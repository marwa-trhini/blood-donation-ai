"""Centralized conversational signal detection for recipient messages."""

from __future__ import annotations

import re

# Conversational lead-ins stripped before question/intent analysis.
LEAD_IN_PATTERN = re.compile(
    r"^(?:"
    r"(?:actually|oh|well|so|wait|sorry|ok|okay|hmm|um|uh|right|listen|anyway|btw|"
    r"by the way|one more thing|quick question|just wondering)"
    r"[\s,:-]*)+",
    re.IGNORECASE,
)

EXPLICIT_QUESTION_PATTERN = re.compile(
    r"(?:"
    r"^\s*(?:how|what|why|when|where|can|could|is|are|do|does|did|who|which|should|would|tell)\b"
    r"|\?\s*$"
    r")",
    re.IGNORECASE,
)

CONTINUE_PATTERN = re.compile(
    r"\b(?:continue|go on|carry on|keep going|resume|proceed|let(?:'s|\s+us)\s+continue)\b",
    re.IGNORECASE,
)

COMPATIBILITY_SIGNAL_PATTERN = re.compile(
    r"\b(?:"
    r"(?:can|could)\s+.+\s+(?:donate\s+to|receive\s+from|get\s+from|take\s+from|give\s+(?:blood\s+)?to)"
    r"|(?:compatible|compatibility)"
    r"|who\s+can\s+(?:donate|give)\s+(?:to|for)"
    r"|is\s+.+\s+compatible\s+with"
    r"|what\s+blood\s+types?\s+can\s+(?:donate|give)\s+to"
    r")\b",
    re.IGNORECASE,
)

GENERAL_INFO_SIGNAL_PATTERN = re.compile(
    r"\b(?:"
    r"why\s+is\s+.+\s+(?:rare|common|uncommon|important|special)"
    r"|why\s+(?:is|are)\s+(?:blood|blood type|blood donation|this blood type|this blood group)"
    r"|what\s+(?:is|does)\s+(?:special|different)\s+about"
    r"|what\s+does\s+(?:blood type|this blood type|this blood group)"
    r"|what\s+blood\s+types?\s+are\s+compatible"
    r"|how\s+common\s+is\s+(?:this\s+)?(?:blood type|blood group)"
    r"|tell\s+me\s+about\s+(?:this\s+)?(?:blood type|blood group|blood type)"
    r"|universal\s+(?:donor|recipient)"
    r"|why\s+donate\s+blood"
    r"|importance\s+of\s+blood"
    r")\b",
    re.IGNORECASE,
)

FIND_DONOR_SIGNAL_PATTERN = re.compile(
    r"\b(?:"
    r"find\s+(?:a\s+)?(?:matching\s+)?donors?"
    r"|matching\s+donor"
    r"|contact\s+donor"
    r"|see\s+donors?"
    r"|any\s+donors?"
    r"|donor\s+match"
    r"|how(?:\s+do|\s+can|\s+to)?\s*(?:i|we)\s+(?:find|know|locate|get|see|contact)\s+(?:a\s+)?(?:matching\s+)?donors?"
    r"|where\s+can\s+(?:i|we)\s+find\s+(?:a\s+)?(?:matching\s+)?donors?"
    r"|can\s+(?:you|bloodconnect)\s+help\s+(?:me|us)\s+find\s+donors?"
    r"|who\s+can\s+donate\s+to\s+(?:me|him|her|them|someone|the patient|my\s+\w+|the\s+patient)"
    r"|which\s+donors?\s+(?:are\s+)?(?:compatible|can donate|match)"
    r"|how\s+do\s+i\s+know\s+which\s+donors?"
    r"|how\s+do\s+i\s+find\s+someone\s+compatible"
    r"|can\s+bloodconnect\s+find\s+donors?"
    r"|need\s+to\s+find\s+(?:a\s+)?donor"
    r"|what\s+donors?\s+can\s+(?:give|donate)"
    r")\b",
    re.IGNORECASE,
)

REQUEST_INFORMATION_SIGNAL_PATTERN = re.compile(
    r"\b(?:"
    r"what information|what details|what do i need|information (?:do i|to)|"
    r"how many units|units should i|required fields|what is required|what should i request"
    r")\b",
    re.IGNORECASE,
)

REQUEST_STATUS_SIGNAL_PATTERN = re.compile(
    r"\b(?:my request|request status|status of my request|track request|"
    r"submitted request|open request)\b",
    re.IGNORECASE,
)

