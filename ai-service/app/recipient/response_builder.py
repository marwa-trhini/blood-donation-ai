"""Contextual natural responses for recipient assistance."""

from __future__ import annotations

import re

from app.models.recipient_schemas import RecipientConversationState, RecipientIntent
from app.recipient.entity_extraction import ExtractedEntities
from app.recipient.field_specs import (
    ACTIVE_FLOW_BLOOD_REQUEST,
    FIELD_QUESTIONS,
    REQUIRED_FIELD_SPECS,
)
from app.recipient.conversation_signals import classify_side_question, has_recognizable_context
from app.recipient.medical_safety import is_medical_safety_question
from app.recipient.message_analysis import MessageAnalysis
from app.services.blood_compatibility import explain_can_recipient_receive_from_donor, explain_who_can_donate_to
from app.services.recipient_intent_service import parse_compatibility_pair


class RecipientResponseBuilder:
    GENERIC_HELP = (
        "I can help with blood requests, blood type compatibility, finding matching "
        "donors through BloodConnect, and general blood donation information. "
        "What would you like to know?"
    )

    SIDE_QUESTION_SUFFIX = (
        " If you'd like, we can continue your blood request afterward."
    )

    def build(
        self,
        *,
        intent: RecipientIntent,
        message: str,
        state: RecipientConversationState,
        entities: ExtractedEntities,
        changed_fields: dict[str, object],
        analysis: MessageAnalysis | None = None,
    ) -> tuple[str, str | None]:
        normalized = message.lower().strip()
        analysis = analysis or MessageAnalysis()

        if intent == RecipientIntent.GREETING:
            return self._greeting(), None

        if intent == RecipientIntent.MEDICAL_OUT_OF_SCOPE:
            return self._medical_out_of_scope(normalized, analysis), None

        if intent == RecipientIntent.BLOOD_COMPATIBILITY:
            return self._with_side_suffix(
                self._blood_compatibility(normalized, entities, state),
                state,
                analysis,
            ), None

        if intent == RecipientIntent.FIND_DONOR:
            return self._with_side_suffix(self._find_donor(state, normalized), state, analysis), None

        if intent == RecipientIntent.REQUEST_STATUS:
            return self._with_side_suffix(self._request_status(), state, analysis), None

        if intent == RecipientIntent.REQUEST_INFORMATION:
            return self._with_side_suffix(self._request_information(normalized), state, analysis), None

        if intent == RecipientIntent.GENERAL_BLOOD_INFORMATION:
            return self._with_side_suffix(
                self._general_information(normalized, entities, state),
                state,
                analysis,
            ), None

        if intent in {RecipientIntent.CREATE_BLOOD_REQUEST, RecipientIntent.UPDATE_BLOOD_REQUEST}:
            if analysis.is_continue_request and not changed_fields:
                return self._resume_request_flow(state)
            return self._request_flow_response(state, changed_fields)

        return self._unknown(state, message, entities, analysis), None

    @staticmethod
    def _with_side_suffix(
        answer: str,
        state: RecipientConversationState,
        analysis: MessageAnalysis,
    ) -> str:
        if (
            state.active_flow == ACTIVE_FLOW_BLOOD_REQUEST
            and analysis.is_direct_question
            and RecipientResponseBuilder.SIDE_QUESTION_SUFFIX.strip() not in answer
        ):
            return answer + RecipientResponseBuilder.SIDE_QUESTION_SUFFIX
        return answer

    def _greeting(self) -> str:
        return (
            "Hello! I can help with blood requests, compatibility questions, finding "
            "matching donors, and general blood information. What would you like help with?"
        )

    def _medical_out_of_scope(self, normalized: str, analysis: MessageAnalysis) -> str:
        if analysis.is_medical_safety_question or re.search(
            r"\b(?:how many|how much|what amount|units?|bags?|enough)\b", normalized
        ):
            return (
                "I can't recommend how many blood units someone medically needs. That decision "
                "must come from the treating doctor or hospital medical team. When you create "
                "the BloodConnect request, enter the number of units confirmed by your care team."
            )
        return (
            "I can't provide medical diagnosis, treatment advice, or recommend how many blood "
            "units someone medically needs. Please follow guidance from the hospital or treating "
            "medical team. I can help with BloodConnect request steps and general educational "
            "blood type information."
        )

    def _blood_compatibility(
        self,
        normalized: str,
        entities: ExtractedEntities,
        state: RecipientConversationState,
    ) -> str:
        blood_types = list(entities.blood_types)
        if state.blood_type_needed and state.blood_type_needed not in blood_types:
            blood_types.insert(0, state.blood_type_needed)

        recipient_type, donor_type = self._parse_compatibility_roles(normalized, blood_types)

        if recipient_type and donor_type:
            answer = explain_can_recipient_receive_from_donor(recipient_type, donor_type)
        elif recipient_type:
            answer = explain_who_can_donate_to(recipient_type)
        else:
            return (
                "I can explain blood type compatibility if you tell me the blood types involved. "
                "For example: 'Can O negative receive O positive?' or 'Who can donate to A positive?'"
            )

        if not answer.valid:
            return answer.explanation
        return f"{answer.explanation} {answer.disclaimer}"

    @staticmethod
    def _parse_compatibility_roles(
        normalized: str,
        blood_types: list[str],
    ) -> tuple[str | None, str | None]:
        donate_to = re.search(
            r"\b(?:can|could)\s+([a-z0-9+\-\s]+?)\s+donate\s+to\s+(?:someone who needs\s+)?([a-z0-9+\-\s]+?)(?:\?|$)",
            normalized,
        )
        if donate_to:
            from app.services.blood_compatibility import normalize_blood_type

            donor = normalize_blood_type(donate_to.group(1))
            recipient = normalize_blood_type(donate_to.group(2))
            if donor and recipient:
                return recipient, donor

        if len(blood_types) >= 2:
            recipient_match = re.search(
                r"\b(?:(?:can|could)\s+)?([a-z0-9+\-\s]+?)\s+(?:receive|get|take)\s+(?:from\s+)?([a-z0-9+\-\s]+?)(?:\?|$)",
                normalized,
            )
            if recipient_match:
                from app.services.blood_compatibility import normalize_blood_type

                left = normalize_blood_type(recipient_match.group(1))
                right = normalize_blood_type(recipient_match.group(2))
                if left and right:
                    return left, right
            return blood_types[0], blood_types[1]

        if len(blood_types) == 1:
            recipient_type, donor_type = parse_compatibility_pair(normalized, blood_types)
            return recipient_type, donor_type

        return None, None

    def _find_donor(self, state: RecipientConversationState, normalized: str) -> str:
        prefix = ""
        if state.blood_type_needed:
            prefix = (
                f"For a {state.blood_type_needed} blood request, BloodConnect identifies donors "
                "whose blood type is compatible with that need. "
            )
        if re.search(r"\bwho can donate\b|\bwhich donors\b|\bhow do i know\b", normalized):
            return (
                f"{prefix}"
                "After you submit a blood request in BloodConnect, open that request to see "
                "matching donors. Matching is based on blood type compatibility, donor "
                "eligibility, and availability in the system — the app does not guarantee "
                "that a donor is immediately available."
            )
        return (
            f"{prefix}"
            "After you create and submit a blood request in the app, open that request to view "
            "matching donors identified by BloodConnect. Matching considers blood type "
            "compatibility, donor eligibility, and availability."
        )

    def _request_status(self) -> str:
        return (
            "You can review your submitted blood requests in the app under your recipient "
            "requests. Each request shows its status, such as open, fulfilled, or cancelled."
        )

    def _request_information(self, normalized: str) -> str:
        if re.search(r"\bhow many units\b", normalized):
            return (
                "BloodConnect requires at least 1 unit when creating a request, but the medically "
                "appropriate number must come from your hospital or treating medical team. "
                "Enter the amount instructed by your care team when you create the request."
            )
        return (
            "To create a blood request in BloodConnect you typically need: blood type needed, "
            "units needed, urgency (emergency, urgent, or normal), hospital name and city, and "
            "location city and country. Optional fields include hospital address, location address "
            "or map coordinates, required date, medical notes, and a title."
        )

    def _general_information(
        self,
        normalized: str,
        entities: ExtractedEntities,
        state: RecipientConversationState,
    ) -> str:
        blood_type = None
        if entities.blood_types:
            blood_type = entities.blood_types[0]
        elif state.blood_type_needed:
            blood_type = state.blood_type_needed

        if blood_type and re.search(r"\b(?:rare|uncommon)\b", normalized):
            return (
                f"Blood type {blood_type} is relatively less common in many populations, which "
                f"can make matching harder at times. Availability varies by region and donor pool. "
                f"{explain_who_can_donate_to(blood_type).disclaimer}"
            )
        if blood_type and re.search(r"\b(?:common|how common)\b", normalized):
            return (
                f"Blood type {blood_type} is relatively more common in many populations, which "
                f"often makes matching easier than with rarer types. Availability still varies by "
                f"region and donor pool. {explain_who_can_donate_to(blood_type).disclaimer}"
            )
        if blood_type and re.search(r"\b(?:special|different|mean)\b", normalized):
            return (
                f"Blood type {blood_type} describes the ABO and Rh markers on red blood cells. "
                f"It helps determine which donor types are generally compatible for transfusion. "
                f"{explain_who_can_donate_to(blood_type).disclaimer}"
            )
        if re.search(r"\buniversal donor\b", normalized):
            return (
                "O negative is often called the universal red blood cell donor type because its "
                "red blood cells can generally be given to recipients of any ABO/Rh type in "
                "emergency settings. This is educational information only."
            )
        if re.search(r"\buniversal recipient\b", normalized):
            return (
                "AB positive is often described as a universal recipient for red blood cells "
                "because people with AB+ can generally receive from all ABO/Rh donor types. "
                "This is educational information only."
            )
        return (
            "Blood donation helps maintain supplies for surgeries, emergencies, and patients "
            "who need transfusions. Blood type compatibility matters because matching reduces "
            "transfusion reactions."
        )

    def _resume_request_flow(
        self,
        state: RecipientConversationState,
    ) -> tuple[str, str | None]:
        next_field = self._next_missing_required_field(state)
        if next_field:
            state.pending_field = next_field
            return f"Sure. {FIELD_QUESTIONS[next_field]}", next_field

        summary = self._request_summary(state)
        return (
            f"{summary} You can enter these details in the BloodConnect app when creating "
            "your blood request.",
            None,
        )

    def _request_flow_response(
        self,
        state: RecipientConversationState,
        changed_fields: dict[str, object],
    ) -> tuple[str, str | None]:
        state.active_flow = ACTIVE_FLOW_BLOOD_REQUEST
        parts: list[str] = []

        if "blood_type_needed" in changed_fields:
            parts.append(f"Got it - {changed_fields['blood_type_needed']}.")
        if "units_needed" in changed_fields:
            units = changed_fields["units_needed"]
            label = "unit" if units == 1 else "units"
            parts.append(f"Got it - {units} {label}.")
        if "urgency" in changed_fields:
            parts.append(f"Understood - {changed_fields['urgency']} priority.")
        if "hospital_name" in changed_fields:
            parts.append(f"Noted - {changed_fields['hospital_name']}.")
        if "hospital_city" in changed_fields:
            parts.append(f"Hospital city: {changed_fields['hospital_city']}.")
        if "location_city" in changed_fields and "hospital_city" not in changed_fields:
            parts.append(f"Location city: {changed_fields['location_city']}.")
        if "location_country" in changed_fields:
            parts.append(f"Country: {changed_fields['location_country']}.")
        if "required_date" in changed_fields:
            parts.append(f"Required date noted: {changed_fields['required_date']}.")

        next_field = self._next_missing_required_field(state)
        if next_field:
            question = FIELD_QUESTIONS[next_field]
            if not parts:
                if next_field == "blood_type_needed":
                    parts.append("Of course.")
                elif state.pending_field == next_field:
                    parts.append("Thanks.")
            parts.append(question)
            state.pending_field = next_field
            return " ".join(parts), next_field

        state.pending_field = None
        if changed_fields:
            summary = self._request_summary(state)
            parts.append(
                f"{summary} You can enter these details in the BloodConnect app when creating "
                "your blood request. For units, confirm the amount with your hospital or treating "
                "team before submitting."
            )
        return " ".join(part for part in parts if part), None

    def _next_missing_required_field(self, state: RecipientConversationState) -> str | None:
        for spec in REQUIRED_FIELD_SPECS:
            if getattr(state, spec.key, None) in (None, ""):
                return spec.key
        return None

    def _request_summary(self, state: RecipientConversationState) -> str:
        bits = []
        if state.blood_type_needed:
            bits.append(f"blood type {state.blood_type_needed}")
        if state.units_needed is not None:
            bits.append(f"{state.units_needed} unit(s)")
        if state.urgency:
            bits.append(f"{state.urgency} priority")
        if state.hospital_name:
            bits.append(f"hospital {state.hospital_name}")
        if state.hospital_city:
            bits.append(f"hospital city {state.hospital_city}")
        if state.location_city:
            bits.append(f"location city {state.location_city}")
        if state.location_country:
            bits.append(f"country {state.location_country}")
        if not bits:
            return "When you're ready, we can gather the request details."
        return "So far I have: " + ", ".join(bits) + "."

    def _unknown(
        self,
        state: RecipientConversationState,
        message: str,
        entities: ExtractedEntities,
        analysis: MessageAnalysis,
    ) -> str:
        if state.active_flow == ACTIVE_FLOW_BLOOD_REQUEST and state.pending_field:
            return FIELD_QUESTIONS[state.pending_field]
        if state.active_flow == ACTIVE_FLOW_BLOOD_REQUEST:
            next_field = self._next_missing_required_field(state)
            if next_field:
                return FIELD_QUESTIONS[next_field]

        # Last-resort contextual rescue before generic help.
        if not has_recognizable_context(
            blood_types=entities.blood_types,
            compatibility_signal=entities.compatibility_signal,
            find_donor_signal=entities.find_donor_signal,
            general_info_signal=entities.general_info_signal,
            is_medical_safety=analysis.is_medical_safety_question
            or is_medical_safety_question(message),
            is_correction=entities.is_correction,
            is_pending_field_answer=analysis.is_pending_field_answer,
            is_continue_request=analysis.is_continue_request,
            request_signal=entities.request_signal,
        ):
            return self.GENERIC_HELP

        side_intent = classify_side_question(
            message,
            blood_types=entities.blood_types,
            is_medical_safety=analysis.is_medical_safety_question
            or is_medical_safety_question(message),
            is_request_information=entities.request_information_signal,
        )
        if side_intent == "medical_out_of_scope":
            return self._medical_out_of_scope(message.lower(), analysis)
        if side_intent == "blood_compatibility":
            return self._blood_compatibility(message.lower(), entities, state)
        if side_intent == "find_donor":
            return self._find_donor(state, message.lower())
        if side_intent == "general_blood_information":
            return self._general_information(message.lower(), entities, state)
        if side_intent == "request_information":
            return self._request_information(message.lower())
        if entities.blood_types and entities.compatibility_signal:
            return self._blood_compatibility(message.lower(), entities, state)
        if entities.blood_types and entities.general_info_signal:
            return self._general_information(message.lower(), entities, state)

        return self.GENERIC_HELP
