"""Tests for conversation state management and orchestration."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.models.nlp_schemas import NLPIntent
from app.services.conversation_service import ConversationService


@pytest.fixture
def isolated_store():
    return {}


@pytest.fixture
def service(isolated_store):
    return ConversationService(session_store=isolated_store)


@pytest.fixture
def mock_eligibility_model():
    model = MagicMock()
    model.predict.return_value = {
        "status": "eligible",
        "confidence": 0.81,
        "probabilities": {
            "eligible": 0.81,
            "not_eligible": 0.10,
            "needs_review": 0.09,
        },
        "model_name": "Logistic Regression (mock)",
    }
    return model


def complete_profile() -> dict:
    return {
        "age": 30,
        "weight_kg": 70.0,
        "days_since_last_donation": 120,
        "recent_illness": False,
        "fever": False,
        "current_medication": False,
        "antibiotics": False,
        "recent_surgery": False,
        "recent_dental_procedure": False,
        "recent_tattoo_or_piercing": False,
        "pregnancy_status": "not_applicable",
        "chronic_condition_reported": False,
        "recent_blood_transfusion": False,
        "hemoglobin_known": False,
        "hemoglobin_value": None,
    }


class TestSingleMessage:
    def test_collects_age_and_reports_missing(self, service):
        result = service.handle_message("I'm 24.")
        assert result.collected_information["age"] == 24
        assert "weight_kg" in result.missing_information
        assert "days_since_last_donation" in result.missing_information
        assert result.eligibility is None
        assert result.status.value == "collecting_information"


class TestMultipleMessages:
    def test_state_merges_across_messages(self, service):
        first = service.handle_message("I'm 24.")
        session_id = first.session_id

        second = service.handle_message("I weigh 65kg.", session_id=session_id)
        assert second.collected_information["age"] == 24
        assert second.collected_information["weight_kg"] == 65.0

        third = service.handle_message("I donated two months ago.", session_id=session_id)
        assert third.collected_information["age"] == 24
        assert third.collected_information["weight_kg"] == 65.0
        assert third.collected_information["days_since_last_donation"] == 60


class TestCombinedMessage:
    def test_collects_multiple_entities_at_once(self, service):
        message = "I'm 24, weigh 65kg and donated blood two months ago."
        result = service.handle_message(message)
        assert result.collected_information["age"] == 24
        assert result.collected_information["weight_kg"] == 65.0
        assert result.collected_information["days_since_last_donation"] == 60


class TestRequirementsQuestion:
    def test_ask_requirements_preserves_state(self, service):
        first = service.handle_message("I'm 24.")
        session_id = first.session_id
        result = service.handle_message("What information do you need?", session_id=session_id)

        assert result.intent == NLPIntent.ASK_REQUIREMENTS.value
        assert result.collected_information["age"] == 24
        assert result.eligibility is None


class TestClarification:
    def test_clarification_preserves_state_and_pending_question(self, service):
        first = service.handle_message("I'm 24.")
        session_id = first.session_id
        state = service.get_session(session_id)
        assert state is not None
        state.pending_question_field = "recent_illness"
        state.asked_questions.append("recent_illness")

        result = service.handle_message(
            "What do you mean by recent illness?",
            session_id=session_id,
        )

        assert result.intent == NLPIntent.ASK_CLARIFICATION.value
        assert result.collected_information["age"] == 24
        assert "recent illness" in result.message.lower()
        assert state.pending_question_field == "recent_illness"
        assert result.eligibility is None


class TestGreeting:
    def test_greeting_does_not_predict_eligibility(self, service):
        result = service.handle_message("Hi")
        assert result.intent == NLPIntent.GREETING.value
        assert result.eligibility is None
        assert "preliminary" in result.message.lower()
        assert result.next_question is not None


class TestContradiction:
    def test_latest_value_replaces_previous(self, service):
        first = service.handle_message("I'm 24.")
        session_id = first.session_id
        second = service.handle_message("Actually I'm 25.", session_id=session_id)

        assert second.collected_information["age"] == 24
        assert any(conflict["field"] == "age" for conflict in second.conflicts)


class TestMissingInformationBlocksML:
    def test_does_not_run_ml_when_incomplete(self, isolated_store):
        mock_model = MagicMock()
        mock_model.predict.side_effect = AssertionError("ML must not run when incomplete")
        service = ConversationService(
            session_store=isolated_store,
            eligibility_model=mock_model,
        )

        result = service.handle_message("I'm 24.")
        mock_model.predict.assert_not_called()
        assert result.eligibility is None


class TestCompleteAssessment:
    def test_runs_eligibility_when_complete(self, isolated_store, mock_eligibility_model):
        service = ConversationService(
            session_store=isolated_store,
            eligibility_model=mock_eligibility_model,
        )
        first = service.handle_message("I'm 30.")
        session_id = first.session_id
        state = service.get_session(session_id)
        assert state is not None
        state.collected_information.update(complete_profile())
        state.is_first_time_donor = False

        result = service.handle_message("That is all my information.", session_id=session_id)

        mock_eligibility_model.predict.assert_called_once()
        assert result.status.value == "completed"
        assert result.eligibility is not None
        assert result.eligibility["status"] == "eligible"
        assert "preliminary" in result.message.lower()


class TestSessionIsolation:
    def test_sessions_do_not_share_state(self, service):
        first = service.handle_message("I'm 24.")
        second = service.handle_message("I'm 40.")

        assert first.session_id != second.session_id
        assert first.collected_information["age"] == 24
        assert second.collected_information["age"] == 40


class TestDeterministicOverride:
    def test_underage_triggers_deterministic_not_eligible(self, isolated_store, mock_eligibility_model):
        service = ConversationService(
            session_store=isolated_store,
            eligibility_model=mock_eligibility_model,
        )
        first = service.handle_message("I'm 16.")
        session_id = first.session_id
        state = service.get_session(session_id)
        assert state is not None

        profile = complete_profile()
        profile["age"] = 16
        state.collected_information.update(profile)
        state.is_first_time_donor = False

        result = service.handle_message("Done.", session_id=session_id)

        mock_eligibility_model.predict.assert_not_called()
        assert result.eligibility["status"] == "not_eligible"
        assert result.eligibility["source"] == "deterministic_rules"


class TestContextualNLPIntegration:
    def test_combined_age_weight_no_conflict(self, service):
        result = service.handle_message("26 years old and 71 kg")
        assert result.collected_information["age"] == 26
        assert result.collected_information["weight_kg"] == 71.0
        assert not result.conflicts

    def test_donation_date_from_contextual_answer(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("I'm 26 years old and 71 kg", session_id=session_id)
        result = service.handle_message("6 months ago", session_id=session_id)

        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information["age"] == 26
        assert result.collected_information["weight_kg"] == 71.0

    def test_first_time_donor_no(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("I'm 26 years old and 71 kg", session_id=session_id)
        result = service.handle_message("No", session_id=session_id)
        state = service.get_session(session_id)

        assert state is not None
        assert state.is_first_time_donor is True
        assert result.collected_information["days_since_last_donation"] is None
        assert "days_since_last_donation" not in result.missing_information

    def test_yes_with_donation_date(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("I'm 26 years old and 71 kg", session_id=session_id)
        result = service.handle_message("Yes, 6 months ago", session_id=session_id)
        state = service.get_session(session_id)

        assert state is not None
        assert state.is_first_time_donor is False
        assert result.collected_information["days_since_last_donation"] == 180

    def test_conflicting_ages(self, service):
        first = service.handle_message("I'm 26.")
        session_id = first.session_id
        second = service.handle_message("Actually, I'm 27.", session_id=session_id)

        assert second.collected_information["age"] == 26
        assert any(conflict["field"] == "age" for conflict in second.conflicts)

    def test_pending_weight_bare_number(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("I'm 26.", session_id=session_id)
        result = service.handle_message("71", session_id=session_id)

        assert result.collected_information["weight_kg"] == 71.0
        assert result.collected_information["age"] == 26
        assert not any(conflict["field"] == "age" for conflict in result.conflicts)


class TestContextualYesNoFlow:
    def test_recent_illness_yes_advances_conversation(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("26", session_id=session_id)
        service.handle_message("73", session_id=session_id)
        service.handle_message("Yes 6 months ago", session_id=session_id)
        result = service.handle_message("Yes", session_id=session_id)

        assert result.collected_information["recent_illness"] is True
        assert "blood-donation eligibility" not in result.message.lower()
        assert result.next_question is not None

    def test_full_yes_no_screening_sequence(self, service):
        messages = [
            "Hi",
            "26",
            "73",
            "Yes 6 months ago",
            "Yes",
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
        last = None
        for message in messages:
            last = service.handle_message(message, session_id=session_id)
            session_id = last.session_id

        assert last is not None
        assert last.collected_information["age"] == 26
        assert last.collected_information["weight_kg"] == 73.0
        assert last.collected_information["days_since_last_donation"] == 180
        assert last.collected_information["recent_illness"] is True
        assert last.collected_information["fever"] is False
        assert "blood-donation eligibility" not in last.message.lower()
        assert last.missing_information == [] or last.status.value == "completed"
