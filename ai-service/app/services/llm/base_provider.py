"""Abstract LLM provider interface."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from app.models.llm_schemas import LLMExtractionResponse, LLMResponseRequest


class LLMProvider(ABC):
    """Provider abstraction for LLM-powered extraction and response generation."""

    @abstractmethod
    def is_available(self) -> bool:
        """Return True when the provider is configured and ready."""

    @abstractmethod
    def extract_information(
        self,
        *,
        message: str,
        pending_field: str | None,
        collected_information: dict[str, Any],
        conversation_history: list[dict[str, str]],
    ) -> LLMExtractionResponse:
        """Extract structured information from a user message."""

    @abstractmethod
    def generate_response(self, request: LLMResponseRequest) -> str:
        """Generate a natural assistant response from structured context."""
