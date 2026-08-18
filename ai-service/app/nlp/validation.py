"""Domain validation for extracted screening field values."""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any


class ValidationOutcome(str, Enum):
    VALID = "valid"
    INVALID = "invalid"
    NEEDS_CLARIFICATION = "needs_clarification"


@dataclass(frozen=True)
class ValidationResult:
    outcome: ValidationOutcome
    message: str | None = None


def validate_field_value(field: str, value: Any) -> ValidationResult:
    """Validate an extracted value against reasonable domain ranges."""
    if value is None:
        return ValidationResult(ValidationOutcome.VALID)

    if field == "age":
        if not isinstance(value, (int, float)):
            return ValidationResult(ValidationOutcome.INVALID, "Age must be a number.")
        age = int(value)
        if age < 10 or age > 100:
            return ValidationResult(
                ValidationOutcome.NEEDS_CLARIFICATION,
                "That age seems unusual for screening. Could you confirm your age?",
            )
        return ValidationResult(ValidationOutcome.VALID)

    if field == "weight_kg":
        if not isinstance(value, (int, float)):
            return ValidationResult(ValidationOutcome.INVALID, "Weight must be a number.")
        weight = float(value)
        if weight < 30 or weight > 250:
            return ValidationResult(
                ValidationOutcome.NEEDS_CLARIFICATION,
                "That weight seems unusual. Could you confirm your weight in kilograms?",
            )
        return ValidationResult(ValidationOutcome.VALID)

    if field == "hemoglobin_value":
        if not isinstance(value, (int, float)):
            return ValidationResult(
                ValidationOutcome.INVALID, "Hemoglobin must be a numeric value."
            )
        hb = float(value)
        if hb < 5.0 or hb > 25.0:
            return ValidationResult(
                ValidationOutcome.NEEDS_CLARIFICATION,
                "That hemoglobin value seems unusual. Could you confirm the result?",
            )
        return ValidationResult(ValidationOutcome.VALID)

    if field == "days_since_last_donation":
        if not isinstance(value, (int, float)):
            return ValidationResult(ValidationOutcome.INVALID)
        days = int(value)
        if days < 0 or days > 365 * 30:
            return ValidationResult(
                ValidationOutcome.NEEDS_CLARIFICATION,
                "That donation timing seems unusual. When did you last donate?",
            )
        return ValidationResult(ValidationOutcome.VALID)

    if isinstance(value, bool):
        return ValidationResult(ValidationOutcome.VALID)

    return ValidationResult(ValidationOutcome.VALID)


def validate_body_temperature_celsius(value: float) -> ValidationResult:
    """Validate a body temperature reading in Celsius."""
    if value < 35.0 or value > 42.0:
        return ValidationResult(
            ValidationOutcome.NEEDS_CLARIFICATION,
            "That temperature does not look like a typical body temperature. "
            "Do you currently have a fever?",
        )
    return ValidationResult(ValidationOutcome.VALID)
