"""
Deterministic screening rules for preliminary eligibility assessment.

Uses centralized thresholds from config/dataset_assumptions.py.
These are PROJECT assumptions — not clinical guidelines.
"""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.dataset_assumptions import (
    HEMOGLOBIN_REVIEW_HIGH,
    HEMOGLOBIN_REVIEW_LOW,
    MAX_AGE,
    MIN_AGE,
    MIN_DAYS_BETWEEN_DONATIONS,
    MIN_WEIGHT_KG,
    WEIGHT_REVIEW_UPPER_KG,
)


def evaluate_deterministic_rules(
    collected: dict[str, Any],
    *,
    is_first_time_donor: bool | None = None,
) -> tuple[str | None, list[str]]:
    """
    Apply configured safety/policy checks before or alongside ML.

    Returns:
        (override_status, reasons)
        override_status is 'not_eligible', 'needs_review', or None
    """
    reasons: list[str] = []

    age = collected.get("age")
    if age is not None:
        if age < MIN_AGE:
            return "not_eligible", [
                f"Based on the configured prototype screening range, donors under {MIN_AGE} "
                "are preliminarily marked as not eligible. Confirm with official policy."
            ]
        if age > MAX_AGE:
            return "not_eligible", [
                f"Based on the configured prototype screening range, donors over {MAX_AGE} "
                "are preliminarily marked as not eligible. Confirm with official policy."
            ]

    weight = collected.get("weight_kg")
    if weight is not None and weight < MIN_WEIGHT_KG:
        return "not_eligible", [
            f"Based on the configured prototype minimum weight ({MIN_WEIGHT_KG} kg), "
            "this profile is preliminarily not eligible."
        ]

    if weight is not None and MIN_WEIGHT_KG <= weight < WEIGHT_REVIEW_UPPER_KG:
        reasons.append(
            f"Weight is near the configured prototype minimum ({MIN_WEIGHT_KG} kg); "
            "human review may be appropriate."
        )

    if collected.get("fever") is True:
        return "not_eligible", [
            "A current or recent fever is a preliminary deferral indicator in this prototype."
        ]

    if collected.get("antibiotics") is True:
        return "not_eligible", [
            "Current antibiotic use is a preliminary deferral indicator in this prototype."
        ]

    if collected.get("pregnancy_status") == "yes":
        return "not_eligible", [
            "Pregnancy is a preliminary deferral indicator in this prototype."
        ]

    days = collected.get("days_since_last_donation")
    if days is not None and not is_first_time_donor:
        if days < MIN_DAYS_BETWEEN_DONATIONS:
            return "not_eligible", [
                f"Last donation appears to be within the configured prototype minimum interval "
                f"({MIN_DAYS_BETWEEN_DONATIONS} days)."
            ]

    if collected.get("recent_illness") is True and collected.get("fever") is True:
        return "not_eligible", [
            "Recent illness combined with fever is a preliminary deferral indicator."
        ]

    review_triggers = []
    if collected.get("recent_surgery") is True:
        review_triggers.append("recent surgery")
    if collected.get("recent_tattoo_or_piercing") is True:
        review_triggers.append("recent tattoo or piercing")
    if collected.get("chronic_condition_reported") is True:
        review_triggers.append("reported chronic condition")
    if collected.get("recent_blood_transfusion") is True:
        review_triggers.append("recent blood transfusion")
    if collected.get("pregnancy_status") == "unknown":
        review_triggers.append("unknown pregnancy status")
    if collected.get("recent_dental_procedure") is True:
        review_triggers.append("recent dental procedure")
    if collected.get("current_medication") is True and collected.get("antibiotics") is not True:
        review_triggers.append("current medication without clear deferral resolution")

    hb_known = collected.get("hemoglobin_known")
    hb_value = collected.get("hemoglobin_value")
    if hb_known is True and hb_value is not None:
        if hb_value < HEMOGLOBIN_REVIEW_LOW or hb_value > HEMOGLOBIN_REVIEW_HIGH:
            review_triggers.append("borderline hemoglobin value")

    if review_triggers and not reasons:
        return "needs_review", [
            "Preliminary review recommended due to: " + ", ".join(review_triggers) + ".",
            "Please confirm your eligibility with the blood donation center or medical staff.",
        ]

    if review_triggers:
        reasons.append(
            "Preliminary review also recommended due to: " + ", ".join(review_triggers) + "."
        )
        return "needs_review", reasons

    return None, reasons
