"""NLP schemas for message parsing and entity extraction."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class NLPIntent(str, Enum):
    """Detected user message intent."""

    ELIGIBILITY_CHECK = "eligibility_check"
    PROVIDE_INFORMATION = "provide_information"
    ASK_REQUIREMENTS = "ask_requirements"
    ASK_CLARIFICATION = "ask_clarification"
    GREETING = "greeting"
    UNKNOWN = "unknown"


class ExtractedEntity(BaseModel):
    """Single extracted entity with optional debug metadata."""

    value: Any = Field(..., description="Extracted normalized value.")
    confidence: float = Field(..., ge=0.0, le=1.0)
    source_text: str = Field(..., description="Text span that supported the extraction.")


class NLPParseResult(BaseModel):
    """Structured output from the deterministic NLP parser."""

    intent: NLPIntent = Field(..., description="Detected message intent.")
    topic: Optional[str] = Field(
        default=None,
        description="Clarification topic when intent is ask_clarification.",
    )
    entities: dict[str, Any] = Field(
        default_factory=dict,
        description="Simple entity map aligned with ML feature schema.",
    )
    entity_details: dict[str, ExtractedEntity] = Field(
        default_factory=dict,
        description="Per-entity value/confidence/source for debugging.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Known fields not mentioned in the message.",
    )
    confidence: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Overall parse confidence.",
    )
    is_first_time_donor: Optional[bool] = Field(
        default=None,
        description="True when user explicitly states they have never donated.",
    )
    raw_message: str = Field(..., description="Original user message.")
    needs_clarification: bool = Field(
        default=False,
        description="True when the assistant should ask for clarification.",
    )
    clarification_field: Optional[str] = Field(
        default=None,
        description="Field requiring clarification when needs_clarification is true.",
    )
    extraction_source: Optional[str] = Field(
        default=None,
        description="Source of extraction: llm or deterministic.",
    )
    supplemental_information: dict[str, str] = Field(
        default_factory=dict,
        description="Extra context extracted from the message (e.g. medication names).",
    )
