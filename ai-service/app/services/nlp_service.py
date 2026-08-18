"""
Deterministic NLP service for donor eligibility conversations.

Extracts structured entities from natural language without external LLM APIs.
This is a development prototype — NOT a medical diagnostic system.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

from app.models.nlp_schemas import ExtractedEntity, NLPIntent, NLPParseResult
from app.nlp.boolean import (
    AFFIRMATIVE_SHORT_ANSWERS,
    NEGATIVE_SHORT_ANSWERS,
    parse_boolean_answer,
    parse_pending_boolean_answer,
)
from app.nlp.field_policy import filter_entities_for_merge
from app.nlp.relative_time import (
    has_relative_time_phrase,
    mentions_donation,
    parse_relative_time,
)
from app.nlp.supplemental import extract_supplemental_information, extract_temperature_celsius
from app.nlp.validation import ValidationOutcome, validate_body_temperature_celsius, validate_field_value
from app.services.data_preprocessing import ML_FEATURE_COLUMNS
from config.conversation_config import (
    BOOLEAN_SCREENING_FIELDS,
    PREGNANCY_NOT_APPLICABLE_PHRASES,
    RECENCY_BOOLEAN_FIELDS,
    UNKNOWN_HEMOGLOBIN_PHRASES,
)

# ---------------------------------------------------------------------------
# Normalization approximations for relative time phrases (NLP only — not medical)
# ---------------------------------------------------------------------------
DAYS_PER_WEEK = 7
DAYS_PER_MONTH = 30
DAYS_PER_YEAR = 365

# Approximate day counts for fuzzy quantifiers in relative-time phrases (NLP only).
FUZZY_TIME_QUANTIFIERS: dict[str, int] = {
    "few": 3,
    "couple": 2,
    "couple of": 2,
    "several": 4,
}

# Vague recency adverbs map to a short default interval when a day count is needed.
RECENCY_ADVERB_DAYS = 30

RELATIVE_TIME_MODIFIER = r"(?:about|around|approximately|just)\s+"
RELATIVE_TIME_UNIT = r"(?:days?|weeks?|months?|years?)"

ML_ENTITY_FIELDS = [
    "age",
    "weight_kg",
    "days_since_last_donation",
    "recent_illness",
    "fever",
    "current_medication",
    "antibiotics",
    "recent_surgery",
    "recent_dental_procedure",
    "recent_tattoo_or_piercing",
    "pregnancy_status",
    "chronic_condition_reported",
    "recent_blood_transfusion",
    "hemoglobin_known",
    "hemoglobin_value",
]

WORD_NUMBERS: dict[str, int] = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
}

RELATIVE_TIME_AMOUNT = (
    r"(\d+|"
    + "|".join(WORD_NUMBERS.keys())
    + r")"
)

NEGATION_PATTERN = re.compile(
    r"\b("
    r"no|not|n't|never|without|neither|nor|"
    r"haven't|hasn't|hadn't|isn't|aren't|wasn't|weren't|"
    r"don't|doesn't|didn't|can't|cannot|won't|wouldn't|"
    r"ain't"
    r")\b",
    re.IGNORECASE,
)

CONTRACTION_MAP = {
    "i'm": "i am",
    "i've": "i have",
    "i'd": "i would",
    "don't": "do not",
    "doesn't": "does not",
    "didn't": "did not",
    "can't": "cannot",
    "won't": "will not",
    "isn't": "is not",
    "aren't": "are not",
    "wasn't": "was not",
    "weren't": "were not",
    "haven't": "have not",
    "hasn't": "has not",
    "hadn't": "had not",
}


RECENCY_FIELD_KEYWORDS: dict[str, str] = {
    "recent_tattoo_or_piercing": r"\b(?:tattoo|piercing|pierced|got one|had one)\b",
    "recent_surgery": r"\b(?:surgery|operation|operated|had surgery)\b",
    "recent_dental_procedure": r"\b(?:dental|dentist|tooth|extraction|root canal)\b",
    "recent_blood_transfusion": r"\b(?:transfusion|blood transfusion)\b",
    "recent_illness": r"\b(?:sick|ill|illness|infection|cold|flu|unwell)\b",
}


@dataclass
class _MatchResult:
    value: Any
    confidence: float
    source_text: str


class NLPService:
    """Lightweight rule-based NLP for donor screening conversations."""

    def parse_message(
        self,
        message: str,
        pending_field: str | None = None,
        collected_information: dict[str, Any] | None = None,
    ) -> NLPParseResult:
        """Context-aware deterministic parse: pending answers first, then full extraction."""
        text = message.strip()
        normalized = self._normalize_text(text)

        entities: dict[str, Any] = {field: None for field in ML_ENTITY_FIELDS}
        details: dict[str, ExtractedEntity] = {}
        is_first_time_donor: bool | None = None
        contextual_found = False

        # Phase 1: pending-question context (checked before generic intent classification)
        contextual_supplemental: dict[str, str] = {}
        if pending_field:
            contextual = self._extract_pending_field_context(
                normalized, text, pending_field
            )
            if contextual:
                raw_sup = contextual.pop("_supplemental", None)
                if isinstance(raw_sup, dict):
                    contextual_supplemental = raw_sup
                if contextual:
                    contextual_found = True
                    is_first_time_donor = self._apply_contextual_results(
                        contextual, entities, details, is_first_time_donor
                    )

        # Phase 2: generic intent detection
        intent, topic = self._detect_intent(normalized)

        # Phase 3: upgrade intent when the message carries screening information
        if contextual_found or self._message_contains_extractable_info(normalized):
            if intent in {NLPIntent.UNKNOWN, NLPIntent.ELIGIBILITY_CHECK}:
                intent = NLPIntent.PROVIDE_INFORMATION

        # Phase 4: run all independent entity extractors (never stop after first match)
        if intent not in {
            NLPIntent.GREETING,
            NLPIntent.ASK_REQUIREMENTS,
            NLPIntent.ASK_CLARIFICATION,
        }:
            is_first_time_donor = self._run_full_entity_extraction(
                normalized,
                text,
                entities,
                details,
                pending_field=pending_field,
                is_first_time_donor=is_first_time_donor,
            )

        missing = [field for field in ML_ENTITY_FIELDS if entities.get(field) is None]

        filtered = filter_entities_for_merge(
            entities,
            pending_field=pending_field,
            normalized_message=normalized,
            collected=collected_information or {},
        )
        for field in list(entities.keys()):
            if field not in filtered:
                entities[field] = None
                details.pop(field, None)

        needs_clarification = False
        clarification_field: str | None = None

        if pending_field == "fever":
            temp = extract_temperature_celsius(normalized)
            if temp is not None:
                temp_validation = validate_body_temperature_celsius(temp)
                if temp_validation.outcome == ValidationOutcome.NEEDS_CLARIFICATION:
                    needs_clarification = True
                    clarification_field = "fever"
                    entities["fever"] = None
                    details.pop("fever", None)
                elif temp >= 37.5:
                    entities["fever"] = True
                    details["fever"] = ExtractedEntity(
                        value=True,
                        confidence=0.92,
                        source_text=f"{temp}°C",
                    )
                else:
                    entities["fever"] = False
                    details["fever"] = ExtractedEntity(
                        value=False,
                        confidence=0.9,
                        source_text=f"{temp}°C",
                    )

        for field, value in list(filtered.items()):
            if value is None:
                continue
            validation = validate_field_value(field, value)
            if validation.outcome == ValidationOutcome.NEEDS_CLARIFICATION:
                needs_clarification = True
                clarification_field = field
                entities[field] = None
                details.pop(field, None)

        supplemental = extract_supplemental_information(
            normalized, text, pending_field=pending_field
        )
        supplemental.update(contextual_supplemental)

        confidences = [entity.confidence for entity in details.values()]
        overall_confidence = sum(confidences) / len(confidences) if confidences else 0.0
        if intent != NLPIntent.UNKNOWN or contextual_found:
            overall_confidence = max(overall_confidence, 0.5)

        return NLPParseResult(
            intent=intent,
            topic=topic,
            entities=entities,
            entity_details=details,
            missing_information=missing,
            confidence=round(min(overall_confidence, 1.0), 4),
            is_first_time_donor=is_first_time_donor,
            raw_message=message,
            needs_clarification=needs_clarification,
            clarification_field=clarification_field,
            supplemental_information=supplemental,
        )

    def _apply_contextual_results(
        self,
        contextual: dict[str, _MatchResult | bool],
        entities: dict[str, Any],
        details: dict[str, ExtractedEntity],
        is_first_time_donor: bool | None,
    ) -> bool | None:
        for field, result in contextual.items():
            if field.startswith("_"):
                continue
            if field == "is_first_time_donor":
                is_first_time_donor = True
                continue
            if result is None or not isinstance(result, _MatchResult):
                continue
            entities[field] = result.value
            details[field] = ExtractedEntity(
                value=result.value,
                confidence=result.confidence,
                source_text=result.source_text,
            )
        if entities.get("days_since_last_donation") is not None:
            is_first_time_donor = False
        return is_first_time_donor

    def _run_full_entity_extraction(
        self,
        normalized: str,
        original: str,
        entities: dict[str, Any],
        details: dict[str, ExtractedEntity],
        *,
        pending_field: str | None,
        is_first_time_donor: bool | None,
    ) -> bool | None:
        self._apply_extractor(
            lambda n, o: self._extract_age(n, o, pending_field=pending_field),
            normalized,
            original,
            "age",
            entities,
            details,
            skip_if_set=True,
        )
        self._apply_extractor(
            self._extract_weight,
            normalized,
            original,
            "weight_kg",
            entities,
            details,
            skip_if_set=True,
        )

        if entities.get("days_since_last_donation") is None and is_first_time_donor is not True:
            donation = self._extract_donation_history(
                normalized, original, pending_field=pending_field
            )
            if donation is not None:
                if donation.value is None:
                    entities["days_since_last_donation"] = None
                    is_first_time_donor = True
                else:
                    entities["days_since_last_donation"] = donation.value
                    is_first_time_donor = False
                details["days_since_last_donation"] = ExtractedEntity(
                    value=entities["days_since_last_donation"],
                    confidence=donation.confidence,
                    source_text=donation.source_text,
                )

        self._extract_explicit_negations(normalized, original, entities, details)
        self._apply_boolean_extractors(normalized, original, entities, details)
        self._apply_extractor(
            lambda n, o: self._extract_hemoglobin(n, o, pending_field=pending_field),
            normalized,
            original,
            "hemoglobin_value",
            entities,
            details,
            skip_if_set=True,
        )
        if entities.get("hemoglobin_value") is not None:
            entities["hemoglobin_known"] = True
            if "hemoglobin_value" in details:
                hb_detail = details["hemoglobin_value"]
                details["hemoglobin_known"] = ExtractedEntity(
                    value=True,
                    confidence=hb_detail.confidence,
                    source_text=hb_detail.source_text,
                )
        elif entities.get("hemoglobin_known") is None:
            entities["hemoglobin_known"] = None

        pregnancy = self._extract_pregnancy_status(normalized, original)
        if pregnancy is not None:
            entities["pregnancy_status"] = pregnancy.value
            details["pregnancy_status"] = ExtractedEntity(
                value=pregnancy.value,
                confidence=pregnancy.confidence,
                source_text=pregnancy.source_text,
            )

        self._apply_wellness_phrases(normalized, original, entities, details)
        return is_first_time_donor

    def _normalize_text(self, text: str) -> str:
        lowered = text.lower().strip()
        for contraction, expanded in CONTRACTION_MAP.items():
            lowered = re.sub(rf"\b{re.escape(contraction)}\b", expanded, lowered)
        lowered = re.sub(r"\s+", " ", lowered)
        return lowered

    def _detect_intent(self, text: str) -> tuple[NLPIntent, str | None]:
        if re.search(r"^(hi|hello|hey|good morning|good afternoon|good evening)\b", text):
            return NLPIntent.GREETING, None

        if re.search(
            r"\b(what information do (you|i) need|what (info|information) (do you need|is required)|"
            r"what do i need to (tell|provide|give)|what details do you need)\b",
            text,
        ):
            return NLPIntent.ASK_REQUIREMENTS, None

        clarification = re.search(
            r"\bwhat do you mean by ([a-z_ ]+?)\??\s*$|\bwhat does ([a-z_ ]+?) mean\b",
            text,
        )
        if clarification:
            topic_raw = clarification.group(1) or clarification.group(2)
            topic = self._map_clarification_topic(topic_raw.strip())
            return NLPIntent.ASK_CLARIFICATION, topic

        if re.search(
            r"\b(can i donate|am i eligible|eligible to donate|donate blood\??|"
            r"able to donate|qualify to donate)\b",
            text,
        ):
            return NLPIntent.ELIGIBILITY_CHECK, None

        if self._message_contains_extractable_info(text):
            return NLPIntent.PROVIDE_INFORMATION, None

        return NLPIntent.UNKNOWN, None

    def _map_clarification_topic(self, phrase: str) -> str:
        phrase = phrase.strip().lower()
        topic_map = {
            "recent illness": "recent_illness",
            "illness": "recent_illness",
            "sick": "recent_illness",
            "fever": "fever",
            "medication": "current_medication",
            "medicine": "current_medication",
            "antibiotics": "antibiotics",
            "surgery": "recent_surgery",
            "dental": "recent_dental_procedure",
            "dental procedure": "recent_dental_procedure",
            "tattoo": "recent_tattoo_or_piercing",
            "piercing": "recent_tattoo_or_piercing",
            "pregnancy": "pregnancy_status",
            "transfusion": "recent_blood_transfusion",
            "hemoglobin": "hemoglobin_value",
            "weight": "weight_kg",
            "donation interval": "days_since_last_donation",
        }
        for key, value in topic_map.items():
            if key in phrase:
                return value
        return phrase.replace(" ", "_")

    def _message_contains_extractable_info(self, text: str) -> bool:
        probes = [
            r"\b\d{1,2}\b",
            r"\b(years? old|year old|yo|y\.o\.|kg|kilo|kilos|kilogram|kilograms|weigh|weight)\b",
            r"\b(\d+)\s*(days?|weeks?|months?|years?)\s+ago\b",
            r"\b(yesterday|last month|last week)\b",
            r"\b(donated|donation|gave blood)\b",
            r"\b(fever|sick|ill|medication|antibiotics|surgery|tattoo|piercing|hemoglobin)\b",
            r"\b(healthy|feeling fine|never donated|first time)\b",
        ]
        return any(re.search(pattern, text) for pattern in probes)

    def _apply_extractor(
        self,
        extractor: Callable[[str, str], _MatchResult | None],
        normalized: str,
        original: str,
        field: str,
        entities: dict[str, Any],
        details: dict[str, ExtractedEntity],
        *,
        skip_if_set: bool = False,
    ) -> None:
        if skip_if_set and entities.get(field) is not None:
            return
        result = extractor(normalized, original)
        if result is not None:
            entities[field] = result.value
            details[field] = ExtractedEntity(
                value=result.value,
                confidence=result.confidence,
                source_text=result.source_text,
            )

    def _is_weight_associated_number(
        self,
        normalized: str,
        num_start: int,
        num_end: int,
    ) -> bool:
        after = normalized[num_end : num_end + 20]
        before = normalized[max(0, num_start - 20) : num_start]
        if re.match(r"\s*(?:kg|kilos?|kilograms?)\b", after):
            return True
        if re.match(r"(?:kg|kilos?|kilograms?)\b", after.strip()):
            return True
        if re.search(r"\b(?:weigh|weight(?:\s+is)?|around|about|approximately)\s*$", before):
            return True
        return False

    def _extract_pending_field_context(
        self,
        normalized: str,
        original: str,
        pending_field: str,
    ) -> dict[str, _MatchResult | bool]:
        results: dict[str, _MatchResult | bool] = {}

        if pending_field == "age":
            bare_age = re.fullmatch(
                r"(?:(?:i am|i'm|im|about|around|approximately)\s+)?"
                r"(\d{1,2})\s*(?:years?\s*old|yo|y\.?o\.?)?\.?",
                normalized.strip(),
            )
            if bare_age:
                age = int(bare_age.group(1))
                if 10 <= age <= 100:
                    results["age"] = _MatchResult(
                        value=age,
                        confidence=0.94,
                        source_text=self._span_original(
                            original, bare_age.start(1), bare_age.end(1)
                        ),
                    )

        elif pending_field == "weight_kg":
            bare_weight = re.fullmatch(
                r"(?:(?:about|around|approximately|my weight is|i weigh)\s+)?"
                r"(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)?\.?",
                normalized.strip(),
            )
            if bare_weight:
                weight = float(bare_weight.group(1))
                if 30 <= weight <= 250:
                    results["weight_kg"] = _MatchResult(
                        value=weight,
                        confidence=0.94,
                        source_text=self._span_original(
                            original, bare_weight.start(1), bare_weight.end(1)
                        ),
                    )

        elif pending_field == "days_since_last_donation":
            if self._is_first_time_donor_answer(normalized, allow_short_negative=True):
                results["is_first_time_donor"] = True
                results["days_since_last_donation"] = _MatchResult(
                    value=None,
                    confidence=0.96,
                    source_text=original.strip(),
                )
            else:
                relative = self._extract_relative_time_phrase(
                    normalized,
                    original,
                    require_donation_keyword=False,
                )
                if relative is not None:
                    results["days_since_last_donation"] = relative

        elif pending_field in RECENCY_BOOLEAN_FIELDS:
            results.update(
                self._extract_recency_boolean_pending(
                    normalized, original, pending_field
                )
            )

        elif pending_field == "fever":
            answer = parse_pending_boolean_answer(normalized)
            temp = extract_temperature_celsius(normalized)
            if temp is not None:
                temp_validation = validate_body_temperature_celsius(temp)
                if temp_validation.outcome != ValidationOutcome.NEEDS_CLARIFICATION:
                    results["fever"] = _MatchResult(
                        value=temp >= 37.5,
                        confidence=0.92,
                        source_text=original.strip(),
                    )
            elif answer is not None:
                results["fever"] = _MatchResult(
                    value=answer,
                    confidence=0.96,
                    source_text=original.strip(),
                )

        elif pending_field in {"current_medication", "antibiotics"}:
            from app.nlp.medication import parse_medication_pending_answer

            med = parse_medication_pending_answer(
                normalized, original, pending_field=pending_field
            )
            if med.value is not None:
                results[pending_field] = _MatchResult(
                    value=med.value,
                    confidence=med.confidence,
                    source_text=med.source_text,
                )
            if med.supplemental:
                results["_supplemental"] = med.supplemental  # type: ignore[assignment]

        elif pending_field in BOOLEAN_SCREENING_FIELDS:
            answer = parse_pending_boolean_answer(normalized)
            if answer is not None:
                results[pending_field] = _MatchResult(
                    value=answer,
                    confidence=0.96,
                    source_text=original.strip(),
                )

        elif pending_field == "pregnancy_status":
            pregnancy_answer = self._parse_pregnancy_short_answer(normalized)
            if pregnancy_answer is not None:
                results["pregnancy_status"] = _MatchResult(
                    value=pregnancy_answer,
                    confidence=0.96,
                    source_text=original.strip(),
                )

        elif pending_field == "hemoglobin_known":
            results.update(
                self._extract_hemoglobin_pending(normalized, original, pending_field)
            )

        elif pending_field == "hemoglobin_value":
            results.update(
                self._extract_hemoglobin_pending(normalized, original, pending_field)
            )

        return results

    def _mentions_donation(self, normalized: str) -> bool:
        return mentions_donation(normalized)

    def _has_relative_time_phrase(self, normalized: str, original: str) -> bool:
        return has_relative_time_phrase(
            normalized, original, require_donation_keyword=False
        )

    def _extract_recency_boolean_pending(
        self,
        normalized: str,
        original: str,
        pending_field: str,
    ) -> dict[str, _MatchResult]:
        results: dict[str, _MatchResult] = {}
        answer = parse_pending_boolean_answer(normalized)
        if answer is False:
            results[pending_field] = _MatchResult(
                value=False,
                confidence=0.96,
                source_text=original.strip(),
            )
            return results

        has_recency = self._has_relative_time_phrase(normalized, original)
        keyword_pattern = RECENCY_FIELD_KEYWORDS.get(pending_field)
        has_keyword = bool(
            keyword_pattern and re.search(keyword_pattern, normalized)
        )
        yes_with_recency = answer is True and has_recency
        recency_implies_event = has_recency and self._recency_phrase_affirms_event(
            normalized, answer
        )

        if (
            answer is True
            or yes_with_recency
            or has_keyword
            or recency_implies_event
        ):
            results[pending_field] = _MatchResult(
                value=True,
                confidence=0.94,
                source_text=original.strip(),
            )
            return results

        if has_recency and re.search(r"\b(?:got one|had one|i did)\b", normalized):
            results[pending_field] = _MatchResult(
                value=True,
                confidence=0.9,
                source_text=original.strip(),
            )

        return results

    def _recency_phrase_affirms_event(
        self,
        normalized: str,
        boolean_answer: bool | None,
    ) -> bool:
        """Relative time in a pending recency question affirms the event unless negated."""
        if boolean_answer is False:
            return False
        if boolean_answer is True:
            return True
        if NEGATION_PATTERN.search(normalized):
            return False
        return True

    def _extract_hemoglobin_pending(
        self,
        normalized: str,
        original: str,
        pending_field: str,
    ) -> dict[str, _MatchResult]:
        results: dict[str, _MatchResult] = {}
        stripped = normalized.strip().rstrip(".")

        if any(phrase in normalized for phrase in UNKNOWN_HEMOGLOBIN_PHRASES):
            results["hemoglobin_known"] = _MatchResult(
                value=False,
                confidence=0.94,
                source_text=original.strip(),
            )
            return results

        value_match = self._match_hemoglobin_value(
            normalized,
            original,
            allow_bare=pending_field in {"hemoglobin_known", "hemoglobin_value"},
            allow_yes_prefix=True,
        )
        if value_match is not None:
            results["hemoglobin_value"] = value_match
            results["hemoglobin_known"] = _MatchResult(
                value=True,
                confidence=0.96,
                source_text=value_match.source_text,
            )
            return results

        if pending_field == "hemoglobin_known":
            answer = self._parse_short_yes_no(stripped)
            if answer is False:
                results["hemoglobin_known"] = _MatchResult(
                    value=False,
                    confidence=0.96,
                    source_text=original.strip(),
                )
            elif answer is True:
                results["hemoglobin_known"] = _MatchResult(
                    value=True,
                    confidence=0.96,
                    source_text=original.strip(),
                )

        return results

    def _match_hemoglobin_value(
        self,
        normalized: str,
        original: str,
        *,
        allow_bare: bool = False,
        allow_yes_prefix: bool = False,
    ) -> _MatchResult | None:
        search_patterns = [
            r"\bhemoglobin(?:\s+(?:is|level|of))?\s*(?:is\s+)?(\d+(?:\.\d+)?)\s*(?:g/dl|g/dL)?\b",
            r"\bhemoglobin\s+(\d+(?:\.\d+)?)\s*(?:g/dl|g/dL)?\b",
        ]
        if allow_yes_prefix:
            search_patterns.append(
                r"^yes(?:,|\s)+(\d+(?:\.\d+)?)\s*(?:g/dl|g/dL)?\.?$"
            )
        for pattern in search_patterns:
            match = re.search(pattern, normalized)
            if match:
                return self._hemoglobin_value_result(original, match)

        if allow_bare:
            bare = re.fullmatch(
                r"(\d+(?:\.\d+)?)\s*(?:g/dl|g/dL)?\.?",
                normalized.strip(),
            )
            if bare:
                return self._hemoglobin_value_result(original, bare)

        return None

    def _hemoglobin_value_result(
        self,
        original: str,
        match: re.Match[str],
    ) -> _MatchResult | None:
        value = float(match.group(1))
        if 5.0 <= value <= 25.0:
            return _MatchResult(
                value=value,
                confidence=0.97,
                source_text=self._span_original(original, match.start(), match.end()),
            )
        return None

    def _parse_short_yes_no(self, normalized: str) -> bool | None:
        return parse_pending_boolean_answer(normalized)

    def _parse_pregnancy_short_answer(self, normalized: str) -> str | None:
        stripped = normalized.strip().rstrip(".")
        if stripped in AFFIRMATIVE_SHORT_ANSWERS or stripped == "pregnant":
            return "yes"
        if stripped in {"no", "nope", "nah", "not pregnant"}:
            return "no"
        if any(phrase in normalized for phrase in PREGNANCY_NOT_APPLICABLE_PHRASES):
            return "not_applicable"
        if stripped in {"unknown", "not sure"} or any(
            phrase in normalized for phrase in UNKNOWN_HEMOGLOBIN_PHRASES
        ):
            return "unknown"
        return None

    def _is_first_time_donor_answer(
        self,
        normalized: str,
        *,
        allow_short_negative: bool = False,
    ) -> bool:
        stripped = normalized.strip()
        if allow_short_negative and stripped in {
            "no",
            "nope",
            "nah",
            "never",
            "no.",
            "nope.",
            "never.",
        }:
            return True

        patterns = [
            r"\b(?:never donated|never given blood|never gave blood|first[- ]time donor|"
            r"first time donating|first donation|have not donated|have never donated|"
            r"haven't donated|has never donated|no previous donation|"
            r"i've never donated|i have never donated|i haven't donated before|"
            r"this would be my first time|this would be my first donation|"
            r"no, this would be my first time|no, i've never donated)\b",
        ]
        return any(re.search(pattern, normalized) for pattern in patterns)

    def _extract_relative_time_phrase(
        self,
        normalized: str,
        original: str,
        *,
        require_donation_keyword: bool,
    ) -> _MatchResult | None:
        parsed = parse_relative_time(
            normalized,
            original,
            require_donation_keyword=require_donation_keyword,
        )
        if parsed is None:
            return None
        return _MatchResult(
            value=parsed.days,
            confidence=parsed.confidence,
            source_text=parsed.source_text,
        )

    def _extract_age(
        self,
        normalized: str,
        original: str,
        *,
        pending_field: str | None = None,
    ) -> _MatchResult | None:
        patterns = [
            (
                r"\b(?:actually|but)\s+(?:i am|i'm|im)\s+(?:about\s+|around\s+)?(\d{1,2})\s*"
                r"(?:years?\s*old|y\.?o\.?)?\b",
                0.97,
            ),
            (
                r"\b(?:i am|i'm|im)\s+(?:about\s+|around\s+)?(\d{1,2})\s*"
                r"(?:years?\s*old|y\.?o\.?)?\b",
                0.98,
            ),
            (r"\b(\d{1,2})\s*years?\s*old\b", 0.98),
            (r"\b(\d{1,2})\s*y\.?o\.?\b", 0.96),
            (
                r"(?:^|\b(?:i am|i'm|im)\s+)(\d{1,2})\s*(?:,|\s+and\b)",
                0.9,
            ),
        ]
        for pattern, confidence in patterns:
            for match in re.finditer(pattern, normalized):
                num_start = match.start(1)
                num_end = match.end(1)
                if self._is_weight_associated_number(normalized, num_start, num_end):
                    continue
                age = int(match.group(1))
                if 10 <= age <= 100:
                    return _MatchResult(
                        value=age,
                        confidence=confidence,
                        source_text=self._span_original(original, match.start(), match.end()),
                    )

        word_age = re.search(
            r"\b(?:i am|i'm|im)\s+(?P<words>(?:twenty|thirty|forty|fifty|sixty|seventy)"
            r"(?:[\s-]?(?:one|two|three|four|five|six|seven|eight|nine))?)\s*"
            r"(?:years?\s*old|y\.?o\.?)?\b",
            normalized,
        )
        if word_age:
            age = self._words_to_number(word_age.group("words"))
            if age is not None and 10 <= age <= 100:
                return _MatchResult(
                    value=age,
                    confidence=0.92,
                    source_text=self._span_original(
                        original, word_age.start(), word_age.end()
                    ),
                )

        yo_age = re.search(r"(?:^|[,.\s])(\d{1,2})\s*y\.?o\.?", normalized)
        if yo_age and not self._is_weight_associated_number(
            normalized, yo_age.start(1), yo_age.end(1)
        ):
            age = int(yo_age.group(1))
            if 10 <= age <= 100:
                return _MatchResult(
                    value=age,
                    confidence=0.95,
                    source_text=self._span_original(original, yo_age.start(), yo_age.end()),
                )

        if pending_field == "age":
            bare = re.fullmatch(
                r"(?:(?:about|around|approximately|i am|i'm|im)\s+)?(\d{1,2})\.?",
                normalized.strip(),
            )
            if bare:
                age = int(bare.group(1))
                if 10 <= age <= 100:
                    return _MatchResult(
                        value=age,
                        confidence=0.9,
                        source_text=self._span_original(
                            original, bare.start(1), bare.end(1)
                        ),
                    )
        return None

    def _extract_weight(self, normalized: str, original: str) -> _MatchResult | None:
        patterns = [
            (
                r"\b(?:weigh|weight(?:\s+is)?|my weight is)\s*(?:around|about|approximately)?\s*"
                r"(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)\b",
                0.98,
            ),
            (
                r"\b(?:i am|i'm|im)\s*(?:around|about|approximately)?\s*"
                r"(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)\b",
                0.95,
            ),
            (r"\b(\d+(?:\.\d+)?)\s*(?:kg|kilos?|kilograms?)\b", 0.9),
            (r"\b(\d+(?:\.\d+)?)(?:kg)\b", 0.88),
        ]
        for pattern, confidence in patterns:
            match = re.search(pattern, normalized)
            if match:
                weight = float(match.group(1))
                if 30 <= weight <= 250:
                    return _MatchResult(
                        value=weight,
                        confidence=confidence,
                        source_text=self._span_original(original, match.start(), match.end()),
                    )
        return None

    def _extract_donation_history(
        self,
        normalized: str,
        original: str,
        *,
        pending_field: str | None = None,
    ) -> _MatchResult | None:
        if pending_field and pending_field != "days_since_last_donation":
            if not self._mentions_donation(normalized):
                return None

        if self._is_first_time_donor_answer(normalized, allow_short_negative=False):
            match = re.search(
                r"\b(?:never donated|never given blood|never gave blood|first[- ]time|"
                r"first donation|have not donated|have never donated|haven't donated|"
                r"i've never donated|i have never donated)\b",
                normalized,
            )
            span = match if match else re.search(r".+", normalized)
            return _MatchResult(
                value=None,
                confidence=0.97,
                source_text=self._span_original(original, span.start(), span.end())
                if span
                else original.strip(),
            )

        contextual = pending_field == "days_since_last_donation"
        relative = self._extract_relative_time_phrase(
            normalized,
            original,
            require_donation_keyword=not contextual,
        )
        if relative is not None:
            return relative

        relative_patterns = [
            (r"\b(?:donated|donation|gave blood|last donation(?: was)?|last donated)\b.*?\byesterday\b", 1, 0.95),
            (
                r"\b(?:donated|donation|gave blood|last donation(?: was)?|last donated|"
                r"i last donated)\b.*?(\d+|"
                + "|".join(WORD_NUMBERS.keys())
                + r")\s*days?\s+ago",
                "days",
                0.95,
            ),
            (
                r"\b(?:donated|donation|gave blood|last donation(?: was)?|last donated|"
                r"i last donated)\b.*?(\d+|"
                + "|".join(WORD_NUMBERS.keys())
                + r")\s*weeks?\s+ago",
                "weeks",
                0.93,
            ),
            (
                r"\b(?:donated|donation|gave blood|last donation(?: was)?|last donated|"
                r"i last donated|my last donation was)\b.*?(\d+|"
                + "|".join(WORD_NUMBERS.keys())
                + r")\s*months?\s+ago",
                "months",
                0.9,
            ),
            (
                r"\b(?:donated|donation|gave blood|last donation(?: was)?|last donated|"
                r"i last donated)\b.*?(\d+|"
                + "|".join(WORD_NUMBERS.keys())
                + r")\s*years?\s+ago",
                "years",
                0.88,
            ),
        ]

        for entry in relative_patterns:
            if len(entry) == 3 and isinstance(entry[1], str):
                pattern, unit, confidence = entry
                match = re.search(pattern, normalized)
                if match:
                    amount = self._parse_number_token(match.group(1))
                    if amount is None:
                        continue
                    days = self._to_days(amount, unit)
                    return _MatchResult(
                        value=days,
                        confidence=confidence,
                        source_text=self._span_original(original, match.start(), match.end()),
                    )
            elif len(entry) == 3:
                pattern, days, confidence = entry
                match = re.search(pattern, normalized)
                if match:
                    return _MatchResult(
                        value=int(days),
                        confidence=confidence,
                        source_text=self._span_original(original, match.start(), match.end()),
                    )

        standalone = re.search(
            r"\b(\d+|"
            + "|".join(WORD_NUMBERS.keys())
            + r")\s*(days?|weeks?|months?|years?)\s+ago\b",
            normalized,
        )
        if standalone and (
            self._mentions_donation(normalized)
            or (
                pending_field == "days_since_last_donation"
                and re.search(r"\b(?:yes|yeah|yep)\b", normalized)
            )
        ):
            amount = self._parse_number_token(standalone.group(1))
            unit = standalone.group(2)
            if amount is not None:
                days = self._to_days(amount, unit)
                return _MatchResult(
                    value=days,
                    confidence=0.88,
                    source_text=self._span_original(
                        original, standalone.start(), standalone.end()
                    ),
                )
        return None

    def _extract_explicit_negations(
        self,
        normalized: str,
        original: str,
        entities: dict[str, Any],
        details: dict[str, ExtractedEntity],
    ) -> None:
        """Extract clear negative statements before keyword-based boolean inference."""
        negation_specs: list[tuple[str, list[str], float]] = [
            (
                "fever",
                [
                    r"\bno fever\b",
                    r"\b(?:don't|do not) have (?:a )?fever\b",
                    r"\bfever[- ]free\b",
                ],
                0.92,
            ),
            (
                "recent_illness",
                [
                    r"\bno recent illness\b",
                    r"\bhaven't been sick\b",
                    r"\bhave not been sick\b",
                    r"\b(?:i am|i'm|im)\s+healthy\b",
                    r"\b(?:i am|i'm|im)\s+not\s+sick\b",
                ],
                0.9,
            ),
            (
                "current_medication",
                [
                    r"\bno medication\b",
                    r"\bnot taking anything\b",
                    r"\b(?:not taking|no|without)\s+(?:any\s+)?(?:medication|medicine|meds)\b",
                    r"\b(?:i'm|i am) not on medication\b",
                ],
                0.9,
            ),
            (
                "antibiotics",
                [
                    r"\bno antibiotics\b",
                    r"\b(?:not taking|no)\s+antibiotics\b",
                ],
                0.9,
            ),
        ]
        for field, patterns, confidence in negation_specs:
            if entities.get(field) is not None:
                continue
            for pattern in patterns:
                match = re.search(pattern, normalized)
                if match:
                    entities[field] = False
                    details[field] = ExtractedEntity(
                        value=False,
                        confidence=confidence,
                        source_text=self._span_original(
                            original, match.start(), match.end()
                        ),
                    )
                    break

    def _apply_boolean_extractors(
        self,
        normalized: str,
        original: str,
        entities: dict[str, Any],
        details: dict[str, ExtractedEntity],
    ) -> None:
        boolean_specs: dict[str, list[str]] = {
            "fever": [
                r"\bfever\b",
                r"\bhigh temperature\b",
                r"\btemperature\b",
            ],
            "recent_illness": [
                r"\bsick\b",
                r"\bill(?:ness)?\b",
                r"\bunwell\b",
                r"\bnot feeling well\b",
            ],
            "current_medication": [
                r"\bmedication\b",
                r"\bmedicine\b",
                r"\bmeds\b",
                r"\btaking (?:any )?(?:medication|medicine|meds)\b",
            ],
            "antibiotics": [
                r"\bantibiotics?\b",
            ],
            "recent_surgery": [
                r"\bsurgery\b",
                r"\boperation\b",
                r"\bsurgical procedure\b",
            ],
            "recent_dental_procedure": [
                r"\bdental procedure\b",
                r"\bdental work\b",
                r"\bdentist\b",
                r"\btooth extraction\b",
            ],
            "recent_tattoo_or_piercing": [
                r"\btattoo\b",
                r"\bpiercing\b",
            ],
            "chronic_condition_reported": [
                r"\bchronic condition\b",
                r"\bchronic illness\b",
                r"\bchronic disease\b",
            ],
            "recent_blood_transfusion": [
                r"\bblood transfusion\b",
                r"\btransfusion\b",
            ],
        }

        for field, patterns in boolean_specs.items():
            result = self._extract_boolean_entity(normalized, original, patterns)
            if result is not None:
                entities[field] = result.value
                details[field] = ExtractedEntity(
                    value=result.value,
                    confidence=result.confidence,
                    source_text=result.source_text,
                )

    def _extract_boolean_entity(
        self,
        normalized: str,
        original: str,
        keyword_patterns: list[str],
    ) -> _MatchResult | None:
        for pattern in keyword_patterns:
            for match in re.finditer(pattern, normalized):
                window_start = max(0, match.start() - 50)
                context = normalized[window_start : match.end()]
                negated = self._is_negated(context, match.start() - window_start)
                value = False if negated else True
                return _MatchResult(
                    value=value,
                    confidence=0.9 if not negated else 0.88,
                    source_text=self._span_original(original, match.start(), match.end()),
                )
        return None

    def _extract_hemoglobin(
        self,
        normalized: str,
        original: str,
        *,
        pending_field: str | None = None,
    ) -> _MatchResult | None:
        return self._match_hemoglobin_value(
            normalized,
            original,
            allow_bare=pending_field in {"hemoglobin_known", "hemoglobin_value"},
            allow_yes_prefix=pending_field in {"hemoglobin_known", "hemoglobin_value"},
        )

    def _extract_pregnancy_status(self, normalized: str, original: str) -> _MatchResult | None:
        patterns = [
            (r"\b(?:i am|i'm|im)\s+pregnant\b", "yes", 0.95),
            (r"\bnot pregnant\b", "no", 0.95),
            (r"\bpregnant\b", "yes", 0.85),
        ]
        for pattern, status, confidence in patterns:
            match = re.search(pattern, normalized)
            if match:
                negated = self._is_negated(
                    normalized[max(0, match.start() - 20) : match.end()],
                    match.start() - max(0, match.start() - 20),
                )
                if status == "yes" and negated:
                    status = "no"
                return _MatchResult(
                    value=status,
                    confidence=confidence,
                    source_text=self._span_original(original, match.start(), match.end()),
                )
        return None

    def _apply_wellness_phrases(
        self,
        normalized: str,
        original: str,
        entities: dict[str, Any],
        details: dict[str, ExtractedEntity],
    ) -> None:
        wellness_patterns = [
            r"\bfeeling (?:completely )?fine(?: lately| recently)?\b",
            r"\bfeel(?:ing)? (?:completely )?(?:fine|well|healthy)(?: lately| recently)?\b",
            r"\bi am fine\b",
            r"\bi'm fine\b",
            r"\bi am healthy\b",
            r"\bi'm healthy\b",
        ]
        for pattern in wellness_patterns:
            match = re.search(pattern, normalized)
            if match:
                span = self._span_original(original, match.start(), match.end())
                if entities.get("recent_illness") is None:
                    entities["recent_illness"] = False
                    details["recent_illness"] = ExtractedEntity(
                        value=False, confidence=0.82, source_text=span
                    )
                if entities.get("fever") is None:
                    entities["fever"] = False
                    details["fever"] = ExtractedEntity(
                        value=False, confidence=0.82, source_text=span
                    )
                break

        not_sick = re.search(
            r"\b(?:i am|i'm|im)\s+not\s+sick\b|\bhaven't been sick\b|\bhave not been sick\b",
            normalized,
        )
        if not_sick and entities.get("recent_illness") is None:
            entities["recent_illness"] = False
            details["recent_illness"] = ExtractedEntity(
                value=False,
                confidence=0.9,
                source_text=self._span_original(original, not_sick.start(), not_sick.end()),
            )

        no_fever = re.search(
            r"\b(?:no fever|(?:don't|do not) have (?:a )?fever|fever[- ]free)\b",
            normalized,
        )
        if no_fever and entities.get("fever") is None:
            entities["fever"] = False
            details["fever"] = ExtractedEntity(
                value=False,
                confidence=0.9,
                source_text=self._span_original(original, no_fever.start(), no_fever.end()),
            )

        no_medication = re.search(
            r"\b(?:not taking|no|without)\s+(?:any\s+)?(?:medication|medicine|meds)\b|"
            r"\bno medication\b|"
            r"\bnot taking anything\b",
            normalized,
        )
        if no_medication and entities.get("current_medication") is None:
            entities["current_medication"] = False
            details["current_medication"] = ExtractedEntity(
                value=False,
                confidence=0.9,
                source_text=self._span_original(
                    original, no_medication.start(), no_medication.end()
                ),
            )

        never_patterns = {
            "recent_surgery": r"\b(?:never had surgery|no surgery)\b",
            "recent_blood_transfusion": r"\b(?:never had a blood transfusion|never had transfusion)\b",
        }
        for field, pattern in never_patterns.items():
            match = re.search(pattern, normalized)
            if match and entities.get(field) is None:
                entities[field] = False
                details[field] = ExtractedEntity(
                    value=False,
                    confidence=0.9,
                    source_text=self._span_original(original, match.start(), match.end()),
                )

    def _is_negated(self, context: str, keyword_index: int) -> bool:
        prefix = context[:keyword_index]
        return bool(NEGATION_PATTERN.search(prefix))

    def _words_to_number(self, words: str) -> int | None:
        words = words.strip().lower().replace("-", " ")
        tokens = words.split()
        if not tokens:
            return None
        if len(tokens) == 1:
            return WORD_NUMBERS.get(tokens[0])
        if len(tokens) == 2 and tokens[0] in WORD_NUMBERS and tokens[1] in WORD_NUMBERS:
            return WORD_NUMBERS[tokens[0]] + WORD_NUMBERS[tokens[1]]
        return None

    def _parse_number_token(self, token: str) -> int | None:
        token = token.strip().lower()
        if token.isdigit():
            return int(token)
        return WORD_NUMBERS.get(token)

    def _to_days(self, amount: int, unit: str) -> int:
        unit = unit.rstrip("s")
        if unit.startswith("day"):
            return amount
        if unit.startswith("week"):
            return amount * DAYS_PER_WEEK
        if unit.startswith("month"):
            return amount * DAYS_PER_MONTH
        if unit.startswith("year"):
            return amount * DAYS_PER_YEAR
        return amount

    def _span_original(self, original: str, start: int, end: int) -> str:
        return original[start:end].strip()


_nlp_service: NLPService | None = None


def get_nlp_service() -> NLPService:
    global _nlp_service
    if _nlp_service is None:
        _nlp_service = NLPService()
    return _nlp_service


def parse_message(
    message: str,
    pending_field: str | None = None,
    collected_information: dict[str, Any] | None = None,
) -> NLPParseResult:
    """Module-level convenience wrapper."""
    return get_nlp_service().parse_message(
        message,
        pending_field=pending_field,
        collected_information=collected_information,
    )
