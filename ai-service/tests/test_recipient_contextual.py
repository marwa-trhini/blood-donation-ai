"""Tests for contextual recipient NLP and conversation flow."""

from __future__ import annotations

import pytest

from app.models.schemas import ChatRequest
from app.recipient.blood_type_parser import extract_blood_types, parse_standalone_blood_type_answer
from app.recipient.entity_extraction import extract_entities
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService
from app.services.recipient_conversation_service import RecipientConversationService

GENERIC_CAPABILITY_PHRASE = "could you tell me a bit more about what you need"


@pytest.fixture
def recipient_service():
    return AIService(
        conversation_service=ConversationService(session_store={}),
        recipient_conversation_service=RecipientConversationService(session_store={}),
    )


def chat(svc, message, session_id=None):
    payload = {"message": message, "role": "recipient"}
    if session_id:
        payload["session_id"] = session_id
    return svc.process_message(ChatRequest(**payload))


def assert_not_generic_help(message: str) -> None:
    lowered = message.lower()
    assert GENERIC_CAPABILITY_PHRASE not in lowered
    assert not (
        lowered.count("i can help with") >= 1
        and "blood request" in lowered
        and "compatibility" in lowered
        and "?" in lowered
        and "got it" not in lowered
    )


class TestBloodTypeParser:
    @pytest.mark.parametrize(
        "message,expected",
        [
            ("My blood type is O negative", "O-"),
            ("It's O negative.", "O-"),
            ("O neg", "O-"),
            ("O-", "O-"),
            ("we need O negative", "O-"),
            ("she needs A positive blood", "A+"),
            ("AB negative", "AB-"),
        ],
    )
    def test_natural_blood_type_variants(self, message, expected):
        assert expected in extract_blood_types(message)

    def test_standalone_pending_answer(self):
        assert parse_standalone_blood_type_answer("O negative.") == "O-"


class TestBasicRecipientFlow:
    def test_greeting(self, recipient_service):
        r = chat(recipient_service, "Hi")
        assert r.intent == "greeting"
        assert "blood request" in r.message.lower()

    def test_need_blood_asks_blood_type(self, recipient_service):
        r = chat(recipient_service, "I need blood.")
        assert r.intent == "create_blood_request"
        assert "blood type" in r.message.lower()
        assert r.collected_information.get("active_flow") == "blood_request"

    def test_my_blood_type_is_o_negative(self, recipient_service):
        r = chat(recipient_service, "My blood type is O negative")
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert "units" in r.message.lower()
        assert_not_generic_help(r.message)

    def test_i_need_o_negative(self, recipient_service):
        r = chat(recipient_service, "I need O- blood")
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert_not_generic_help(r.message)

    def test_its_o_negative(self, recipient_service):
        r = chat(recipient_service, "It's O negative.")
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert_not_generic_help(r.message)


class TestNaturalLanguage:
    def test_mother_needs_o_negative(self, recipient_service):
        r = chat(recipient_service, "I'm looking for O negative blood for my mother")
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert_not_generic_help(r.message)

    def test_mom_needs_o_negative(self, recipient_service):
        r = chat(recipient_service, "My mom needs O negative")
        assert r.collected_information.get("blood_type_needed") == "O-"

    def test_two_units_urgently(self, recipient_service):
        first = chat(recipient_service, "I need blood")
        r = chat(
            recipient_service,
            "We need two units of O negative urgently",
            session_id=first.session_id,
        )
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert r.collected_information.get("units_needed") == 2
        assert r.collected_information.get("urgency") == "urgent"


class TestMultiEntity:
    def test_multi_entity_hospital(self, recipient_service):
        r = chat(
            recipient_service,
            "I need 2 units of O negative urgently at Saint George Hospital.",
        )
        info = r.collected_information
        assert info.get("blood_type_needed") == "O-"
        assert info.get("units_needed") == 2
        assert info.get("urgency") == "urgent"
        assert info.get("hospital_name") == "Saint George"


class TestContextFollowUp:
    def test_pending_blood_type_answer(self, recipient_service):
        first = chat(recipient_service, "I need blood.")
        assert first.collected_information.get("pending_field") == "blood_type_needed"
        second = chat(recipient_service, "O negative.", session_id=first.session_id)
        assert second.collected_information.get("blood_type_needed") == "O-"
        assert "units" in second.message.lower()
        assert_not_generic_help(second.message)

    def test_pending_units_answer(self, recipient_service):
        first = chat(recipient_service, "I need blood.")
        chat(recipient_service, "O negative", session_id=first.session_id)
        third = chat(recipient_service, "2", session_id=first.session_id)
        assert third.collected_information.get("units_needed") == 2
        assert "urgent" in third.message.lower() or "priority" in third.message.lower()

    def test_pending_urgency_answer(self, recipient_service):
        sid = chat(recipient_service, "I need blood.").session_id
        chat(recipient_service, "O negative", session_id=sid)
        chat(recipient_service, "2", session_id=sid)
        r = chat(recipient_service, "urgent", session_id=sid)
        assert r.collected_information.get("urgency") == "urgent"


class TestCorrections:
    def test_blood_type_correction(self, recipient_service):
        sid = chat(recipient_service, "My blood type is O negative").session_id
        r = chat(recipient_service, "Actually, it's A positive.", session_id=sid)
        assert r.collected_information.get("blood_type_needed") == "A+"
        assert "A+" in r.message

    def test_units_correction(self, recipient_service):
        sid = chat(recipient_service, "I need blood.").session_id
        chat(recipient_service, "O negative", session_id=sid)
        chat(recipient_service, "2", session_id=sid)
        r = chat(recipient_service, "Actually make that 3.", session_id=sid)
        assert r.collected_information.get("units_needed") == 3


class TestDirectQuestions:
    def test_compatibility_question(self, recipient_service):
        r = chat(recipient_service, "Can O negative receive O positive?")
        assert r.intent == "blood_compatibility"
        assert "educational" in r.message.lower() or "not typically" in r.message.lower()

    def test_find_donor_question(self, recipient_service):
        r = chat(recipient_service, "How can I find a donor?")
        assert r.intent == "find_donor"

    def test_general_information(self, recipient_service):
        r = chat(recipient_service, "Why is O negative rare?")
        assert r.intent == "general_blood_information"


class TestSafety:
    def test_medical_units_question(self, recipient_service):
        r = chat(recipient_service, "How many units should my mother receive?")
        assert r.intent == "medical_out_of_scope"

    def test_transfusion_decision(self, recipient_service):
        r = chat(recipient_service, "Can you approve the transfusion for my mother?")
        assert r.intent == "medical_out_of_scope"


class TestUnknownHandling:
    def test_useful_info_not_generic(self, recipient_service):
        first = chat(recipient_service, "I need blood.")
        r = chat(recipient_service, "O negative", session_id=first.session_id)
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert_not_generic_help(r.message)

    def test_genuinely_unknown(self, recipient_service):
        r = chat(recipient_service, "Tell me a joke about cats")
        assert r.intent == "unknown"


class TestRoleIsolation:
    def test_recipient_not_donor_screening(self, recipient_service):
        r = chat(recipient_service, "Hi")
        assert "how old are you" not in r.message.lower()

    def test_donor_unchanged(self, recipient_service):
        donor = recipient_service.process_message(ChatRequest(message="Hi", role="donor"))
        assert "old" in donor.message.lower() or "weight" in donor.message.lower()


class TestEntityExtractionIndependent:
    def test_extract_without_request_intent(self):
        entities = extract_entities("My blood type is O negative")
        assert entities.blood_type == "O-"
