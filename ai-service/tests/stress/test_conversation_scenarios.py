"""Realistic multi-turn conversation stress tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import pytest

from app.models.schemas import ChatRequest
from app.services.ai_service import AIService
from app.services.conversation_service import ConversationService
from config.conversation_config import REQUIRED_FIELD_ORDER


@pytest.fixture
def service():
    return ConversationService(session_store={})


@pytest.fixture
def ai_service():
    return AIService()


@dataclass
class ConversationScenario:
    name: str
    messages: list[str]
    checks: Callable[[list[Any]], None]


def walk(service: ConversationService, messages: list[str]) -> list[Any]:
    session_id = None
    results = []
    for message in messages:
        result = service.handle_message(message, session_id=session_id)
        session_id = result.session_id
        results.append(result)
    return results


SETUP = ["Hi", "26", "73"]


def advance_to(service: ConversationService, target: str) -> str:
    messages = ["Hi", "26", "73", "Yes, 6 months ago"]
    idx = REQUIRED_FIELD_ORDER.index(target)
    messages.extend(["No"] * max(0, idx - 3))
    session_id = None
    for message in messages:
        result = service.handle_message(message, session_id=session_id)
        session_id = result.session_id
    return session_id


def answer_at(service: ConversationService, target: str, answer: str) -> list[Any]:
    session_id = advance_to(service, target)
    result = service.handle_message(answer, session_id=session_id)
    return [result]


def last(results: list[Any]):
    return results[-1]


def check_donation_240(results):
    assert last(results).collected_information["days_since_last_donation"] == 240


def check_donation_180(results):
    assert last(results).collected_information["days_since_last_donation"] == 180


def check_first_time(results):
    assert last(results).collected_information["days_since_last_donation"] is None


def check_tattoo_isolation(results):
    r = last(results)
    assert r.collected_information["days_since_last_donation"] == 180
    assert r.collected_information["recent_tattoo_or_piercing"] is True
    assert not r.conflicts


def check_surgery(results):
    r = last(results)
    assert r.collected_information["recent_surgery"] is True
    assert r.collected_information["days_since_last_donation"] == 180


def check_medication_true(results):
    assert last(results).collected_information["current_medication"] is True


def check_hemoglobin(results):
    r = last(results)
    assert r.collected_information["hemoglobin_known"] is True
    assert r.collected_information["hemoglobin_value"] == 13.4


def check_fever_invalid(results):
    r = last(results)
    assert r.collected_information.get("fever") is None or r.status.value == "needs_clarification"


def check_age_conflict(results):
    r = last(results)
    assert r.collected_information["age"] == 26
    assert any(c["field"] == "age" for c in r.conflicts)


def check_medication_false(results):
    assert last(results).collected_information["current_medication"] is False


def check_illness_false(results):
    assert last(results).collected_information.get("recent_illness") is False


def check_dental_true(results):
    assert last(results).collected_information["recent_dental_procedure"] is True


def check_transfusion_true(results):
    assert last(results).collected_information["recent_blood_transfusion"] is True


def check_pregnancy_na(results):
    assert last(results).collected_information["pregnancy_status"] == "not_applicable"


def check_antibiotics_true(results):
    assert last(results).collected_information["antibiotics"] is True


def check_multi_entity(results):
    r = last(results)
    assert r.collected_information["age"] == 26
    assert r.collected_information["weight_kg"] == 73
    assert r.collected_information["days_since_last_donation"] == 240
    assert r.collected_information["recent_illness"] is False
    assert r.collected_information["current_medication"] is False


def check_tattoo_8_months(results):
    r = last(results)
    assert r.collected_information["days_since_last_donation"] == 180
    assert r.collected_information["recent_tattoo_or_piercing"] is True


def check_chronic_false(results):
    assert last(results).collected_information["chronic_condition_reported"] is False


SCENARIOS = [
    ConversationScenario("donation_8_months_before", ["Hi", "26", "73", "Yes, 8 months before"], check_donation_240),
    ConversationScenario("donation_8_months_back", ["Hi", "26", "73", "last donation was about 8 months back"], check_donation_240),
    ConversationScenario("donation_roughly_8_months_ago", ["Hi", "26", "73", "I gave blood roughly 8 months ago"], check_donation_240),
    ConversationScenario("first_time_donor_never", ["Hi", "26", "73", "No, I've never donated blood"], check_first_time),
    ConversationScenario("tattoo_yes_last_month", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "No", "Yes, last month"], check_tattoo_isolation),
    ConversationScenario("surgery_two_years_ago", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "Yes, two years ago"], check_surgery),
    ConversationScenario("medication_panadol", SETUP + ["Yes, 6 months ago", "No", "No", "Yes, I take Panadol"], check_medication_true),
    ConversationScenario("hemoglobin_13_4", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "No", "No", "No", "No", "No", "Yes, my hemoglobin is 13.4"], check_hemoglobin),
    ConversationScenario("fever_29_degrees", SETUP + ["No", "Yes, 29 degrees"], check_fever_invalid),
    ConversationScenario("age_conflict", ["I'm 26.", "Actually I'm 27."], check_age_conflict),
    ConversationScenario("not_currently_medication", SETUP + ["Yes, 6 months ago", "No", "No", "Not currently"], check_medication_false),
    ConversationScenario("no_im_fine", SETUP + ["No, I'm fine"], check_illness_false),
    ConversationScenario("around_eight_months", ["Hi", "26", "73", "around eight months ago"], check_donation_240),
    ConversationScenario("dental_couple_months", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "Yes, a couple of months ago"], check_dental_true),
    ConversationScenario("transfusion_few_weeks", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "No", "No", "No", "No", "Yes, a few weeks ago"], check_transfusion_true),
    ConversationScenario("pregnancy_na", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "No", "No", "not applicable"], check_pregnancy_na),
    ConversationScenario("antibiotics_tablets", SETUP + ["Yes, 6 months ago", "No", "No", "No", "Yes, two tablets a day"], check_antibiotics_true),
    ConversationScenario("multi_entity", ["I'm 26, weigh 73 kg, donated blood about 8 months ago, haven't been sick recently, and I'm not taking any medication."], check_multi_entity),
    ConversationScenario("irrelevant_prefix", ["Hi", "26", "73", "Hmm let me think... about 6 months ago I think"], check_donation_180),
    ConversationScenario("tattoo_8_months_isolated", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "No", "Yes, 8 months ago"], check_tattoo_8_months),
    ConversationScenario("never_sick", SETUP + ["I have never been sick recently"], check_illness_false),
    ConversationScenario("donated_before_then_date", ["Hi", "26", "73", "Yes, I donated before", "about 8 months ago"], check_donation_240),
    ConversationScenario("chronic_no", SETUP + ["Yes, 6 months ago", "No", "No", "No", "No", "No", "No", "No", "No", "No"], check_chronic_false),
    ConversationScenario("illness_no_havent", SETUP + ["Yes, 6 months ago", "No, I haven't"], check_illness_false),
]


class TestConversationStressScenarios:
    @pytest.mark.parametrize("scenario", SCENARIOS, ids=[s.name for s in SCENARIOS])
    def test_scenario(self, service, scenario):
        scenario.checks(walk(service, scenario.messages))


class TestAIServiceEndToEnd:
    def test_multi_turn(self, ai_service):
        first = ai_service.process_message(ChatRequest(message="Hi"))
        sid = first.session_id
        r2 = ai_service.process_message(
            ChatRequest(message="I'm 26, weigh 73 kg, donated about 8 months ago", session_id=sid)
        )
        assert r2.collected_information.get("days_since_last_donation") == 240

    def test_donation_before(self, ai_service):
        first = ai_service.process_message(ChatRequest(message="Hi"))
        sid = first.session_id
        ai_service.process_message(ChatRequest(message="26", session_id=sid))
        ai_service.process_message(ChatRequest(message="73", session_id=sid))
        r = ai_service.process_message(ChatRequest(message="Yes, 8 months before", session_id=sid))
        assert r.collected_information.get("days_since_last_donation") == 240


class TestRelativeTimeDirections:
    @pytest.mark.parametrize("phrase,expected", [
        ("8 months ago", 240),
        ("8 months before", 240),
        ("8 months back", 240),
        ("roughly 8 months back", 240),
        ("about eight months ago", 240),
        ("a couple of months ago", 60),
        ("last year", 365),
    ])
    def test_variants(self, service, phrase, expected):
        sid = service.handle_message("Hi").session_id
        service.handle_message("26", session_id=sid)
        service.handle_message("73", session_id=sid)
        r = service.handle_message(phrase, session_id=sid)
        assert r.collected_information["days_since_last_donation"] == expected
