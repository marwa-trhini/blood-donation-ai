"""Regression tests for contextual medication/antibiotics parsing."""

from __future__ import annotations

import pytest

from app.services.conversation_service import ConversationService
from app.services.nlp_service import parse_message


@pytest.fixture
def service():
    return ConversationService(session_store={})


def advance_to_medication(service: ConversationService) -> str:
    messages = ["Hi", "26", "73", "Yes, 6 months ago", "No", "No"]
    session_id = None
    for message in messages:
        result = service.handle_message(message, session_id=session_id)
        session_id = result.session_id
    state = service.get_session(session_id)
    assert state is not None
    assert state.pending_question_field == "current_medication"
    return session_id


def advance_to_antibiotics(service: ConversationService) -> str:
    messages = ["Hi", "26", "73", "Yes, 6 months ago", "No", "No", "No"]
    session_id = None
    for message in messages:
        result = service.handle_message(message, session_id=session_id)
        session_id = result.session_id
    state = service.get_session(session_id)
    assert state is not None
    assert state.pending_question_field == "antibiotics"
    return session_id


MEDICATION_AFFIRMATIVE_PHRASES = [
    "Actually yes, I take Panadol sometimes when I have a headache",
    "Yes, I take Panadol sometimes",
    "I'm taking Panadol when I have a headache",
    "Yes, I take medication",
    "I take two tablets a day",
]

MEDICATION_NEGATIVE_PHRASES = [
    "No, I'm not taking anything",
    "No medication at all",
    "I don't take anything",
    "Not currently",
]


class TestMedicationPendingNLP:
    @pytest.mark.parametrize("phrase", MEDICATION_AFFIRMATIVE_PHRASES)
    def test_affirmative_phrases(self, phrase):
        result = parse_message(phrase, pending_field="current_medication")
        assert result.entities["current_medication"] is True
        assert result.intent.value == "provide_information"

    @pytest.mark.parametrize("phrase", MEDICATION_NEGATIVE_PHRASES)
    def test_negative_phrases(self, phrase):
        result = parse_message(phrase, pending_field="current_medication")
        assert result.entities["current_medication"] is False

    def test_panadol_supplemental_not_hardcoded_drug(self):
        result = parse_message(
            "Actually yes, I take Panadol sometimes when I have a headache",
            pending_field="current_medication",
        )
        assert result.supplemental_information.get("medication_name")
        assert "panadol" in result.supplemental_information["medication_name"].lower()
        assert result.supplemental_information.get("frequency") == "sometimes"
        assert result.supplemental_information.get("reason")

    def test_different_drug_name_works(self):
        result = parse_message(
            "Yes, I take Ibuprofen daily for back pain",
            pending_field="current_medication",
        )
        assert result.entities["current_medication"] is True
        assert "ibuprofen" in result.supplemental_information.get("medication_name", "").lower()


class TestMedicationPendingConversation:
    def test_panadol_message_not_out_of_scope(self, service):
        session_id = advance_to_medication(service)
        result = service.handle_message(
            "Actually yes, I take Panadol sometimes when I have a headache",
            session_id=session_id,
        )
        assert result.collected_information["current_medication"] is True
        assert "out-of-scope" not in result.message.lower()
        assert "what would you like to know" not in result.message.lower()

    @pytest.mark.parametrize(
        "phrase",
        [
            "Yes, I take Panadol sometimes",
            "I'm taking medication for allergies",
            "I take two tablets a day",
        ],
    )
    def test_affirmative_advances(self, service, phrase):
        session_id = advance_to_medication(service)
        result = service.handle_message(phrase, session_id=session_id)
        assert result.collected_information["current_medication"] is True
        state = service.get_session(session_id)
        assert state is not None
        assert state.pending_question_field != "current_medication"

    @pytest.mark.parametrize("phrase", MEDICATION_NEGATIVE_PHRASES)
    def test_negative_advances(self, service, phrase):
        session_id = advance_to_medication(service)
        result = service.handle_message(phrase, session_id=session_id)
        assert result.collected_information["current_medication"] is False


class TestAntibioticsPending:
    @pytest.mark.parametrize(
        "phrase,expected",
        [
            ("Yes, I'm currently taking antibiotics", True),
            ("Yes, two tablets a day", True),
            ("No, I'm not taking antibiotics", False),
        ],
    )
    def test_antibiotics_phrases(self, service, phrase, expected):
        session_id = advance_to_antibiotics(service)
        result = service.handle_message(phrase, session_id=session_id)
        assert result.collected_information["antibiotics"] is expected
