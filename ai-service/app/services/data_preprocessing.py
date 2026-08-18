"""
Donor eligibility dataset preprocessing pipeline.

Prepares tabular features for future ML training without fitting a production model.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

TARGET_COLUMN = "eligibility_status"
TARGET_VALUES = ["eligible", "not_eligible", "needs_review"]

IDENTIFIER_COLUMNS = ["record_id"]

NUMERIC_FEATURES = ["age", "weight_kg"]
OPTIONAL_NUMERIC_FEATURES = ["days_since_last_donation", "hemoglobin_value"]

BOOLEAN_FEATURES = [
    "recent_illness",
    "fever",
    "current_medication",
    "antibiotics",
    "recent_surgery",
    "recent_dental_procedure",
    "recent_tattoo_or_piercing",
    "chronic_condition_reported",
    "recent_blood_transfusion",
    "hemoglobin_known",
]

CATEGORICAL_FEATURES = ["pregnancy_status"]
PREGNANCY_STATUS_VALUES = ["not_applicable", "no", "yes", "unknown"]

ML_FEATURE_COLUMNS = (
    NUMERIC_FEATURES + OPTIONAL_NUMERIC_FEATURES + BOOLEAN_FEATURES + CATEGORICAL_FEATURES
)

DEFAULT_DATASET_PATH = (
    Path(__file__).resolve().parents[2] / "data" / "donor_eligibility.csv"
)


@dataclass
class PreparedDataset:
    features: pd.DataFrame
    target: pd.Series
    feature_columns: list[str]
    target_column: str = TARGET_COLUMN


@dataclass
class TrainTestSplitResult:
    x_train: pd.DataFrame
    x_test: pd.DataFrame
    y_train: pd.Series
    y_test: pd.Series
    random_state: int
    test_size: float


class DonorEligibilityPreprocessor:
    """
    Reproducible preprocessing for donor eligibility tabular data.

    Supports validation, feature preparation, and train/test splitting.
    Model training is performed by scripts/train_models.py using the sklearn Pipeline
    returned by `build_preprocessing_pipeline()`.
    """

    def __init__(self, dataset_path: str | Path | None = None) -> None:
        self.dataset_path = Path(dataset_path) if dataset_path else DEFAULT_DATASET_PATH

    def load_dataset(self) -> pd.DataFrame:
        if not self.dataset_path.exists():
            raise FileNotFoundError(f"Dataset not found: {self.dataset_path}")

        return pd.read_csv(self.dataset_path)

    def prepare_dataset(self, dataframe: pd.DataFrame | None = None) -> PreparedDataset:
        df = dataframe.copy() if dataframe is not None else self.load_dataset()
        self._validate_required_columns(df)

        features = df[ML_FEATURE_COLUMNS].copy()
        target = df[TARGET_COLUMN].copy()

        features = self._normalize_feature_types(features)

        return PreparedDataset(
            features=features,
            target=target,
            feature_columns=ML_FEATURE_COLUMNS,
        )

    def split_train_test(
        self,
        prepared: PreparedDataset,
        test_size: float = 0.2,
        random_state: int = 42,
    ) -> TrainTestSplitResult:
        if not 0.0 < test_size < 1.0:
            raise ValueError("test_size must be between 0 and 1.")

        x_train, x_test, y_train, y_test = train_test_split(
            prepared.features,
            prepared.target,
            test_size=test_size,
            random_state=random_state,
            stratify=prepared.target,
        )

        return TrainTestSplitResult(
            x_train=x_train.reset_index(drop=True),
            x_test=x_test.reset_index(drop=True),
            y_train=y_train.reset_index(drop=True),
            y_test=y_test.reset_index(drop=True),
            random_state=random_state,
            test_size=test_size,
        )

    def build_preprocessing_pipeline(self) -> ColumnTransformer:
        """
        Build a sklearn preprocessing pipeline for future model training.

        Not fitted in Step 2 — training occurs in Step 3.
        """
        numeric_pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="median")),
            ]
        )

        boolean_pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="most_frequent")),
            ]
        )

        categorical_pipeline = Pipeline(
            steps=[
                ("imputer", SimpleImputer(strategy="most_frequent")),
                (
                    "encoder",
                    OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                ),
            ]
        )

        return ColumnTransformer(
            transformers=[
                ("numeric", numeric_pipeline, NUMERIC_FEATURES + OPTIONAL_NUMERIC_FEATURES),
                ("boolean", boolean_pipeline, BOOLEAN_FEATURES),
                ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
            ],
            remainder="drop",
        )

    def _validate_required_columns(self, df: pd.DataFrame) -> None:
        required = ML_FEATURE_COLUMNS + [TARGET_COLUMN]
        missing = [column for column in required if column not in df.columns]
        if missing:
            raise ValueError(f"Missing required columns: {', '.join(missing)}")

        invalid_targets = set(df[TARGET_COLUMN].dropna()) - set(TARGET_VALUES)
        if invalid_targets:
            raise ValueError(
                f"Invalid eligibility_status values: {', '.join(sorted(invalid_targets))}"
            )

    def _normalize_feature_types(self, features: pd.DataFrame) -> pd.DataFrame:
        normalized = features.copy()

        for column in NUMERIC_FEATURES + OPTIONAL_NUMERIC_FEATURES:
            normalized[column] = pd.to_numeric(normalized[column], errors="coerce")

        for column in BOOLEAN_FEATURES:
            normalized[column] = normalized[column].astype("boolean")

        normalized["pregnancy_status"] = normalized["pregnancy_status"].astype("string")

        return normalized


def get_feature_metadata() -> dict[str, Any]:
    """Return feature grouping metadata for documentation and training scripts."""
    return {
        "target_column": TARGET_COLUMN,
        "target_values": TARGET_VALUES,
        "identifier_columns": IDENTIFIER_COLUMNS,
        "ml_feature_columns": ML_FEATURE_COLUMNS,
        "numeric_features": NUMERIC_FEATURES,
        "optional_numeric_features": OPTIONAL_NUMERIC_FEATURES,
        "boolean_features": BOOLEAN_FEATURES,
        "categorical_features": CATEGORICAL_FEATURES,
    }
