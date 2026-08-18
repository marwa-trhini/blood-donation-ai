"""Lightweight recipient assistance conversation orchestrator."""

from __future__ import annotations

import uuid
from typing import Any

from app.models.recipient_schemas import (
    RecipientConversationState,
    RecipientConversationStatus,
    RecipientHistoryEntry,
    RecipientOrchestrationResponse,
)
from app.recipient.entity_extraction import extract_entities
from app.recipient.field_specs import REQUIRED_FIELD_SPECS
from app.recipient.intent_resolution import resolve_recipient_intent
from app.recipient.message_analysis import analyze_message
from app.recipient.response_builder import RecipientResponseBuilder
from app.recipient.state_merge import merge_entities_into_state

_RECIPIENT_SESSIONS: dict[str, RecipientConversationState] = {}


class RecipientConversationService:
    def __init__(
        self,
        response_builder: RecipientResponseBuilder | None = None,
        session_store: dict[str, RecipientConversationState] | None = None,
    ) -> None:
        self._response_builder = response_builder or RecipientResponseBuilder()
        self._sessions = session_store if session_store is not None else _RECIPIENT_SESSIONS

    def handle_message(
        self,
        message: str,
        session_id: str | None = None,
    ) -> RecipientOrchestrationResponse:
        state = self._get_or_create_session(session_id)

        entities = extract_entities(message, pending_field=state.pending_field)
        analysis = analyze_message(message, entities, state)
        merge_result = merge_entities_into_state(state, entities, analysis)
        intent = resolve_recipient_intent(
            message,
            entities,
            state,
            analysis,
            merge_changed=bool(merge_result.changed_fields),
        )

        if analysis.is_pending_field_answer and merge_result.changed_fields:
            state.pending_field = None

        reply, pending_field = self._response_builder.build(
            intent=intent,
            message=message,
            state=state,
            entities=entities,
            changed_fields=merge_result.changed_fields,
            analysis=analysis,
        )
        if pending_field is not None:
            state.pending_field = pending_field

        state.intent = intent.value
        state.conversation_history.append(
            RecipientHistoryEntry(role="user", message=message, intent=intent.value)
        )
        state.conversation_history.append(
            RecipientHistoryEntry(role="assistant", message=reply, intent=intent.value)
        )

        return RecipientOrchestrationResponse(
            session_id=state.session_id,
            message=reply,
            intent=intent.value,
            status=RecipientConversationStatus.ASSISTING,
            collected_information=self._state_snapshot(state),
            missing_information=self._missing_fields(state),
            entities=self._entities_snapshot(entities, merge_result.changed_fields, analysis),
        )

    def get_session(self, session_id: str) -> RecipientConversationState | None:
        return self._sessions.get(session_id)

    def _get_or_create_session(self, session_id: str | None) -> RecipientConversationState:
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        new_id = str(uuid.uuid4())
        state = RecipientConversationState(session_id=new_id)
        self._sessions[new_id] = state
        return state

    def _missing_fields(self, state: RecipientConversationState) -> list[str]:
        missing = []
        for spec in REQUIRED_FIELD_SPECS:
            if getattr(state, spec.key, None) in (None, ""):
                missing.append(spec.key)
        return missing

    def _entities_snapshot(
        self,
        entities: Any,
        changed_fields: dict[str, object],
        analysis: Any,
    ) -> dict[str, Any]:
        snapshot: dict[str, Any] = {}
        if entities.blood_types:
            snapshot["blood_types"] = entities.blood_types
        if entities.units is not None:
            snapshot["units"] = entities.units
        if entities.urgency:
            snapshot["urgency"] = entities.urgency
        if entities.location_country:
            snapshot["location_country"] = entities.location_country
        if changed_fields:
            snapshot["changed_fields"] = changed_fields
        if entities.message_type:
            snapshot["message_type"] = entities.message_type.value
        if analysis.is_direct_question:
            snapshot["direct_question"] = analysis.direct_question_intent
        return snapshot

    def _state_snapshot(self, state: RecipientConversationState) -> dict[str, Any]:
        return {
            "user_role": state.user_role,
            "active_flow": state.active_flow,
            "pending_field": state.pending_field,
            "blood_type_needed": state.blood_type_needed,
            "units_needed": state.units_needed,
            "urgency": state.urgency,
            "hospital_name": state.hospital_name,
            "hospital_city": state.hospital_city,
            "hospital_address_line": state.hospital_address_line,
            "location_city": state.location_city,
            "location_country": state.location_country,
            "location_address_line": state.location_address_line,
            "required_date": state.required_date,
            "medical_notes": state.medical_notes,
            "title": state.title,
        }


def get_recipient_conversation_service() -> RecipientConversationService:
    return RecipientConversationService()
