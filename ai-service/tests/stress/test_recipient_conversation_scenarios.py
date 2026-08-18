"""Recipient AI stress scenarios — final conversation hardening regression suite."""

from __future__ import annotations

import re

import pytest

from app.models.schemas import ChatRequest
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService
from app.services.recipient_conversation_service import RecipientConversationService

GENERIC_HELP = "i can help with blood requests"
MEDICAL_SAFE_MARKERS = ("doctor", "medical team", "hospital", "care team")


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


def assert_not_generic(r, context: str = "") -> None:
    assert GENERIC_HELP not in r.message.lower(), f"Generic help for: {context or r.intent}"


def build_full_request(svc):
    sid = chat(svc, "I need blood").session_id
    chat(svc, "O negative", session_id=sid)
    chat(svc, "2 units", session_id=sid)
    chat(svc, "urgent", session_id=sid)
    chat(svc, "Saint George Hospital in Beirut", session_id=sid)
    chat(svc, "Lebanon", session_id=sid)
    return sid


class TestGreetings:
    @pytest.mark.parametrize("msg", ["Hi", "Hello", "Can you help me?"])
    def test_greetings(self, svc, msg):
        r = chat(svc, msg)
        assert r.intent in {"greeting", "create_blood_request", "unknown", "request_information"}


class TestRequestCreation:
    def test_need_blood(self, svc):
        r = chat(svc, "I need blood")
        assert r.intent == "create_blood_request"
        assert "blood type" in r.message.lower()

    def test_need_o_negative(self, svc):
        sid = chat(svc, "I need blood").session_id
        r = chat(svc, "I need O negative", session_id=sid)
        assert r.collected_information.get("blood_type_needed") == "O-"

    def test_multi_entity(self, svc):
        r = chat(svc, "I need 2 units of O negative urgently at a hospital in Beirut")
        info = r.collected_information
        assert info.get("blood_type_needed") == "O-"
        assert info.get("units_needed") == 2


class TestNaturalAnswers:
    @pytest.mark.parametrize(
        "setup,answer,field,expected",
        [
            ("I need blood", "O neg", "blood_type_needed", "O-"),
            ("I need blood", "two", "units_needed", 2),
            ("I need blood", "it's urgent", "urgency", "urgent"),
        ],
    )
    def test_natural_answers(self, svc, setup, answer, field, expected):
        sid = chat(svc, setup).session_id
        if field != "blood_type_needed":
            chat(svc, "O negative", session_id=sid)
        if field == "urgency":
            chat(svc, "2 units", session_id=sid)
        r = chat(svc, answer, session_id=sid)
        assert r.collected_information.get(field) == expected


class TestCompatibility:
    @pytest.mark.parametrize(
        "msg",
        [
            "Can O- donate to A+?",
            "Is A positive compatible with O negative?",
            "Who can donate to A+?",
            "can o negative donate to a positive",
            "So can O negative donate to A positive",
        ],
    )
    def test_compatibility(self, svc, msg):
        r = chat(svc, msg)
        assert r.intent in {"blood_compatibility", "find_donor"}
        assert_not_generic(r, msg)


class TestGeneralInformation:
    @pytest.mark.parametrize(
        "msg",
        [
            "Why is O negative rare?",
            "why is o negative rare",
            "What is special about AB positive?",
            "Why is this blood type uncommon?",
            "Oh, why is O negative rare?",
        ],
    )
    def test_general_info(self, svc, msg):
        r = chat(svc, msg)
        assert r.intent == "general_blood_information"
        assert_not_generic(r, msg)


class TestFindDonor:
    @pytest.mark.parametrize(
        "msg",
        ["How can I find a donor?", "Which donors can donate to him?", "what donors can give him"],
    )
    def test_find_donor(self, svc, msg):
        r = chat(svc, msg)
        assert r.intent == "find_donor"
        assert_not_generic(r, msg)


