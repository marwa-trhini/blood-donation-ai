"""NLP service facade — deterministic extraction only."""

from __future__ import annotations

from typing import Any

from app.models.nlp_schemas import NLPParseResult
from app.services.nlp_service import NLPService


class HybridNLPService:
    """Deterministic NLP for donor screening entity extraction."""

    def __init__(self, deterministic_service: NLPService | None = None) -> None:
        self._deterministic = deterministic_service or NLPService()

    def parse_message(
        self,
        message: str,
        pending_field: str | None = None,
        *,
        conversation_history: list[dict[str, str]] | None = None,
        collected_information: dict[str, Any] | None = None,
    ) -> NLPParseResult:
        collected = collected_information or {}
        result = self._deterministic.parse_message(
            message,
            pending_field=pending_field,
            collected_information=collected,
        )
        result.extraction_source = "deterministic"
        return result


_hybrid_nlp_service: HybridNLPService | None = None


def get_nlp_service() -> HybridNLPService:
    global _hybrid_nlp_service
    if _hybrid_nlp_service is None:
        _hybrid_nlp_service = HybridNLPService()
    return _hybrid_nlp_service
