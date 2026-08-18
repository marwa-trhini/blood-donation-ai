from app.models.schemas import ChatRequest, ChatResponse
from app.services.conversation_service import ConversationService, get_conversation_service
from app.services.recipient_conversation_service import (
    RecipientConversationService,
    get_recipient_conversation_service,
)


class AIService:
    """
    Core AI orchestration layer.

    Routes donor requests to the existing eligibility screening flow and
    recipient requests to the lightweight recipient assistance flow.
    """

    def __init__(
        self,
        conversation_service: ConversationService | None = None,
        recipient_conversation_service: RecipientConversationService | None = None,
    ) -> None:
        self._conversation_service = conversation_service or get_conversation_service()
        self._recipient_conversation_service = (
            recipient_conversation_service or get_recipient_conversation_service()
        )

    def process_message(self, request: ChatRequest) -> ChatResponse:
        role = self._resolve_role(request)
        if role == "recipient":
            return self._process_recipient_message(request)
        return self._process_donor_message(request)

    def _resolve_role(self, request: ChatRequest) -> str:
        if request.role in {"donor", "recipient"}:
            return request.role
        return "donor"

    def _process_donor_message(self, request: ChatRequest) -> ChatResponse:
        result = self._conversation_service.handle_message(
            message=request.message,
            session_id=request.session_id,
        )
        return ChatResponse(
            success=result.success,
            message=result.message,
            session_id=result.session_id,
            status=result.status.value,
            intent=result.intent,
            role="donor",
            entities=result.entities,
            collected_information=result.collected_information,
            missing_information=result.missing_information,
            next_question=result.next_question,
            eligibility=result.eligibility,
        )

    def _process_recipient_message(self, request: ChatRequest) -> ChatResponse:
        result = self._recipient_conversation_service.handle_message(
            message=request.message,
            session_id=request.session_id,
        )
        return ChatResponse(
            success=result.success,
            message=result.message,
            session_id=result.session_id,
            status=result.status.value,
            intent=result.intent,
            role="recipient",
            entities=result.entities,
            collected_information=result.collected_information,
            missing_information=result.missing_information,
            next_question=None,
            eligibility=None,
        )


_ai_service: AIService | None = None


def get_ai_service() -> AIService:
    """Return a shared AIService instance."""
    global _ai_service
    if _ai_service is None:
        _ai_service = AIService()
    return _ai_service