# Side-question intents resolved in priority order (matches product priority).
SIDE_QUESTION_INTENTS: tuple[str, ...] = (
    "medical_out_of_scope",
    "blood_compatibility",
    "find_donor",
    "request_status",
    "request_information",
    "general_blood_information",
)


def normalize_for_analysis(message: str) -> str:
    """Strip conversational lead-ins; lowercase and trim."""
    text = message.strip()
    while True:
        stripped = LEAD_IN_PATTERN.sub("", text, count=1).strip()
        if stripped == text:
            break
        text = stripped
    return text.lower().strip()


def looks_like_question(message: str, normalized: str | None = None, *, strong_signal: bool = False) -> bool:
    """
    Return True when the message should be treated as a question.

    Strong side-question signals (compatibility, general info, etc.) do not require
    a question mark or leading question word.
    """
    if strong_signal:
        return True
    norm = normalized if normalized is not None else normalize_for_analysis(message)
    if "?" in message:
        return True
    if EXPLICIT_QUESTION_PATTERN.search(norm):
        return True
    if EXPLICIT_QUESTION_PATTERN.search(message):
        return True
    return False


def has_compatibility_signal(normalized: str, *, blood_types: list[str] | None = None) -> bool:
    if COMPATIBILITY_SIGNAL_PATTERN.search(normalized):
        return True
    if blood_types and re.search(
        r"\b(?:receive|compatible|donate to|donate for|give to|give blood to)\b",
        normalized,
    ):
        return True
    return False


def has_general_info_signal(normalized: str) -> bool:
    return bool(GENERAL_INFO_SIGNAL_PATTERN.search(normalized))


def has_find_donor_signal(normalized: str) -> bool:
    return bool(FIND_DONOR_SIGNAL_PATTERN.search(normalized))


def _is_find_donor_over_compatibility(normalized: str, blood_types: list[str]) -> bool:
    """Route pronoun-based donor questions without blood types to find_donor."""
    if blood_types:
        return False
    if not re.search(r"\b(?:him|her|them|someone|patient|my\s+\w+)\b", normalized):
        return False
    return bool(
        FIND_DONOR_SIGNAL_PATTERN.search(normalized)
        or re.search(r"\bwho\s+can\s+donate\s+to\b", normalized)
    )


def classify_side_question(
    message: str,
    *,
    blood_types: list[str] | None = None,
    is_medical_safety: bool = False,
    is_request_information: bool = False,
) -> str | None:
    """
    Classify a side question intent from message content.

    Returns an intent key matching ``_DIRECT_INTENT_MAP`` in intent_resolution,
    or None when the message is not a recognizable side question.
    """
    if is_medical_safety:
        return "medical_out_of_scope"

    normalized = normalize_for_analysis(message)
    types = blood_types or []

    if has_compatibility_signal(normalized, blood_types=types):
        if _is_find_donor_over_compatibility(normalized, types):
            if looks_like_question(message, normalized, strong_signal=True):
                return "find_donor"
        elif looks_like_question(message, normalized, strong_signal=True):
            return "blood_compatibility"

    if has_find_donor_signal(normalized) and looks_like_question(
        message, normalized, strong_signal=True
    ):
        return "find_donor"

    if REQUEST_STATUS_SIGNAL_PATTERN.search(normalized) and looks_like_question(message, normalized):
        return "request_status"

    if is_request_information and looks_like_question(message, normalized):
        return "request_information"

    if has_general_info_signal(normalized) and looks_like_question(
        message, normalized, strong_signal=True
    ):
        return "general_blood_information"

    return None


def has_recognizable_context(
    *,
    blood_types: list[str] | None = None,
    compatibility_signal: bool = False,
    find_donor_signal: bool = False,
    general_info_signal: bool = False,
    is_medical_safety: bool = False,
    is_correction: bool = False,
    is_pending_field_answer: bool = False,
    is_continue_request: bool = False,
    request_signal: bool = False,
) -> bool:
    """True when the message carries enough signal to avoid generic help."""
    if any(
        (
            is_medical_safety,
            compatibility_signal,
            find_donor_signal,
            general_info_signal,
            is_correction,
            is_pending_field_answer,
            is_continue_request,
            request_signal,
        )
    ):
        return True
    return bool(blood_types)
