"""Tests for deterministic NLP entity extraction and intent detection."""

from __future__ import annotations

import pytest

from app.models.nlp_schemas import NLPIntent
from app.services.nlp_service import parse_message


@pytest.fixture
def nlp():
    return parse_message


class TestAgeExtraction:
    def test_im_24(self, nlp):
        result = nlp("I'm 24")
        assert result.entities["age"] == 24

    def test_im_24_years_old(self, nlp):
        result = nlp("I'm 24 years old")
        assert result.entities["age"] == 24
        assert result.entity_details["age"].confidence >= 0.9


class TestWeightExtraction:
    def test_i_weigh_65_kg(self, nlp):
        result = nlp("I weigh 65 kg")
        assert result.entities["weight_kg"] == 65.0

    def test_around_65_kilos(self, nlp):
        result = nlp("I'm around 65 kilos")
        assert result.entities["weight_kg"] == 65.0


class TestDonationHistory:
    def test_two_months_ago(self, nlp):
        result = nlp("I donated blood two months ago")
        assert result.entities["days_since_last_donation"] == 60
        assert result.is_first_time_donor is not True

    def test_eight_weeks_ago(self, nlp):
        result = nlp("I donated 8 weeks ago")
        assert result.entities["days_since_last_donation"] == 56

    def test_never_donated(self, nlp):
        result = nlp("I've never donated before")
        assert result.entities["days_since_last_donation"] is None
        assert result.is_first_time_donor is True


class TestNegation:
    def test_have_fever(self, nlp):
        result = nlp("I have a fever")
        assert result.entities["fever"] is True

    def test_no_fever(self, nlp):
        result = nlp("I don't have a fever")
        assert result.entities["fever"] is False

    def test_taking_antibiotics(self, nlp):
        result = nlp("I'm currently taking antibiotics")
        assert result.entities["antibiotics"] is True

    def test_not_taking_antibiotics(self, nlp):
        result = nlp("I'm not taking antibiotics")
        assert result.entities["antibiotics"] is False


class TestMultipleEntities:
    def test_age_weight_donation(self, nlp):
        message = "I'm 24, 65kg, and I donated blood 2 months ago."
        result = nlp(message)
        assert result.entities["age"] == 24
        assert result.entities["weight_kg"] == 65.0
        assert result.entities["days_since_last_donation"] == 60
        assert result.intent == NLPIntent.PROVIDE_INFORMATION


class TestHealthEntities:
    def test_surgery_last_month(self, nlp):
        result = nlp("I had surgery last month")
        assert result.entities["recent_surgery"] is True

    def test_tattoo_recently(self, nlp):
        result = nlp("I got a tattoo recently")
        assert result.entities["recent_tattoo_or_piercing"] is True


class TestHemoglobin:
    def test_hemoglobin_value(self, nlp):
        result = nlp("My hemoglobin is 13.2")
        assert result.entities["hemoglobin_value"] == 13.2
        assert result.entities["hemoglobin_known"] is True


class TestIntentDetection:
    def test_eligibility_check(self, nlp):
        result = nlp("Can I donate blood?")
        assert result.intent == NLPIntent.ELIGIBILITY_CHECK

    def test_ask_requirements(self, nlp):
        result = nlp("What information do you need?")
        assert result.intent == NLPIntent.ASK_REQUIREMENTS

    def test_ask_clarification(self, nlp):
        result = nlp("What do you mean by recent illness?")
        assert result.intent == NLPIntent.ASK_CLARIFICATION
        assert result.topic == "recent_illness"

    def test_greeting(self, nlp):
        result = nlp("Hi")
        assert result.intent == NLPIntent.GREETING


class TestUnknownInformation:
    def test_does_not_invent_fields(self, nlp):
        result = nlp("I'm 24 and healthy.")
        assert result.entities["age"] == 24
        assert result.entities["weight_kg"] is None
        assert result.entities["fever"] is None
        assert result.entities["antibiotics"] is None
        assert result.entities["current_medication"] is None
        assert result.entities["hemoglobin_value"] is None
        assert result.entities["hemoglobin_known"] is None


class TestGoalExample:
    def test_full_donor_message(self, nlp):
        message = (
            "I'm 24 years old, around 65 kilos. I donated blood about two months ago "
            "and I'm feeling completely fine."
        )
        result = nlp(message)
        assert result.entities["age"] == 24
        assert result.entities["weight_kg"] == 65.0
        assert result.entities["days_since_last_donation"] == 60
        assert result.entities["recent_illness"] is False
        assert result.entities["fever"] is False


