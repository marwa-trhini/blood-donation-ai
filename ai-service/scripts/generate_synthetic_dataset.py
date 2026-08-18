"""
Generate a synthetic donor eligibility development dataset.

IMPORTANT:
- SYNTHETIC / DEVELOPMENT data only — NOT clinical data.
- Labeling uses documented project assumptions from config/dataset_assumptions.py.
- Labels must never be presented as real medical decisions.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config.dataset_assumptions import (
    DEFAULT_ROW_COUNT,
    HEMOGLOBIN_REVIEW_HIGH,
    HEMOGLOBIN_REVIEW_LOW,
    MAX_AGE,
    MIN_AGE,
    MIN_DAYS_BETWEEN_DONATIONS,
    MIN_WEIGHT_KG,
    PREGNANCY_STATUSES,
    RANDOM_STATE,
    RECORD_ID_PREFIX,
    WEIGHT_REVIEW_UPPER_KG,
)


def _generate_features(n: int, rng: np.random.Generator) -> pd.DataFrame:
    """Vectorized synthetic feature generation with realistic variation."""
    age = np.full(n, -1, dtype=int)
    in_range_mask = rng.random(n) < 0.88
    below_mask = (~in_range_mask) & (rng.random(n) < 0.5)
    above_mask = (~in_range_mask) & (~below_mask)

    age[in_range_mask] = rng.integers(MIN_AGE, MAX_AGE + 1, size=in_range_mask.sum())
    age[below_mask] = rng.integers(16, MIN_AGE, size=below_mask.sum())
    age[above_mask] = rng.integers(MAX_AGE + 1, 71, size=above_mask.sum())

    weight_kg = np.round(rng.normal(72.0, 12.0, n), 1)
    edge_weight_mask = rng.random(n) < 0.08
    weight_kg[edge_weight_mask] = np.round(rng.uniform(43.0, MIN_WEIGHT_KG + 4.0, edge_weight_mask.sum()), 1)
    weight_kg = np.clip(weight_kg, 40.0, 130.0)

    is_first_time = rng.random(n) < 0.18
    donation_bucket = rng.random(n)
    days_since = np.full(n, np.nan, dtype=float)
    repeat_mask = ~is_first_time

    recent_mask = repeat_mask & (donation_bucket < 0.22)
    medium_mask = repeat_mask & (donation_bucket >= 0.22) & (donation_bucket < 0.55)
    long_mask = repeat_mask & (donation_bucket >= 0.55)

    days_since[recent_mask] = rng.integers(14, MIN_DAYS_BETWEEN_DONATIONS, size=recent_mask.sum())
    days_since[medium_mask] = rng.integers(MIN_DAYS_BETWEEN_DONATIONS, 181, size=medium_mask.sum())
    days_since[long_mask] = rng.integers(181, 731, size=long_mask.sum())

    pregnancy_status = rng.choice(
        PREGNANCY_STATUSES,
        size=n,
        p=[0.70, 0.24, 0.03, 0.03],
    )

    hemoglobin_known = rng.random(n) < 0.58
    hemoglobin_value = np.full(n, np.nan, dtype=float)
    hb_known_idx = np.where(hemoglobin_known)[0]

    normal_count = int(len(hb_known_idx) * 0.72)
    borderline_count = int(len(hb_known_idx) * 0.18)
    low_count = len(hb_known_idx) - normal_count - borderline_count

    hemoglobin_value[hb_known_idx[:normal_count]] = np.round(
        rng.normal(13.5, 0.7, normal_count), 1
    )
    hemoglobin_value[
        hb_known_idx[normal_count : normal_count + borderline_count]
    ] = np.round(rng.uniform(11.8, 12.4, borderline_count), 1)
    hemoglobin_value[hb_known_idx[normal_count + borderline_count :]] = np.round(
        rng.uniform(10.0, 11.7, low_count), 1
    )

    recent_illness = rng.random(n) < 0.20
    fever = (rng.random(n) < 0.07) | (recent_illness & (rng.random(n) < 0.18))
    current_medication = (rng.random(n) < 0.26) | (recent_illness & (rng.random(n) < 0.22))
    antibiotics = (rng.random(n) < 0.09) | (current_medication & (rng.random(n) < 0.12))
    recent_surgery = rng.random(n) < 0.06
    recent_dental_procedure = rng.random(n) < 0.11
    recent_tattoo_or_piercing = rng.random(n) < 0.08
    chronic_condition_reported = rng.random(n) < 0.13
    recent_blood_transfusion = rng.random(n) < 0.04

    return pd.DataFrame(
        {
            "record_id": [f"{RECORD_ID_PREFIX}-{i + 1:06d}" for i in range(n)],
            "age": age,
            "weight_kg": weight_kg,
            "days_since_last_donation": days_since,
            "recent_illness": recent_illness,
            "fever": fever,
            "current_medication": current_medication,
            "antibiotics": antibiotics,
            "recent_surgery": recent_surgery,
            "recent_dental_procedure": recent_dental_procedure,
            "recent_tattoo_or_piercing": recent_tattoo_or_piercing,
            "pregnancy_status": pregnancy_status,
            "chronic_condition_reported": chronic_condition_reported,
            "recent_blood_transfusion": recent_blood_transfusion,
            "hemoglobin_known": hemoglobin_known,
            "hemoglobin_value": hemoglobin_value,
        }
    )


def _assign_eligibility_status(df: pd.DataFrame) -> pd.Series:
    """
    Assign labels from documented multi-feature synthetic screening assumptions.

    Labels emerge naturally from the rules — no forced class quotas.
    """
    short_interval = df["days_since_last_donation"].notna() & (
        df["days_since_last_donation"] < MIN_DAYS_BETWEEN_DONATIONS
    )
    borderline_hb = df["hemoglobin_known"] & df["hemoglobin_value"].notna() & (
        (df["hemoglobin_value"] < HEMOGLOBIN_REVIEW_LOW)
        | (df["hemoglobin_value"] > HEMOGLOBIN_REVIEW_HIGH)
    )
    first_time = df["days_since_last_donation"].isna()
    low_weight = df["weight_kg"] < MIN_WEIGHT_KG
    borderline_weight = (df["weight_kg"] >= MIN_WEIGHT_KG) & (
        df["weight_kg"] < WEIGHT_REVIEW_UPPER_KG
    )

    illness_with_fever = df["recent_illness"] & df["fever"]
    multiple_concerns = (
        df["recent_illness"].astype(int)
        + df["current_medication"].astype(int)
        + df["recent_surgery"].astype(int)
        + df["chronic_condition_reported"].astype(int)
        + df["recent_blood_transfusion"].astype(int)
        + short_interval.astype(int)
    ) >= 3

    not_eligible_mask = (
        (df["age"] < MIN_AGE)
        | (df["age"] > MAX_AGE)
        | low_weight
        | df["fever"]
        | df["antibiotics"]
        | (df["pregnancy_status"] == "yes")
        | short_interval
        | illness_with_fever
        | multiple_concerns
    )

    review_mask = (
        ~not_eligible_mask
        & (
            df["recent_surgery"]
            | df["recent_tattoo_or_piercing"]
            | df["chronic_condition_reported"]
            | (df["pregnancy_status"] == "unknown")
            | df["recent_blood_transfusion"]
            | df["recent_dental_procedure"]
            | (df["recent_illness"] & ~df["fever"])
            | (df["current_medication"] & ~df["antibiotics"])
            | borderline_hb
            | borderline_weight
            | (first_time & (df["recent_illness"] | df["chronic_condition_reported"]))
            | (first_time & (df["pregnancy_status"] == "unknown"))
            | (~df["hemoglobin_known"] & (df["recent_illness"] | df["chronic_condition_reported"]))
        )
    )

    labels = np.where(
        not_eligible_mask,
        "not_eligible",
        np.where(review_mask, "needs_review", "eligible"),
    )

    return pd.Series(labels, index=df.index, name="eligibility_status")


def generate_dataset(row_count: int = DEFAULT_ROW_COUNT, random_state: int = RANDOM_STATE) -> pd.DataFrame:
    rng = np.random.default_rng(random_state)
    features = _generate_features(row_count, rng)
    features["eligibility_status"] = _assign_eligibility_status(features)
    return features


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate synthetic donor eligibility dataset.")
    parser.add_argument("--rows", type=int, default=DEFAULT_ROW_COUNT)
    parser.add_argument("--seed", type=int, default=RANDOM_STATE)
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "data" / "donor_eligibility.csv",
    )
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)

    started = time.perf_counter()
    dataset = generate_dataset(row_count=args.rows, random_state=args.seed)

    temp_output = args.output.with_suffix(".csv.tmp")
    dataset.to_csv(temp_output, index=False)

    written_path = args.output
    fallback_path = args.output.with_name(args.output.stem + "_generated.csv")

    try:
        if args.output.exists():
            args.output.unlink()
        temp_output.replace(args.output)
        if fallback_path.exists():
            fallback_path.unlink()
    except PermissionError:
        if fallback_path.exists():
            fallback_path.unlink()
        temp_output.replace(fallback_path)
        written_path = fallback_path
        print(
            f"Warning: could not overwrite {args.output} (file may be open). "
            f"Wrote dataset to {written_path} instead."
        )

    elapsed = time.perf_counter() - started
    distribution = dataset["eligibility_status"].value_counts()
    percentages = (distribution / len(dataset) * 100).round(2)

    print(f"Wrote {len(dataset):,} rows to {written_path}")
    print(f"Generation time: {elapsed:.2f}s")
    print(f"Random seed: {args.seed}")
    print("\nNatural class distribution:")
    for label in ["eligible", "not_eligible", "needs_review"]:
        count = int(distribution.get(label, 0))
        pct = float(percentages.get(label, 0.0))
        print(f"  {label}: {count:,} ({pct}%)")


if __name__ == "__main__":
    main()
