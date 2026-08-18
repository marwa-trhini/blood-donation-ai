"""Regression tests for Step 8.2 UX cleanup: acknowledgments and hemoglobin."""

from __future__ import annotations

import pytest

from app.services.conversation_service import ConversationService
from app.services.nlp_service import parse_message
from app.services.response_service import ResponseContext, ResponseService
from app.models.conversation_schemas import ConversationStatus


@pytest.fixture
def service():
    return ConversationService(session_store={})


@pytest.fixture
def responses():
    return ResponseService()


class TestTurnAcknowledgments:
    def _advance_to_field(self, service: ConversationService, target_field: str) -> str:
        """Walk a session until the given field is pending."""
        messages = [
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
        ]
        field_order = [
            "age",
            "weight_kg",
            "days_since_last_donation",
            "recent_illness",
            "fever",
            "current_medication",
            "antibiotics",
            "recent_surgery",
            "recent_dental_procedure",
            "recent_tattoo_or_piercing",
            "pregnancy_status",
            "chronic_condition_reported",
            "recent_blood_transfusion",
        ]
        session_id = None
        last = None
        for message in messages:
            last = service.handle_message(message, session_id=session_id)
            session_id = last.session_id
            state = service.get_session(session_id)
            assert state is not None
            if state.pending_question_field == target_field:
                return session_id
            if target_field not in field_order:
                break
            idx = field_order.index(target_field)
            if state.pending_question_field == target_field:
                return session_id
        if last is None:
            raise RuntimeError("conversation did not start")
        return last.session_id

    def test_medication_no_acknowledgment(self, service):
        session_id = self._advance_to_field(service, "current_medication")
        result = service.handle_message("No", session_id=session_id)
        assert "not currently taking medication" in result.message.lower()
        assert "donation history" not in result.message.lower()

    def test_fever_no_acknowledgment(self, service):
        session_id = self._advance_to_field(service, "fever")
        result = service.handle_message("No", session_id=session_id)
        assert "don't have a fever" in result.message.lower()
        assert "donation history" not in result.message.lower()

    def test_antibiotics_no_acknowledgment(self, service):
        session_id = self._advance_to_field(service, "antibiotics")
        result = service.handle_message("No", session_id=session_id)
        assert "not taking antibiotics" in result.message.lower()
        assert "donation history" not in result.message.lower()

    def test_donation_history_acknowledgment(self, service):
        first = service.handle_message("Hi")
        service.handle_message("26", session_id=first.session_id)
        service.handle_message("73", session_id=first.session_id)
        result = service.handle_message(
            "Yes, 6 months ago", session_id=first.session_id
        )
        assert "donation history" in result.message.lower()
        assert "medication" not in result.message.lower()

    def test_multi_entity_acknowledgment(self, service):
        first = service.handle_message("Hi")
        result = service.handle_message(
            "I am 26, 73 kg, and I donated 6 months ago.",
            session_id=first.session_id,
        )
        msg = result.message.lower()
        assert "age" in msg
        assert "weight" in msg
        assert "donation history" in msg

    def test_no_repeated_donation_acknowledgment(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("26", session_id=session_id)
        service.handle_message("73", session_id=session_id)
        service.handle_message("Yes, 6 months ago", session_id=session_id)
        result = service.handle_message("No", session_id=session_id)
        assert "donation history" not in result.message.lower()


class TestHemoglobinParsing:
    @pytest.mark.parametrize(
        "message,expected_known,expected_value",
        [
            ("Yes 12.5", True, 12.5),
            ("Yes, 12.5", True, 12.5),
            ("My hemoglobin is 12.5", True, 12.5),
            ("12.5", True, 12.5),
            ("12.5 g/dL", True, 12.5),
            ("Yes my hemoglobin level is 12.5", True, 12.5),
        ],
    )
    def test_positive_hemoglobin_answers(
        self, message, expected_known, expected_value
    ):
        result = parse_message(message, pending_field="hemoglobin_known")
        assert result.entities["hemoglobin_known"] is expected_known
        assert result.entities["hemoglobin_value"] == expected_value

    @pytest.mark.parametrize(
        "message",
        ["No", "I don't know", "Not sure", "I don't know my hemoglobin"],
    )
    def test_negative_or_unknown_hemoglobin(self, message):
        result = parse_message(message, pending_field="hemoglobin_known")
        assert result.entities["hemoglobin_known"] is False
        assert result.entities["hemoglobin_value"] is None

    def test_hemoglobin_question_not_repeated_after_yes_12_5(self, service):
        session_id = self._complete_screening_to_hemoglobin(service)
        result = service.handle_message("Yes 12.5", session_id=session_id)
        assert result.collected_information["hemoglobin_known"] is True
        assert result.collected_information["hemoglobin_value"] == 12.5
        assert "Do you know your recent hemoglobin level?" not in result.message
        assert result.status.value in {"collecting_information", "completed"}

    def _complete_screening_to_hemoglobin(self, service: ConversationService) -> str:
        messages = [
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
        ]
        session_id = None
        for message in messages:
            last = service.handle_message(message, session_id=session_id)
            session_id = last.session_id
        assert last is not None
        state = service.get_session(session_id)
        assert state is not None
        assert state.pending_question_field == "hemoglobin_known"
        return session_id


class TestResponseAcknowledgmentPhrases:
    def test_single_boolean_acknowledgment(self, responses):
        text = responses.generate(
            ResponseContext(
                intent="provide_information",
                status=ConversationStatus.COLLECTING_INFORMATION,
                latest_entities={"current_medication": False},
                missing_information=["antibiotics"],
                next_question="Are you currently taking antibiotics?",
            )
        )
        assert "not currently taking medication" in text.lower()
