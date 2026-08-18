"""
Deterministic ABO/Rh red-cell compatibility utilities.

Mirrors backend/src/utils/bloodCompatibility.js for educational recipient guidance.
This is NOT a clinical transfusion decision system.
"""

from __future__ import annotations

from dataclasses import dataclass

ALLOWED_BLOOD_TYPES: tuple[str, ...] = (
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-",
)

RECIPIENT_TO_DONOR_COMPATIBILITY: dict[str, tuple[str, ...]] = {
    "A+": ("A+", "A-", "O+", "O-"),
    "A-": ("A-", "O-"),
    "B+": ("B+", "B-", "O+", "O-"),
    "B-": ("B-", "O-"),
    "AB+": ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"),
    "AB-": ("A-", "B-", "AB-", "O-"),
    "O+": ("O+", "O-"),
    "O-": ("O-",),
}

BLOOD_TYPE_ALIASES: dict[str, str] = {
    "a positive": "A+",
    "a+": "A+",
    "a negative": "A-",
    "a-": "A-",
    "b positive": "B+",
    "b+": "B+",
    "b negative": "B-",
    "b-": "B-",
    "ab positive": "AB+",
    "ab+": "AB+",
    "ab negative": "AB-",
    "ab-": "AB-",
    "o positive": "O+",
    "o+": "O+",
    "o negative": "O-",
    "o-": "O-",
}


@dataclass(frozen=True)
class CompatibilityAnswer:
    valid: bool
    recipient_type: str | None
    donor_type: str | None
    compatible: bool | None
    compatible_donors: tuple[str, ...]
    explanation: str
    disclaimer: str = (
        "This is general educational information about blood type compatibility. "
        "Final transfusion compatibility is determined by qualified medical "
        "professionals and proper blood-bank testing."
    )


def normalize_blood_type(value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    if stripped in ALLOWED_BLOOD_TYPES:
        return stripped
    alias = BLOOD_TYPE_ALIASES.get(stripped.lower())
    if alias:
        return alias
    compact = stripped.upper().replace(" ", "")
    mappings = {
        "A+": "A+",
        "A-": "A-",
        "B+": "B+",
        "B-": "B-",
        "AB+": "AB+",
        "AB-": "AB-",
        "O+": "O+",
        "O-": "O-",
    }
    for key, canonical in mappings.items():
        if compact == key:
            return canonical
    lowered = stripped.lower()
    for phrase, canonical in BLOOD_TYPE_ALIASES.items():
        if lowered == phrase:
            return canonical

    return None


def is_valid_blood_type(blood_type: str | None) -> bool:
    return normalize_blood_type(blood_type) in ALLOWED_BLOOD_TYPES


def get_compatible_donor_blood_types(recipient_blood_type: str) -> tuple[str, ...]:
    normalized = normalize_blood_type(recipient_blood_type)
    if not normalized:
        return ()
    return RECIPIENT_TO_DONOR_COMPATIBILITY.get(normalized, ())


def is_donor_compatible_with_recipient(
    donor_blood_type: str,
    recipient_blood_type_needed: str,
) -> bool:
    normalized_donor = normalize_blood_type(donor_blood_type)
    if not normalized_donor:
        return False
    return normalized_donor in get_compatible_donor_blood_types(recipient_blood_type_needed)


def explain_who_can_donate_to(recipient_blood_type: str) -> CompatibilityAnswer:
    normalized = normalize_blood_type(recipient_blood_type)
    if not normalized:
        return CompatibilityAnswer(
            valid=False,
            recipient_type=None,
            donor_type=None,
            compatible=None,
            compatible_donors=(),
            explanation="I couldn't recognize that blood type. Please use a standard type such as A+, O-, or AB+.",
        )
    donors = get_compatible_donor_blood_types(normalized)
    donor_list = ", ".join(donors)
    return CompatibilityAnswer(
        valid=True,
        recipient_type=normalized,
        donor_type=None,
        compatible=None,
        compatible_donors=donors,
        explanation=(
            f"A person with blood type {normalized} can generally receive red blood cells "
            f"from donors with these blood types: {donor_list}."
        ),
    )


def explain_can_recipient_receive_from_donor(
    recipient_blood_type: str,
    donor_blood_type: str,
) -> CompatibilityAnswer:
    normalized_recipient = normalize_blood_type(recipient_blood_type)
    normalized_donor = normalize_blood_type(donor_blood_type)
    if not normalized_recipient or not normalized_donor:
        return CompatibilityAnswer(
            valid=False,
            recipient_type=normalized_recipient,
            donor_type=normalized_donor,
            compatible=None,
            compatible_donors=(),
            explanation="I couldn't recognize one or both blood types. Please use standard types such as A+, O-, or AB+.",
        )
    compatible = is_donor_compatible_with_recipient(
        normalized_donor, normalized_recipient
    )
    if compatible:
        explanation = (
            f"In general educational terms, a {normalized_recipient} recipient may receive "
            f"red blood cells from an {normalized_donor} donor."
        )
    else:
        explanation = (
            f"In general educational terms, a {normalized_recipient} recipient is not typically "
            f"listed as compatible with an {normalized_donor} donor for red blood cell transfusion."
        )
    return CompatibilityAnswer(
        valid=True,
        recipient_type=normalized_recipient,
        donor_type=normalized_donor,
        compatible=compatible,
        compatible_donors=get_compatible_donor_blood_types(normalized_recipient),
        explanation=explanation,
    )
