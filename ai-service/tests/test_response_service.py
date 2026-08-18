"""Tests for user-facing response generation and safety wording."""

from __future__ import annotations

import pytest

from app.models.conversation_schemas import ConversationStatus
from app.services.response_service import ResponseContext, ResponseService


@pytest.fixture
def responses():
    return ResponseService()


class TestGreeting:
    def test_greeting_includes_intro_and_question(self, responses):
        context = ResponseContext(
            intent="greeting",
            status=ConversationStatus.COLLECTING_INFORMATION,
            next_question="How old are you?",
        )
        message = responses.generate(context)
        assert "BloodConnect" in message
        assert "preliminary" in message.lower()
        assert "How old are you?" in message


class TestAskRequirements:
    def test_requirements_explains_process(self, responses):
        context = ResponseContext(
            intent="ask_requirements",
            status=ConversationStatus.COLLECTING_INFORMATION,
            next_question="How old are you?",
        )
        message = responses.generate(context)
        assert "age" in message.lower()
        assert "weight" in message.lower()
        assert "How old are you?" in message


class TestMissingInformation:
    def test_missing_information_prompt(self, responses):
        context = ResponseContext(
            intent="provide_information",
            status=ConversationStatus.COLLECTING_INFORMATION,
            missing_information=["weight_kg"],
            next_question="What is your approximate weight in kilograms?",
        )
        message = responses.generate(context)
        assert "still need" in message.lower()
        assert "weight" in message.lower()
        assert "eligible" not in message.lower() or "preliminary" in message.lower()


class TestAcknowledgment:
    def test_acknowledges_age_and_weight(self, responses):
        context = ResponseContext(
            intent="provide_information",
            status=ConversationStatus.COLLECTING_INFORMATION,
            latest_entities={"age": 24, "weight_kg": 65.0},
            missing_information=["days_since_last_donation"],
            next_question="Have you donated blood before?",
        )
        message = responses.generate(context)
        assert "Thanks" in message
        assert "age" in message.lower()
        assert "weight" in message.lower()
        assert "noted" in message.lower()
        assert "Have you donated blood before?" in message


class TestEligibleResult:
    def test_eligible_uses_careful_language(self, responses):
        message = responses.generate_eligible(
            ["No current deferral factors were identified from your answers."]
        )
        assert "may be eligible" in message.lower()
        assert "preliminary" in message.lower()
        assert "definitely" not in message.lower()
        assert "screening staff" in message.lower() or "screening process" in message.lower()


class TestNotEligibleResult:
    def test_not_eligible_explains_reason(self, responses):
        message = responses.generate_not_eligible(
            [
                "Your reported last donation appears too recent according to the "
                "project's configured screening rule."
            ]
        )
        assert "should not donate" in message.lower()
        assert "Reason" in message
        assert "definitely" not in message.lower()
        assert "blood service" in message.lower() or "donation center" in message.lower()


class TestNeedsReviewResult:
    def test_needs_review_is_cautious(self, responses):
        message = responses.generate_needs_review(
            ["Some of your answers require additional review."]
        )
        assert "can't confidently" in message.lower() or "cannot" in message.lower()
        assert "screening staff" in message.lower()
        assert "definitely eligible" not in message.lower()


class TestLowConfidence:
    def test_low_confidence_message(self, responses):
        message = responses.generate_low_confidence()
        assert "not confident" in message.lower()
        assert "screening staff" in message.lower()


class TestConflict:
    def test_conflict_prompts_confirmation(self, responses):
        context = ResponseContext(
            intent="provide_information",
            status=ConversationStatus.COLLECTING_INFORMATION,
            conflicts=[
                {"field": "age", "previous_value": 24, "new_value": 25},
            ],
        )
        message = responses.generate(context)
        assert "two different answers" in message.lower()
        assert "age" in message.lower()
        assert "confirm" in message.lower()


class TestDeterministicDeferral:
    def test_fever_deferral_wording(self, responses):
        message = responses._generate_deterministic_deferral(
            "not_eligible",
            ["You reported having a fever recently."],
        )
        assert "should not donate" in message.lower()
        assert "fever" in message.lower()
        assert "healthcare professional" in message.lower() or "blood donation center" in message.lower()


class TestClarification:
    def test_recent_illness_clarification(self, responses):
        context = ResponseContext(
            intent="ask_clarification",
            status=ConversationStatus.NEEDS_CLARIFICATION,
            clarification_topic="recent_illness",
            next_question="Have you been sick recently?",
        )
        message = responses.generate(context)
        assert "recent illness" in message.lower() or "recently been sick" in message.lower()
        assert "Have you been sick recently?" in message


class TestOutOfScope:
    def test_out_of_scope_redirect(self, responses):
        message = responses.generate_out_of_scope()
        assert "blood-donation eligibility" in message.lower() or "donating blood" in message.lower()


class TestMedicalSafety:
    def test_no_guaranteed_eligibility_phrases(self, responses):
        eligible = responses.generate_eligible([])
        not_eligible = responses.generate_not_eligible(["Example reason."])
        review = responses.generate_needs_review([])
        for message in (eligible, not_eligible, review):
            assert "medically eligible" not in message.lower()
            assert "you can definitely donate" not in message.lower()
            assert "guaranteed" not in message.lower()

    def test_humanize_reasons_skips_ml_jargon(self, responses):
        reasons = responses.humanize_reasons(
            [
                "Preliminary ML assessment (Logistic Regression): eligible (0.81).",
                "Please confirm your eligibility with the blood donation center.",
                "Based on the configured prototype screening range, donors under 18 "
                "are preliminarily marked as not eligible.",
            ]
        )
        assert len(reasons) == 1
        assert "outside the configured screening range" in reasons[0]
