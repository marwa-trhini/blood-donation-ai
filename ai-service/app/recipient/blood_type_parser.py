"""Reusable natural-language blood type extraction and normalization."""

from __future__ import annotations

import re

from app.services.blood_compatibility import normalize_blood_type

# Core ABO/Rh token with optional positive/negative words or symbols.
_BLOOD_TYPE_TOKEN = (
    r"(?:"
    r"AB|A|B|O"
    r")"
    r"\s*"
    r"(?:"
    r"[-−+]|positive|negative|pos|neg"
    r")?"
)

# Phrases that introduce a blood type in natural speech.
_INTRO_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        rf"(?:blood\s+type|type\s+of\s+blood)(?:\s+is|\s+of|\s+needed)?\s*(?:is\s+)?({_BLOOD_TYPE_TOKEN})",
        rf"(?:need|needs|needed|require|requires|looking\s+for|we\s+need|she\s+needs|he\s+needs|"
        rf"my\s+(?:mother|mom|father|dad|parent|child|patient)(?:'s)?\s+needs?)\s+"
        rf"(?:for\s+)?(?:some\s+)?(?:units?\s+of\s+)?(?:blood\s+type\s+)?({_BLOOD_TYPE_TOKEN})",
        rf"(?:it(?:'s|\s+is)|that(?:'s|\s+is)|this\s+is)\s+({_BLOOD_TYPE_TOKEN})",
        rf"(?:^|\b)({_BLOOD_TYPE_TOKEN})(?:\s+blood)?(?:\s*$|[,.!?])",
    )
)

_STANDALONE_PATTERN = re.compile(
    rf"\b({_BLOOD_TYPE_TOKEN})\b",
    re.IGNORECASE,
)


def _token_to_phrase(token: str) -> str:
    return re.sub(r"\s+", " ", token.strip())


def _normalize_token(token: str) -> str | None:
    phrase = _token_to_phrase(token)
    # Expand shorthand like "O neg" -> "O negative"
    phrase = re.sub(r"\bpos\b", "positive", phrase, flags=re.IGNORECASE)
    phrase = re.sub(r"\bneg\b", "negative", phrase, flags=re.IGNORECASE)
    phrase = phrase.replace("−", "-")
    return normalize_blood_type(phrase) or normalize_blood_type(phrase.replace(" ", ""))


def extract_blood_types(message: str) -> list[str]:
    """Extract all blood types mentioned in natural language."""
    if not message or not message.strip():
        return []

    found: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        normalized = _normalize_token(raw)
        if normalized and normalized not in seen:
            seen.add(normalized)
            found.append(normalized)

    for pattern in _INTRO_PATTERNS:
        for match in pattern.finditer(message):
            add(match.group(1))

    for match in _STANDALONE_PATTERN.finditer(message):
        add(match.group(1))

    return found


def extract_primary_blood_type(message: str) -> str | None:
    types = extract_blood_types(message)
    return types[0] if types else None


def parse_standalone_blood_type_answer(message: str) -> str | None:
    """Parse short replies such as 'O negative.' when answering a blood-type question."""
    stripped = message.strip().rstrip(".!?")
    if not stripped:
        return None

    # Full message as blood type phrase (common for pending-field answers).
    direct = _normalize_token(stripped)
    if direct:
        return direct

    return extract_primary_blood_type(message)
