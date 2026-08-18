"""Merge extracted recipient entities into conversation state."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.models.recipient_schemas import RecipientConversationState
from app.recipient.entity_extraction import ExtractedEntities
from app.recipient.message_analysis import MessageAnalysis


@dataclass
class MergeResult:
    changed_fields: dict[str, object] = field(default_factory=dict)
    started_request_flow: bool = False


def _set_field(
    state: RecipientConversationState,
    key: str,
    value: object,
    *,
    is_correction: bool,
    changed: dict[str, object],
) -> None:
    current = getattr(state, key, None)
    if value is None:
        return
    if current == value and not is_correction:
        return
    setattr(state, key, value)
    changed[key] = value


def merge_entities_into_state(
    state: RecipientConversationState,
    entities: ExtractedEntities,
    analysis: MessageAnalysis | None = None,
) -> MergeResult:
    if analysis and analysis.is_direct_question and not entities.is_correction:
        return MergeResult()

    changed: dict[str, object] = {}
    is_correction = entities.is_correction

    if entities.blood_type:
        _set_field(
            state,
            "blood_type_needed",
            entities.blood_type,
            is_correction=is_correction,
            changed=changed,
        )

    if entities.units is not None:
        _set_field(
            state,
            "units_needed",
            entities.units,
            is_correction=is_correction,
            changed=changed,
        )

    if entities.urgency and entities.urgency in {"emergency", "urgent", "normal"}:
        _set_field(
            state,
            "urgency",
            entities.urgency,
            is_correction=is_correction,
            changed=changed,
        )

    for entity_key, state_key in (
        ("hospital_name", "hospital_name"),
        ("hospital_city", "hospital_city"),
        ("location_city", "location_city"),
        ("location_country", "location_country"),
        ("hospital_address_line", "hospital_address_line"),
        ("location_address_line", "location_address_line"),
        ("required_date", "required_date"),
        ("medical_notes", "medical_notes"),
        ("title", "title"),
    ):
        value = getattr(entities, entity_key, None)
        if value:
            _set_field(
                state,
                state_key,
                value,
                is_correction=is_correction,
                changed=changed,
            )

    if "hospital_city" in changed and not state.location_city:
        _set_field(
            state,
            "location_city",
            changed["hospital_city"],
            is_correction=is_correction,
            changed=changed,
        )

    started_request_flow = False
    if entities.request_signal or changed or state.active_flow == "blood_request":
        if state.active_flow != "blood_request" and (
            entities.request_signal or changed
        ):
            state.active_flow = "blood_request"
            started_request_flow = True

    if changed and state.active_flow != "blood_request":
        state.active_flow = "blood_request"
        started_request_flow = True

    return MergeResult(changed_fields=changed, started_request_flow=started_request_flow)
