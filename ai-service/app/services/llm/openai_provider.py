"""OpenAI-compatible LLM provider implementation."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx

from app.models.llm_schemas import LLMExtractionResponse, LLMResponseRequest
from app.services.llm.base_provider import LLMProvider
from app.services.llm.prompts import (
    EXTRACTION_SYSTEM_PROMPT,
    RESPONSE_SYSTEM_PROMPT,
    build_extraction_user_prompt,
    build_response_user_prompt,
)
from config.llm_config import get_llm_settings

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(LLMProvider):
    """OpenAI-compatible chat completions provider with JSON extraction."""

    def __init__(self) -> None:
        settings = get_llm_settings()
        self._api_key = str(settings["api_key"])
        self._model = str(settings["model"])
        self._base_url = str(settings["base_url"])
        self._timeout = float(settings["timeout_ms"]) / 1000.0
        self._enabled = bool(settings["enabled"])

    def is_available(self) -> bool:
        return self._enabled

    def extract_information(
        self,
        *,
        message: str,
        pending_field: str | None,
        collected_information: dict[str, Any],
        conversation_history: list[dict[str, str]],
    ) -> LLMExtractionResponse:
        user_prompt = build_extraction_user_prompt(
            message=message,
            pending_field=pending_field,
            collected_information=collected_information,
            conversation_history=conversation_history,
        )
        raw = self._chat_completion(
            system_prompt=EXTRACTION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            json_mode=True,
        )
        parsed = json.loads(raw)
        return LLMExtractionResponse.model_validate(parsed)

    def generate_response(self, request: LLMResponseRequest) -> str:
        user_prompt = build_response_user_prompt(request.model_dump())
        return self._chat_completion(
            system_prompt=RESPONSE_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            json_mode=False,
        ).strip()

    def _chat_completion(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        json_mode: bool,
    ) -> str:
        url = f"{self._base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        body: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        if json_mode:
            body["response_format"] = {"type": "json_object"}

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                with httpx.Client(timeout=self._timeout) as client:
                    response = client.post(url, headers=headers, json=body)
                    response.raise_for_status()
                    data = response.json()
                    content = data["choices"][0]["message"]["content"]
                    if not content:
                        raise ValueError("Empty LLM response content")
                    return content
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "LLM request failed (attempt %s/2): %s",
                    attempt + 1,
                    exc,
                )
                if attempt == 0:
                    time.sleep(0.3)

        raise RuntimeError(f"LLM provider unavailable: {last_error}") from last_error
