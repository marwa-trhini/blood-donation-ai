"""Natural response generation for recipient assistance."""

from __future__ import annotations

import re

from app.models.recipient_schemas import RecipientConversationState, RecipientIntent
from app.services.blood_compatibility import (
    explain_can_recipient_receive_from_donor,
    explain_who_can_donate_to,
    normalize_blood_type,
)
from app.services.recipient_intent_service import parse_compatibility_pair


class RecipientResponseService:
    def generate(
        self,
        *,
        intent: RecipientIntent,
        message: str,
        state: RecipientConversationState,
        blood_types: list[str],
        units_mentioned: int | None,
    ) -> str:
        normalized = message.lower().strip()
        handler = {
            RecipientIntent.GREETING: self._greeting,
            RecipientIntent.CREATE_BLOOD_REQUEST: self._create_blood_request,
            RecipientIntent.BLOOD_COMPATIBILITY: self._blood_compatibility,
            RecipientIntent.FIND_DONOR: self._find_donor,
            RecipientIntent.REQUEST_STATUS: self._request_status,
            RecipientIntent.REQUEST_INFORMATION: self._request_information,
            RecipientIntent.GENERAL_BLOOD_INFORMATION: self._general_information,
            RecipientIntent.CLARIFICATION: self._clarification,
            RecipientIntent.MEDICAL_OUT_OF_SCOPE: self._medical_out_of_scope,
            RecipientIntent.UNKNOWN: self._unknown,
        }.get(intent, self._unknown)
        return handler(
            state=state,
            normalized=normalized,
            blood_types=blood_types,
            units_mentioned=units_mentioned,
        )

    def _greeting(self, **_) -> str:
        return (
            "Hello! I can help with blood requests, blood type compatibility, finding "
            "matching donors through BloodConnect, and general blood donation information. "
            "What would you like to know?"
        )

    def _create_blood_request(
        self,
        *,
        state: RecipientConversationState,
        blood_types: list[str],
        units_mentioned: int | None,
        **_,
    ) -> str:
        parts = []
        if blood_types:
            parts.append(
                f"If you need {blood_types[0]} blood through BloodConnect, you can create "
                f"a blood request and select {blood_types[0]} as the required blood type."
            )
        else:
            parts.append(
                "If you need blood through BloodConnect, you can create a blood request "
                "from the app."
            )

        parts.append(
            "When creating a request, the app asks for: blood type needed, units needed "
            "(at least 1), urgency (emergency, urgent, or normal), hospital details "
            "(name and city, with optional address), and location (city and country, with "
            "optional address or map coordinates). You may also add an optional required date, "
            "medical notes, or title."
        )

        if units_mentioned:
            parts.append(
                f"You mentioned {units_mentioned} unit(s). Please confirm the amount with your "
                "hospital or treating team before submitting the request."
            )
        else:
            parts.append(
                "For the number of units, follow the amount specified by your hospital or "
                "treating medical team."
            )

        parts.append(
            "After you submit the request, BloodConnect can help identify matching donors "
            "based on blood type compatibility and donor availability."
        )
        return " ".join(parts)

    def _blood_compatibility(
        self,
        *,
        state: RecipientConversationState,
        normalized: str,
        blood_types: list[str],
        **_,
    ) -> str:
        recipient_type, donor_type = parse_compatibility_pair(normalized, blood_types)

        if state.blood_type_needed and not recipient_type:
            recipient_type = state.blood_type_needed

        if recipient_type and donor_type:
            answer = explain_can_recipient_receive_from_donor(recipient_type, donor_type)
        elif recipient_type:
            if re.search(r"\bwho can (?:donate|give)\b", normalized):
                answer = explain_who_can_donate_to(recipient_type)
            else:
                answer = explain_who_can_donate_to(recipient_type)
        else:
            return (
                "I can explain blood type compatibility if you tell me the blood types involved. "
                "For example: 'Can O negative receive O positive?' or 'Who can donate to A positive?'"
            )

        if not answer.valid:
            return answer.explanation

        return f"{answer.explanation} {answer.disclaimer}"

    def _find_donor(self, *, state: RecipientConversationState, **_) -> str:
        prefix = ""
        if state.blood_type_needed:
            prefix = (
                f"For a {state.blood_type_needed} blood request, BloodConnect looks for donors "
                "whose blood type is compatible with that need. "
            )
        return (
            f"{prefix}"
            "After you create and submit a blood request in the app, you can open that request "
            "and view matching donors identified by BloodConnect. Matching considers blood type "
            "compatibility, donor eligibility, and availability in the system. If you do not see "
            "donors yet, the request may still be new, there may be no compatible available "
            "donors nearby, or donors may not have updated their availability."
        )

    def _request_status(self, **_) -> str:
        return (
            "You can review your submitted blood requests in the app under your recipient "
            "requests. Each request shows its status, such as open, fulfilled, or cancelled. "
            "Open requests remain visible to compatible donors in BloodConnect."
        )

    def _request_information(
        self,
        *,
        normalized: str,
        units_mentioned: int | None,
        **_,
    ) -> str:
        if re.search(r"\bhow many units\b", normalized):
            return (
                "BloodConnect requires at least 1 unit when creating a request, but the medically "
                "appropriate number of units must come from your hospital or treating medical team. "
                "I cannot recommend a medical amount. Enter the units instructed by your care team "
                "when you create the request."
            )

        return (
            "To create a blood request in BloodConnect you typically need: blood type needed "
            "(A+, A-, B+, B-, AB+, AB-, O+, O-), units needed, urgency (emergency, urgent, or "
            "normal), hospital name and city, and location city and country. Optional fields "
            "include hospital address, location address or map coordinates, required date, "
            "medical notes, and a title."
        )

    def _general_information(
        self,
        *,
        normalized: str,
        blood_types: list[str],
        **_,
    ) -> str:
        if blood_types and re.search(r"\brare\b", normalized):
            blood_type = blood_types[0]
            return (
                f"Blood type {blood_type} is relatively less common in many populations compared "
                f"with some other types, which can make matching harder at times. Availability "
                f"varies by region and donor pool. {explain_who_can_donate_to(blood_type).disclaimer}"
            )

        if re.search(r"\buniversal donor\b", normalized):
            return (
                "O negative is often called the universal red blood cell donor type because "
                "its red blood cells can generally be given to recipients of any ABO/Rh type "
                "in emergency settings. This is educational information only; real transfusion "
                "decisions require medical and blood-bank verification."
            )

        if re.search(r"\buniversal recipient\b", normalized):
            return (
                "AB positive is often described as a universal recipient for red blood cells "
                "because people with AB+ can generally receive from all ABO/Rh donor types. "
                "This is educational information only; actual compatibility must be confirmed "
                "clinically."
            )

        return (
            "Blood donation helps maintain supplies for surgeries, emergencies, and patients "
            "who need transfusions. Blood type compatibility matters because matching reduces "
            "transfusion reactions. In BloodConnect, recipients create requests and compatible "
            "donors can be matched through the app."
        )

    def _clarification(self, **_) -> str:
        return (
            "I can help explain how to create a blood request, blood type compatibility, "
            "finding matching donors, request information, and general blood donation topics. "
            "Tell me what you'd like to understand."
        )

    def _medical_out_of_scope(self, **_) -> str:
        return (
            "I can't provide medical diagnosis, treatment advice, or recommend how many blood "
            "units you medically need. Please follow guidance from your hospital or treating "
            "medical team. I can help with BloodConnect request steps and general educational "
            "blood type information."
        )

    def _unknown(self, **_) -> str:
        return (
            "I can help with creating a blood request, blood type compatibility, finding "
            "matching donors, request details, and general blood information in BloodConnect. "
            "Could you tell me a bit more about what you need?"
        )

