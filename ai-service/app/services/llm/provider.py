"""LLM provider factory."""

from __future__ import annotations

from app.services.llm.base_provider import LLMProvider
from app.services.llm.openai_provider import OpenAICompatibleProvider
from config.llm_config import get_llm_settings

_llm_provider: LLMProvider | None = None


class UnavailableLLMProvider(LLMProvider):
    """No-op provider used when LLM is not configured."""

    def is_available(self) -> bool:
        return False

    def extract_information(self, **kwargs):
        raise RuntimeError("LLM provider is not configured")

    def generate_response(self, request):
        raise RuntimeError("LLM provider is not configured")


def get_llm_provider() -> LLMProvider:
    global _llm_provider
    if _llm_provider is None:
        settings = get_llm_settings()
        provider_name = str(settings["provider"])
        if settings["enabled"] and provider_name in {"openai", "openai_compatible"}:
            _llm_provider = OpenAICompatibleProvider()
        else:
            _llm_provider = UnavailableLLMProvider()
    return _llm_provider
