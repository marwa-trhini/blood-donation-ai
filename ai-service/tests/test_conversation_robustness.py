"""Comprehensive regression tests for multi-turn conversation robustness."""

from __future__ import annotations

import pytest

from app.models.nlp_schemas import NLPIntent
from app.services.conversation_service import ConversationService
from app.services.hybrid_nlp_service import HybridNLPService
from tests.test_hybrid_llm_service import MockLLMProvider


@pytest.fixture
def nlp():
    from app.services.nlp_service import parse_message

    return parse_message


@pytest.fixture
def isolated_store():
    return {}


@pytest.fixture
def service(isolated_store):
    return ConversationService(session_store=isolated_store)


class TestMultiEntitySingleMessage:
    """A. One message with many entities."""

    def test_extracts_all_fields_from_natural_message(self, nlp):
        message = (
            "I am 26, weigh 73kg, donated 6 months ago, feel fine and have no fever."
        )
        result = nlp(message)
        assert result.entities["age"] == 26
        assert result.entities["weight_kg"] == 73.0
        assert result.entities["days_since_last_donation"] == 180
        assert result.is_first_time_donor is False
        assert result.entities["recent_illness"] is False
        assert result.entities["fever"] is False

    def test_long_natural_message_in_conversation(self, service):
        message = (
            "I am 26 years old and 73 kg and I donated blood 6 months ago "
            "and I feel fine lately and have no fever."
        )
        first = service.handle_message("Hi")
        result = service.handle_message(message, session_id=first.session_id)

        assert result.collected_information["age"] == 26
        assert result.collected_information["weight_kg"] == 73.0
        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information["recent_illness"] is False
        assert result.collected_information["fever"] is False
        assert "days_since_last_donation" not in result.missing_information
        assert "Are you currently taking any medication?" in (result.next_question or "")


class TestPendingBooleanAnswers:
    """B-E. Pending field + bare yes/no answers."""

    @pytest.mark.parametrize(
        "pending_field,message,expected",
        [
            ("current_medication", "No", False),
            ("antibiotics", "No", False),
            ("recent_illness", "No", False),
            ("fever", "No", False),
            ("current_medication", "Yes", True),
        ],
    )
    def test_pending_boolean_via_nlp(self, nlp, pending_field, message, expected):
        result = nlp(message, pending_field=pending_field)
        assert result.intent == NLPIntent.PROVIDE_INFORMATION
        assert result.entities[pending_field] == expected

    @pytest.mark.parametrize(
        "pending_field",
        ["current_medication", "antibiotics", "recent_illness", "fever"],
    )
    def test_pending_boolean_via_conversation(self, service, pending_field):
        first = service.handle_message("Hi")
        session_id = first.session_id
        state = service.get_session(session_id)
        assert state is not None
        state.pending_question_field = pending_field

        result = service.handle_message("No", session_id=session_id)
        assert result.collected_information[pending_field] is False
        assert "blood-donation eligibility" not in result.message.lower()


