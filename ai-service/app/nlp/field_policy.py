"""Field extraction and merge scoping based on pending question context."""

from __future__ import annotations

from typing import Any

from config.conversation_config import RECENCY_BOOLEAN_FIELDS
from app.nlp.relative_time import mentions_donation


def pending_companion_fields(pending_field: str | None) -> frozenset[str]:
    if pending_field == "hemoglobin_known":
        return frozenset({"hemoglobin_known", "hemoglobin_value"})
    if pending_field == "hemoglobin_value":
        return frozenset({"hemoglobin_value", "hemoglobin_known"})
    if pending_field:
        return frozenset({pending_field})
    return frozenset()


def count_extracted_fields(entities: dict[str, Any]) -> int:
    return sum(1 for value in entities.values() if value is not None)


def is_multi_entity_message(entities: dict[str, Any]) -> bool:
    return count_extracted_fields(entities) >= 2


def should_block_field_merge(
    field: str,
    *,
    pending_field: str | None,
    normalized_message: str,
    is_multi_entity: bool,
) -> bool:
    if field != "days_since_last_donation":
        return False
    if pending_field is None or pending_field == "days_since_last_donation":
        return False
    if is_multi_entity and mentions_donation(normalized_message):
        return False
    if pending_field in RECENCY_BOOLEAN_FIELDS and not mentions_donation(
        normalized_message
    ):
        return True
    return False


def filter_entities_for_merge(
    entities: dict[str, Any],
    *,
    pending_field: str | None,
    normalized_message: str,
    collected: dict[str, Any],
) -> dict[str, Any]:
    multi_entity = is_multi_entity_message(entities)
    companions = pending_companion_fields(pending_field)
    filtered: dict[str, Any] = {}

    for field, value in entities.items():
        if value is None:
            continue
        if should_block_field_merge(
            field,
            pending_field=pending_field,
            normalized_message=normalized_message,
            is_multi_entity=multi_entity,
        ):
            continue

        if pending_field and not multi_entity and field not in companions:
            if collected.get(field) is None and field != pending_field:
                continue

        filtered[field] = value

    return filtered
