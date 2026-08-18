"""
Donor eligibility ML prediction service.

Loads the persisted sklearn pipeline and exposes a simple predict() API
for future FastAPI integration. Deterministic screening rules remain separate.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from app.services.data_preprocessing import (
    ML_FEATURE_COLUMNS,
    TARGET_VALUES,
    DonorEligibilityPreprocessor,
)

DEFAULT_ARTIFACT_PATH = (
    Path(__file__).resolve().parents[2] / "artifacts" / "donor_eligibility_model.joblib"
)


class EligibilityModelService:
    """
    Preliminary eligibility classifier — decision support only.

    Accepts raw feature dictionaries matching ML_FEATURE_COLUMNS.
    Does NOT replace deterministic safety rules or clinical screening.
    """

    def __init__(self, artifact_path: str | Path | None = None) -> None:
        self.artifact_path = Path(artifact_path) if artifact_path else DEFAULT_ARTIFACT_PATH
        self._artifact: dict[str, Any] | None = None
        self._preprocessor = DonorEligibilityPreprocessor()

    @property
    def is_loaded(self) -> bool:
        return self._artifact is not None

    def load(self) -> "EligibilityModelService":
        if not self.artifact_path.exists():
            raise FileNotFoundError(
                f"Model artifact not found: {self.artifact_path}. "
                "Run scripts/train_models.py first."
            )
        self._artifact = joblib.load(self.artifact_path)
        return self

    @property
    def pipeline(self):
        if self._artifact is None:
            self.load()
        return self._artifact["pipeline"]

    @property
    def model_name(self) -> str:
        if self._artifact is None:
            self.load()
        return str(self._artifact.get("model_name", "unknown"))

    def _prepare_input(self, features: dict[str, Any]) -> pd.DataFrame:
        row = {column: features.get(column) for column in ML_FEATURE_COLUMNS}
        frame = pd.DataFrame([row])
        return self._preprocessor._normalize_feature_types(frame)

    def predict(self, features: dict[str, Any]) -> dict[str, Any]:
        """
        Predict eligibility from a raw feature dictionary.

        Returns status, confidence, and per-class probabilities.
        """
        model = self.pipeline
        input_df = self._prepare_input(features)

        probabilities = model.predict_proba(input_df)[0]
        classes = model.named_steps["classifier"].classes_
        prob_map = {str(cls): float(prob) for cls, prob in zip(classes, probabilities)}

        predicted_idx = int(np.argmax(probabilities))
        predicted_class = str(classes[predicted_idx])

        ordered_probs = {label: prob_map.get(label, 0.0) for label in TARGET_VALUES}

        return {
            "status": predicted_class,
            "confidence": float(probabilities[predicted_idx]),
            "probabilities": ordered_probs,
            "model_name": self.model_name,
        }


def predict(features: dict[str, Any], artifact_path: str | Path | None = None) -> dict[str, Any]:
    """Module-level convenience wrapper."""
    return EligibilityModelService(artifact_path=artifact_path).predict(features)
