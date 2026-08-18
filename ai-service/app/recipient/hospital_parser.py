"""Pending-field-aware hospital name and location parsing for recipient requests."""

from __future__ import annotations

import re

from app.recipient.location_parser import _is_plausible_place, _title_place

HOSPITAL_KEYWORDS = re.compile(
    r"\b(?:hospital|medical\s+center|medical\s+centre|clinic|hospital\s+center)\b",
    re.IGNORECASE,
)

# Name immediately before hospital keyword (search, not anchored to start of message).
NAME_BEFORE_HOSPITAL = re.compile(
    r"(?<!\w)([A-Za-z][\w\s'.,-]{1,60}?)\s+"
    r"(?:hospital|medical\s+center|medical\s+centre|clinic)\b",
    re.IGNORECASE,
)

NAME_BEFORE_HOSPITAL_STANDALONE = re.compile(
    r"^\s*(?:the\s+)?([A-Za-z][\w\s'.,-]{1,60}?)\s+"
    r"(?:hospital|medical\s+center|medical\s+centre|clinic)\s*\.?\s*$",
    re.IGNORECASE,
)

HOSPITAL_PREFIX = re.compile(
    r"^\s*(?:the\s+)?hospital(?:\s+is|\s+name\s+is|\s*:\s*)?\s*(?:called\s+)?"
    r"(?!in\b|at\b)([A-Za-z][\w\s'.,-]{1,80})\s*\.?\s*$",
    re.IGNORECASE,
)

AT_HOSPITAL = re.compile(
    r"\b(?:at|for)\s+(?:the\s+)?([A-Za-z][\w\s'.,-]{2,80}?)\s+"
    r"(?:hospital|medical\s+center|medical\s+centre|clinic)\b",
    re.IGNORECASE,
)

HOSPITAL_IS = re.compile(
    r"\b(?:the\s+)?hospital\s+is\s+(?!in\b|at\b)(?:called\s+)?([A-Za-z][\w\s'.,-]{2,80})\b",
    re.IGNORECASE,
)

COMBINED_HOSPITAL_CITY = re.compile(
    r"^\s*(?:the\s+)?([A-Za-z][\w\s'.,-]{2,80}?)\s+"
    r"(?:hospital|medical\s+center|medical\s+centre|clinic)\s+in\s+"
    r"([A-Za-z][\w\s'.,-]{2,40})\s*\.?\s*$",
    re.IGNORECASE,
)

HOSPITAL_IN_CITY_ONLY = re.compile(
    r"^\s*(?:the\s+)?hospital\s+is\s+in\s+([A-Za-z][\w\s'.,-]{2,40})\s*\.?\s*$",
    re.IGNORECASE,
)


def _is_valid_hospital_name_candidate(candidate: str) -> bool:
    """Reject blood-request phrasing accidentally captured before 'Hospital'."""
    lowered = candidate.lower()
    blocked = (
        "need",
        "units",
        "unit",
        "blood",
        "urgent",
        "urgency",
        "emergency",
        "negative",
        "positive",
        "donate",
        "request",
        "looking",
    )
    tokens = lowered.split()
    if any(token in blocked for token in tokens):
        return False
    return len(tokens) <= 8


def is_hospital_in_city_statement(message: str) -> bool:
    """True when the user gives a city via 'the hospital is in {city}'."""
    return bool(HOSPITAL_IN_CITY_ONLY.match(message.strip()))


def _normalize_hospital_name(raw: str) -> str:
    name = raw.strip(" .,!?:;")
    if not name:
        return ""
    lowered = name.lower()
    if lowered.startswith("in ") or lowered.startswith("at "):
        name = name[3:].strip()
    if HOSPITAL_KEYWORDS.search(name):
        return " ".join(part.capitalize() for part in name.split())
    return f"{_title_place(name)} Hospital"


def looks_like_hospital_name(message: str) -> bool:
    """True when the message plausibly names a hospital rather than only a city."""
    stripped = message.strip()
    if not stripped:
        return False
    if HOSPITAL_IN_CITY_ONLY.match(stripped):
        return False
    if HOSPITAL_KEYWORDS.search(stripped):
        return True
    if len(stripped.split()) >= 3:
        return True
    return bool(
        NAME_BEFORE_HOSPITAL_STANDALONE.match(stripped)
        or HOSPITAL_PREFIX.match(stripped)
        or AT_HOSPITAL.search(stripped)
        or HOSPITAL_IS.search(stripped)
    )


