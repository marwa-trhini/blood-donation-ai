"""Conversational turn analysis for recipient message priority."""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.recipient_schemas import RecipientConversationState
from app.recipient.conversation_signals import (
    classify_side_question,
    looks_like_question,
    normalize_for_analysis,
)
from app.recipient.entity_extraction import ExtractedEntities, MessageType
from app.recipient.medical_safety import is_medical_safety_question, is_pregnancy_context_message
from app.recipient.hospital_parser import looks_like_city_only, looks_like_hospital_name


@dataclass
class MessageAnalysis:
    is_explicit_question: bool = False
    is_direct_question: bool = False
    is_pending_field_answer: bool = False
    is_continue_request: bool = False
    is_medical_safety_question: bool = False
    is_ambiguous_hospital_answer: bool = False
    direct_question_intent: str | None = None
    normalized_message: str = ""


def _pending_field_has_answer(pending_field: str | None, entities: ExtractedEntities) -> bool:
    if not pending_field:
        return False
    mapping = {
        "blood_type_needed": entities.blood_type,
        "units_needed": entities.units is not None,
        "urgency": bool(entities.urgency),
        "hospital_name": bool(entities.hospital_name),
        "hospital_city": bool(entities.hospital_city),
        "location_city": bool(entities.location_city),
        "location_country": bool(entities.location_country),
    }
    return bool(mapping.get(pending_field))


def _message_is_side_question_not_field_answer(
    message: str,
    entities: ExtractedEntities,
    normalized: str,
) -> bool:
    """Side questions must not be treated as pending-field answers."""
    side_intent = classify_side_question(
        message,
        blood_types=entities.blood_types,
        is_medical_safety=is_medical_safety_question(message),
        is_request_information=entities.request_information_signal,
    )
    return side_intent is not None


def analyze_message(
    message: str,
    entities: ExtractedEntities,
    state: RecipientConversationState,
) -> MessageAnalysis:
    normalized = normalize_for_analysis(message)
    analysis = MessageAnalysis(normalized_message=normalized)

    analysis.is_medical_safety_question = is_medical_safety_question(message)
    analysis.is_explicit_question = looks_like_question(message, normalized)
    analysis.is_continue_request = bool(
        re.search(
            r"\b(?:continue|go on|carry on|keep going|resume|proceed|let(?:'s|\s+us)\s+continue)\b",
            normalized,
        )
    )

    side_intent = classify_side_question(
        message,
        blood_types=entities.blood_types,
        is_medical_safety=(
            entities.message_type == MessageType.MEDICAL_OUT_OF_SCOPE
            or analysis.is_medical_safety_question
        ),
        is_request_information=entities.request_information_signal,
    )
    if side_intent:
        analysis.is_direct_question = True
        analysis.direct_question_intent = side_intent
        return analysis

    if state.pending_field and not analysis.is_explicit_question and not analysis.is_continue_request:
        if _message_is_side_question_not_field_answer(message, entities, normalized):
            return analysis
        if _pending_field_has_answer(state.pending_field, entities):
            analysis.is_pending_field_answer = True
        elif state.pending_field == "hospital_name":
            if entities.hospital_city:
                analysis.is_pending_field_answer = True
            elif looks_like_hospital_name(message):
                analysis.is_pending_field_answer = True
            elif looks_like_city_only(message):
                analysis.is_ambiguous_hospital_answer = True
        elif state.pending_field in {"location_country", "location_city", "hospital_city"}:
            stripped = message.strip().rstrip(".!?")
            if (
                stripped
                and "?" not in stripped
                and len(stripped.split()) <= 4
                and re.match(r"^[A-Za-z][A-Za-z\s',-]*$", stripped)
            ):
                analysis.is_pending_field_answer = True

    return analysis
