"""Hybrid response service: LLM wording with deterministic fallback."""

from __future__ import annotations

import logging
import re

from app.models.conversation_schemas import ConversationStatus
from app.models.llm_schemas import LLMResponseRequest
from app.services.llm.provider import get_llm_provider
from app.services.response_service import ResponseContext, ResponseService
from config.ai_config import FINAL_AUTHORITY_DISCLAIMER

logger = logging.getLogger(__name__)

FORBIDDEN_RESPONSE_PATTERNS = [
    re.compile(r"\bguaranteed eligible\b", re.IGNORECASE),
    re.compile(r"\bdefinitely eligible\b", re.IGNORECASE),
    re.compile(r"\bmedical diagnosis\b", re.IGNORECASE),
]


class HybridResponseService:
    """LLM-powered natural responses with deterministic safety fallback."""

    def __init__(
        self,
        deterministic_service: ResponseService | None = None,
        llm_provider=None,
    ) -> None:
        self._deterministic = deterministic_service or ResponseService()
        self._llm = llm_provider if llm_provider is not None else get_llm_provider()

    def generate(self, context: ResponseContext) -> str:
        if self._llm.is_available() and not context.conflicts:
            try:
                request = self._to_llm_request(context)
                text = self._llm.generate_response(request)
                if self._is_safe_response(text, context):
                    return self._finalize_response(text, context)
            except Exception as exc:
                logger.warning("LLM response generation failed, using fallback: %s", exc)

        return self._deterministic.generate(context)

    def humanize_reasons(self, reasons: list[str]) -> list[str]:
        return self._deterministic.humanize_reasons(reasons)

    def _to_llm_request(self, context: ResponseContext) -> LLMResponseRequest:
        return LLMResponseRequest(
            intent=context.intent,
            status=context.status.value,
            pending_question_field=context.pending_question_field,
            next_field=context.next_field,
            next_question=context.next_question,
            collected_information=context.collected_information,
            missing_information=context.missing_information,
            latest_entities=context.latest_entities,
            eligibility=context.eligibility,
            conflicts=context.conflicts,
            clarification_topic=context.clarification_topic,
            session_complete=context.session_complete,
            low_confidence=context.low_confidence,
        )

    def _is_safe_response(self, text: str, context: ResponseContext) -> bool:
        cleaned = text.strip()
        if not cleaned:
            return False
        for pattern in FORBIDDEN_RESPONSE_PATTERNS:
            if pattern.search(cleaned):
                return False
        if context.status == ConversationStatus.COMPLETED and context.eligibility:
            lowered = cleaned.lower()
            if "preliminary" not in lowered and "based on" not in lowered:
                return False
        return True

    def _finalize_response(self, text: str, context: ResponseContext) -> str:
        cleaned = text.strip()
        if context.status == ConversationStatus.COMPLETED and context.eligibility:
            if FINAL_AUTHORITY_DISCLAIMER.lower() not in cleaned.lower():
                return f"{cleaned} {FINAL_AUTHORITY_DISCLAIMER}"
        return cleaned


_hybrid_response_service: HybridResponseService | None = None


def get_response_service() -> HybridResponseService:
    global _hybrid_response_service
    if _hybrid_response_service is None:
        _hybrid_response_service = HybridResponseService()
    return _hybrid_response_service
