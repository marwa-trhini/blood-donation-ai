"""Deterministic intent detection for recipient assistance messages."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.recipient_schemas import RecipientIntent
from app.services.blood_compatibility import normalize_blood_type

BLOOD_TYPE_PATTERN = re.compile(
    r"\b(?:"
    r"A\s*[-+]?\s*(?:positive|negative)?|"
    r"B\s*[-+]?\s*(?:positive|negative)?|"
    r"AB\s*[-+]?\s*(?:positive|negative)?|"
    r"O\s*[-+]?\s*(?:positive|negative)?"
    r")\b",
    re.IGNORECASE,
)

UNITS_PATTERN = re.compile(r"\b(\d+)\s*(?:units?|bags?)\b", re.IGNORECASE)

MEDICAL_DIAGNOSIS_PATTERNS = (
    r"\b(?:diagnose|diagnosis|prescribe|prescription|what disease|what condition)\b",
    r"\b(?:should i take|what medicine|what treatment)\b",
    r"\b(?:how many units do i need|how much blood do i need medically)\b",
)


@dataclass
class RecipientParseResult:
    intent: RecipientIntent
    blood_types: list[str]
    units_mentioned: int | None
    topic: str | None = None


def _extract_blood_types(normalized: str) -> list[str]:
    found: list[str] = []
    for match in BLOOD_TYPE_PATTERN.finditer(normalized):
        normalized_type = normalize_blood_type(match.group(0))
        if normalized_type and normalized_type not in found:
            found.append(normalized_type)
    return found


def _is_compatibility_question(normalized: str) -> bool:
    patterns = (
        r"\b(?:can|could)\s+.+\s+(?:receive|get|take)\b",
        r"\b(?:compatible|compatibility)\b",
        r"\bwho can (?:donate|give) (?:to|for)\b",
        r"\bis .+ compatible with\b",
    )
    return any(re.search(p, normalized) for p in patterns)


def detect_recipient_intent(message: str) -> RecipientParseResult:
    normalized = message.lower().strip()
    blood_types = _extract_blood_types(normalized)
    units_match = UNITS_PATTERN.search(normalized)
    units_mentioned = int(units_match.group(1)) if units_match else None

    if any(re.search(p, normalized) for p in MEDICAL_DIAGNOSIS_PATTERNS):
        return RecipientParseResult(
            intent=RecipientIntent.MEDICAL_OUT_OF_SCOPE,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(r"^(hi|hello|hey|good morning|good afternoon|good evening)\b", normalized):
        return RecipientParseResult(
            intent=RecipientIntent.GREETING,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(r"\bwhat do you mean\b|\bwhat does .+ mean\b", normalized):
        return RecipientParseResult(
            intent=RecipientIntent.CLARIFICATION,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if _is_compatibility_question(normalized) or (
        blood_types and re.search(r"\b(?:receive|compatible|donate to|donate for)\b", normalized)
    ):
        return RecipientParseResult(
            intent=RecipientIntent.BLOOD_COMPATIBILITY,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(
        r"\b(?:find (?:a )?donors?|matching donor|contact donor|see donors|any donors|"
        r"donor match|who can donate to me)\b",
        normalized,
    ):
        return RecipientParseResult(
            intent=RecipientIntent.FIND_DONOR,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(
        r"\b(?:my request|request status|status of my request|track request|"
        r"submitted request|open request)\b",
        normalized,
    ):
        return RecipientParseResult(
            intent=RecipientIntent.REQUEST_STATUS,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(
        r"\b(?:what information|what details|what do i need|information (?:do i|to)|"
        r"how many units|units should i|required fields|what is required)\b",
        normalized,
    ):
        return RecipientParseResult(
            intent=RecipientIntent.REQUEST_INFORMATION,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(
        r"\b(?:request blood|create (?:a )?blood request|need blood|need .{0,20}blood|"
        r"request for blood|submit (?:a )?request|make (?:a )?request|what should i do)\b",
        normalized,
    ):
        return RecipientParseResult(
            intent=RecipientIntent.CREATE_BLOOD_REQUEST,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if re.search(
        r"\b(?:why is .+ rare|why (?:is|are) blood|blood donation important|"
        r"what does blood type|universal donor|universal recipient|"
        r"why donate blood|importance of blood)\b",
        normalized,
    ):
        return RecipientParseResult(
            intent=RecipientIntent.GENERAL_BLOOD_INFORMATION,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    if blood_types and re.search(r"\b(?:need|require|looking for)\b", normalized):
        return RecipientParseResult(
            intent=RecipientIntent.CREATE_BLOOD_REQUEST,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    return RecipientParseResult(
        intent=RecipientIntent.UNKNOWN,
        blood_types=blood_types,
        units_mentioned=units_mentioned,
    )


def parse_compatibility_pair(
    normalized: str, blood_types: list[str]
) -> tuple[str | None, str | None]:
    if len(blood_types) >= 2:
        return blood_types[0], blood_types[1]

    if len(blood_types) == 1:
        if re.search(r"\bwho can (?:donate|give)\b", normalized):
            return blood_types[0], None
        receive_from = re.search(
            r"(?:receive|get|take)\s+(?:from\s+)?([a-z0-9+\-\s]+?)(?:\?|$)",
            normalized,
        )
        if receive_from:
            donor = normalize_blood_type(receive_from.group(1))
            return blood_types[0], donor
        return blood_types[0], None

    return None, None
