"""BloodRequest-aligned field definitions for recipient conversations."""

from __future__ import annotations

from dataclasses import dataclass

# Mirrors backend BloodRequest.js required/optional fields used in CreateBloodRequestScreen.
REQUEST_FIELD_KEYS: tuple[str, ...] = (
    "blood_type_needed",
    "units_needed",
    "urgency",
    "hospital_name",
    "hospital_city",
    "location_city",
    "location_country",
)

OPTIONAL_REQUEST_FIELD_KEYS: tuple[str, ...] = (
    "hospital_address_line",
    "location_address_line",
    "required_date",
    "medical_notes",
    "title",
)

URGENCY_VALUES: tuple[str, ...] = ("emergency", "urgent", "normal")


@dataclass(frozen=True)
class RequestFieldSpec:
    key: str
    question: str
    required: bool = True


REQUEST_FIELD_SPECS: tuple[RequestFieldSpec, ...] = (
    RequestFieldSpec("blood_type_needed", "What blood type is needed?"),
    RequestFieldSpec("units_needed", "How many units are needed?"),
    RequestFieldSpec(
        "urgency",
        "Is this request emergency, urgent, or normal priority?",
    ),
    RequestFieldSpec("hospital_name", "Which hospital is this for?"),
    RequestFieldSpec("hospital_city", "Which city is the hospital in?"),
    RequestFieldSpec("location_city", "Which city should donors see for this request?"),
    RequestFieldSpec("location_country", "Which country is the request location in?"),
    RequestFieldSpec(
        "hospital_address_line",
        "Do you have a hospital address to add (optional)?",
        required=False,
    ),
    RequestFieldSpec(
        "location_address_line",
        "Do you have a location address to add (optional)?",
        required=False,
    ),
    RequestFieldSpec(
        "required_date",
        "Is there a specific date the blood is needed by (optional)?",
        required=False,
    ),
    RequestFieldSpec(
        "medical_notes",
        "Would you like to add any medical notes (optional)?",
        required=False,
    ),
    RequestFieldSpec(
        "title",
        "Would you like to add a short title for the request (optional)?",
        required=False,
    ),
)

REQUIRED_FIELD_SPECS: tuple[RequestFieldSpec, ...] = tuple(
    spec for spec in REQUEST_FIELD_SPECS if spec.required
)

FIELD_QUESTIONS: dict[str, str] = {spec.key: spec.question for spec in REQUEST_FIELD_SPECS}

ACTIVE_FLOW_BLOOD_REQUEST = "blood_request"
