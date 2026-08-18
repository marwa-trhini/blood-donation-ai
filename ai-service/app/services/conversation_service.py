"""
Multi-turn conversation orchestration for donor eligibility screening.

Manages session state, merges NLP entities, asks follow-up questions,
applies deterministic rules, and invokes the ML model when ready.
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.conversation_config import (
    BOOLEAN_SCREENING_FIELDS,
    REQUIRED_FIELD_ORDER,
    SCREENING_QUESTIONS,
)
from config.ai_config import LOW_CONFIDENCE_THRESHOLD
from app.conversation.merge import merge_entities_into_state
from app.models.conversation_schemas import (
    ConversationHistoryEntry,
    ConversationState,
    ConversationStatus,
    OrchestrationResponse,
)
from app.models.nlp_schemas import NLPIntent, NLPParseResult
from app.services.data_preprocessing import ML_FEATURE_COLUMNS
from app.services.deterministic_rules import evaluate_deterministic_rules
from app.services.eligibility_model import EligibilityModelService
from app.services.hybrid_nlp_service import HybridNLPService, get_nlp_service
from app.services.hybrid_response_service import HybridResponseService, get_response_service
from app.services.response_service import ResponseContext

# In-memory session store — replace with persistent storage in production.
_SESSIONS: dict[str, ConversationState] = {}


class ConversationService:
    """Session-based eligibility conversation manager."""

    def __init__(
        self,
        nlp_service: HybridNLPService | None = None,
        eligibility_model: EligibilityModelService | None = None,
        response_service: HybridResponseService | None = None,
        session_store: dict[str, ConversationState] | None = None,
    ) -> None:
        self._nlp = nlp_service or get_nlp_service()
        self._eligibility_model = eligibility_model
        self._response = response_service or get_response_service()
        self._sessions = session_store if session_store is not None else _SESSIONS

    def create_session(self) -> ConversationState:
        session_id = str(uuid.uuid4())
        state = ConversationState(
            session_id=session_id,
            collected_information={field: None for field in ML_FEATURE_COLUMNS},
            missing_information=self._compute_missing(
                collected_information={field: None for field in ML_FEATURE_COLUMNS},
                is_first_time_donor=None,
            ),
        )
        self._sessions[session_id] = state
        return state

    def get_session(self, session_id: str) -> ConversationState | None:
        return self._sessions.get(session_id)

    def handle_message(
        self,
        message: str,
        session_id: str | None = None,
    ) -> OrchestrationResponse:
        state = self._get_or_create_session(session_id)
        pending_before = state.pending_question_field
        nlp_result = self._nlp.parse_message(
            message,
            pending_field=state.pending_question_field,
            conversation_history=self._recent_history(state),
            collected_information=state.collected_information,
        )

        if state.completed:
            self._append_user_history(
                state, message, nlp_result, pending_before, turn_entities={}
            )
            reply = self._response.generate(
                ResponseContext(
                    intent=nlp_result.intent.value,
                    status=ConversationStatus.COMPLETED,
                    session_complete=True,
                )
            )
            return self._build_response(state, reply, nlp_result)

        if nlp_result.intent == NLPIntent.ASK_CLARIFICATION:
            self._append_user_history(
                state, message, nlp_result, pending_before, turn_entities={}
            )
            return self._handle_clarification(state, nlp_result)

        if nlp_result.intent == NLPIntent.GREETING:
            return self._handle_greeting(state, message, nlp_result, pending_before)

        if nlp_result.intent == NLPIntent.ASK_REQUIREMENTS:
            collected_before = dict(state.collected_information)
            is_first_time_before = state.is_first_time_donor
            self._merge_entities(state, nlp_result, pending_before, message)
            self._sync_donor_status(state, nlp_result)
            turn_entities = self._build_turn_entities(
                state, collected_before, is_first_time_before
            )
            self._append_user_history(
                state, message, nlp_result, pending_before, turn_entities
            )
            return self._handle_requirements(state, nlp_result)

        return self._process_screening_message(
            state, message, nlp_result, pending_before
        )

    def _process_screening_message(
        self,
        state: ConversationState,
        message: str,
        nlp_result: NLPParseResult,
        pending_before: str | None,
    ) -> OrchestrationResponse:
        """Unified flow: context shortcuts → merge → recalculate missing → advance."""
        collected_before = dict(state.collected_information)
        is_first_time_before = state.is_first_time_donor
        merge_conflicts = self._merge_entities(
            state, nlp_result, pending_before, message
        )
        self._sync_donor_status(state, nlp_result)
        state.missing_information = self._compute_missing(
            state.collected_information,
            state.is_first_time_donor,
        )

        turn_entities = self._build_turn_entities(
            state, collected_before, is_first_time_before
        )
        effective_intent = self._resolve_effective_intent(
            nlp_result, turn_entities, pending_before, state
        )
        self._append_user_history(
            state,
            message,
            nlp_result,
            pending_before,
            turn_entities,
            intent_override=effective_intent,
        )

        if effective_intent == NLPIntent.UNKNOWN and not turn_entities:
            if (
                pending_before in BOOLEAN_SCREENING_FIELDS
                and not self._field_is_missing(state, pending_before)
            ):
                return self._advance_collection(state, nlp_result)

            state.missing_information = self._compute_missing(
                state.collected_information,
                state.is_first_time_donor,
            )
            if self._is_ready_for_assessment(state):
                return self._run_assessment(state, nlp_result)
            return self._handle_out_of_scope(state, nlp_result)

        if merge_conflicts:
            state.conflicts.extend(merge_conflicts)
            state.conversation_history[-1].conflicts = merge_conflicts
            conflict_field = merge_conflicts[-1]["field"]
            state.pending_question_field = conflict_field
            reply = self._response.generate(
                self._response_context(
                    state,
                    nlp_result,
                    conflicts=merge_conflicts,
                    next_field=conflict_field,
                )
            )
            response = self._build_response(
                state,
                reply,
                nlp_result,
                next_question=SCREENING_QUESTIONS.get(conflict_field),
            )
            self._append_assistant_history(state, reply)
            return response

        if nlp_result.needs_clarification and nlp_result.clarification_field:
            clarification_field = nlp_result.clarification_field
            if not self._field_is_missing(state, clarification_field):
                return self._advance_collection(state, nlp_result)

            state.pending_question_field = clarification_field
            state.status = ConversationStatus.NEEDS_CLARIFICATION
            clarification_question = SCREENING_QUESTIONS.get(
                clarification_field,
                "Could you clarify that for me?",
            )
            reply = self._response.generate(
                self._response_context(
                    state,
                    nlp_result,
                    next_field=clarification_field,
                    next_question=clarification_question,
                )
            )
            response = self._build_response(
                state,
                reply,
                nlp_result,
                next_question=clarification_question,
            )
            self._append_assistant_history(state, reply)
            return response

        return self._advance_collection(state, nlp_result)

    def _append_user_history(
        self,
        state: ConversationState,
        message: str,
        nlp_result: NLPParseResult,
        pending_before: str | None,
        turn_entities: dict[str, Any],
        intent_override: NLPIntent | None = None,
    ) -> None:
        intent = (intent_override or nlp_result.intent).value
        state.conversation_history.append(
            ConversationHistoryEntry(
                role="user",
                message=message,
                intent=intent,
                entities=turn_entities,
            )
        )
        state.intent = intent

    def _build_turn_entities(
        self,
        state: ConversationState,
        collected_before: dict[str, Any],
        is_first_time_before: bool | None,
    ) -> dict[str, Any]:
        """Fields newly collected or updated during this turn only."""
        entities: dict[str, Any] = {}

        for field, value in state.collected_information.items():
            if value is None:
                continue
            if collected_before.get(field) != value:
                entities[field] = value

        if state.is_first_time_donor is True and is_first_time_before is not True:
            entities["is_first_time_donor"] = True

        if (
            state.is_first_time_donor is False
            and is_first_time_before is not False
            and state.collected_information.get("days_since_last_donation") is not None
            and "days_since_last_donation" not in entities
        ):
            entities["days_since_last_donation"] = state.collected_information[
                "days_since_last_donation"
            ]

        return entities

    def _screening_question_for_field(
        self,
        state: ConversationState,
        field: str | None,
    ) -> str | None:
        if not field:
            return None
        if field == "hemoglobin_known" and state.collected_information.get(
            "hemoglobin_known"
        ) is True:
            return SCREENING_QUESTIONS.get(
                "hemoglobin_value",
                "What is your recent hemoglobin level (for example, 12.5 g/dL)?",
            )
        return SCREENING_QUESTIONS.get(field, "")

    def _resolve_effective_intent(
        self,
        nlp_result: NLPParseResult,
        turn_entities: dict[str, Any],
        pending_before: str | None,
        state: ConversationState,
    ) -> NLPIntent:
        if turn_entities:
            return NLPIntent.PROVIDE_INFORMATION

        if pending_before and not self._field_is_missing(state, pending_before):
            return NLPIntent.PROVIDE_INFORMATION

        return nlp_result.intent

    def _sync_donor_status(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
    ) -> None:
        if nlp_result.is_first_time_donor is True:
            state.is_first_time_donor = True
            state.collected_information["days_since_last_donation"] = None
        elif state.collected_information.get("days_since_last_donation") is not None:
            state.is_first_time_donor = False
        elif nlp_result.is_first_time_donor is False:
            state.is_first_time_donor = False

    def _advance_collection(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
    ) -> OrchestrationResponse:
        state.missing_information = self._compute_missing(
            state.collected_information,
            state.is_first_time_donor,
        )

        if self._is_ready_for_assessment(state):
            return self._run_assessment(state, nlp_result)

        next_field = self._next_missing_field(state)
        if next_field:
            state.pending_question_field = next_field
            if next_field not in state.asked_questions:
                state.asked_questions.append(next_field)

        next_question = self._screening_question_for_field(state, next_field)
        state.status = ConversationStatus.COLLECTING_INFORMATION
        reply = self._response.generate(
            self._response_context(
                state,
                nlp_result,
                next_field=next_field,
                next_question=next_question,
            )
        )
        response = self._build_response(state, reply, nlp_result, next_question=next_question)
        self._append_assistant_history(state, reply)
        return response

    def _recent_history(self, state: ConversationState, limit: int = 6) -> list[dict[str, str]]:
        recent = state.conversation_history[-limit:]
        return [{"role": entry.role, "message": entry.message} for entry in recent]

    def _get_or_create_session(self, session_id: str | None) -> ConversationState:
        if session_id and session_id in self._sessions:
            return self._sessions[session_id]
        return self.create_session()

    def _handle_greeting(
        self,
        state: ConversationState,
        message: str,
        nlp_result: NLPParseResult,
        pending_before: str | None,
    ) -> OrchestrationResponse:
        collected_before = dict(state.collected_information)
        is_first_time_before = state.is_first_time_donor
        self._merge_entities(state, nlp_result, pending_before, message)
        self._sync_donor_status(state, nlp_result)
        turn_entities = self._build_turn_entities(
            state, collected_before, is_first_time_before
        )
        self._append_user_history(
            state, message, nlp_result, pending_before, turn_entities
        )
        state.missing_information = self._compute_missing(
            state.collected_information,
            state.is_first_time_donor,
        )

        if self._is_ready_for_assessment(state):
            return self._run_assessment(state, nlp_result)

        next_field = self._next_missing_field(state)
        next_question = self._screening_question_for_field(state, next_field)
        if next_field:
            state.pending_question_field = next_field
            if next_field not in state.asked_questions:
                state.asked_questions.append(next_field)

        reply = self._response.generate(
            self._response_context(
                state,
                nlp_result,
                next_field=next_field,
                next_question=next_question,
            )
        )
        response = self._build_response(state, reply, nlp_result, next_question=next_question)
        self._append_assistant_history(state, reply)
        return response

    def _handle_requirements(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
    ) -> OrchestrationResponse:
        next_field = self._next_missing_field(state)
        next_question = self._screening_question_for_field(state, next_field)
        if next_field:
            state.pending_question_field = next_field

        reply = self._response.generate(
            ResponseContext(
                intent=nlp_result.intent.value,
                status=ConversationStatus.COLLECTING_INFORMATION,
                collected_information=state.collected_information,
                missing_information=state.missing_information,
                next_field=next_field,
                next_question=next_question,
            )
        )
        response = self._build_response(state, reply, nlp_result, next_question=next_question)
        self._append_assistant_history(state, reply)
        return response

    def _handle_clarification(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
    ) -> OrchestrationResponse:
        pending = state.pending_question_field
        pending_question = SCREENING_QUESTIONS.get(pending, "") if pending else None
        state.status = ConversationStatus.NEEDS_CLARIFICATION

        reply = self._response.generate(
            ResponseContext(
                intent=nlp_result.intent.value,
                status=state.status,
                clarification_topic=nlp_result.topic or pending,
                pending_question_field=pending,
                next_question=pending_question,
            )
        )
        response = self._build_response(
            state,
            reply,
            nlp_result,
            next_question=pending_question,
        )
        self._append_assistant_history(state, reply)
        return response

    def _handle_out_of_scope(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
    ) -> OrchestrationResponse:
        reply = self._response.generate(
            ResponseContext(intent="unknown", status=ConversationStatus.COLLECTING_INFORMATION)
        )
        response = self._build_response(state, reply, nlp_result)
        self._append_assistant_history(state, reply)
        return response

    def _merge_entities(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
        pending_field: str | None,
        message: str,
    ) -> list[dict[str, Any]]:
        normalized = message.lower().strip()
        conflicts, _ = merge_entities_into_state(
            state,
            nlp_result,
            pending_field=pending_field,
            normalized_message=normalized,
        )
        return conflicts

    def _compute_missing(
        self,
        collected_information: dict[str, Any],
        is_first_time_donor: bool | None,
    ) -> list[str]:
        temp_state = ConversationState(
            session_id="temp",
            collected_information=collected_information,
            is_first_time_donor=is_first_time_donor,
        )
        return [
            field
            for field in REQUIRED_FIELD_ORDER
            if self._field_is_missing(temp_state, field)
        ]

    def _field_is_missing(self, state: ConversationState, field: str) -> bool:
        collected = state.collected_information

        if field == "days_since_last_donation":
            if state.is_first_time_donor is True:
                return False
            return collected.get("days_since_last_donation") is None

        if field == "hemoglobin_known":
            known = collected.get("hemoglobin_known")
            if known is None:
                return True
            if known is True:
                return collected.get("hemoglobin_value") is None
            return False

        value = collected.get(field)
        return value is None

    def _next_missing_field(self, state: ConversationState) -> str | None:
        for field in REQUIRED_FIELD_ORDER:
            if self._field_is_missing(state, field):
                return field
        return None

    def _is_ready_for_assessment(self, state: ConversationState) -> bool:
        return len(self._compute_missing(state.collected_information, state.is_first_time_donor)) == 0

    def _response_context(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
        *,
        next_field: str | None = None,
        next_question: str | None = None,
        conflicts: list[dict[str, Any]] | None = None,
    ) -> ResponseContext:
        latest = state.conversation_history[-1].entities if state.conversation_history else {}
        return ResponseContext(
            intent=nlp_result.intent.value,
            status=state.status,
            collected_information=state.collected_information,
            missing_information=state.missing_information,
            next_field=next_field,
            next_question=next_question,
            latest_entities=latest,
            pending_question_field=state.pending_question_field,
            conflicts=conflicts or [],
        )

    def _get_eligibility_model(self) -> EligibilityModelService:
        if self._eligibility_model is None:
            self._eligibility_model = EligibilityModelService()
        return self._eligibility_model

    def _run_assessment(
        self,
        state: ConversationState,
        nlp_result: NLPParseResult,
    ) -> OrchestrationResponse:
        override_status, det_reasons = evaluate_deterministic_rules(
            state.collected_information,
            is_first_time_donor=state.is_first_time_donor,
        )

        low_confidence = False
        if override_status == "not_eligible":
            eligibility = {
                "status": "not_eligible",
                "confidence": 1.0,
                "reasons": self._response.humanize_reasons(det_reasons) or det_reasons,
                "missing_information": [],
                "source": "deterministic_rules",
            }
        elif override_status == "needs_review":
            eligibility = {
                "status": "needs_review",
                "confidence": 1.0,
                "reasons": self._response.humanize_reasons(det_reasons) or det_reasons,
                "missing_information": [],
                "source": "deterministic_rules",
            }
        else:
            model = self._get_eligibility_model()
            ml_result = model.predict(state.collected_information)
            humanized = self._response.humanize_reasons(det_reasons)
            if ml_result["confidence"] < LOW_CONFIDENCE_THRESHOLD:
                low_confidence = True
                eligibility = {
                    "status": "needs_review",
                    "confidence": ml_result["confidence"],
                    "probabilities": ml_result["probabilities"],
                    "reasons": humanized,
                    "missing_information": [],
                    "source": "ml_model",
                    "low_confidence": True,
                }
            else:
                eligibility = {
                    "status": ml_result["status"],
                    "confidence": ml_result["confidence"],
                    "probabilities": ml_result["probabilities"],
                    "reasons": humanized or [
                        "No current deferral factors were identified from your answers."
                    ],
                    "missing_information": [],
                    "source": "ml_model",
                }

        state.completed = True
        state.status = ConversationStatus.COMPLETED
        state.eligibility_result = eligibility
        state.missing_information = []
        state.pending_question_field = None

        message = self._response.generate(
            ResponseContext(
                intent=nlp_result.intent.value,
                status=ConversationStatus.COMPLETED,
                eligibility=eligibility,
                low_confidence=low_confidence,
            )
        )

        response = self._build_response(
            state,
            message,
            nlp_result,
            eligibility=eligibility,
            next_question=None,
        )
        self._append_assistant_history(state, message)
        return response

    def _build_response(
        self,
        state: ConversationState,
        message: str,
        nlp_result: NLPParseResult,
        *,
        next_question: str | None = None,
        eligibility: dict[str, Any] | None = None,
    ) -> OrchestrationResponse:
        entities = {
            key: value
            for key, value in nlp_result.entities.items()
            if value is not None
        }
        return OrchestrationResponse(
            success=True,
            session_id=state.session_id,
            message=message,
            intent=nlp_result.intent.value,
            status=state.status,
            collected_information=dict(state.collected_information),
            missing_information=list(state.missing_information),
            next_question=next_question,
            entities=entities,
            eligibility=eligibility or state.eligibility_result,
            conflicts=list(state.conflicts),
        )

    def _append_assistant_history(self, state: ConversationState, message: str) -> None:
        state.conversation_history.append(
            ConversationHistoryEntry(role="assistant", message=message)
        )


_conversation_service: ConversationService | None = None


def get_conversation_service() -> ConversationService:
    global _conversation_service
    if _conversation_service is None:
        _conversation_service = ConversationService()
    return _conversation_service
