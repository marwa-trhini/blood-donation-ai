"""General medical-safety question detection for recipient conversations."""

from __future__ import annotations

import re

from app.recipient.conversation_signals import EXPLICIT_QUESTION_PATTERN, normalize_for_analysis

# Quantity / transfusion decision language (not exact-phrase specific).
_MEDICAL_QUANTITY_CONTEXT = re.compile(
    r"\b(?:"
    r"units?(?:\s+of\s+blood)?|bags?(?:\s+of\s+blood)?|blood|transfusion|amount"
    r")\b",
    re.IGNORECASE,
)

_MEDICAL_SAFETY_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        # How many / how much + request/receive/need
        r"\bhow many\b.{0,35}\b(?:should|must|need to|do we|does|can|could|would)\b.{0,35}\b(?:request|receive|need|get|ask(?: for)?)\b",
        r"\bhow many should\b.{0,20}\b(?:request|receive|need|get|ask(?: for)?)\b",
        r"\bhow much\b.{0,25}\b(?:blood|units?|bags?)\b.{0,35}\b(?:should|need|require|does|do|can)\b",
        r"\bhow much should\b.{0,20}\b(?:request|receive|need|get|ask(?: for)?)\b",
        r"\bhow much blood\b.{0,30}\b(?:should|does|do|can|could|would|need)\b",
        r"\bwhat amount\b.{0,25}\b(?:should|must|can|could)\b.{0,25}\b(?:request|ask|order|need)\b",
        r"\bhow many bags?\b.{0,30}\b(?:needed|required|should|must|are needed)\b",
        r"\bhow many units?\b.{0,30}\b(?:needed|required|are needed)\b",
        r"\b(?:appropriate|correct|right)\b.{0,20}\b(?:number|amount)\b.{0,20}\b(?:units?|blood|transfusion|bags?)\b",
        r"\btransfusion amount\b",
        # Clinical team has not specified amount
        r"\b(?:doctor|physician|medical team|hospital team|treating team)\b.{0,40}\b(?:hasn['']t|has not|had not|didn['']t|did not)\b.{0,25}\btold\b",
        r"\b(?:hasn['']t|has not|had not|didn['']t|did not)\b.{0,25}\btold\b.{0,35}\b(?:how many|how much|units?|blood)\b",
        # Sufficiency judgments
        r"\b(?:is|are)\s+\d+\s+(?:units?|bags?)\s+(?:enough|sufficient|adequate|okay|ok)\b",
        r"\b(?:is|are)\s+(?:one|two|three|four|five|\d+)\s+(?:units?|bags?)\s+enough\b",
        r"\b(?:enough|sufficient|adequate)\b.{0,15}\b(?:units?|bags?|blood)\b",
    )
)

def is_medical_safety_question(message: str) -> bool:
    """
    Return True when the user is asking for medical transfusion quantity guidance.

    Uses reusable patterns — not exact-string matching.
    """
    if not message or not message.strip():
        return False

    normalized = normalize_for_analysis(message)

    # Pure statements supplying units for a request are not safety questions.
    if re.search(
        r"^(?:we need|i need|she needs|he needs|they need|requesting|need)\s+\d+\s+(?:units?|bags?)\b",
        normalized,
    ):
        return False

    for pattern in _MEDICAL_SAFETY_PATTERNS:
        if pattern.search(normalized):
            if EXPLICIT_QUESTION_PATTERN.search(normalized) or EXPLICIT_QUESTION_PATTERN.search(message):
                return True
            if re.search(
                r"\b(?:doctor|physician|medical team|treating team|hospital team)\b",
                normalized,
            ):
                return True
            if re.search(r"\b(?:enough|sufficient|adequate)\b", normalized):
                return True
            if _MEDICAL_QUANTITY_CONTEXT.search(normalized) and re.search(
                r"\b(?:should|must|need to|how many|how much|what amount)\b", normalized
            ):
                return True

    return False
