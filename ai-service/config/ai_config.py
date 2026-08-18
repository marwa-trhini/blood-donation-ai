"""
Central AI service configuration for response generation and safety.

PROJECT / DEVELOPMENT settings — not clinical guidelines.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# ML confidence — below this threshold, do not present results as reliable
# ---------------------------------------------------------------------------
LOW_CONFIDENCE_THRESHOLD = 0.55

# ---------------------------------------------------------------------------
# Assistant identity (user-facing)
# ---------------------------------------------------------------------------
ASSISTANT_NAME = "BloodConnect's donor eligibility assistant"

# ---------------------------------------------------------------------------
# Standard safety disclaimers
# ---------------------------------------------------------------------------
FINAL_AUTHORITY_DISCLAIMER = (
    "Final eligibility is determined by the blood donation center's screening process. "
    "Please confirm with their screening staff before donating."
)

MEDICAL_DISCLAIMER = (
    "This is a preliminary assessment based on the information you provided — "
    "not a medical diagnosis or guaranteed clearance to donate."
)

OUT_OF_SCOPE_MESSAGE = (
    "I'm here to help with blood-donation eligibility and screening questions. "
    "What would you like to know about donating blood?"
)

SESSION_COMPLETE_MESSAGE = (
    "This screening session is already complete. "
    "Start a new session if you would like another preliminary assessment."
)