class TestFullNaturalConversation:
    """F. Full multi-turn screening sequence."""

    def test_step_by_step_screening_with_no_answers(self, service):
        messages = [
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
        assert last.collected_information["recent_illness"] is False
        assert last.collected_information["fever"] is False
        assert last.collected_information["current_medication"] is False
        assert last.collected_information["antibiotics"] is False
        assert "blood-donation eligibility" not in last.message.lower()


class TestMultiAnswerMessage:
    """G. Multi-answer message extracts everything and avoids repetition."""

    def test_all_fields_no_donation_repeat(self, service):
        message = (
            "I'm 26, 73kg, donated 6 months ago, no illness, no fever, "
            "no medication and I'm not taking antibiotics."
        )
        first = service.handle_message("Hi")
        result = service.handle_message(message, session_id=first.session_id)

        assert result.collected_information["age"] == 26
        assert result.collected_information["weight_kg"] == 73.0
        assert result.collected_information["days_since_last_donation"] == 180
        assert result.collected_information["recent_illness"] is False
        assert result.collected_information["fever"] is False
        assert result.collected_information["current_medication"] is False
        assert result.collected_information["antibiotics"] is False
        assert "days_since_last_donation" not in result.missing_information
        assert "Have you donated blood before" not in (result.next_question or "")


class TestFirstTimeDonor:
    """H. First-time donor should not request donation date."""

    def test_never_donated_nlp(self, nlp):
        result = nlp("I've never donated before")
        assert result.is_first_time_donor is True

    def test_never_donated_conversation(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("26", session_id=session_id)
        service.handle_message("73", session_id=session_id)
        result = service.handle_message("I've never donated before", session_id=session_id)

        state = service.get_session(session_id)
        assert state is not None
        assert state.is_first_time_donor is True
        assert "days_since_last_donation" not in result.missing_information


class TestContextualBareNumbers:
    """I. Contextual bare number interpretation."""

    def test_pending_age(self, nlp):
        assert nlp("26", pending_field="age").entities["age"] == 26

    def test_pending_weight(self, nlp):
        assert nlp("73", pending_field="weight_kg").entities["weight_kg"] == 73.0


class TestContextualDonationDate:
    """J. Contextual donation date."""

    def test_six_months_ago_with_pending(self, nlp):
        result = nlp("6 months ago", pending_field="days_since_last_donation")
        assert result.entities["days_since_last_donation"] == 180
        assert result.is_first_time_donor is False


class TestNoFalseConflicts:
    """K. Combined messages must not produce false conflicts."""

    def test_age_weight_no_conflict(self, service):
        result = service.handle_message("26 years old and 73 kg")
        assert not result.conflicts

    def test_age_and_donation_no_conflict(self, service):
        result = service.handle_message(
            "I'm 26 years old and donated blood 6 months ago"
        )
        assert not result.conflicts
        assert result.collected_information["age"] == 26
        assert result.collected_information["days_since_last_donation"] == 180


class TestHybridDeterministicBaseline:
    """LLM partial extraction must not drop deterministic fields."""

    def test_hybrid_fills_llm_gaps_from_deterministic(self):
        from app.models.llm_schemas import LLMExtractionResponse

        message = (
            "I am 26 years old and 73 kg and I donated blood 6 months ago "
            "and I feel fine lately and have no fever."
        )
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(
                intent=NLPIntent.PROVIDE_INFORMATION,
                entities={
                    "age": 26,
                    "weight_kg": 73.0,
                    "recent_illness": False,
                    "fever": False,
                },
            )
        )
        hybrid = HybridNLPService(llm_provider=provider)
        result = hybrid.parse_message(message)

        assert result.entities["days_since_last_donation"] == 180
        assert result.extraction_source in {"hybrid", "deterministic"}

    def test_hybrid_conversation_keeps_donation_history(self):
        from app.models.llm_schemas import LLMExtractionResponse

        store: dict = {}
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(
                intent=NLPIntent.PROVIDE_INFORMATION,
                entities={
                    "age": 26,
                    "weight_kg": 73.0,
                    "recent_illness": False,
                    "fever": False,
                },
            )
        )
        svc = ConversationService(
            session_store=store,
            nlp_service=HybridNLPService(llm_provider=provider),
        )
        message = (
            "I am 26 years old and 73 kg and I donated blood 6 months ago "
            "and I feel fine lately and have no fever."
        )
        first = svc.handle_message("Hi")
        result = svc.handle_message(message, session_id=first.session_id)

        assert result.collected_information["days_since_last_donation"] == 180
        assert "days_since_last_donation" not in result.missing_information

    def test_hybrid_no_out_of_scope_for_pending_no(self):
        from app.models.llm_schemas import LLMExtractionResponse

        store: dict = {}
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(
                intent=NLPIntent.UNKNOWN,
                entities={},
            )
        )
        svc = ConversationService(
            session_store=store,
            nlp_service=HybridNLPService(llm_provider=provider),
        )
        first = svc.handle_message("Hi")
        session_id = first.session_id
        svc.handle_message("26", session_id=session_id)
        svc.handle_message("73", session_id=session_id)
        svc.handle_message("Yes, 6 months ago", session_id=session_id)
        svc.handle_message("No", session_id=session_id)
        svc.handle_message("No", session_id=session_id)
        result = svc.handle_message("No", session_id=session_id)

        assert result.collected_information["current_medication"] is False
        assert "blood-donation eligibility" not in result.message.lower()


