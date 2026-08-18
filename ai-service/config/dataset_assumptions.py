"""
Central BloodConnect donor screening assumptions for synthetic dataset generation.

IMPORTANT:
All values in this module are PROJECT / SYNTHETIC ASSUMPTIONS.
They are NOT clinical guidelines and must be validated against applicable
blood-service policy before any real-world deployment.
"""

from __future__ import annotations

# Reproducibility
RANDOM_STATE = 42
DEFAULT_ROW_COUNT = 200_000
RECORD_ID_PREFIX = "SYN"

# ---------------------------------------------------------------------------
# Age — configured prototype donor range (PROJECT ASSUMPTION)
# ---------------------------------------------------------------------------
MIN_AGE = 18
MAX_AGE = 65

# ---------------------------------------------------------------------------
# Weight — configured prototype minimum (PROJECT ASSUMPTION)
# ---------------------------------------------------------------------------
MIN_WEIGHT_KG = 50.0

# Optional review band above minimum weight (PROJECT ASSUMPTION)
WEIGHT_REVIEW_UPPER_KG = 55.0

# ---------------------------------------------------------------------------
# Donation interval — configured prototype minimum days (PROJECT ASSUMPTION)
# ---------------------------------------------------------------------------
MIN_DAYS_BETWEEN_DONATIONS = 56

# ---------------------------------------------------------------------------
# Hemoglobin review band for synthetic labeling (PROJECT ASSUMPTION)
# ---------------------------------------------------------------------------
HEMOGLOBIN_REVIEW_LOW = 12.0
HEMOGLOBIN_REVIEW_HIGH = 18.0

# ---------------------------------------------------------------------------
# Categorical values
# ---------------------------------------------------------------------------
PREGNANCY_STATUSES = ["not_applicable", "no", "yes", "unknown"]

TARGET_CLASSES = ["eligible", "not_eligible", "needs_review"]
