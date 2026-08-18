from fastapi import APIRouter, Depends

from app.models.schemas import ChatRequest, ChatResponse, HealthResponse, VersionResponse
from app.services.ai_service import AIService, get_ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Verify the AI service is running."""
    return HealthResponse(status="ok", service="BloodConnect AI")


@router.get("/version", response_model=VersionResponse)
def version_check() -> VersionResponse:
    """Development endpoint to verify the active AI service build."""
    return VersionResponse(
        service="BloodConnect AI",
        version="step-10.4-recipient-conversation-hardening",
        nlp_contextual_parsing=True,
        dual_role_support=True,
    )


@router.post("/chat", response_model=ChatResponse)
def chat(
    request: ChatRequest,
    ai_service: AIService = Depends(get_ai_service),
) -> ChatResponse:
    """Accept a user message and return a structured AI response."""
    return ai_service.process_message(request)
