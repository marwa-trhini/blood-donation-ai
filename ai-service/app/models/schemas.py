from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


class EligibilityStatus(str, Enum):
    """Donor eligibility assessment outcome."""

    ELIGIBLE = "eligible"
    NOT_ELIGIBLE = "not_eligible"
    NEEDS_REVIEW = "needs_review"
    UNKNOWN = "unknown"


class EligibilityResult(BaseModel):
    """Structured donor eligibility assessment."""

    status: EligibilityStatus = Field(
        ...,
        description="Overall eligibility determination.",
    )
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Model confidence score between 0 and 1.",
    )
    reasons: list[str] = Field(
        default_factory=list,
        description="Human-readable reasons supporting the assessment.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Information still required for a definitive assessment.",
    )


class ChatRequest(BaseModel):
    """Incoming chat message from the mobile app or API client."""

    message: str = Field(..., min_length=1, description="User message text.")
    session_id: Optional[str] = Field(
        default=None,
        description="Optional session identifier for multi-turn context.",
    )
    conversation_id: Optional[str] = Field(
        default=None,
        description="Legacy alias for session_id (backward compatible).",
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Optional authenticated user identifier.",
    )
    role: Optional[Literal["donor", "recipient"]] = Field(
        default=None,
        description="App user role. Defaults to donor when omitted for backward compatibility.",
    )

    @model_validator(mode="after")
    def resolve_session_id(self) -> "ChatRequest":
        if not self.session_id and self.conversation_id:
            self.session_id = self.conversation_id
        return self

    @field_validator("role")
    @classmethod
    def normalize_role(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip().lower()


class ChatResponse(BaseModel):
    """Structured AI response returned to clients."""

    success: bool = Field(..., description="Whether the request was processed successfully.")
    message: str = Field(..., description="Assistant reply or status message.")
    session_id: Optional[str] = Field(
        default=None,
        description="Session identifier for follow-up messages.",
    )
    status: Optional[str] = Field(
        default=None,
        description="Conversation status: collecting_information, needs_clarification, completed, assisting.",
    )
    intent: Optional[str] = Field(
        default=None,
        description="Detected user intent.",
    )
    role: Optional[str] = Field(
        default=None,
        description="Active conversation role for this session.",
    )
    entities: dict[str, Any] = Field(
        default_factory=dict,
        description="Entities extracted from the current message.",
    )
    collected_information: dict[str, Any] = Field(
        default_factory=dict,
        description="Merged information collected across the session.",
    )
    missing_information: list[str] = Field(
        default_factory=list,
        description="Fields still needed for the active flow.",
    )
    next_question: Optional[str] = Field(
        default=None,
        description="Next screening question when collecting information.",
    )
    eligibility: Optional[dict[str, Any]] = Field(
        default=None,
        description="Preliminary eligibility assessment when complete (donor flow only).",
    )


class HealthResponse(BaseModel):
    """Service health check payload."""

    status: str = Field(..., description="Health status indicator.")
    service: str = Field(..., description="Service name.")


class VersionResponse(BaseModel):
    """Development build/version marker for runtime verification."""

    service: str = Field(..., description="Service name.")
    version: str = Field(..., description="AI service build/version label.")
    nlp_contextual_parsing: bool = Field(
        ...,
        description="Whether contextual NLP parsing (Step 7.2+) is active.",
    )
    dual_role_support: bool = Field(
        default=True,
        description="Whether donor and recipient role routing is active.",
    )
