"""Dataset validation utilities for donor eligibility data."""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pandas as pd

from app.services.data_preprocessing import (
    BOOLEAN_FEATURES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    OPTIONAL_NUMERIC_FEATURES,
    PREGNANCY_STATUS_VALUES,
    TARGET_COLUMN,
    TARGET_VALUES,
)

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.dataset_assumptions import MAX_AGE, MIN_AGE, MIN_WEIGHT_KG

DEFAULT_DATASET_PATH = ROOT / "data" / "donor_eligibility.csv"


@dataclass
class DatasetValidationReport:
    dataset_path: str
    row_count: int
    column_count: int
    missing_columns: list[str] = field(default_factory=list)
    extra_columns: list[str] = field(default_factory=list)
    invalid_target_values: list[str] = field(default_factory=list)
    invalid_pregnancy_values: list[str] = field(default_factory=list)
    duplicate_record_id_count: int = 0
    duplicate_row_count: int = 0
    target_distribution: dict[str, int] = field(default_factory=dict)
    target_distribution_pct: dict[str, float] = field(default_factory=dict)
    missing_values: dict[str, int] = field(default_factory=dict)
    missing_values_pct: dict[str, float] = field(default_factory=dict)
    age_distribution: dict[str, int] = field(default_factory=dict)
    weight_distribution: dict[str, Any] = field(default_factory=dict)
    donation_interval_stats: dict[str, Any] = field(default_factory=dict)
    hemoglobin_stats: dict[str, Any] = field(default_factory=dict)
    feature_ranges: dict[str, dict[str, Any]] = field(default_factory=dict)
    out_of_range_counts: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        return not self.errors and not self.missing_columns and not self.invalid_target_values

    def format_summary(self) -> str:
        lines = [
            "Dataset shape:",
            f"Rows: {self.row_count:,}",
            f"Columns: {self.column_count}",
            "",
            "Target distribution (natural):",
        ]

        for label in TARGET_VALUES:
            count = self.target_distribution.get(label, 0)
            pct = self.target_distribution_pct.get(label, 0.0)
            lines.append(f"{label}: {count:,} ({pct:.2f}%)")

        if self.age_distribution:
            lines.extend(["", "Age distribution:"])
            for key, value in self.age_distribution.items():
                lines.append(f"{key}: {value:,}")

        if self.weight_distribution:
            lines.extend(["", "Weight distribution:"])
            for key, value in self.weight_distribution.items():
                lines.append(f"{key}: {value}")

        if self.donation_interval_stats:
            lines.extend(["", "Donation interval (days_since_last_donation):"])
            for key, value in self.donation_interval_stats.items():
                lines.append(f"{key}: {value}")

        if self.hemoglobin_stats:
            lines.extend(["", "Hemoglobin statistics:"])
            for key, value in self.hemoglobin_stats.items():
                lines.append(f"{key}: {value}")

        lines.extend(["", "Missing values:"])
        if self.missing_values:
            for column, count in self.missing_values.items():
                pct = self.missing_values_pct.get(column, 0.0)
                lines.append(f"{column}: {count:,} ({pct:.2f}%)")
        else:
            lines.append("(none)")

        lines.extend(
            [
                "",
                f"Duplicate record_id values: {self.duplicate_record_id_count}",
                f"Duplicate full rows: {self.duplicate_row_count}",
            ]
        )

        if self.feature_ranges:
            lines.extend(["", "Feature ranges:"])
            for column, stats in self.feature_ranges.items():
                if "min" in stats and "max" in stats:
                    lines.append(
                        f"{column}: min={stats['min']}, max={stats['max']}, mean={stats.get('mean', 'n/a')}"
                    )
                elif "values" in stats:
                    lines.append(f"{column}: values={stats['values']}")
                elif "true_count" in stats:
                    lines.append(
                        f"{column}: true_count={stats['true_count']} ({stats['true_pct']}%)"
                    )

        if self.out_of_range_counts:
            lines.extend(["", "Out-of-range checks:"])
            for key, value in self.out_of_range_counts.items():
                lines.append(f"{key}: {value}")

        if self.errors:
            lines.extend(["", "Errors:"])
            lines.extend(f"- {error}" for error in self.errors)

        if self.warnings:
            lines.extend(["", "Warnings:"])
            lines.extend(f"- {warning}" for warning in self.warnings)

        return "\n".join(lines)