class TestMobileDonationRegression:
    """Exact mobile conversation: Hi then combined age/weight/donation message."""

    EXACT_MESSAGE = "I am 26 years old, 73 kg, and I donated blood 6 months ago."

    DONATION_QUESTION = (
        "Have you donated blood before? If yes, approximately when was your last donation?"
    )

    def test_nlp_extracts_all_fields(self, nlp):
        result = nlp(self.EXACT_MESSAGE, pending_field="age")
        assert result.entities["age"] == 26
        assert result.entities["weight_kg"] == 73.0
        assert result.entities["days_since_last_donation"] == 180
        assert result.is_first_time_donor is False

    def test_hi_then_combined_message_preserves_donation(self, service):
        first = service.handle_message("Hi")
        session_id = first.session_id
        state = service.get_session(session_id)
        assert state is not None
        assert state.pending_question_field == "age"

        second = service.handle_message(self.EXACT_MESSAGE, session_id=session_id)

        assert second.collected_information["age"] == 26
        assert second.collected_information["weight_kg"] == 73.0
        assert second.collected_information["days_since_last_donation"] == 180
        assert state.is_first_time_donor is False
        assert "days_since_last_donation" not in second.missing_information
        assert second.next_question != self.DONATION_QUESTION
        assert self.DONATION_QUESTION not in (second.next_question or "")
        assert self.DONATION_QUESTION not in second.message

    def test_llm_clarification_does_not_reask_when_deterministic_found_donation(self):
        from app.models.llm_schemas import LLMExtractionResponse

        class ClarifyNLP(HybridNLPService):
            def parse_message(self, message, pending_field=None, **kwargs):
                base = super().parse_message(
                    message, pending_field=pending_field, **kwargs
                )
                return base.model_copy(
                    update={
                        "needs_clarification": True,
                        "clarification_field": "days_since_last_donation",
                    }
                )

        store: dict = {}
        svc = ConversationService(
            session_store=store,
            nlp_service=ClarifyNLP(
                llm_provider=type(
                    "P", (), {"is_available": lambda self: False}
                )()
            ),
        )
        first = svc.handle_message("Hi")
        second = svc.handle_message(
            self.EXACT_MESSAGE, session_id=first.session_id
        )

        assert second.collected_information["days_since_last_donation"] == 180
        assert "days_since_last_donation" not in second.missing_information
        assert self.DONATION_QUESTION not in (second.next_question or "")


class TestResponseAcknowledgment:
    def test_acknowledges_donation_history(self, service):
        message = (
            "I am 26 years old and 73 kg and I donated blood 6 months ago "
            "and I feel fine lately and have no fever."
        )
        first = service.handle_message("Hi")
        result = service.handle_message(message, session_id=first.session_id)
        assert "donation history" in result.message.lower()

    def test_state_preserved_across_turns(self, service):
        first = service.handle_message("I'm 26 and 73 kg.")
        session_id = first.session_id
        second = service.handle_message(
            "I donated blood 6 months ago and I feel fine.",
            session_id=session_id,
        )
        third = service.handle_message(
            "No, I'm not taking medication.",
            session_id=session_id,
        )

        assert third.collected_information["age"] == 26
        assert third.collected_information["weight_kg"] == 73.0
        assert third.collected_information["days_since_last_donation"] == 180
        assert third.collected_information["recent_illness"] is False
        assert third.collected_information["current_medication"] is False
