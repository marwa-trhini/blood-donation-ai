"""
User-facing response generation for the eligibility assistant.

Converts structured orchestration results into natural, safety-conscious messages.
Does NOT make eligibility decisions — formatting only.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.ai_config import (
    ASSISTANT_NAME,
    FINAL_AUTHORITY_DISCLAIMER,
    LOW_CONFIDENCE_THRESHOLD,
    OUT_OF_SCOPE_MESSAGE,
    SESSION_COMPLETE_MESSAGE,
)
from config.conversation_config import CLARIFICATION_RESPONSES, SCREENING_QUESTIONS
from app.models.conversation_schemas import ConversationStatus

FIELD_FRIENDLY_NAMES: dict[str, str] = {
    "age": "age",
    "weight_kg": "weight",
    "days_since_last_donation": "donation history",
    "recent_illness": "recent illness",
    "fever": "fever",
    "current_medication": "medication",
    "antibiotics": "antibiotics",
    "recent_surgery": "recent surgery",
    "recent_dental_procedure": "dental procedure",
    "recent_tattoo_or_piercing": "tattoo or piercing",
    "pregnancy_status": "pregnancy status",
    "chronic_condition_reported": "chronic condition",
    "recent_blood_transfusion": "blood transfusion",
    "hemoglobin_known": "hemoglobin information",
    "hemoglobin_value": "hemoglobin level",
}

CONFLICT_PROMPTS: dict[str, str] = {
    "age": "Could you confirm your current age?",
    "weight_kg": "Could you confirm your current weight in kilograms?",
    "days_since_last_donation": "Could you confirm when you last donated blood?",
    "recent_illness": "Could you confirm whether you have been sick recently?",
    "fever": "Could you confirm whether you currently have a fever?",
    "current_medication": "Could you confirm whether you are taking any medication?",
    "antibiotics": "Could you confirm whether you are taking antibiotics?",
    "recent_surgery": "Could you confirm whether you have had surgery recently?",
    "recent_dental_procedure": (
        "Could you confirm whether you have had a dental procedure recently?"
    ),
    "recent_tattoo_or_piercing": (
        "Could you confirm whether you have had a tattoo or piercing recently?"
    ),
    "pregnancy_status": "Could you confirm your pregnancy status for screening purposes?",
    "chronic_condition_reported": (
        "Could you confirm whether you have a relevant chronic condition?"
    ),
    "recent_blood_transfusion": (
        "Could you confirm whether you have had a recent blood transfusion?"
    ),
    "hemoglobin_known": "Could you confirm whether you know your recent hemoglobin level?",
    "hemoglobin_value": "Could you confirm your hemoglobin level?",
}


@dataclass
class ResponseContext:
    """Structured input for response generation — no decisions, only formatting context."""

    intent: str
    status: ConversationStatus
    collected_information: dict[str, Any] = field(default_factory=dict)
    missing_information: list[str] = field(default_factory=list)
    next_field: str | None = None
    next_question: str | None = None
    eligibility: dict[str, Any] | None = None
    conflicts: list[dict[str, Any]] = field(default_factory=list)
    latest_entities: dict[str, Any] = field(default_factory=dict)
    pending_question_field: str | None = None
    clarification_topic: str | None = None
    session_complete: bool = False
    low_confidence: bool = False


class ResponseService:
    """Generates natural, safety-conscious user-facing assistant messages."""

    def generate(self, context: ResponseContext) -> str:
        if context.session_complete:
            return SESSION_COMPLETE_MESSAGE

        if context.conflicts:
            return self.generate_conflict(context.conflicts[-1], context)

        if context.intent == "greeting":
            return self.generate_greeting(context)

        if context.intent == "ask_requirements":
            return self.generate_requirements(context)

        if context.intent == "ask_clarification":
            return self.generate_clarification(context)

        if context.status == ConversationStatus.COMPLETED and context.eligibility:
            return self.generate_assessment(context)

        if context.intent == "unknown":
            return self.generate_out_of_scope()

        return self.generate_collecting(context)

    def generate_greeting(self, context: ResponseContext) -> str:
        intro = (
            f"Hi! I'm {ASSISTANT_NAME}. I can ask you a few questions and give you "
            "a preliminary assessment. You can answer naturally in your own words."
        )
        if context.next_question:
            return f"{intro} {context.next_question}"
        return intro

    def generate_requirements(self, context: ResponseContext) -> str:
        explanation = (
            "I'll ask about your age, weight, previous donation, recent health, "
            "medications, recent procedures, and a few other factors relevant to a "
            "preliminary assessment."
        )
        if context.next_question:
            return f"{explanation} {context.next_question}"
        return explanation

    def generate_clarification(self, context: ResponseContext) -> str:
        topic = context.clarification_topic or context.pending_question_field or "recent_illness"
        natural = self._natural_clarification(topic)
        if context.next_question:
            return f"{natural} {context.next_question}"
        return natural

    def generate_collecting(self, context: ResponseContext) -> str:
        parts: list[str] = []

        if context.latest_entities:
            ack = self._acknowledge_entities(context.latest_entities)
            if ack:
                parts.append(ack)

        if context.missing_information:
            if not parts:
                parts.append(
                    "Thanks. I still need a little more information before I can give "
                    "you a preliminary assessment."
                )
            if context.next_question:
                parts.append(context.next_question)
        elif context.next_question:
            parts.append(context.next_question)

        if not parts:
            return "Thank you. Could you tell me a bit more about your screening information?"

        return " ".join(parts)

    def generate_assessment(self, context: ResponseContext) -> str:
        eligibility = context.eligibility or {}
        status = eligibility.get("status", "unknown")
        reasons = self.humanize_reasons(eligibility.get("reasons", []))
        source = eligibility.get("source", "")
        confidence = float(eligibility.get("confidence", 0.0))

        if context.low_confidence or (
            source == "ml_model" and confidence < LOW_CONFIDENCE_THRESHOLD
        ):
            return self.generate_low_confidence()

        if source == "deterministic_rules":
            return self._generate_deterministic_deferral(status, reasons)

        if status == "eligible":
            return self.generate_eligible(reasons)
        if status == "not_eligible":
            return self.generate_not_eligible(reasons)
        if status == "needs_review":
            return self.generate_needs_review(reasons)

        return (
            "Based on the information you provided, I could not determine a clear "
            f"preliminary assessment. {FINAL_AUTHORITY_DISCLAIMER}"
        )

    def generate_eligible(self, reasons: list[str]) -> str:
        intro = (
            "Based on the information you provided, your preliminary assessment is "
            "that you may be eligible to donate blood."
        )
        reason_text = self._format_reason_block(
            reasons,
            fallback="No current deferral factors were identified from your answers.",
        )
        return f"{intro} {reason_text} {FINAL_AUTHORITY_DISCLAIMER}"

    def generate_not_eligible(self, reasons: list[str]) -> str:
        intro = (
            "Based on the information you provided, the preliminary assessment is "
            "that you should not donate at this time."
        )
        reason_text = self._format_reason_block(reasons, prefix="Reason")
        policy_note = (
            "Donation requirements can vary by blood service, so please confirm "
            "the appropriate guidance with your local donation center."
        )
        return f"{intro} {reason_text} {policy_note}"

    def generate_needs_review(self, reasons: list[str]) -> str:
        intro = (
            "Based on the information provided, I can't confidently determine your "
            "eligibility."
        )
        reason_text = self._format_reason_block(
            reasons,
            fallback="Some of your answers require additional review.",
        )
        follow_up = (
            "Please speak with the blood donation center's screening staff before donating."
        )
        return f"{intro} {reason_text} {follow_up}"

    def generate_low_confidence(self) -> str:
        return (
            "I'm not confident enough to give a clear preliminary assessment from "
            "the information provided. Please provide more information or confirm "
            "with the donation center's screening staff."
        )

    def generate_conflict(self, conflict: dict[str, Any], context: ResponseContext) -> str:
        field = conflict.get("field", "that detail")
        friendly = FIELD_FRIENDLY_NAMES.get(field, field.replace("_", " "))
        prompt = CONFLICT_PROMPTS.get(field, f"Could you confirm your {friendly}?")
        previous = conflict.get("previous_value")
        new_value = conflict.get("new_value")
        notice = (
            f"I noticed that you gave two different answers about your {friendly} "
            f"({previous} and then {new_value})."
        )
        return f"{notice} {prompt}"

    def generate_out_of_scope(self) -> str:
        return OUT_OF_SCOPE_MESSAGE

    def humanize_reasons(self, reasons: list[str]) -> list[str]:
        readable: list[str] = []
        for reason in reasons:
            if not reason or not str(reason).strip():
                continue
            text = str(reason).strip()
            if text.startswith("Preliminary ML assessment"):
                continue
            if "Please confirm your eligibility" in text:
                continue
            readable.append(self._humanize_single_reason(text))
        return readable

    def _humanize_single_reason(self, reason: str) -> str:
        lowered = reason.lower()
        if "screening range" in lowered and ("under" in lowered or "over" in lowered):
            return "Your reported age is outside the configured screening range."
        if "fever" in lowered:
            return "You reported having a fever recently."
        if "minimum interval" in lowered or "too recent" in lowered:
            return (
                "Your reported last donation appears too recent according to the "
                "project's configured screening rule."
            )
        if "weight" in lowered and "minimum" in lowered:
            return "Your reported weight is below the configured prototype minimum."
        if reason.endswith("."):
            return reason
        return f"{reason}."

    def _acknowledge_entities(self, entities: dict[str, Any]) -> str:
        display_order = [
            "age",
            "weight_kg",
            "days_since_last_donation",
            "is_first_time_donor",
            "recent_illness",
            "fever",
            "current_medication",
            "antibiotics",
            "recent_surgery",
            "recent_dental_procedure",
            "recent_tattoo_or_piercing",
            "pregnancy_status",
            "chronic_condition_reported",
            "recent_blood_transfusion",
            "hemoglobin_value",
            "hemoglobin_known",
        ]
        phrases: list[str] = []
        seen: set[str] = set()

        for field in display_order:
            if field in seen:
                continue
            value = entities.get(field)
            if value is None:
                continue
            phrase = self._turn_acknowledgment_phrase(field, value, entities)
            if phrase:
                phrases.append(phrase)
                seen.add(field)
                if field == "hemoglobin_value":
                    seen.add("hemoglobin_known")

        if not phrases:
            return "Thanks for sharing that information."

        if len(phrases) == 1:
            return f"Thanks, I've noted {phrases[0]}."
        if len(phrases) == 2:
            return f"Thanks, I've noted {phrases[0]} and {phrases[1]}."
        joined = ", ".join(phrases[:-1]) + f", and {phrases[-1]}"
        return f"Thanks, I've noted {joined}."

    def _turn_acknowledgment_phrase(
        self,
        field: str,
        value: Any,
        entities: dict[str, Any],
    ) -> str | None:
        if field == "age":
            return "your age"
        if field == "weight_kg":
            return "your weight"
        if field == "days_since_last_donation":
            return "your donation history"
        if field == "is_first_time_donor" and value is True:
            return "that this would be your first donation"
        if field == "recent_illness":
            if value is False:
                return "that you haven't been sick recently"
            return "your recent illness"
        if field == "fever":
            if value is False:
                return "that you don't have a fever"
            return "that you have a fever"
        if field == "current_medication":
            if value is False:
                return "that you're not currently taking medication"
            return "that you're currently taking medication"
        if field == "antibiotics":
            if value is False:
                return "that you're not taking antibiotics"
            return "that you're taking antibiotics"
        if field == "recent_surgery":
            return (
                "that you've had recent surgery"
                if value is True
                else "that you haven't had recent surgery"
            )
        if field == "recent_dental_procedure":
            return (
                "your recent dental procedure"
                if value is True
                else "that you haven't had a recent dental procedure"
            )
        if field == "recent_tattoo_or_piercing":
            return (
                "your recent tattoo or piercing"
                if value is True
                else "that you haven't had a recent tattoo or piercing"
            )
        if field == "chronic_condition_reported":
            return (
                "your chronic condition"
                if value is True
                else "that you don't have a relevant chronic condition"
            )
        if field == "recent_blood_transfusion":
            return (
                "your recent blood transfusion"
                if value is True
                else "that you haven't had a recent blood transfusion"
            )
        if field == "pregnancy_status":
            return "your pregnancy status"
        if field == "hemoglobin_value":
            return "your hemoglobin level"
        if field == "hemoglobin_known":
            if value is False:
                return "that you don't know your hemoglobin level"
            if entities.get("hemoglobin_value") is None:
                return "that you know your hemoglobin level"
        return FIELD_FRIENDLY_NAMES.get(field)

    def _format_reason_block(
        self,
        reasons: list[str],
        *,
        prefix: str = "",
        fallback: str = "",
    ) -> str:
        if reasons:
            combined = " ".join(reasons)
            if prefix:
                return f"{prefix}: {combined}"
            return combined
        return fallback

    def _natural_clarification(self, topic: str) -> str:
        if topic == "recent_illness":
            return (
                "By recent illness, I mean whether you've recently been sick or had "
                "an infection or fever. For example, if you were recently unwell, "
                "you can tell me what happened."
            )
        return CLARIFICATION_RESPONSES.get(
            topic,
            "I can only provide general preliminary screening guidance. "
            "Please confirm details with the blood donation center or medical staff.",
        )

    def _generate_deterministic_deferral(self, status: str, reasons: list[str]) -> str:
        if status == "not_eligible":
            primary = reasons[0] if reasons else "a reported deferral factor"
            intro = (
                "Based on the information you provided, the preliminary screening "
                f"indicates that you should not donate at this time because {primary.rstrip('.')}."
            )
            guidance = (
                "Please follow the guidance of your blood donation center or "
                "healthcare professional."
            )
            return f"{intro} {guidance}"
        return self.generate_needs_review(reasons)


_response_service: ResponseService | None = None


def get_response_service() -> ResponseService:
    global _response_service
    if _response_service is None:
        _response_service = ResponseService()
    return _response_service
