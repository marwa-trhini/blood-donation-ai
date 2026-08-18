"""Unit tests for general medical-safety question detection."""

from __future__ import annotations

import pytest

from app.recipient.medical_safety import is_medical_safety_question

MEDICAL_QUESTIONS = [
    "How many units should we request?",
    "How many units should she receive?",
    "How much blood does he need?",
    "How much should we request?",
    "Is 2 units enough?",
    "What amount should we ask for?",
    "How many bags are needed?",
    "How much blood should the patient receive?",
    "The doctor hasn't told us how many units we need. How many should we request?",
    "What transfusion amount is appropriate?",
]

NOT_MEDICAL = [
    "We need 2 units",
    "2 units",
    "Make that 3 units",
    "I need blood urgently",
]


@pytest.mark.parametrize("message", MEDICAL_QUESTIONS)
def test_detects_medical_safety_questions(message: str) -> None:
    assert is_medical_safety_question(message) is True


@pytest.mark.parametrize("message", NOT_MEDICAL)
def test_does_not_flag_request_statements(message: str) -> None:
    assert is_medical_safety_question(message) is False
