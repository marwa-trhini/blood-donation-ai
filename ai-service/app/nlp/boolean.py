"""Contextual boolean answer parsing for pending screening questions."""

from __future__ import annotations

import re

AFFIRMATIVE_SHORT_ANSWERS = {
    "yes",
    "yeah",
    "yep",
    "y",
    "correct",
    "that's right",
    "thats right",
    "i do",
    "i have",
    "definitely",
}

NEGATIVE_SHORT_ANSWERS = {
    "no",
    "nope",
    "nah",
    "n",
    "not really",
    "never",
    "not currently",
    "no i don't",
    "no, i don't",
    "no i do not",
    "no i haven't",
    "no, i haven't",
    "no i have not",
}

NEGATION_PREFIX_PATTERN = re.compile(
    r"^(no|nope|nah|never|not really|not currently|"
    r"i don't|i do not|i havent|i haven't|i have not|"
    r"i'm not|i am not|i've never|i have never)\b"
)

AFFIRMATION_PREFIX_PATTERN = re.compile(
    r"^(?:yes|yeah|yep|y|i do|i have|i am|i'm)\b"
)

# Matches affirmation after conversational lead-ins like "actually yes".
EMBEDDED_AFFIRMATION_PATTERN = re.compile(
    r"\b(?:actually|oh|well|sorry)\s*,?\s*(yes|yeah|yep)\b"
)


def parse_boolean_answer(normalized: str) -> bool | None:
    """Interpret yes/no answers relative to the pending screening field."""
    from app.nlp.medication import strip_conversational_leadin

    stripped = strip_conversational_leadin(normalized.strip().rstrip("."))
    if not stripped:
        return None

    if stripped in AFFIRMATIVE_SHORT_ANSWERS:
        return True
    if stripped in NEGATIVE_SHORT_ANSWERS:
        return False

    if stripped in {
        "i don't",
        "i do not",
        "i haven't",
        "i have not",
        "i'm not",
        "i am not",
    }:
        return False

    if re.fullmatch(r"yes(?:,|\s)?(?:i do|i have)?\.?", stripped):
        return True
    if re.fullmatch(
        r"no(?:,|\s)?(?:i don't|i do not|i havent|i haven't|i have not)?\.?",
        stripped,
    ):
        return False

    if AFFIRMATION_PREFIX_PATTERN.match(stripped):
        return True
    if EMBEDDED_AFFIRMATION_PATTERN.search(stripped):
        return True
    if NEGATION_PREFIX_PATTERN.match(stripped):
        return False

    return None


parse_pending_boolean_answer = parse_boolean_answer
