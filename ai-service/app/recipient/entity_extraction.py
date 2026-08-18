"""Extract BloodRequest-aligned entities from natural recipient messages."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum

from app.recipient.blood_type_parser import (
    extract_blood_types,
    extract_primary_blood_type,
    parse_standalone_blood_type_answer,
)
from app.recipient.field_specs import URGENCY_VALUES
from app.recipient.conversation_signals import (
    COMPATIBILITY_SIGNAL_PATTERN,
    FIND_DONOR_SIGNAL_PATTERN,
    GENERAL_INFO_SIGNAL_PATTERN,
    REQUEST_INFORMATION_SIGNAL_PATTERN,
    REQUEST_STATUS_SIGNAL_PATTERN,
    normalize_for_analysis,
)
from app.recipient.location_parser import extract_location_entities
from app.recipient.hospital_parser import (
    apply_pending_field_scope,
    extract_hospital_city_from_message,
    extract_hospital_name,
    looks_like_city_only,
    looks_like_hospital_name,
)
from app.recipient.medical_safety import is_medical_safety_question, is_pregnancy_context_message

WORD_NUMBERS: dict[str, int] = {
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
}

CORRECTION_MARKERS = (
    r"\bactually\b",
    r"\bi meant\b",
    r"\bmake that\b",
    r"\bnot .+ but\b",
    r"\bno,? sorry\b",
    r"\bsorry,? it(?:'s|\s+is)\b",
    r"\bcorrect(?:ion| that)\b",
    r"\bchange (?:it|that) to\b",
)

MEDICAL_OUT_OF_SCOPE_PATTERNS = (
    r"\b(?:diagnose|diagnosis|prescribe|prescription|what disease|what condition)\b",
    r"\b(?:should i take|what medicine|what treatment)\b",
    r"\b(?:should .+ receive|approve (?:the )?transfusion)\b",
)

UNITS_PATTERN = re.compile(
    r"\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:units?|bags?)\b",
    re.IGNORECASE,
)
CORRECTION_UNITS_PATTERN = re.compile(
    r"\b(?:make that|change (?:it|that) to)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b",
    re.IGNORECASE,
)
BARE_NUMBER_PATTERN = re.compile(r"^\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*[.!]?$", re.IGNORECASE)

HOSPITAL_NAME_PATTERN = re.compile(
    r"(?:at|for)\s+(?:the\s+)?([A-Z][\w\s'-]{2,60}?)(?:\s+hospital|\s+medical\s+center|\s+clinic)\b",
    re.IGNORECASE,
)
HOSPITAL_NAME_ALT = re.compile(
    r"\bhospital(?:\s+is|\s+name\s+is)?\s+(?:called\s+)?([A-Z][\w\s'-]{2,60})",
    re.IGNORECASE,
)

CITY_IN_PATTERN = re.compile(
    r"\b(?:in|at)\s+([A-Z][\w\s'-]{2,40})\b"
)
COUNTRY_PATTERN = re.compile(
    r"\b(?:country|located in)\s+([A-Z][\w\s'-]{2,40})\b",
    re.IGNORECASE,
)

DATE_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\btomorrow\b",
        r"\btoday\b",
        r"\bnext week\b",
        r"\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        r"\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        r"\bneeded\s+(?:by|on|for)\s+(.{3,30}?)(?:[,.!?]|$)",
    )
)


class MessageType(str, Enum):
    QUESTION = "question"
    INFORMATION = "information"
    REQUEST = "request"
    CORRECTION = "correction"
    CONFIRMATION = "confirmation"
    FOLLOW_UP = "follow_up"
    MEDICAL_OUT_OF_SCOPE = "medical_out_of_scope"
    GREETING = "greeting"
    UNKNOWN = "unknown"


@dataclass
class ExtractedEntities:
    blood_types: list[str] = field(default_factory=list)
    blood_type: str | None = None
    units: int | None = None
    urgency: str | None = None
    hospital_name: str | None = None
    hospital_city: str | None = None
    location_city: str | None = None
    location_country: str | None = None
    hospital_address_line: str | None = None
    location_address_line: str | None = None
    required_date: str | None = None
    medical_notes: str | None = None
    title: str | None = None
    message_type: MessageType = MessageType.UNKNOWN
    is_correction: bool = False
    request_signal: bool = False
    compatibility_signal: bool = False
    find_donor_signal: bool = False
    request_status_signal: bool = False
    request_information_signal: bool = False
    general_info_signal: bool = False
    greeting_signal: bool = False


def _parse_number(raw: str) -> int | None:
    token = raw.lower().strip()
    if token.isdigit():
        value = int(token)
        return value if value >= 1 else None
    return WORD_NUMBERS.get(token)


def _extract_units(message: str, pending_field: str | None) -> int | None:
    correction = CORRECTION_UNITS_PATTERN.search(message)
    if correction:
        return _parse_number(correction.group(1))

    match = UNITS_PATTERN.search(message)
    if match:
        return _parse_number(match.group(1))

    if pending_field == "units_needed":
        bare = BARE_NUMBER_PATTERN.match(message.strip())
        if bare:
            return _parse_number(bare.group(1))

    return None


def _extract_urgency(normalized: str) -> str | None:
    if re.search(r"\bemergency\b|\basap\b|\bcritical\b|\blife.?threatening\b", normalized):
        return "emergency"
    if re.search(r"\burgent(?:ly)?\b|\bas soon as possible\b", normalized):
        return "urgent"
    if re.search(r"\bnormal(?:ly)?\b|\bnot urgent\b|\bstandard priority\b", normalized):
        return "normal"
    return None


def _extract_hospital_name_legacy(message: str) -> str | None:
    if re.search(r"\bhospital\s+is\s+in\b", message, re.IGNORECASE):
        return None
    for pattern in (HOSPITAL_NAME_PATTERN, HOSPITAL_NAME_ALT):
        match = pattern.search(message)
        if match:
            name = match.group(1).strip(" .,")
            if len(name) >= 3:
                return name
    return None


def _extract_city(message: str, normalized: str, *, pending_field: str | None = None) -> str | None:
    if pending_field == "hospital_name":
        return None
    if re.match(r"^\s*hospital\s+[A-Za-z]", message.strip(), re.IGNORECASE):
        return None

    in_match = re.search(
        r"\b(?:in|at)\s+([A-Za-z][\w\s'-]{2,40})\b",
        message,
        re.IGNORECASE,
    )
    if in_match:
        city = in_match.group(1).strip(" .,")
        lowered = city.lower()
        if lowered not in {"the hospital", "a hospital", "this hospital", "my hospital"}:
            return city
    return None


def _extract_country(message: str) -> str | None:
    match = COUNTRY_PATTERN.search(message)
    if match:
        return match.group(1).strip(" .,")
    return None


def _extract_required_date(normalized: str) -> str | None:
    for pattern in DATE_PATTERNS:
        match = pattern.search(normalized)
        if match:
            if match.lastindex:
                return match.group(1).strip()
            return match.group(0).strip()
    return None


def _detect_message_type(
    message: str,
    normalized: str,
    entities: ExtractedEntities,
    pending_field: str | None,
) -> MessageType:
    if any(re.search(p, normalized) for p in MEDICAL_OUT_OF_SCOPE_PATTERNS):
        return MessageType.MEDICAL_OUT_OF_SCOPE
    if is_medical_safety_question(message):
        return MessageType.MEDICAL_OUT_OF_SCOPE
    if is_pregnancy_context_message(message):
        return MessageType.MEDICAL_OUT_OF_SCOPE

    if any(re.search(p, normalized) for p in CORRECTION_MARKERS):
        return MessageType.CORRECTION

    if re.search(r"^(hi|hello|hey|good morning|good afternoon|good evening)\b", normalized):
        return MessageType.GREETING

    if normalized.endswith("?") or re.search(
        r"^(how|what|why|when|where|can|could|is|are|do|does|who)\b", normalized
    ):
        if entities.compatibility_signal or entities.find_donor_signal or entities.general_info_signal:
            return MessageType.QUESTION
        if entities.request_information_signal and not entities.blood_type:
            return MessageType.QUESTION

    if entities.request_signal:
        return MessageType.REQUEST

    if pending_field and (
        entities.blood_type
        or entities.units is not None
        or entities.urgency
        or entities.hospital_name
        or entities.hospital_city
        or entities.location_city
        or entities.location_country
    ):
        return MessageType.FOLLOW_UP

    if (
        entities.blood_type
        or entities.units is not None
        or entities.urgency
        or entities.hospital_name
        or entities.hospital_city
        or entities.location_city
        or entities.location_country
        or entities.required_date
    ):
        return MessageType.INFORMATION

    if re.search(r"^(yes|yeah|yep|ok|okay|sure|correct|that's right)\b", normalized):
        return MessageType.CONFIRMATION

    return MessageType.UNKNOWN


def extract_entities(message: str, *, pending_field: str | None = None) -> ExtractedEntities:
    normalized = normalize_for_analysis(message)
    entities = ExtractedEntities()

    if is_pregnancy_context_message(message):
        entities.message_type = MessageType.MEDICAL_OUT_OF_SCOPE
        return entities

    entities.is_correction = any(re.search(p, normalized) for p in CORRECTION_MARKERS)

    if pending_field == "blood_type_needed":
        standalone = parse_standalone_blood_type_answer(message)
        if standalone:
            entities.blood_types = [standalone]
    elif pending_field != "blood_type_needed":
        entities.blood_types = extract_blood_types(message)

    entities.blood_type = entities.blood_types[0] if entities.blood_types else None
    if not entities.blood_type and pending_field != "blood_type_needed":
        entities.blood_type = extract_primary_blood_type(message)

    entities.units = _extract_units(message, pending_field)
    entities.urgency = _extract_urgency(normalized)

    hospital_name = extract_hospital_name(message, pending_field=pending_field)
    if not hospital_name and pending_field != "hospital_name":
        hospital_name = _extract_hospital_name_legacy(message)

    hospital_city = extract_hospital_city_from_message(message)
    if not hospital_city:
        hospital_city = _extract_city(message, normalized, pending_field=pending_field)

    location = extract_location_entities(message, pending_field=pending_field)
    if location.hospital_city:
        hospital_city = location.hospital_city
    location_city = location.location_city
    location_country = location.location_country

    if not location_city and pending_field in {None, "location_city", "hospital_city"}:
        location_city = hospital_city
    if not location_country and pending_field in {None, "location_country"}:
        location_country = _extract_country(message)

    hospital_name, hospital_city, location_city, location_country = apply_pending_field_scope(
        pending_field=pending_field,
        hospital_name=hospital_name,
        hospital_city=hospital_city,
        location_city=location_city,
        location_country=location_country,
        is_correction=entities.is_correction,
    )

    entities.hospital_name = hospital_name
    entities.hospital_city = hospital_city
    entities.location_city = location_city
    entities.location_country = location_country

    entities.required_date = _extract_required_date(normalized)

    entities.request_information_signal = bool(
        REQUEST_INFORMATION_SIGNAL_PATTERN.search(normalized)
        and not is_medical_safety_question(message)
    )
    entities.request_signal = bool(
        re.search(
            r"\b(?:need blood|needs blood|need .{0,30}blood|create (?:a )?blood request|"
            r"request blood|request for blood|make (?:a )?request|submit (?:a )?request|"
            r"looking for blood|we need blood|"
            r"my (?:mother|mom|father|dad|parent|child|patient) needs blood)\b",
            normalized,
        )
        and not entities.request_information_signal
    )
    entities.compatibility_signal = bool(
        COMPATIBILITY_SIGNAL_PATTERN.search(normalized)
        or (
            entities.blood_types
            and re.search(
                r"\b(?:receive|compatible|donate to|donate for|give to|give blood to)\b",
                normalized,
            )
        )
    )
    entities.find_donor_signal = bool(FIND_DONOR_SIGNAL_PATTERN.search(normalized))
    entities.request_status_signal = bool(REQUEST_STATUS_SIGNAL_PATTERN.search(normalized))
    entities.general_info_signal = bool(GENERAL_INFO_SIGNAL_PATTERN.search(normalized))
    entities.greeting_signal = bool(
        re.search(r"^(hi|hello|hey|good morning|good afternoon|good evening)\b", normalized)
    )

    entities.message_type = _detect_message_type(message, normalized, entities, pending_field)
    return entities
