"""Reusable location, city, and country parsing for recipient messages."""

from __future__ import annotations

import re
from dataclasses import dataclass

# Common words that are not place names when answering pending fields.
NON_PLACE_TOKENS = frozenset(
    {
        "yes",
        "no",
        "okay",
        "ok",
        "thanks",
        "thank",
        "you",
        "the",
        "a",
        "an",
        "in",
        "at",
        "is",
        "it",
        "this",
        "that",
        "we",
        "are",
        "i",
        "me",
        "my",
        "our",
        "urgent",
        "emergency",
        "normal",
        "blood",
        "units",
        "unit",
        "hospital",
    }
)

COUNTRY_INTRO_PATTERN = re.compile(
    r"\b(?:country|location|place)\s+is\s+([A-Za-z][A-Za-z\s'-]{1,40})\b",
    re.IGNORECASE,
)
IN_PLACE_PATTERN = re.compile(
    r"\b(?:in|from|at)\s+([A-Za-z][A-Za-z\s'-]{1,40})\b",
    re.IGNORECASE,
)
WE_ARE_IN_PATTERN = re.compile(
    r"\b(?:we(?:'re|\s+are)|i(?:'m|\s+am))\s+in\s+([A-Za-z][A-Za-z\s'-]{1,40})\b",
    re.IGNORECASE,
)
COMMA_SEPARATED_PATTERN = re.compile(
    r"^\s*([A-Za-z][A-Za-z\s'-]{1,40})\s*,\s*([A-Za-z][A-Za-z\s'-]{1,40})\s*\.?\s*$"
)
HOSPITAL_IN_PLACE_PATTERN = re.compile(
    r"\bhospital\s+is\s+in\s+([A-Za-z][A-Za-z\s'-]{1,40})(?:\s*,\s*([A-Za-z][A-Za-z\s'-]{1,40}))?",
    re.IGNORECASE,
)


@dataclass
class LocationEntities:
    hospital_city: str | None = None
    location_city: str | None = None
    location_country: str | None = None


def _title_place(value: str) -> str:
    cleaned = value.strip(" .,!?:;")
    if not cleaned:
        return ""
    return " ".join(part.capitalize() for part in cleaned.split())


def _is_plausible_place(name: str) -> bool:
    tokens = name.lower().split()
    if not tokens or len(name) < 2:
        return False
    if all(token in NON_PLACE_TOKENS for token in tokens):
        return False
    if tokens[0] in NON_PLACE_TOKENS and len(tokens) == 1:
        return False
    return True


def _parse_standalone_place(message: str) -> str | None:
    stripped = message.strip().rstrip(".!?")
    if not stripped or "?" in stripped:
        return None
    if len(stripped.split()) > 4:
        return None
    if not re.match(r"^[A-Za-z][A-Za-z\s',-]*$", stripped):
        return None
    place = _title_place(stripped)
    return place if _is_plausible_place(place) else None


def extract_location_entities(
    message: str,
    *,
    pending_field: str | None = None,
) -> LocationEntities:
    result = LocationEntities()
    stripped = message.strip()

    hospital_match = HOSPITAL_IN_PLACE_PATTERN.search(message)
    if hospital_match:
        city = _title_place(hospital_match.group(1))
        if _is_plausible_place(city):
            result.hospital_city = city
            result.location_city = city
        if hospital_match.group(2):
            country = _title_place(hospital_match.group(2))
            if _is_plausible_place(country):
                result.location_country = country
        return result

    comma_match = COMMA_SEPARATED_PATTERN.match(stripped)
    if comma_match:
        first = _title_place(comma_match.group(1))
        second = _title_place(comma_match.group(2))
        if _is_plausible_place(first):
            result.location_city = first
            result.hospital_city = first
        if _is_plausible_place(second):
            result.location_country = second
        return result

    country_intro = COUNTRY_INTRO_PATTERN.search(message)
    if country_intro:
        country = _title_place(country_intro.group(1))
        if _is_plausible_place(country):
            result.location_country = country

    for pattern in (WE_ARE_IN_PATTERN, IN_PLACE_PATTERN):
        match = pattern.search(message)
        if match:
            place = _title_place(match.group(1))
            if _is_plausible_place(place):
                if pending_field == "location_country" or "country" in message.lower():
                    result.location_country = result.location_country or place
                elif pending_field in {"location_city", "hospital_city"}:
                    result.location_city = result.location_city or place
                    if pending_field == "hospital_city":
                        result.hospital_city = result.hospital_city or place
                else:
                    result.location_city = result.location_city or place
            break

    if pending_field == "location_country" and not result.location_country:
        standalone = _parse_standalone_place(stripped)
        if standalone:
            result.location_country = standalone

    if pending_field in {"location_city", "hospital_city"} and not (
        result.location_city or result.hospital_city
    ):
        standalone = _parse_standalone_place(stripped)
        if standalone:
            result.location_city = standalone
            if pending_field == "hospital_city":
                result.hospital_city = standalone

    if pending_field == "hospital_name":
        pass  # hospital name handled elsewhere

    return result
