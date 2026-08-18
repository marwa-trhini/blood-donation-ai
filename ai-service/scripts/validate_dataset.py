"""Validate donor eligibility dataset and print a summary report."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.utils.dataset_validation import DEFAULT_DATASET_PATH, validate_dataset


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Validate donor eligibility dataset.")
    parser.add_argument(
        "--path",
        type=Path,
        default=DEFAULT_DATASET_PATH,
        help="Path to donor_eligibility.csv",
    )
    args = parser.parse_args()

    report = validate_dataset(args.path)
    print(report.format_summary())

    if not report.is_valid:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
