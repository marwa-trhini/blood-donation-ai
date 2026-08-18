"""Response service facade — deterministic donor screening responses only."""

from __future__ import annotations

from app.services.response_service import ResponseContext, ResponseService


class HybridResponseService:
    """Deterministic natural-language responses for donor screening."""

    def __init__(self, deterministic_service: ResponseService | None = None) -> None:
        self._deterministic = deterministic_service or ResponseService()

    def generate(self, context: ResponseContext) -> str:
        return self._deterministic.generate(context)

    def humanize_reasons(self, reasons: list[str]) -> list[str]:
        return self._deterministic.humanize_reasons(reasons)


_hybrid_response_service: HybridResponseService | None = None


def get_response_service() -> HybridResponseService:
    global _hybrid_response_service
    if _hybrid_response_service is None:
        _hybrid_response_service = HybridResponseService()
    return _hybrid_response_service
