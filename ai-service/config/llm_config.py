"""LLM provider configuration loaded from environment variables."""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _optional_env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


@lru_cache(maxsize=1)
def get_llm_settings() -> dict[str, str | int | bool]:
    provider = _optional_env("LLM_PROVIDER").lower()
    api_key = _optional_env("LLM_API_KEY")
    model = _optional_env("LLM_MODEL", "gpt-4o-mini")
    timeout_ms = int(_optional_env("LLM_TIMEOUT_MS", "10000") or "10000")
    base_url = _optional_env("LLM_BASE_URL", "https://api.openai.com/v1")
    max_history_turns = int(_optional_env("LLM_MAX_HISTORY_TURNS", "6") or "6")

    enabled = bool(provider and api_key)

    return {
        "provider": provider,
        "api_key": api_key,
        "model": model,
        "timeout_ms": timeout_ms,
        "base_url": base_url.rstrip("/"),
        "max_history_turns": max_history_turns,
        "enabled": enabled,
    }
