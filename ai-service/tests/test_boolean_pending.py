"""Regression tests for pending boolean screening field handling."""

from __future__ import annotations

import pytest

from config.conversation_config import BOOLEAN_SCREENING_FIELDS
from app.models.nlp_schemas import NLPIntent
from app.services.conversation_service import ConversationService
from app.services.nlp_service import parse_message, parse_pending_boolean_answer


@pytest.fixture
def service():
    return ConversationService(session_store={})


NEGATIVE_VARIANTS = [
    "No",
    "Nope",
    "Not really",
    "No, I am not taking any",
    "No, I haven't",
    "Not currently",
    "I don't",
    "I haven't",
]

AFFIRMATIVE_VARIANTS = [
    "Yes",
    "Yeah",
    "Yes, I do",
    "Yes, recently",
]


class TestParsePendingBooleanAnswer:
    @pytest.mark.parametrize("message", NEGATIVE_VARIANTS)
    def test_negative_variants(self, message):
        assert parse_pending_boolean_answer(message.lower()) is False

    @pytest.mark.parametrize("message", AFFIRMATIVE_VARIANTS)
    def test_affirmative_variants(self, message):
        assert parse_pending_boolean_answer(message.lower()) is True


class TestPendingBooleanNLP:
    @pytest.mark.parametrize("field", sorted(BOOLEAN_SCREENING_FIELDS))
    @pytest.mark.parametrize("message", NEGATIVE_VARIANTS)
    def test_negative_answers_for_all_boolean_fields(self, field, message):
        result = parse_message(message, pending_field=field)
        assert result.intent == NLPIntent.PROVIDE_INFORMATION
        assert result.entities[field] is False

    @pytest.mark.parametrize("field", sorted(BOOLEAN_SCREENING_FIELDS))
    @pytest.mark.parametrize("message", AFFIRMATIVE_VARIANTS)
    def test_affirmative_answers_for_all_boolean_fields(self, field, message):
        result = parse_message(message, pending_field=field)
        assert result.intent == NLPIntent.PROVIDE_INFORMATION
        assert result.entities[field] is True


class TestPendingBooleanConversation:
    def _session_at_field(self, service: ConversationService, target: str) -> str:
        prelude = {
            "current_medication": [
                "Hi",
                "26",
                "73",
                "Yes, 6 months ago",
                "No",
                "No",
            ],
            "antibiotics": [
                "Hi",
                "26",
                "73",
                "Yes, 6 months ago",
                "No",
                "No",
                "No",
            ],
            "recent_surgery": [
                "Hi",
                "26",
                "73",
                "Yes, 6 months ago",
                "No",
                "No",
                "No",
                "No",
            ],
        }
        messages = prelude[target]
        session_id = None
        for message in messages:
            result = service.handle_message(message, session_id=session_id)
            session_id = result.session_id
        state = service.get_session(session_id)
        assert state is not None
        assert state.pending_question_field == target
        return session_id

    def test_medication_extended_no_not_out_of_scope(self, service):
        session_id = self._session_at_field(service, "current_medication")
        result = service.handle_message(
            "No, I am not taking any.", session_id=session_id
        )
        assert result.collected_information["current_medication"] is False
        assert result.intent != NLPIntent.UNKNOWN.value
        assert "blood-donation eligibility" not in result.message.lower()
        assert "not currently taking medication" in result.message.lower()

    def test_antibiotics_bare_no_not_out_of_scope(self, service):
        session_id = self._session_at_field(service, "antibiotics")
        result = service.handle_message("No", session_id=session_id)
        assert result.collected_information["antibiotics"] is False
        assert "blood-donation eligibility" not in result.message.lower()

    def test_surgery_bare_no_not_out_of_scope(self, service):
        session_id = self._session_at_field(service, "recent_surgery")
        result = service.handle_message("No", session_id=session_id)
        assert result.collected_information["recent_surgery"] is False
        assert "blood-donation eligibility" not in result.message.lower()

    @pytest.mark.parametrize("field", sorted(BOOLEAN_SCREENING_FIELDS))
    def test_field_not_still_missing_after_no(self, service, field):
        session_id = None
        for message in [
            "Hi",
            "26",
            "73",
            "Yes, 6 months ago",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
            "No",
        ]:
            result = service.handle_message(message, session_id=session_id)
            session_id = result.session_id
            state = service.get_session(session_id)
            assert state is not None
            if state.pending_question_field == field:
                answered = service.handle_message("No", session_id=session_id)
                assert answered.collected_information[field] is False
                assert field not in answered.missing_information
                assert "blood-donation eligibility" not in answered.message.lower()
                return
        pytest.fail(f"never reached pending field {field}")