class TestAgeWeightCombined:
    @pytest.mark.parametrize(
        "message,expected_age,expected_weight",
        [
            ("26 years old and 71 kg", 26, 71.0),
            ("I'm 26 and weigh 71 kg", 26, 71.0),
            ("I'm 26 years old, around 71 kilos", 26, 71.0),
            ("I'm 26, 71kg", 26, 71.0),
            ("26 yo, 71 kilos", 26, 71.0),
            ("I'm 26 years old and my weight is 71 kg", 26, 71.0),
        ],
    )
    def test_combined_age_weight_sentences(self, nlp, message, expected_age, expected_weight):
        result = nlp(message)
        assert result.entities["age"] == expected_age
        assert result.entities["weight_kg"] == expected_weight

    def test_bare_number_not_treated_as_age_without_context(self, nlp):
        result = nlp("71")
        assert result.entities["age"] is None

    def test_bare_number_as_age_when_pending(self, nlp):
        result = nlp("26", pending_field="age")
        assert result.entities["age"] == 26

    def test_bare_number_as_weight_when_pending(self, nlp):
        result = nlp("71", pending_field="weight_kg")
        assert result.entities["weight_kg"] == 71.0
        assert result.entities["age"] is None


class TestContextualDonationDates:
    @pytest.mark.parametrize(
        "message,expected_days",
        [
            ("6 months ago", 180),
            ("2 months ago", 60),
            ("8 weeks ago", 56),
            ("56 days ago", 56),
            ("three months ago", 90),
            ("yesterday", 1),
            ("last month", 30),
        ],
    )
    def test_relative_time_with_pending_donation_question(
        self, nlp, message, expected_days
    ):
        result = nlp(message, pending_field="days_since_last_donation")
        assert result.entities["days_since_last_donation"] == expected_days

    @pytest.mark.parametrize(
        "message,expected_days",
        [
            ("Yes, about 6 months ago", 180),
            ("Yeah, 2 months ago", 60),
            ("Yes, around 8 weeks ago", 56),
            ("I donated 3 months ago", 90),
        ],
    )
    def test_yes_and_donation_date_phrases(self, nlp, message, expected_days):
        result = nlp(message, pending_field="days_since_last_donation")
        assert result.entities["days_since_last_donation"] == expected_days
        assert result.is_first_time_donor is False


class TestFirstTimeDonor:
    @pytest.mark.parametrize(
        "message",
        [
            "No",
            "Never",
            "I've never donated",
            "No, this would be my first time",
            "I haven't donated before",
        ],
    )
    def test_first_time_donor_with_pending_question(self, nlp, message):
        result = nlp(message, pending_field="days_since_last_donation")
        assert result.is_first_time_donor is True
        assert result.entities["days_since_last_donation"] is None

    def test_no_without_pending_is_not_first_time_donor(self, nlp):
        result = nlp("No")
        assert result.is_first_time_donor is not True


class TestContextualYesNoAnswers:
    @pytest.mark.parametrize(
        "pending_field,message,expected",
        [
            ("recent_illness", "Yes", True),
            ("recent_illness", "No", False),
            ("fever", "Yes", True),
            ("fever", "No", False),
            ("current_medication", "Yes", True),
            ("antibiotics", "No", False),
            ("recent_surgery", "Yes", True),
            ("recent_dental_procedure", "No", False),
            ("recent_tattoo_or_piercing", "Yes", True),
            ("chronic_condition_reported", "No", False),
            ("recent_blood_transfusion", "Yes", True),
            ("pregnancy_status", "Yes", "yes"),
            ("pregnancy_status", "No", "no"),
            ("hemoglobin_known", "Yes", True),
            ("hemoglobin_known", "No", False),
        ],
    )
    def test_pending_field_short_answers(self, nlp, pending_field, message, expected):
        result = nlp(message, pending_field=pending_field)
        assert result.intent == NLPIntent.PROVIDE_INFORMATION
        assert result.entities[pending_field] == expected

    @pytest.mark.parametrize(
        "pending_field,message,expected",
        [
            ("recent_illness", "Yeah", True),
            ("fever", "Yep", True),
            ("antibiotics", "Nope", False),
            ("recent_surgery", "Nah", False),
        ],
    )
    def test_natural_yes_no_variants(self, nlp, pending_field, message, expected):
        result = nlp(message, pending_field=pending_field)
        assert result.entities[pending_field] == expected
