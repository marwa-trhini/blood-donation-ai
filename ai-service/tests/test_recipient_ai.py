"""Tests for donor/recipient dual-role AI routing."""

from __future__ import annotations

import pytest

from app.models.schemas import ChatRequest
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService
from app.services.recipient_conversation_service import RecipientConversationService


@pytest.fixture
def donor_service():
    return AIService(conversation_service=ConversationService(session_store={}))


@pytest.fixture
def dual_service():
    return AIService(
        conversation_service=ConversationService(session_store={}),
        recipient_conversation_service=RecipientConversationService(session_store={}),
    )


class TestRoleRouting:
    def test_donor_greeting_unchanged(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(message="Hi", role="donor")
        )
        assert response.role == "donor"
        assert "weight" in response.message.lower() or "old" in response.message.lower()

    def test_donor_without_role_defaults_to_donor(self, dual_service):
        response = dual_service.process_message(ChatRequest(message="Hi"))
        assert response.role == "donor"
        assert response.next_question is not None

    def test_recipient_greeting_not_donor_screening(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(message="Hi", role="recipient")
        )
        assert response.role == "recipient"
        assert response.status == "assisting"
        assert response.eligibility is None
        assert "how old are you" not in response.message.lower()
        assert "weight" not in response.message.lower()
        assert "blood request" in response.message.lower()

    def test_recipient_never_enters_donor_screening(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(
                message="I need O negative blood. What should I do?",
                role="recipient",
            )
        )
        assert response.role == "recipient"
        assert "donated blood before" not in response.message.lower()
        assert (
            "blood request" in response.message.lower()
            or "units" in response.message.lower()
            or "got it" in response.message.lower()
        )
        assert response.collected_information.get("user_role") == "recipient"


class TestRecipientIntents:
    @pytest.mark.parametrize(
        "message,expected_intent",
        [
            ("How do I request blood?", "create_blood_request"),
            ("I need blood", "create_blood_request"),
            ("Can O negative receive O positive?", "blood_compatibility"),
            ("Who can donate to A positive?", "blood_compatibility"),
            ("How do I find donors?", "find_donor"),
            ("What information do I need to request blood?", "request_information"),
            ("Why is O negative rare?", "general_blood_information"),
        ],
    )
    def test_recipient_intents(self, dual_service, message, expected_intent):
        response = dual_service.process_message(
            ChatRequest(message=message, role="recipient")
        )
        assert response.intent == expected_intent

    def test_unknown_recipient_message(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(message="Tell me a joke about cats", role="recipient")
        )
        assert response.intent == "unknown"
        assert "blood request" in response.message.lower()


class TestRecipientCompatibilityConversation:
    def test_o_negative_receive_o_positive(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(
                message="Can O negative receive O positive?",
                role="recipient",
            )
        )
        assert response.intent == "blood_compatibility"
        assert (
            "not typically" in response.message.lower()
            or "cannot" in response.message.lower()
            or "educational" in response.message.lower()
        )

    def test_multi_turn_recipient_blood_type(self, dual_service):
        first = dual_service.process_message(
            ChatRequest(message="Hi", role="recipient")
        )
        sid = first.session_id
        second = dual_service.process_message(
            ChatRequest(message="I need A+ blood", role="recipient", session_id=sid)
        )
        assert second.collected_information.get("blood_type_needed") == "A+"

        third = dual_service.process_message(
            ChatRequest(
                message="Who can donate to A positive?",
                role="recipient",
                session_id=sid,
            )
        )
        assert third.intent == "blood_compatibility"
        assert "A+" in third.message


class TestRecipientSafety:
    def test_units_medical_question(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(message="How many units do I need?", role="recipient")
        )
        assert response.intent in {"request_information", "medical_out_of_scope"}
        assert "hospital" in response.message.lower() or "medical team" in response.message.lower()
        assert response.eligibility is None

    def test_diagnosis_out_of_scope(self, dual_service):
        response = dual_service.process_message(
            ChatRequest(message="Can you diagnose my condition?", role="recipient")
        )
        assert response.intent == "medical_out_of_scope"
        assert "diagnosis" in response.message.lower() or "medical" in response.message.lower()


class TestDonorRegression:
    def test_donor_flow_still_collects_age(self, dual_service):
        first = dual_service.process_message(ChatRequest(message="Hi", role="donor"))
        sid = first.session_id
        second = dual_service.process_message(
            ChatRequest(message="26", role="donor", session_id=sid)
        )
        assert second.collected_information.get("age") == 26
        assert second.role == "donor"

    def test_existing_donor_tests_path_without_role(self, donor_service):
        response = donor_service.process_message(ChatRequest(message="Hi"))
        assert response.role == "donor"
        assert response.next_question