def looks_like_city_only(message: str) -> bool:
    """True for a short standalone place name without hospital cues."""
    stripped = message.strip().rstrip(".!?")
    if HOSPITAL_KEYWORDS.search(stripped):
        return False
    if HOSPITAL_IN_CITY_ONLY.match(stripped):
        return True
    if len(stripped.split()) > 2:
        return False
    from app.recipient.location_parser import _parse_standalone_place

    place = _parse_standalone_place(stripped)
    return place is not None


def extract_hospital_name(message: str, *, pending_field: str | None = None) -> str | None:
    """Extract a hospital name using general patterns (not hardcoded names)."""
    stripped = message.strip()
    if not stripped:
        return None

    if HOSPITAL_IN_CITY_ONLY.match(stripped):
        return None

    combined = COMBINED_HOSPITAL_CITY.match(stripped)
    if combined:
        return _normalize_hospital_name(combined.group(1))

    match = AT_HOSPITAL.search(stripped)
    if match:
        candidate = match.group(1).strip()
        if _is_valid_hospital_name_candidate(candidate):
            return _title_place(candidate)

    for pattern in (NAME_BEFORE_HOSPITAL_STANDALONE, HOSPITAL_PREFIX):
        if pattern is NAME_BEFORE_HOSPITAL_STANDALONE and len(stripped.split()) > 8:
            continue
        match = pattern.match(stripped)
        if match:
            candidate = match.group(1).strip()
            if _is_valid_hospital_name_candidate(candidate):
                return _normalize_hospital_name(candidate)

    match = NAME_BEFORE_HOSPITAL.search(stripped)
    if match:
        candidate = match.group(1).strip()
        if _is_valid_hospital_name_candidate(candidate):
            return _title_place(candidate)

    match = HOSPITAL_IS.search(stripped)
    if match:
        name = match.group(1).strip(" .,")
        if _is_plausible_place(name) and len(name.split()) <= 6:
            return _title_place(name) if len(name.split()) <= 4 else name.title()

    if pending_field == "hospital_name" and looks_like_hospital_name(stripped):
        if NAME_BEFORE_HOSPITAL_STANDALONE.match(stripped):
            return _normalize_hospital_name(NAME_BEFORE_HOSPITAL_STANDALONE.match(stripped).group(1))
        if len(stripped.split()) >= 2 and re.match(r"^[A-Za-z][A-Za-z0-9\s'.,-]+$", stripped):
            return _title_place(stripped)

    return None


def extract_hospital_city_from_message(message: str) -> str | None:
    city_only = HOSPITAL_IN_CITY_ONLY.match(message.strip())
    if city_only:
        city = _title_place(city_only.group(1))
        return city if _is_plausible_place(city) else None

    combined = COMBINED_HOSPITAL_CITY.match(message.strip())
    if combined:
        city = _title_place(combined.group(2))
        return city if _is_plausible_place(city) else None

    in_match = re.search(
        r"\b(?:hospital|medical\s+center|clinic)\s+in\s+([A-Za-z][\w\s'-]{2,40})\b",
        message,
        re.IGNORECASE,
    )
    if in_match:
        city = _title_place(in_match.group(1))
        return city if _is_plausible_place(city) else None
    return None


def apply_pending_field_scope(
    *,
    pending_field: str | None,
    hospital_name: str | None,
    hospital_city: str | None,
    location_city: str | None,
    location_country: str | None,
    is_correction: bool = False,
) -> tuple[str | None, str | None, str | None, str | None]:
    """
    Keep only fields appropriate for the current pending question.

    Prevents a hospital-name answer from populating city/country fields.
    """
    if not pending_field or is_correction:
        return hospital_name, hospital_city, location_city, location_country

    if pending_field == "hospital_name":
        if hospital_name:
            return hospital_name, None, None, None
        if hospital_city:
            return None, hospital_city, location_city or hospital_city, None
        return None, None, None, None
    if pending_field == "hospital_city":
        return None, hospital_city, None, location_country
    if pending_field == "location_city":
        return None, None, location_city, None
    if pending_field == "location_country":
        return None, None, None, location_country
    return hospital_name, hospital_city, location_city, location_country
