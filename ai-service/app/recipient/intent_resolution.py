"""Context-aware recipient intent resolution with conversation priority."""

from __future__ import annotations

from app.models.recipient_schemas import RecipientConversationState, RecipientIntent
from app.recipient.conversation_signals import classify_side_question
from app.recipient.entity_extraction import ExtractedEntities, MessageType
from app.recipient.field_specs import ACTIVE_FLOW_BLOOD_REQUEST
from app.recipient.message_analysis import MessageAnalysis
from app.recipient.medical_safety import is_medical_safety_question

_DIRECT_INTENT_MAP = {
    "medical_out_of_scope": RecipientIntent.MEDICAL_OUT_OF_SCOPE,
    "blood_compatibility": RecipientIntent.BLOOD_COMPATIBILITY,
    "find_donor": RecipientIntent.FIND_DONOR,
    "request_status": RecipientIntent.REQUEST_STATUS,
    "request_information": RecipientIntent.REQUEST_INFORMATION,
    "general_blood_information": RecipientIntent.GENERAL_BLOOD_INFORMATION,
}


def resolve_recipient_intent(
    message: str,
    entities: ExtractedEntities,
    state: RecipientConversationState,
    analysis: MessageAnalysis,
    *,
    merge_changed: bool,
) -> RecipientIntent:
    # 1. Direct side questions (highest priority after medical safety in analysis)
    if analysis.direct_question_intent:
        mapped = _DIRECT_INTENT_MAP.get(analysis.direct_question_intent)
        if mapped:
            return mapped

    # 2. Medical safety fallback
    if (
        entities.message_type == MessageType.MEDICAL_OUT_OF_SCOPE
        or analysis.is_medical_safety_question
        or is_medical_safety_question(analysis.normalized_message)
    ):
        return RecipientIntent.MEDICAL_OUT_OF_SCOPE

    # 3. Re-classify side questions if analysis missed them
    side_intent = classify_side_question(
        message,
        blood_types=entities.blood_types,
        is_medical_safety=False,
        is_request_information=entities.request_information_signal and not merge_changed,
    )
    if side_intent:
        mapped = _DIRECT_INTENT_MAP.get(side_intent)
        if mapped:
            return mapped

    # 4. Entity-signal fallbacks (no strict question-mark requirement)
    if entities.compatibility_signal and (
        analysis.is_explicit_question or entities.blood_types or analysis.is_direct_question
    ):
        return RecipientIntent.BLOOD_COMPATIBILITY

    if entities.find_donor_signal and analysis.is_explicit_question:
        return RecipientIntent.FIND_DONOR

    if entities.request_status_signal and analysis.is_explicit_question:
        return RecipientIntent.REQUEST_STATUS

    if (
        entities.request_information_signal
        and analysis.is_explicit_question
        and not merge_changed
    ):
        return RecipientIntent.REQUEST_INFORMATION

    if entities.general_info_signal and (
        analysis.is_explicit_question or entities.blood_types
    ):
        return RecipientIntent.GENERAL_BLOOD_INFORMATION

    # 5. Request flow continuation
    if analysis.is_continue_request and state.active_flow == ACTIVE_FLOW_BLOOD_REQUEST:
        return RecipientIntent.CREATE_BLOOD_REQUEST

    if (
        entities.greeting_signal
        and entities.message_type == MessageType.GREETING
        and not merge_changed
        and state.active_flow != ACTIVE_FLOW_BLOOD_REQUEST
        and not state.pending_field
    ):
        return RecipientIntent.GREETING

    if entities.message_type == MessageType.CORRECTION and merge_changed:
        return RecipientIntent.UPDATE_BLOOD_REQUEST

    if analysis.is_pending_field_answer and merge_changed:
        return RecipientIntent.CREATE_BLOOD_REQUEST

    if merge_changed and not analysis.is_direct_question:
        return RecipientIntent.CREATE_BLOOD_REQUEST

    if entities.request_signal and not analysis.is_direct_question:
        return RecipientIntent.CREATE_BLOOD_REQUEST

    if (
        state.active_flow == ACTIVE_FLOW_BLOOD_REQUEST
        and not analysis.is_direct_question
        and (
            analysis.is_pending_field_answer
            or entities.message_type
            in {MessageType.INFORMATION, MessageType.FOLLOW_UP, MessageType.CONFIRMATION, MessageType.REQUEST}
        )
    ):
        if merge_changed or state.pending_field:
            return RecipientIntent.CREATE_BLOOD_REQUEST

    if analysis.is_continue_request:
        return RecipientIntent.CREATE_BLOOD_REQUEST

    return RecipientIntent.UNKNOWN
