"""Tests for hybrid LLM + deterministic NLP/response services."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.models.llm_schemas import LLMExtractionResponse, LLMResponseRequest
from app.models.nlp_schemas import NLPIntent
from app.services.conversation_service import ConversationService
from app.services.hybrid_nlp_service import HybridNLPService
from app.services.hybrid_response_service import HybridResponseService
from app.services.response_service import ResponseContext
from app.models.conversation_schemas import ConversationStatus
from app.services.llm.base_provider import LLMProvider


class MockLLMProvider(LLMProvider):
    def __init__(self, extraction: LLMExtractionResponse | None = None, response: str = ""):
        self._extraction = extraction
        self._response = response
        self.extract_calls = 0
        self.response_calls = 0
        self._available = True

    def is_available(self) -> bool:
        return self._available

    def extract_information(self, **kwargs) -> LLMExtractionResponse:
        self.extract_calls += 1
        if self._extraction is None:
            raise RuntimeError("mock extraction failure")
        return self._extraction

    def generate_response(self, request: LLMResponseRequest) -> str:
        self.response_calls += 1
        if not self._response:
            raise RuntimeError("mock response failure")
        return self._response


class TestHybridNLPFallback:
    def test_falls_back_to_deterministic_when_llm_unavailable(self):
        provider = MockLLMProvider()
        provider._available = False
        service = HybridNLPService(llm_provider=provider)
        result = service.parse_message("I'm 26 and around 73 kilos.")
        assert result.entities["age"] == 26
        assert result.entities["weight_kg"] == 73.0
        assert result.extraction_source == "deterministic"
        assert provider.extract_calls == 0

    def test_falls_back_when_llm_raises(self):
        provider = MockLLMProvider(extraction=None)
        service = HybridNLPService(llm_provider=provider)
        result = service.parse_message("Nope, I'm not taking any antibiotics.", pending_field="antibiotics")
        assert result.entities["antibiotics"] is False
        assert result.extraction_source == "deterministic"

    def test_uses_llm_extraction_when_available(self):
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(
                intent=NLPIntent.PROVIDE_INFORMATION,
                entities={"recent_illness": True, "fever": True, "antibiotics": True},
            )
        )
        service = HybridNLPService(llm_provider=provider)
        result = service.parse_message(
            "Honestly I'm feeling okay, but I had a fever three days ago and I'm currently taking antibiotics."
        )
        assert result.extraction_source in {"hybrid", "deterministic", "llm"}
        assert result.entities["fever"] is True
        assert result.entities["antibiotics"] is True
        assert provider.extract_calls == 1

    def test_deterministic_wins_over_llm_gaps(self):
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(
                intent=NLPIntent.PROVIDE_INFORMATION,
                entities={"age": 26, "weight_kg": 73.0},
            )
        )
        service = HybridNLPService(llm_provider=provider)
        message = (
            "I am 26 years old and 73 kg and I donated blood 6 months ago "
            "and I feel fine lately and have no fever."
        )
        result = service.parse_message(message)
        assert result.entities["days_since_last_donation"] == 180
        assert result.entities["recent_illness"] is False
        assert result.entities["fever"] is False


class TestLLMExtractionSchema:
    def test_filters_unknown_entity_keys(self):
        parsed = LLMExtractionResponse.model_validate(
            {
                "intent": "provide_information",
                "entities": {"age": 26, "made_up_field": True},
            }
        )
        assert parsed.entities == {"age": 26}

    def test_clarification_flag(self):
        parsed = LLMExtractionResponse.model_validate(
            {
                "intent": "provide_information",
                "entities": {},
                "needs_clarification": True,
                "clarification_field": "days_since_last_donation",
            }
        )
        assert parsed.needs_clarification is True
        assert parsed.clarification_field == "days_since_last_donation"


class TestHybridResponseFallback:
    def test_falls_back_to_deterministic_response(self):
        provider = MockLLMProvider(response="")
        provider._available = False
        deterministic = HybridResponseService(llm_provider=provider)
        text = deterministic.generate(
            ResponseContext(
                intent="greeting",
                status=ConversationStatus.COLLECTING_INFORMATION,
                next_question="How old are you?",
            )
        )
        assert "How old are you?" in text

    def test_uses_llm_response_when_safe(self):
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(intent=NLPIntent.GREETING, entities={}),
            response="Got it — and roughly how much do you weigh?",
        )
        service = HybridResponseService(llm_provider=provider)
        text = service.generate(
            ResponseContext(
                intent="provide_information",
                status=ConversationStatus.COLLECTING_INFORMATION,
                latest_entities={"age": 26},
                next_question="What is your approximate weight in kilograms?",
            )
        )
        assert "weigh" in text.lower()
        assert provider.response_calls == 1

    def test_rejects_unsafe_llm_response(self):
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(intent=NLPIntent.GREETING, entities={}),
            response="You are guaranteed eligible to donate blood.",
        )
        service = HybridResponseService(llm_provider=provider)
        text = service.generate(
            ResponseContext(
                intent="greeting",
                status=ConversationStatus.COLLECTING_INFORMATION,
                next_question="How old are you?",
            )
        )
        assert "How old are you?" in text


class TestHybridConversationIntegration:
    def test_llm_extraction_drives_conversation(self):
        store = {}
        provider = MockLLMProvider(
            extraction=LLMExtractionResponse(
                intent=NLPIntent.PROVIDE_INFORMATION,
                entities={"recent_illness": True},
            ),
            response="Thanks for letting me know. Do you currently have a fever?",
        )
        service = ConversationService(
            session_store=store,
            nlp_service=HybridNLPService(llm_provider=provider),
            response_service=HybridResponseService(llm_provider=provider),
            eligibility_model=MagicMock(),
        )
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("26", session_id=session_id)
        service.handle_message("73", session_id=session_id)
        service.handle_message("Yes 6 months ago", session_id=session_id)
        result = service.handle_message("Yes", session_id=session_id)
        assert result.collected_information["recent_illness"] is True
        assert provider.extract_calls >= 1

    def test_step_72_behavior_without_llm(self):
        store = {}
        provider = MockLLMProvider()
        provider._available = False
        service = ConversationService(
            session_store=store,
            nlp_service=HybridNLPService(llm_provider=provider),
            response_service=HybridResponseService(llm_provider=provider),
        )
        first = service.handle_message("Hi")
        session_id = first.session_id
        service.handle_message("26", session_id=session_id)
        result = service.handle_message("73", session_id=session_id)
        assert result.collected_information["age"] == 26
        assert result.collected_information["weight_kg"] == 73.0
        assert not result.conflicts
