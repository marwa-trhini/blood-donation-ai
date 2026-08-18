"""Scoped conversation state merge with validation and conflict handling."""

from __future__ import annotations

from typing import Any

from app.models.conversation_schemas import ConversationState
from app.models.nlp_schemas import NLPParseResult
from app.nlp.field_policy import filter_entities_for_merge
from app.nlp.validation import ValidationOutcome, validate_field_value
from app.services.data_preprocessing import ML_FEATURE_COLUMNS


def merge_entities_into_state(
    state: ConversationState,
    nlp_result: NLPParseResult,
    *,
    pending_field: str | None,
    normalized_message: str,
) -> tuple[list[dict[str, Any]], bool]:
    """
    Merge filtered NLP entities into session state.

    Returns (conflicts, needs_clarification_from_validation).
    Conflicting fields keep their previous values until confirmed.
    """
    conflicts: list[dict[str, Any]] = []
    entities = filter_entities_for_merge(
        nlp_result.entities,
        pending_field=pending_field,
        normalized_message=normalized_message,
        collected=state.collected_information,
    )

    for field, new_value in entities.items():
        if new_value is None or field not in ML_FEATURE_COLUMNS:
            continue

        validation = validate_field_value(field, new_value)
        if validation.outcome == ValidationOutcome.NEEDS_CLARIFICATION:
            continue
        if validation.outcome == ValidationOutcome.INVALID:
            continue

        previous = state.collected_information.get(field)
        if previous is not None and previous != new_value:
            conflicts.append(
                {
                    "field": field,
                    "previous_value": previous,
                    "new_value": new_value,
                    "source_text": (
                        nlp_result.entity_details[field].source_text
                        if field in nlp_result.entity_details
                        else nlp_result.raw_message
                    ),
                }
            )
            continue

        state.collected_information[field] = new_value

    if nlp_result.is_first_time_donor is True:
        state.is_first_time_donor = True
        state.collected_information["days_since_last_donation"] = None

    if nlp_result.supplemental_information:
        state.supplemental_information.update(nlp_result.supplemental_information)

    return conflicts, nlp_result.needs_clarification
