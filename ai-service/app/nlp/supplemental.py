"""Extract supplemental non-ML information from natural screening answers."""

from __future__ import annotations

import re

from app.nlp.medication import extract_medication_supplemental


def extract_supplemental_information(
    normalized: str,
    original: str,
    *,
    pending_field: str | None,
) -> dict[str, str]:
    """Capture extra detail such as medication names or dosage when present."""
    if pending_field in {"current_medication", "antibiotics"}:
        return extract_medication_supplemental(normalized, field=pending_field or "")

    notes: dict[str, str] = {}
    if re.search(r"\b(?:medication|medicine|tablet|pill|antibiotic|taking)\b", normalized):
        med_match = re.search(
            r"\b(?:taking|take|on|using)\s+(.+?)(?:\.|$|,\s*(?:and|but|also))",
            normalized,
        )
        if med_match:
            detail = med_match.group(1).strip()
            if detail and detail not in {"medication", "medicine", "antibiotics"}:
                notes["medication_detail"] = detail[:200]
    return notes


def extract_temperature_celsius(normalized: str) -> float | None:
    """Extract a Celsius temperature when explicitly stated."""
    match = re.search(
        r"\b(\d{2}(?:\.\d+)?)\s*(?:degrees?(?:\s*celsius|\s*c)?|°c|celsius)\b",
        normalized,
    )
    if match:
        return float(match.group(1))
    bare = re.search(r"\byes,?\s*(\d{2}(?:\.\d+)?)\s*(?:degrees?)?\b", normalized)
    if bare:
        return float(bare.group(1))
    return None
