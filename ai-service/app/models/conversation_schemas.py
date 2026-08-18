"""Conversation state schemas for multi-turn eligibility screening."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class ConversationStatus(str, Enum):
    """High-level conversation progress."""

    COLLECTING_INFORMATION = "collecting_information"
    NEEDS_CLARIFICATION = "needs_clarification"
    COMPLETED = "completed"


class ConversationHistoryEntry(BaseModel):
    """Single turn in the conversation log."""

    role: str = Field(..., description="'user' or 'assistant'.")
    message: str = Field(..., description="Message text.")
    intent: Optional[str] = Field(default=None, description="Detected intent for user turns.")
    entities: dict[str, Any] = Field(default_factory=dict)
    conflicts: list[dict[str, Any]] = Field(default_factory=list)


class ConversationState(BaseModel):
    """In-memory session state for eligibility screening."""

    session_id: str
    intent: Optional[str] = None
    collected_information: dict[str, Any] = Field(default_factory=dict)
    missing_information: list[str] = Field(default_factory=list)
    asked_questions: list[str] = Field(default_factory=list)
    completed: bool = False
    eligibility_result: Optional[dict[str, Any]] = None
    conversation_history: list[ConversationHistoryEntry] = Field(default_factory=list)
    pending_question_field: Optional[str] = Field(
        default=None,
        description="Field awaiting an answer; preserved during clarification.",
    )
    is_first_time_donor: Optional[bool] = None
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
    status: ConversationStatus = ConversationStatus.COLLECTING_INFORMATION
    supplemental_information: dict[str, str] = Field(
        default_factory=dict,
        description="Non-ML supplemental notes captured from natural answers.",
    )


class OrchestrationResponse(BaseModel):
    """Structured result returned by the conversation orchestrator."""

    success: bool = True
    session_id: str
    message: str
    intent: Optional[str] = None
    status: ConversationStatus = ConversationStatus.COLLECTING_INFORMATION
    collected_information: dict[str, Any] = Field(default_factory=dict)
    missing_information: list[str] = Field(default_factory=list)
    next_question: Optional[str] = None
    entities: dict[str, Any] = Field(default_factory=dict)
    eligibility: Optional[dict[str, Any]] = None
    conflicts: list[dict[str, Any]] = Field(default_factory=list)