def validate_dataset(
    dataset_path: str | Path | None = None,
    dataframe: pd.DataFrame | None = None,
) -> DatasetValidationReport:
    path = Path(dataset_path) if dataset_path else DEFAULT_DATASET_PATH

    if dataframe is None:
        if not path.exists():
            return DatasetValidationReport(
                dataset_path=str(path),
                row_count=0,
                column_count=0,
                errors=[f"Dataset file not found: {path}"],
            )
        df = pd.read_csv(path)
    else:
        df = dataframe.copy()

    required_columns = (
        ["record_id"]
        + NUMERIC_FEATURES
        + OPTIONAL_NUMERIC_FEATURES
        + BOOLEAN_FEATURES
        + CATEGORICAL_FEATURES
        + [TARGET_COLUMN]
    )

    report = DatasetValidationReport(
        dataset_path=str(path),
        row_count=len(df),
        column_count=len(df.columns),
    )

    report.missing_columns = [column for column in required_columns if column not in df.columns]
    report.extra_columns = [column for column in df.columns if column not in required_columns]

    if report.missing_columns:
        report.errors.append(f"Missing required columns: {', '.join(report.missing_columns)}")

    if TARGET_COLUMN in df.columns:
        invalid_targets = sorted(set(df[TARGET_COLUMN].dropna()) - set(TARGET_VALUES))
        report.invalid_target_values = invalid_targets
        if invalid_targets:
            report.errors.append(
                f"Invalid target values found: {', '.join(invalid_targets)}"
            )
        counts = df[TARGET_COLUMN].value_counts()
        report.target_distribution = counts.to_dict()
        report.target_distribution_pct = {
            label: round(count / len(df) * 100, 2) for label, count in counts.items()
        }

    if "pregnancy_status" in df.columns:
        invalid_pregnancy = sorted(set(df["pregnancy_status"].dropna()) - set(PREGNANCY_STATUS_VALUES))
        report.invalid_pregnancy_values = invalid_pregnancy
        if invalid_pregnancy:
            report.errors.append(
                f"Invalid pregnancy_status values: {', '.join(invalid_pregnancy)}"
            )

    for column in BOOLEAN_FEATURES:
        if column in df.columns:
            valid = df[column].dropna().isin([0, 1, True, False])
            if not valid.all():
                report.errors.append(f"Column '{column}' contains non-boolean values.")

    if "record_id" in df.columns:
        report.duplicate_record_id_count = int(df.duplicated(subset=["record_id"]).sum())
        if report.duplicate_record_id_count:
            report.errors.append(
                f"Found {report.duplicate_record_id_count} duplicate record_id values."
            )

    report.duplicate_row_count = int(df.duplicated().sum())
    if report.duplicate_row_count:
        report.warnings.append(f"Found {report.duplicate_row_count} duplicate full rows.")

    report.missing_values = {
        column: int(df[column].isna().sum())
        for column in df.columns
        if df[column].isna().any()
    }
    report.missing_values_pct = {
        column: round(count / len(df) * 100, 2)
        for column, count in report.missing_values.items()
    }

    if "age" in df.columns:
        age = pd.to_numeric(df["age"], errors="coerce")
        report.age_distribution = {
            f"below_{MIN_AGE}": int((age < MIN_AGE).sum()),
            f"{MIN_AGE}_to_{MAX_AGE}": int(((age >= MIN_AGE) & (age <= MAX_AGE)).sum()),
            f"above_{MAX_AGE}": int((age > MAX_AGE).sum()),
            "min": int(age.min()),
            "max": int(age.max()),
        }

    if "weight_kg" in df.columns:
        weight = pd.to_numeric(df["weight_kg"], errors="coerce")
        report.weight_distribution = {
            "min": float(weight.min()),
            "max": float(weight.max()),
            "mean": round(float(weight.mean()), 2),
            "missing": int(weight.isna().sum()),
            f"below_{MIN_WEIGHT_KG}kg": int((weight < MIN_WEIGHT_KG).sum()),
        }

    if "days_since_last_donation" in df.columns:
        days = pd.to_numeric(df["days_since_last_donation"], errors="coerce")
        known = days.dropna()
        report.donation_interval_stats = {
            "missing_first_time_donors": int(days.isna().sum()),
            "min_when_present": float(known.min()) if not known.empty else None,
            "max_when_present": float(known.max()) if not known.empty else None,
            "mean_when_present": round(float(known.mean()), 2) if not known.empty else None,
        }

    if "hemoglobin_value" in df.columns and "hemoglobin_known" in df.columns:
        hb = pd.to_numeric(df["hemoglobin_value"], errors="coerce")
        known_mask = df["hemoglobin_known"].fillna(False).astype(bool)
        known_values = hb[known_mask].dropna()
        report.hemoglobin_stats = {
            "known_count": int(known_mask.sum()),
            "missing_value_when_known": int((known_mask & hb.isna()).sum()),
            "missing_value_when_unknown": int((~known_mask & hb.isna()).sum()),
            "values_present_when_unknown": int((~known_mask & hb.notna()).sum()),
        }
        if not known_values.empty:
            report.hemoglobin_stats.update(
                {
                    "min_when_known": float(known_values.min()),
                    "max_when_known": float(known_values.max()),
                    "mean_when_known": round(float(known_values.mean()), 2),
                }
            )

        invalid_hb = int((~known_mask & hb.notna()).sum())
        if invalid_hb:
            report.out_of_range_counts["hemoglobin_value_present_when_unknown"] = invalid_hb
            report.errors.append(
                f"Found {invalid_hb} rows with hemoglobin_value present when hemoglobin_known is false."
            )

    for column in NUMERIC_FEATURES + OPTIONAL_NUMERIC_FEATURES:
        if column in df.columns:
            numeric = pd.to_numeric(df[column], errors="coerce")
            if numeric.notna().any():
                report.feature_ranges[column] = {
                    "min": float(numeric.min()),
                    "max": float(numeric.max()),
                    "mean": round(float(numeric.mean()), 2),
                }

    if "pregnancy_status" in df.columns:
        report.feature_ranges["pregnancy_status"] = {
            "values": sorted(df["pregnancy_status"].dropna().unique().tolist())
        }

    for column in BOOLEAN_FEATURES:
        if column in df.columns:
            true_count = int(df[column].fillna(False).astype(bool).sum())
            report.feature_ranges[column] = {
                "true_count": true_count,
                "true_pct": round(true_count / len(df) * 100, 2),
            }

    if "days_since_last_donation" in report.missing_values:
        report.warnings.append(
            "Missing days_since_last_donation may represent first-time donors."
        )

    if "hemoglobin_value" in report.missing_values:
        report.warnings.append(
            "Missing hemoglobin_value is expected when hemoglobin_known is false."
        )

    if "weight_kg" in report.missing_values:
        report.errors.append("weight_kg must not be missing in the canonical dataset.")

    return report
