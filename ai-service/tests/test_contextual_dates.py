"""Regression tests for contextual relative-date parsing."""

from __future__ import annotations

import pytest

from app.services.conversation_service import ConversationService
from app.services.nlp_service import parse_message
from config.conversation_config import RECENCY_BOOLEAN_FIELDS, REQUIRED_FIELD_ORDER

# Natural relative-time variants exercised through the shared parser.
RELATIVE_TIME_VARIANTS = [
    ("last month", 30),
    ("a month ago", 30),
    ("2 months ago", 60),
    ("three months ago", 90),
    ("6 months ago", 180),
    ("about 6 months ago", 180),
    ("last year", 365),
    ("a year ago", 365),
    ("2 years ago", 730),
    ("a few months ago", 90),
    ("about 3 weeks ago", 21),
]

RECENCY_FIELD_WALK_MESSAGES: dict[str, list[str]] = {
    "recent_illness": ["Hi", "26", "73", "Yes, 6 months ago"],
    "recent_surgery": [
        "Hi",
        "26",
        "73",
        "Yes, 6 months ago",
        "No",
        "No",
        "No",
        "No",
    ],
    "recent_dental_procedure": [
        "Hi",
        "26",
        "73",
        "Yes, 6 months ago",
        "No",
        "No",
        "No",
        "No",
        "No",
    ],
    "recent_tattoo_or_piercing": [
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
    ],
    "recent_blood_transfusion": [
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
    ],
}


@pytest.fixture
def service():
    return ConversationService(session_store={})


def advance_to_field(service: ConversationService, field: str) -> str:
    """Walk a session until the given field is pending."""
    messages = RECENCY_FIELD_WALK_MESSAGES.get(field)
    if messages is None:
        idx = REQUIRED_FIELD_ORDER.index(field)
        messages = ["Hi", "26", "73", "Yes, 6 months ago"]
        messages.extend(["No"] * max(0, idx - 3))

    session_id = None
    for message in messages:
        result = service.handle_message(message, session_id=session_id)
        session_id = result.session_id
        state = service.get_session(session_id)
        assert state is not None
        if state.pending_question_field == field:
            return session_id

    state = service.get_session(session_id)
    assert state is not None
    assert state.pending_question_field == field
    return session_id


class TestGenericRelativeTimeParser:
    @pytest.mark.parametrize("phrase,expected_days", RELATIVE_TIME_VARIANTS)
    def test_donation_pending_parses_variants(self, phrase, expected_days):
        result = parse_message(phrase, pending_field="days_since_last_donation")
        assert result.entities["days_since_last_donation"] == expected_days

    @pytest.mark.parametrize("phrase", [p for p, _ in RELATIVE_TIME_VARIANTS])
    def test_recency_pending_does_not_touch_donation(self, phrase):
        result = parse_message(phrase, pending_field="recent_tattoo_or_piercing")
        assert result.entities["days_since_last_donation"] is None

    @pytest.mark.parametrize("field", sorted(RECENCY_BOOLEAN_FIELDS))
    def test_two_months_ago_affirms_pending_recency_field(self, field):
        result = parse_message("2 months ago", pending_field=field)
        assert result.entities[field] is True
        assert result.entities["days_since_last_donation"] is None

    @pytest.mark.parametrize("field", sorted(RECENCY_BOOLEAN_FIELDS))
    def test_yes_last_month_affirms_without_donation_conflict(self, service, field):
        session_id = advance_to_field(service, field)
        state = service.get_session(session_id)
        assert state is not None
        assert state.collected_information["days_since_last_donation"] == 180

        result = service.handle_message("Yes last month", session_id=session_id)
        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information[field] is True
        assert not result.conflicts

    def test_recently_variants(self):
        for phrase in ("recently", "just recently"):
            donation = parse_message(
                phrase, pending_field="days_since_last_donation"
            ).entities["days_since_last_donation"]
            tattoo = parse_message(
                phrase, pending_field="recent_tattoo_or_piercing"
            ).entities["recent_tattoo_or_piercing"]
            assert donation == 30
            assert tattoo is True


class TestContextualRelativeDates:
    def test_yes_last_month_tattoo_pending_preserves_donation(self, service):
        session_id = advance_to_field(service, "recent_tattoo_or_piercing")
        result = service.handle_message("Yes last month", session_id=session_id)

        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information["recent_tattoo_or_piercing"] is True
        assert not result.conflicts
        assert (
            "two different answers about your donation history"
            not in result.message.lower()
        )

    def test_tattoo_two_months_ago_pending(self, service):
        session_id = advance_to_field(service, "recent_tattoo_or_piercing")
        result = service.handle_message(
            "I had a tattoo 2 months ago", session_id=session_id
        )

        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information["recent_tattoo_or_piercing"] is True
        assert not result.conflicts

    def test_last_month_donation_pending(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("26", session_id=session_id)
        service.handle_message("73", session_id=session_id)

        result = service.handle_message("last month", session_id=session_id)
        assert result.collected_information["days_since_last_donation"] == 30

    def test_got_one_two_months_ago_tattoo_pending(self, service):
        session_id = advance_to_field(service, "recent_tattoo_or_piercing")
        result = service.handle_message(
            "I got one 2 months ago", session_id=session_id
        )
        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information["recent_tattoo_or_piercing"] is True
        assert not result.conflicts


class TestMultiEntityWithRelativeTime:
    MULTI_ENTITY_MESSAGE = (
        "I'm 26, weigh 73 kg, donated blood 2 months ago, "
        "haven't been sick recently, and I'm not taking any medication."
    )

    def test_extracts_all_applicable_fields_in_one_turn(self):
        result = parse_message(self.MULTI_ENTITY_MESSAGE)
        entities = result.entities

        assert entities["age"] == 26
        assert entities["weight_kg"] == 73
        assert entities["days_since_last_donation"] == 60
        assert entities["recent_illness"] is False
        assert entities["current_medication"] is False

    def test_multi_entity_does_not_set_unrelated_recency_booleans(self):
        result = parse_message(self.MULTI_ENTITY_MESSAGE)
        entities = result.entities

        assert entities["recent_tattoo_or_piercing"] is None
        assert entities["recent_surgery"] is None
        assert entities["recent_dental_procedure"] is None
