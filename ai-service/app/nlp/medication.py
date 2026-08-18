"""
Contextual medication/antibiotics answer parsing for pending screening questions.

Recognizes natural phrasing without hardcoding specific drug names.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# Conversational lead-ins stripped before interpreting the answer.
CONVERSATIONAL_LEADIN = re.compile(
    r"^(?:actually|oh|well|sorry|umm+|um|let me think|to be honest|honestly)"
    r"[,.\s]+",
    re.IGNORECASE,
)

MEDICATION_FIELD = "current_medication"
ANTIBIOTICS_FIELD = "antibiotics"

NEGATIVE_MEDICATION_PATTERNS = (
    r"\bno(?:,\s)?(?:i'?m|i am)\s+not\s+taking\b",
    r"\bnot\s+taking\s+(?:anything|any(?:\s+medication|\s+medicine|\s+meds)?)\b",
    r"\b(?:i\s+)?(?:don't|do not)\s+take\s+(?:anything|any(?:\s+medication|\s+medicine|\s+meds)?)\b",
    r"\bno\s+medication(?:\s+at\s+all)?\b",
    r"\bnot\s+on\s+(?:any\s+)?(?:medication|medicine|meds)\b",
    r"\bwithout\s+(?:any\s+)?(?:medication|medicine|meds)\b",
)

POSITIVE_MEDICATION_PATTERNS = (
    r"\b(?:i'?m|i am)\s+(?:currently\s+)?(?:taking|on)\s+(?!nothing\b|anything\b)(\S+(?:\s+\S+){0,6})",
    r"\b(?:i\s+)?take\s+(?!nothing\b|anything\b)(\S+(?:\s+\S+){0,6})",
    r"\b(?:taking|on)\s+(?:some\s+)?(?:medication|medicine|meds|tablets?|pills?)\b",
    r"\b(?:i\s+)?take\s+(?:medication|medicine|meds|tablets?|pills?)\b",
    r"\byes[,.\s]+(?:i\s+)?(?:take|taking)\b",
)

POSITIVE_ANTIBIOTICS_PATTERNS = (
    r"\b(?:i'?m|i am)\s+(?:currently\s+)?(?:taking|on)\s+antibiotics?\b",
    r"\b(?:i\s+)?take\s+antibiotics?\b",
    r"\b(?:taking|on)\s+antibiotics?\b",
    r"\byes[,.\s]+(?:i\s+)?(?:take|taking)\s+antibiotics?\b",
)

NEGATIVE_ANTIBIOTICS_PATTERNS = (
    r"\bnot\s+taking\s+antibiotics?\b",
    r"\b(?:i\s+)?(?:don't|do not)\s+take\s+antibiotics?\b",
    r"\bno\s+antibiotics?\b",
)


@dataclass
class MedicationParseResult:
    value: bool | None
    confidence: float = 0.0
    source_text: str = ""
    supplemental: dict[str, str] = field(default_factory=dict)


def strip_conversational_leadin(normalized: str) -> str:
    text = normalized.strip()
    while True:
        updated = CONVERSATIONAL_LEADIN.sub("", text, count=1).strip()
        if updated == text:
            break
        text = updated
    return text


def _matches_any(patterns: tuple[str, ...], text: str) -> re.Match[str] | None:
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match
    return None


def _extract_medication_name(text: str) -> str | None:
    """Extract a medication name/object phrase after take/taking/on/using."""
    patterns = (
        r"\b(?:i'?m|i am)\s+(?:currently\s+)?(?:taking|on)\s+([a-z0-9][\w\s-]{1,40}?)(?:\s+(?:when|if|for|sometimes|daily|once|twice|every|\d)|[,.\s]|$)",
        r"\b(?:i\s+)?take\s+([a-z0-9][\w\s-]{1,40}?)(?:\s+(?:when|if|for|sometimes|daily|once|twice|every|\d)|[,.\s]|$)",
        r"\b(?:using)\s+([a-z0-9][\w\s-]{1,40}?)(?:\s+(?:when|if|for|sometimes|daily|once|twice|every|\d)|[,.\s]|$)",
    )
    skip = {
        "medication",
        "medicine",
        "meds",
        "tablets",
        "tablet",
        "pills",
        "pill",
        "antibiotics",
        "antibiotic",
        "something",
        "anything",
        "nothing",
    }
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            name = match.group(1).strip(" ,.")
            first_word = name.split()[0] if name else ""
            if name and first_word not in skip:
                return name[:120]
    return None


def _extract_frequency(text: str) -> str | None:
    patterns = (
        r"\b(\d+\s*(?:tablets?|pills?|capsules?)\s*(?:per|a)\s*day)\b",
        r"\b(two tablets a day)\b",
        r"\b(once(?:\s+a)?\s+day|twice(?:\s+a)?\s+day|three times(?:\s+a)?\s+day)\b",
        r"\b(sometimes|occasionally|daily|regularly|as needed)\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    return None


def _extract_reason(text: str) -> str | None:
    match = re.search(
        r"\b(?:when|if|for)\s+(?:i\s+)?(?:have|get|feel)\s+(?:a\s+)?(.+?)(?:[,.]|$|\s+and\s+)",
        text,
    )
    if match:
        return match.group(1).strip()[:120]
    match = re.search(r"\bfor\s+(.+?)(?:[,.]|$)", text)
    if match:
        reason = match.group(1).strip()
        if reason not in {"pain", "it"}:
            return reason[:120]
    return None


def _extract_dosage(text: str) -> str | None:
    match = re.search(
        r"\b(\d+\s*(?:tablets?|pills?|capsules?)(?:\s*(?:per|a)\s*day)?)\b",
        text,
    )
    return match.group(1) if match else None


def extract_medication_supplemental(normalized: str, *, field: str) -> dict[str, str]:
    notes: dict[str, str] = {}
    name = _extract_medication_name(normalized)
    if name:
        notes["medication_name"] = name
    dosage = _extract_dosage(normalized)
    if dosage:
        notes["dosage"] = dosage
    frequency = _extract_frequency(normalized)
    if frequency:
        notes["frequency"] = frequency
    reason = _extract_reason(normalized)
    if reason:
        notes["reason"] = reason
    return notes


def parse_medication_pending_answer(
    normalized: str,
    original: str,
    *,
    pending_field: str,
) -> MedicationParseResult:
    """
    Interpret a natural medication/antibiotics answer in pending-question context.
    """
    from app.nlp.boolean import parse_boolean_answer

    text = strip_conversational_leadin(normalized)
    supplemental = extract_medication_supplemental(text, field=pending_field)

    if pending_field == ANTIBIOTICS_FIELD:
        negative = _matches_any(NEGATIVE_ANTIBIOTICS_PATTERNS, text)
        if negative:
            return MedicationParseResult(
                value=False,
                confidence=0.94,
                source_text=original.strip(),
                supplemental=supplemental,
            )
        positive = _matches_any(POSITIVE_ANTIBIOTICS_PATTERNS, text)
        if positive:
            return MedicationParseResult(
                value=True,
                confidence=0.93,
                source_text=original.strip(),
                supplemental=supplemental,
            )
    else:
        negative = _matches_any(NEGATIVE_MEDICATION_PATTERNS, text)
        if negative:
            return MedicationParseResult(
                value=False,
                confidence=0.94,
                source_text=original.strip(),
                supplemental=supplemental,
            )
        positive = _matches_any(POSITIVE_MEDICATION_PATTERNS, text)
        if positive:
            return MedicationParseResult(
                value=True,
                confidence=0.92,
                source_text=original.strip(),
                supplemental=supplemental,
            )

    boolean = parse_boolean_answer(text)
    if boolean is not None:
        return MedicationParseResult(
            value=boolean,
            confidence=0.96,
            source_text=original.strip(),
            supplemental=supplemental,
        )

    if supplemental.get("medication_name") or supplemental.get("dosage"):
        return MedicationParseResult(
            value=True,
            confidence=0.9,
            source_text=original.strip(),
            supplemental=supplemental,
        )

    if re.search(r"\b(?:medication|medicine|meds)\b", text):
        negated = re.search(
            r"\b(?:no|not|never|without|don't|do not)\b.{0,20}\b(?:medication|medicine|meds)\b",
            text,
        )
        if negated:
            return MedicationParseResult(
                value=False,
                confidence=0.9,
                source_text=original.strip(),
            )
        return MedicationParseResult(
            value=True,
            confidence=0.88,
            source_text=original.strip(),
            supplemental=supplemental,
        )

    return MedicationParseResult(value=None, supplemental=supplemental)
