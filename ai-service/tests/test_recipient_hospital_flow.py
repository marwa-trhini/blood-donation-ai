"""Tests for recipient hospital field disambiguation and pregnancy handling."""

from __future__ import annotations

import pytest

from app.models.schemas import ChatRequest
from app.recipient.hospital_parser import extract_hospital_name, looks_like_hospital_name
from app.recipient.medical_safety import is_pregnancy_context_message
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService
from app.services.recipient_conversation_service import RecipientConversationService


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


def build_to_hospital(svc):
    sid = chat(svc, "I need blood").session_id
    chat(svc, "O positive", session_id=sid)
    chat(svc, "4", session_id=sid)
    chat(svc, "Emergency", session_id=sid)
    return sid


class TestHospitalNameExtraction:
    @pytest.mark.parametrize(
        "message,expected_substring",
        [
            ("Beirut hospital", "Beirut"),
            ("Beirut Hospital", "Beirut"),
            ("Hospital Beirut", "Beirut"),
            ("Saint George Hospital", "Saint George"),
            ("American University Hospital", "American University"),
        ],
    )
    def test_hospital_name_patterns(self, message, expected_substring):
        name = extract_hospital_name(message, pending_field="hospital_name")
        assert name is not None
        assert expected_substring in name
        assert looks_like_hospital_name(message)


class TestHospitalConversationFlow:
    def test_city_only_prompts_clarification_not_repeat(self, svc):
        sid = build_to_hospital(svc)
        r = chat(svc, "Beirut", session_id=sid)
        assert "city" in r.message.lower()
        assert "hospital name" in r.message.lower()
        assert r.collected_information.get("hospital_name") is None

    def test_hospital_name_then_city_then_country(self, svc):
        sid = build_to_hospital(svc)
        r1 = chat(svc, "Beirut Hospital", session_id=sid)
        assert r1.collected_information.get("hospital_name")
        assert "Beirut" in r1.collected_information.get("hospital_name", "")
        assert r1.collected_information.get("pending_field") == "hospital_city"

        r2 = chat(svc, "Beirut", session_id=sid)
        assert r2.collected_information.get("hospital_city") == "Beirut"
        assert r2.collected_information.get("location_city") == "Beirut"
        assert r2.collected_information.get("pending_field") == "location_country"

        r3 = chat(svc, "Lebanon", session_id=sid)
        assert r3.collected_information.get("location_country") == "Lebanon"

    def test_no_repeated_hospital_question(self, svc):
        sid = build_to_hospital(svc)
        r1 = chat(svc, "Beirut hospital", session_id=sid)
        assert r1.collected_information.get("hospital_name")
        assert r1.collected_information.get("pending_field") != "hospital_name"
        r2 = chat(svc, "Hospital Beirut", session_id=sid)
        assert r2.collected_information.get("pending_field") != "hospital_name"


class TestPregnancyRecognition:
    @pytest.mark.parametrize(
        "message",
        [
            "I am pregnant",
            "I'm pregnant",
            "she is pregnant",
            "the patient is pregnant",
            "pregnant woman",
            "pregnancy",
            "I am 6 months pregnant",
            "the recipient is pregnant",
        ],
    )
    def test_pregnancy_detected(self, message):
        assert is_pregnancy_context_message(message) is True

    def test_pregnancy_not_hospital_or_units(self, svc):
        sid = build_to_hospital(svc)
        r = chat(svc, "She is pregnant", session_id=sid)
        assert r.intent == "medical_out_of_scope"
        assert r.collected_information.get("hospital_name") is None
        assert "medical team" in r.message.lower() or "doctor" in r.message.lower()
        assert "4" not in r.message or "unit" not in r.message.lower()

    def test_pregnancy_preserves_request_state(self, svc):
        sid = build_to_hospital(svc)
        chat(svc, "Beirut Hospital", session_id=sid)
        chat(svc, "She is pregnant", session_id=sid)
        r = chat(svc, "Continue", session_id=sid)
        info = r.collected_information
        assert info.get("blood_type_needed") == "O+"
        assert info.get("units_needed") == 4
        assert info.get("hospital_name")
