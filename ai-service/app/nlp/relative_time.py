"""
Generic relative-time parser for natural language screening answers.

Handles composable patterns with direction tokens (ago/before/back), modifiers,
word numbers, fuzzy quantifiers, and calendar anchors — not phrase-specific patches.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

DAYS_PER_WEEK = 7
DAYS_PER_MONTH = 30
DAYS_PER_YEAR = 365
RECENCY_ADVERB_DAYS = 30

WORD_NUMBERS: dict[str, int] = {
    "zero": 0,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "eleven": 11,
    "twelve": 12,
    "thirteen": 13,
    "fourteen": 14,
    "fifteen": 15,
    "sixteen": 16,
    "seventeen": 17,
    "eighteen": 18,
    "nineteen": 19,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "sixty": 60,
    "seventy": 70,
}

FUZZY_TIME_QUANTIFIERS: dict[str, int] = {
    "few": 3,
    "couple": 2,
    "couple of": 2,
    "several": 4,
}

TIME_MODIFIER = r"(?:about|around|approximately|roughly|just)\s+"
TIME_UNIT = r"(?:days?|weeks?|months?|years?)"
TIME_DIRECTION = r"(?:ago|before|back)"
TIME_AMOUNT = r"(\d+|" + "|".join(WORD_NUMBERS.keys()) + r")"

DONATION_KEYWORD_PATTERN = re.compile(
    r"\b(?:donated|donation|gave blood|last donation|last donated)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class RelativeTimeResult:
    days: int
    confidence: float
    source_text: str


def mentions_donation(text: str) -> bool:
    return bool(DONATION_KEYWORD_PATTERN.search(text))


def _to_days(amount: int, unit: str) -> int:
    unit = unit.rstrip("s")
    if unit.startswith("day"):
        return amount
    if unit.startswith("week"):
        return amount * DAYS_PER_WEEK
    if unit.startswith("month"):
        return amount * DAYS_PER_MONTH
    if unit.startswith("year"):
        return amount * DAYS_PER_YEAR
    return amount


def _parse_number_token(token: str) -> int | None:
    token = token.strip().lower()
    if token.isdigit():
        return int(token)
    return WORD_NUMBERS.get(token)


def _span_original(original: str, start: int, end: int) -> str:
    return original[start:end].strip()


def _match_scoped_recency_adverb(
    normalized: str,
    *,
    require_donation_keyword: bool,
) -> re.Match[str] | None:
    for match in re.finditer(rf"\b(?:{TIME_MODIFIER})?recently\b", normalized):
        if not require_donation_keyword:
            return match
        window_start = max(0, match.start() - 48)
        window = normalized[window_start : match.end()]
        if mentions_donation(window):
            return match
    return None


def parse_relative_time(
    normalized: str,
    original: str,
    *,
    require_donation_keyword: bool = False,
) -> RelativeTimeResult | None:
    """Parse a relative-time expression into approximate days."""
    if require_donation_keyword and not mentions_donation(normalized):
        return None

    if re.search(r"\byesterday\b", normalized):
        match = re.search(r"\byesterday\b", normalized)
        assert match is not None
        return RelativeTimeResult(
            days=1,
            confidence=0.93,
            source_text=_span_original(original, match.start(), match.end()),
        )

    calendar_anchors = (
        (rf"\b(?:{TIME_MODIFIER})?last week\b", DAYS_PER_WEEK, 0.88),
        (rf"\b(?:{TIME_MODIFIER})?last month\b", DAYS_PER_MONTH, 0.88),
        (rf"\b(?:{TIME_MODIFIER})?last year\b", DAYS_PER_YEAR, 0.86),
    )
    for pattern, days, confidence in calendar_anchors:
        match = re.search(pattern, normalized)
        if match:
            return RelativeTimeResult(
                days=int(days),
                confidence=confidence,
                source_text=_span_original(original, match.start(), match.end()),
            )

    direction_suffix = rf"\s*{TIME_DIRECTION}\b"

    fuzzy_pattern = (
        rf"(?:(?:{TIME_MODIFIER}))?"
        r"(?:a|an)\s+"
        r"(few|couple(?:\s+of)?|several)\s+"
        rf"({TIME_UNIT}){direction_suffix}"
    )
    match = re.search(fuzzy_pattern, normalized)
    if match:
        fuzzy_key = match.group(1).replace("  ", " ")
        amount = FUZZY_TIME_QUANTIFIERS.get(fuzzy_key)
        if amount is not None:
            return RelativeTimeResult(
                days=_to_days(amount, match.group(2)),
                confidence=0.87,
                source_text=_span_original(original, match.start(), match.end()),
            )

    article_pattern = (
        rf"(?:(?:{TIME_MODIFIER}))?"
        r"(?:a|an)\s+"
        rf"({TIME_UNIT}){direction_suffix}"
    )
    match = re.search(article_pattern, normalized)
    if match:
        confidence = 0.9 if not require_donation_keyword else 0.88
        return RelativeTimeResult(
            days=_to_days(1, match.group(1)),
            confidence=confidence,
            source_text=_span_original(original, match.start(), match.end()),
        )

    amount_pattern = (
        rf"(?:(?:{TIME_MODIFIER}))?"
        rf"{TIME_AMOUNT}\s*({TIME_UNIT}){direction_suffix}"
    )
    match = re.search(amount_pattern, normalized)
    if match:
        amount = _parse_number_token(match.group(1))
        if amount is not None:
            confidence = 0.94 if not require_donation_keyword else 0.9
            return RelativeTimeResult(
                days=_to_days(amount, match.group(2)),
                confidence=confidence,
                source_text=_span_original(original, match.start(), match.end()),
            )

    recency_adverb = _match_scoped_recency_adverb(
        normalized, require_donation_keyword=require_donation_keyword
    )
    if recency_adverb is not None:
        return RelativeTimeResult(
            days=RECENCY_ADVERB_DAYS,
            confidence=0.84,
            source_text=_span_original(
                original, recency_adverb.start(), recency_adverb.end()
            ),
        )

    return None


def has_relative_time_phrase(
    normalized: str,
    original: str,
    *,
    require_donation_keyword: bool = False,
) -> bool:
    return (
        parse_relative_time(
            normalized,
            original,
            require_donation_keyword=require_donation_keyword,
        )
        is not None
    )
