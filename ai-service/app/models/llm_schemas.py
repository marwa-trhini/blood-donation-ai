"""Pydantic schemas for LLM extraction and response generation."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator

from app.models.nlp_schemas import NLPIntent
from app.services.data_preprocessing import ML_FEATURE_COLUMNS


class LLMExtractionResponse(BaseModel):
    """Strict JSON schema returned by the LLM extraction call."""

    intent: NLPIntent = Field(default=NLPIntent.PROVIDE_INFORMATION)
    topic: Optional[str] = None
    entities: dict[str, Any] = Field(default_factory=dict)
    is_first_time_donor: Optional[bool] = None
    needs_clarification: bool = False
    clarification_field: Optional[str] = None

    @field_validator("entities")
    @classmethod
    def filter_known_entities(cls, value: dict[str, Any]) -> dict[str, Any]:
        filtered: dict[str, Any] = {}
        for key, entity_value in value.items():
            if key not in ML_FEATURE_COLUMNS:
                continue
            if entity_value is None:
                continue
            filtered[key] = entity_value
        return filtered

    @field_validator("clarification_field")
    @classmethod
    def validate_clarification_field(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        if value not in ML_FEATURE_COLUMNS:
            return None
        return value


class LLMResponseRequest(BaseModel):
    """Structured input for LLM natural response generation."""

    intent: str
    status: str
    user_message: Optional[str] = None
    pending_question_field: Optional[str] = None
    next_field: Optional[str] = None
    next_question: Optional[str] = None
    collected_information: dict[str, Any] = Field(default_factory=dict)
    missing_information: list[str] = Field(default_factory=list)
    latest_entities: dict[str, Any] = Field(default_factory=dict)
    eligibility: Optional[dict[str, Any]] = None
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    clarification_topic: Optional[str] = None
    session_complete: bool = False
    low_confidence: bool = False
    recent_history: list[dict[str, str]] = Field(default_factory=list)
