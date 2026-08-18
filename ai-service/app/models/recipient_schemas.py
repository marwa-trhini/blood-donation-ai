"""Schemas for recipient assistance conversations."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class RecipientIntent(str, Enum):
    GREETING = "greeting"
    CREATE_BLOOD_REQUEST = "create_blood_request"
    UPDATE_BLOOD_REQUEST = "update_blood_request"
    BLOOD_COMPATIBILITY = "blood_compatibility"
    FIND_DONOR = "find_donor"
    REQUEST_STATUS = "request_status"
    REQUEST_INFORMATION = "request_information"
    GENERAL_BLOOD_INFORMATION = "general_blood_information"
    CLARIFICATION = "clarification"
    MEDICAL_OUT_OF_SCOPE = "medical_out_of_scope"
    UNKNOWN = "unknown"


class RecipientConversationStatus(str, Enum):
    ASSISTING = "assisting"
    NEEDS_CLARIFICATION = "needs_clarification"
    COMPLETED = "completed"


class RecipientHistoryEntry(BaseModel):
    role: str
    message: str
    intent: Optional[str] = None


class RecipientConversationState(BaseModel):
    """Lightweight session state for recipient assistance."""

    session_id: str
    user_role: str = "recipient"
    intent: Optional[str] = None
    active_flow: Optional[str] = None
    pending_field: Optional[str] = None
    conversation_history: list[RecipientHistoryEntry] = Field(default_factory=list)
    status: RecipientConversationStatus = RecipientConversationStatus.ASSISTING

    # Optional context extracted from natural messages (BloodRequest-aligned fields).
    blood_type_needed: Optional[str] = None
    units_needed: Optional[int] = None
    urgency: Optional[str] = None
    hospital_name: Optional[str] = None
    hospital_city: Optional[str] = None
    hospital_address_line: Optional[str] = None
    location_city: Optional[str] = None
    location_country: Optional[str] = None
    location_address_line: Optional[str] = None
    medical_notes: Optional[str] = None
    title: Optional[str] = None
    required_date: Optional[str] = None
    pending_clarification: Optional[str] = None


class RecipientOrchestrationResponse(BaseModel):
    success: bool = True
    session_id: str
    message: str
    intent: Optional[str] = None
    status: RecipientConversationStatus = RecipientConversationStatus.ASSISTING
    collected_information: dict[str, Any] = Field(default_factory=dict)
    missing_information: list[str] = Field(default_factory=list)
    entities: dict[str, Any] = Field(default_factory=dict)
