"""Tests for recipient conversation priority and pending-field handling."""

from __future__ import annotations

import re

import pytest

from app.models.schemas import ChatRequest
from app.recipient.location_parser import extract_location_entities
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService
from app.services.recipient_conversation_service import RecipientConversationService

REQUEST_SUMMARY_PHRASE = "so far i have"


@pytest.fixture
def svc():
    return AIService(
        conversation_service=ConversationService(session_store={}),
        recipient_conversation_service=RecipientConversationService(session_store={}),
    )


def chat(svc, message, session_id=None):
    payload = {"message": message, "role": "recipient"}
    if session_id:
        payload["session_id"] = session_id
    return svc.process_message(ChatRequest(**payload))


def build_active_request(svc):
    sid = chat(svc, "I need blood.").session_id
    chat(svc, "O negative", session_id=sid)
    chat(svc, "2 units", session_id=sid)
    chat(svc, "urgent", session_id=sid)
    chat(svc, "The hospital is in Beirut.", session_id=sid)
    return sid


class TestLocationParser:
    @pytest.mark.parametrize(
        "message,pending,expected_country",
        [
            ("Lebanon", "location_country", "Lebanon"),
            ("In Lebanon", "location_country", "Lebanon"),
            ("The country is Lebanon", "location_country", "Lebanon"),
            ("The location is Lebanon", "location_country", "Lebanon"),
        ],
    )
    def test_country_pending_answers(self, message, pending, expected_country):
        loc = extract_location_entities(message, pending_field=pending)
        assert loc.location_country == expected_country

    def test_beirut_lebanon(self):
        loc = extract_location_entities("Beirut, Lebanon")
        assert loc.location_city == "Beirut"
        assert loc.location_country == "Lebanon"

    def test_hospital_in_beirut_lebanon(self):
        loc = extract_location_entities("The hospital is in Beirut, Lebanon")
        assert loc.hospital_city == "Beirut"
        assert loc.location_country == "Lebanon"


class TestLocationConversation:
    def test_pending_country_lebanon(self, svc):
        sid = build_active_request(svc)
        r = chat(svc, "Lebanon", session_id=sid)
        assert r.collected_information.get("location_country") == "Lebanon"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower() or "enter these details" in r.message.lower()

    def test_pending_country_in_lebanon(self, svc):
        sid = build_active_request(svc)
        r = chat(svc, "In Lebanon", session_id=sid)
        assert r.collected_information.get("location_country") == "Lebanon"


class TestQuestionPriorityOverActiveRequest:
    def test_find_donors_during_active_request(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, "How do I know which donors can donate to him?", session_id=sid)
        assert r.intent == "find_donor"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower()
        assert r.collected_information.get("blood_type_needed") == "O-"

    def test_find_donors_variant(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, "How can I find donors?", session_id=sid)
        assert r.intent == "find_donor"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower()

    def test_who_can_donate_to_him(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, "Who can donate to him?", session_id=sid)
        assert r.intent == "find_donor"

    def test_why_a_positive_common(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, "Why is A positive blood common?", session_id=sid)
        assert r.intent == "general_blood_information"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower()
        assert "common" in r.message.lower() or "A+" in r.message

    def test_why_o_negative_rare(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, "Why is O negative rare?", session_id=sid)
        assert r.intent == "general_blood_information"

    def test_compatibility_during_active_request(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, "Can O negative donate to A positive?", session_id=sid)
        assert r.intent == "blood_compatibility"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower()

    def test_medical_units_during_active_request(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(
            svc,
            "The doctor hasn't told us how many units she needs. How many should we request?",
            session_id=sid,
        )
        assert r.intent == "medical_out_of_scope"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower()
        assert "medical team" in r.message.lower() or "doctor" in r.message.lower() or "hospital" in r.message.lower()


class TestStatePreservation:
    def test_side_question_preserves_state(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        chat(svc, "Why is A positive common?", session_id=sid)
        r = chat(svc, "Continue", session_id=sid)
        info = r.collected_information
        assert info.get("blood_type_needed") == "O-"
        assert info.get("units_needed") == 2
        assert info.get("location_country") == "Lebanon"

    def test_continue_resumes_flow(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        chat(svc, "How can I find donors?", session_id=sid)
        r = chat(svc, "Continue", session_id=sid)
        assert r.intent == "create_blood_request"
        assert "?" in r.message or "enter these details" in r.message.lower()


class TestPendingVsQuestion:
    def test_question_while_country_pending(self, svc):
        sid = build_active_request(svc)
        pending = chat(svc, "The hospital is in Beirut.", session_id=sid)
        assert pending.collected_information.get("pending_field") == "location_country"
        r = chat(svc, "How can I find donors?", session_id=sid)
        assert r.intent == "find_donor"
        assert r.collected_information.get("location_country") is None

    def test_country_answer_while_pending(self, svc):
        sid = build_active_request(svc)
        chat(svc, "The hospital is in Beirut.", session_id=sid)
        r = chat(svc, "Lebanon", session_id=sid)
        assert r.collected_information.get("location_country") == "Lebanon"


class TestSafety:
    def test_units_receive_medical_safe(self, svc):
        r = chat(svc, "How many units should she receive?")
        assert r.intent == "medical_out_of_scope"
        assert not re.search(r"\b(?:request|enter)\s+\d+\b", r.message.lower())
        assert "doctor" in r.message.lower() or "medical team" in r.message.lower() or "hospital" in r.message.lower()


class TestMedicalSafetyQuestions:
    """Regression: natural transfusion-quantity questions must not fall through to generic help."""

    MEDICAL_PHRASES = [
        "How many units should we request?",
        "How many units should she receive?",
        "How much blood does he need?",
        "Is 2 units enough?",
        "What amount should we ask for?",
        "How many bags are needed?",
        "How much blood should the patient receive?",
        "The doctor hasn't told us how many units we need. How many should we request?",
    ]

    @pytest.mark.parametrize("message", MEDICAL_PHRASES)
    def test_medical_safety_intent_and_response(self, svc, message):
        r = chat(svc, message)
        assert r.intent == "medical_out_of_scope", f"Expected medical_out_of_scope for: {message!r}"
        lower = r.message.lower()
        assert "i can help with blood requests" not in lower
        assert "doctor" in lower or "medical team" in lower or "hospital" in lower
        assert not re.search(r"\b(?:recommend|request|enter|use)\s+(?:one|two|three|\d+)\s+units?\b", lower)

    @pytest.mark.parametrize("message", MEDICAL_PHRASES[:7])
    def test_medical_safety_over_active_request(self, svc, message):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        r = chat(svc, message, session_id=sid)
        assert r.intent == "medical_out_of_scope"
        assert REQUEST_SUMMARY_PHRASE not in r.message.lower()
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert r.collected_information.get("units_needed") == 2

    def test_medical_then_continue_preserves_state(self, svc):
        sid = build_active_request(svc)
        chat(svc, "Lebanon", session_id=sid)
        chat(svc, "How many units should we request?", session_id=sid)
        r = chat(svc, "Continue", session_id=sid)
        info = r.collected_information
        assert info.get("blood_type_needed") == "O-"
        assert info.get("units_needed") == 2
        assert info.get("location_country") == "Lebanon"