class TestMedicalSafety:
    @pytest.mark.parametrize(
        "msg",
        [
            "How many units should we request?",
            "Is 2 units enough?",
            "How much blood does she need?",
            "The doctor hasn't told us how many units we need. How many should we request?",
        ],
    )
    def test_medical_safety(self, svc, msg):
        r = chat(svc, msg)
        assert r.intent == "medical_out_of_scope"
        lower = r.message.lower()
        assert any(m in lower for m in MEDICAL_SAFE_MARKERS)
        assert not re.search(r"\b(?:recommend|request|enter|use)\s+(?:one|two|three|\d+)\s+units?\b", lower)


class TestCorrections:
    def test_blood_type_correction(self, svc):
        sid = chat(svc, "I need blood").session_id
        chat(svc, "O negative", session_id=sid)
        r = chat(svc, "Actually it's A positive", session_id=sid)
        assert r.collected_information.get("blood_type_needed") == "A+"

    def test_units_correction(self, svc):
        sid = chat(svc, "I need blood").session_id
        chat(svc, "O negative", session_id=sid)
        chat(svc, "2 units", session_id=sid)
        r = chat(svc, "Wait, make it 3 units", session_id=sid)
        assert r.collected_information.get("units_needed") == 3


class TestSideQuestionsDuringRequest:
    @pytest.mark.parametrize(
        "msg,expected_intent",
        [
            ("Why is O negative rare?", "general_blood_information"),
            ("Can O negative donate to A positive?", "blood_compatibility"),
            (
                "The doctor hasn't told us how many units we need. How many should we request?",
                "medical_out_of_scope",
            ),
        ],
    )
    def test_side_questions(self, svc, msg, expected_intent):
        sid = build_full_request(svc)
        r = chat(svc, msg, session_id=sid)
        assert r.intent == expected_intent
        assert_not_generic(r, msg)
        assert r.collected_information.get("blood_type_needed") == "O-"
        assert r.collected_information.get("units_needed") == 2


class TestContinueAfterSideQuestion:
    def test_continue_preserves_state(self, svc):
        sid = build_full_request(svc)
        chat(svc, "Why is O negative rare?", session_id=sid)
        chat(svc, "Can O negative donate to A positive?", session_id=sid)
        chat(
            svc,
            "The doctor hasn't told us how many units we need. How many should we request?",
            session_id=sid,
        )
        r = chat(svc, "Continue", session_id=sid)
        info = r.collected_information
        assert info.get("blood_type_needed") == "O-"
        assert info.get("units_needed") == 2
        assert info.get("location_country") == "Lebanon"


class TestShortMessages:
    def test_country_lebanon(self, svc):
        sid = chat(svc, "I need blood").session_id
        chat(svc, "O negative", session_id=sid)
        chat(svc, "2 units", session_id=sid)
        chat(svc, "urgent", session_id=sid)
        chat(svc, "The hospital is in Beirut", session_id=sid)
        r = chat(svc, "Lebanon", session_id=sid)
        assert r.collected_information.get("location_country") == "Lebanon"


class TestFinalManualConversation:
    """Exact Android regression conversation from product requirements."""

    def test_full_manual_flow(self, svc):
        r1 = chat(svc, "I need blood")
        assert "blood type" in r1.message.lower()
        sid = r1.session_id

        chat(svc, "O negative", session_id=sid)
        chat(svc, "I need 2 units", session_id=sid)
        chat(svc, "Urgent", session_id=sid)
        r5 = chat(svc, "Saint George Hospital in Beirut", session_id=sid)
        assert r5.collected_information.get("hospital_name") or r5.collected_information.get("hospital_city")
        chat(svc, "Lebanon", session_id=sid)

        r6 = chat(svc, "Why is O negative rare?", session_id=sid)
        assert r6.intent == "general_blood_information"
        assert_not_generic(r6)

        r7 = chat(svc, "Can O negative donate to A positive?", session_id=sid)
        assert r7.intent == "blood_compatibility"
        assert_not_generic(r7)

        r8 = chat(
            svc,
            "The doctor hasn't told us how many units we need. How many should we request?",
            session_id=sid,
        )
        assert r8.intent == "medical_out_of_scope"
        assert_not_generic(r8)

        r9 = chat(svc, "Continue", session_id=sid)
        info = r9.collected_information
        assert info.get("blood_type_needed") == "O-"
        assert info.get("units_needed") == 2
        assert info.get("location_country") == "Lebanon"
