"""Hybrid NLP service: deterministic baseline with optional LLM enrichment."""



from __future__ import annotations



import logging

from typing import Any



from app.models.llm_schemas import LLMExtractionResponse

from app.models.nlp_schemas import ExtractedEntity, NLPIntent, NLPParseResult

from app.services.data_preprocessing import ML_FEATURE_COLUMNS

from app.services.llm.provider import get_llm_provider

from app.services.nlp_service import NLPService



logger = logging.getLogger(__name__)





class HybridNLPService:

    """Deterministic NLP always runs; LLM fills gaps when available."""



    def __init__(

        self,

        deterministic_service: NLPService | None = None,

        llm_provider=None,

    ) -> None:

        self._deterministic = deterministic_service or NLPService()

        self._llm = llm_provider if llm_provider is not None else get_llm_provider()



    def parse_message(

        self,

        message: str,

        pending_field: str | None = None,

        *,

        conversation_history: list[dict[str, str]] | None = None,

        collected_information: dict[str, Any] | None = None,

    ) -> NLPParseResult:

        history = conversation_history or []

        collected = collected_information or {}



        deterministic = self._deterministic.parse_message(

            message,

            pending_field=pending_field,

            collected_information=collected,

        )

        deterministic.extraction_source = "deterministic"



        if not self._llm.is_available():

            return deterministic



        try:

            llm_result = self._llm.extract_information(

                message=message,

                pending_field=pending_field,

                collected_information=collected,

                conversation_history=history,

            )

            return self._merge_extractions(deterministic, llm_result, message)

        except Exception as exc:

            logger.warning("LLM extraction failed, using deterministic only: %s", exc)

            return deterministic



    def _merge_extractions(

        self,

        deterministic: NLPParseResult,

        llm_result: LLMExtractionResponse,

        message: str,

    ) -> NLPParseResult:

        """Union merge: deterministic values win; LLM fills only null fields."""

        entities: dict[str, Any] = dict(deterministic.entities)

        details: dict[str, ExtractedEntity] = dict(deterministic.entity_details)



        for field, value in llm_result.entities.items():

            if value is None or field not in ML_FEATURE_COLUMNS:

                continue

            if entities.get(field) is not None:

                continue

            entities[field] = value

            details[field] = ExtractedEntity(

                value=value,

                confidence=0.88,

                source_text=message,

            )



        intent = deterministic.intent

        if intent == NLPIntent.UNKNOWN and llm_result.intent != NLPIntent.UNKNOWN:

            intent = llm_result.intent

        if deterministic.intent == NLPIntent.PROVIDE_INFORMATION:

            intent = NLPIntent.PROVIDE_INFORMATION

        elif llm_result.intent == NLPIntent.PROVIDE_INFORMATION and any(

            value is not None for value in entities.values()

        ):

            intent = NLPIntent.PROVIDE_INFORMATION



        is_first_time_donor = deterministic.is_first_time_donor

        if is_first_time_donor is None:

            is_first_time_donor = llm_result.is_first_time_donor

        if entities.get("days_since_last_donation") is not None:

            is_first_time_donor = False

        elif is_first_time_donor is True:

            entities["days_since_last_donation"] = None



        needs_clarification = llm_result.needs_clarification

        clarification_field = llm_result.clarification_field

        if clarification_field and not self._field_still_missing(

            entities, clarification_field, is_first_time_donor

        ):

            needs_clarification = False

            clarification_field = None



        missing = [field for field in ML_FEATURE_COLUMNS if entities.get(field) is None]

        confidences = [entity.confidence for entity in details.values()]

        overall_confidence = sum(confidences) / len(confidences) if confidences else 0.0

        if intent != NLPIntent.UNKNOWN:

            overall_confidence = max(overall_confidence, 0.5)



        llm_only_fields = [

            field

            for field, value in llm_result.entities.items()

            if value is not None and deterministic.entities.get(field) is None

        ]

        source = "hybrid" if llm_only_fields else "deterministic"



        return NLPParseResult(

            intent=intent,

            topic=deterministic.topic or llm_result.topic,

            entities=entities,

            entity_details=details,

            missing_information=missing,

            confidence=round(min(overall_confidence, 1.0), 4),

            is_first_time_donor=is_first_time_donor,

            raw_message=message,

            needs_clarification=needs_clarification,

            clarification_field=clarification_field,

            extraction_source=source,

        )



    @staticmethod

    def _field_still_missing(

        entities: dict[str, Any],

        field: str,

        is_first_time_donor: bool | None,

    ) -> bool:

        if field == "days_since_last_donation":

            if is_first_time_donor is True:

                return False

            return entities.get("days_since_last_donation") is None

        if field == "hemoglobin_known":

            known = entities.get("hemoglobin_known")

            if known is None:

                return True

            if known is True:

                return entities.get("hemoglobin_value") is None

            return False

        return entities.get(field) is None





_hybrid_nlp_service: HybridNLPService | None = None





def get_nlp_service() -> HybridNLPService:

    global _hybrid_nlp_service

    if _hybrid_nlp_service is None:

        _hybrid_nlp_service = HybridNLPService()

    return _hybrid_nlp_service

