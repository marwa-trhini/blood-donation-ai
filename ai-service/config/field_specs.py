"""
Declarative field metadata for screening conversation parsing and validation.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class FieldKind(str, Enum):
    NUMERIC = "numeric"
    BOOLEAN = "boolean"
    RECENCY_BOOLEAN = "recency_boolean"
    CATEGORICAL = "categorical"
    DONATION_HISTORY = "donation_history"
    HEMOGLOBIN = "hemoglobin"


@dataclass(frozen=True)
class FieldSpec:
    name: str
    kind: FieldKind
    recency_aware: bool = False


FIELD_SPECS: dict[str, FieldSpec] = {
    "age": FieldSpec("age", FieldKind.NUMERIC),
    "weight_kg": FieldSpec("weight_kg", FieldKind.NUMERIC),
    "days_since_last_donation": FieldSpec(
        "days_since_last_donation", FieldKind.DONATION_HISTORY, recency_aware=True
    ),
    "recent_illness": FieldSpec(
        "recent_illness", FieldKind.RECENCY_BOOLEAN, recency_aware=True
    ),
    "fever": FieldSpec("fever", FieldKind.BOOLEAN),
    "current_medication": FieldSpec("current_medication", FieldKind.BOOLEAN),
    "antibiotics": FieldSpec("antibiotics", FieldKind.BOOLEAN),
    "recent_surgery": FieldSpec(
        "recent_surgery", FieldKind.RECENCY_BOOLEAN, recency_aware=True
    ),
    "recent_dental_procedure": FieldSpec(
        "recent_dental_procedure", FieldKind.RECENCY_BOOLEAN, recency_aware=True
    ),
    "recent_tattoo_or_piercing": FieldSpec(
        "recent_tattoo_or_piercing", FieldKind.RECENCY_BOOLEAN, recency_aware=True
    ),
    "pregnancy_status": FieldSpec("pregnancy_status", FieldKind.CATEGORICAL),
    "chronic_condition_reported": FieldSpec(
        "chronic_condition_reported", FieldKind.BOOLEAN
    ),
    "recent_blood_transfusion": FieldSpec(
        "recent_blood_transfusion", FieldKind.RECENCY_BOOLEAN, recency_aware=True
    ),
    "hemoglobin_known": FieldSpec("hemoglobin_known", FieldKind.HEMOGLOBIN),
    "hemoglobin_value": FieldSpec("hemoglobin_value", FieldKind.HEMOGLOBIN),
}
