"""
Evaluate the EXISTING persisted Logistic Regression donor eligibility model.

IMPORTANT:
- Does NOT retrain, modify the artifact, dataset, or preprocessing.
- Uses the same stratified 80/20 split as training (random_state=42, test_size=0.2).
- Evaluates ONLY on the held-out test set using the saved fitted pipeline.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from sklearn.metrics import (
    ConfusionMatrixDisplay,
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
    roc_auc_score,
)

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.services.data_preprocessing import (
    ML_FEATURE_COLUMNS,
    TARGET_COLUMN,
    TARGET_VALUES,
    DonorEligibilityPreprocessor,
)
from config.ai_config import LOW_CONFIDENCE_THRESHOLD

ARTIFACT_PATH = ROOT / "artifacts" / "donor_eligibility_model.joblib"
EVAL_DIR = ROOT / "evaluation"
RANDOM_STATE = 42
TEST_SIZE = 0.2
MAX_ERROR_SAMPLES_TO_SAVE = 50


def load_artifact() -> dict[str, Any]:
    if not ARTIFACT_PATH.exists():
        raise FileNotFoundError(
            f"Model artifact not found: {ARTIFACT_PATH}. "
            "Training must be completed before evaluation."
        )
    return joblib.load(ARTIFACT_PATH)


def reproduce_test_split() -> tuple[pd.DataFrame, pd.Series, pd.DataFrame]:
    preprocessor = DonorEligibilityPreprocessor()
    raw_df = preprocessor.load_dataset()
    prepared = preprocessor.prepare_dataset(raw_df)
    split = preprocessor.split_train_test(
        prepared,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
    )
    return split.x_test, split.y_test, raw_df


def predict_batch(pipeline, x_test: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    y_pred = pipeline.predict(x_test)
    y_proba = pipeline.predict_proba(x_test)
    classes = pipeline.named_steps["classifier"].classes_
    confidences = y_proba.max(axis=1)
    return y_pred, y_proba, confidences


def compute_roc_auc(
    y_true: pd.Series,
    y_proba: np.ndarray,
    classes: np.ndarray,
) -> dict[str, Any]:
    """Multiclass OvR ROC-AUC; binary uses positive-class probabilities."""
    result: dict[str, Any] = {"strategy": None, "macro": None, "weighted": None, "per_class": {}}

    if len(classes) < 2:
        result["note"] = "ROC-AUC requires at least two classes."
        return result

    if len(classes) == 2:
        result["strategy"] = "binary"
        positive_idx = int(np.where(classes == classes[1])[0][0])
        result["macro"] = float(
            roc_auc_score(y_true, y_proba[:, positive_idx], labels=classes)
        )
        result["weighted"] = result["macro"]
        return result

    result["strategy"] = "multiclass_ovr"
    y_true_array = y_true.to_numpy()

    macro = roc_auc_score(
        y_true_array,
        y_proba,
        multi_class="ovr",
        average="macro",
        labels=classes,
    )
    weighted = roc_auc_score(
        y_true_array,
        y_proba,
        multi_class="ovr",
        average="weighted",
        labels=classes,
    )
    result["macro"] = float(macro)
    result["weighted"] = float(weighted)

    for idx, label in enumerate(classes):
        binary_true = (y_true_array == label).astype(int)
        result["per_class"][str(label)] = float(
            roc_auc_score(binary_true, y_proba[:, idx])
        )

    return result


def confidence_analysis(
    y_true: pd.Series,
    y_pred: np.ndarray,
    confidences: np.ndarray,
    threshold: float,
) -> dict[str, Any]:
    high_mask = confidences >= threshold
    low_mask = ~high_mask

    def subset_accuracy(mask: np.ndarray) -> float | None:
        if mask.sum() == 0:
            return None
        return float(accuracy_score(y_true[mask], y_pred[mask]))

    return {
        "threshold": threshold,
        "high_confidence_count": int(high_mask.sum()),
        "low_confidence_count": int(low_mask.sum()),
        "high_confidence_pct": float(high_mask.mean() * 100),
        "low_confidence_pct": float(low_mask.mean() * 100),
        "high_confidence_accuracy": subset_accuracy(high_mask),
        "low_confidence_accuracy": subset_accuracy(low_mask),
    }


def build_error_analysis(
    x_test: pd.DataFrame,
    y_true: pd.Series,
    y_pred: np.ndarray,
    confidences: np.ndarray,
    y_proba: np.ndarray,
    classes: np.ndarray,
) -> dict[str, Any]:
    errors_mask = y_true.to_numpy() != y_pred
    error_indices = np.where(errors_mask)[0]

    false_positive_counts: dict[str, int] = {}
    false_negative_counts: dict[str, int] = {}
    confusion_pairs: dict[str, int] = {}

    for actual, predicted in zip(y_true[errors_mask], y_pred[errors_mask]):
        actual_s = str(actual)
        predicted_s = str(predicted)
        pair_key = f"{actual_s} -> {predicted_s}"
        confusion_pairs[pair_key] = confusion_pairs.get(pair_key, 0) + 1

        if actual_s == "eligible" and predicted_s != "eligible":
            false_negative_counts["eligible"] = false_negative_counts.get("eligible", 0) + 1
        if actual_s != "eligible" and predicted_s == "eligible":
            false_positive_counts["eligible"] = false_positive_counts.get("eligible", 0) + 1
        if actual_s == "not_eligible" and predicted_s != "not_eligible":
            false_negative_counts["not_eligible"] = false_negative_counts.get("not_eligible", 0) + 1
        if actual_s != "not_eligible" and predicted_s == "not_eligible":
            false_positive_counts["not_eligible"] = false_positive_counts.get("not_eligible", 0) + 1
        if actual_s == "needs_review" and predicted_s != "needs_review":
            false_negative_counts["needs_review"] = false_negative_counts.get("needs_review", 0) + 1
        if actual_s != "needs_review" and predicted_s == "needs_review":
            false_positive_counts["needs_review"] = false_positive_counts.get("needs_review", 0) + 1

    per_class_errors = {}
    for label in TARGET_VALUES:
        label_mask = y_true == label
        total = int(label_mask.sum())
        wrong = int((y_true[label_mask].to_numpy() != y_pred[label_mask]).sum())
        per_class_errors[label] = {
            "total": total,
            "misclassified": wrong,
            "error_rate_pct": round(wrong / total * 100, 4) if total else 0.0,
        }

    hardest_class = max(
        per_class_errors.items(),
        key=lambda item: item[1]["error_rate_pct"],
    )[0]

    sample_errors = []
    for idx in error_indices[:MAX_ERROR_SAMPLES_TO_SAVE]:
        row = x_test.iloc[idx]
        prob_map = {
            str(cls): float(y_proba[idx, class_idx])
            for class_idx, cls in enumerate(classes)
        }
        sample_errors.append(
            {
                "actual": str(y_true.iloc[idx]),
                "predicted": str(y_pred[idx]),
                "confidence": round(float(confidences[idx]), 4),
                "probabilities": {k: round(v, 4) for k, v in prob_map.items()},
                "features": {
                    col: _serialize_feature(row[col]) for col in ML_FEATURE_COLUMNS
                },
            }
        )

    return {
        "total_errors": int(errors_mask.sum()),
        "error_rate_pct": round(float(errors_mask.mean() * 100), 4),
        "false_positive_as_eligible": false_positive_counts.get("eligible", 0),
        "false_negative_eligible": false_negative_counts.get("eligible", 0),
        "confusion_pair_counts": dict(
            sorted(confusion_pairs.items(), key=lambda item: item[1], reverse=True)
        ),
        "per_class_error_rates": per_class_errors,
        "hardest_class_to_predict": hardest_class,
        "sample_misclassifications": sample_errors,
    }


def _serialize_feature(value: Any) -> Any:
    if pd.isna(value):
        return None
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return round(float(value), 4)
    return str(value)


def save_confusion_matrix_plot(cm: np.ndarray, classes: list[str], output_path: Path) -> None:
    fig, ax = plt.subplots(figsize=(8, 6))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=classes)
    disp.plot(ax=ax, cmap="Blues", colorbar=False, values_format="d")
    ax.set_title("Logistic Regression — Confusion Matrix (Held-Out Test Set)")
    ax.set_xlabel("Predicted class")
    ax.set_ylabel("Actual class")
    fig.tight_layout()
    fig.savefig(output_path, dpi=150)
    plt.close(fig)


def format_classification_report_text(
    y_true: pd.Series,
    y_pred: np.ndarray,
    classes: np.ndarray,
) -> str:
    return classification_report(
        y_true,
        y_pred,
        labels=classes,
        target_names=[str(c) for c in classes],
        digits=4,
        zero_division=0,
    )


def evaluate() -> dict[str, Any]:
    EVAL_DIR.mkdir(parents=True, exist_ok=True)

    artifact = load_artifact()
    pipeline = artifact["pipeline"]
    model_name = artifact.get("model_name", "Logistic Regression")
    model_key = artifact.get("model_key", "logistic_regression")

    x_test, y_test, _raw_df = reproduce_test_split()
    classes = pipeline.named_steps["classifier"].classes_

    y_pred, y_proba, confidences = predict_batch(pipeline, x_test)

    accuracy = float(accuracy_score(y_test, y_pred))
    macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="macro", zero_division=0, labels=classes
    )
    weighted_p, weighted_r, weighted_f1, _ = precision_recall_fscore_support(
        y_test, y_pred, average="weighted", zero_division=0, labels=classes
    )

    report_dict = classification_report(
        y_test,
        y_pred,
        labels=classes,
        output_dict=True,
        zero_division=0,
    )
    report_text = format_classification_report_text(y_test, y_pred, classes)

    cm = confusion_matrix(y_test, y_pred, labels=classes)
    roc_auc = compute_roc_auc(y_test, y_proba, classes)
    confidence = confidence_analysis(
        y_test,
        y_pred,
        confidences,
        LOW_CONFIDENCE_THRESHOLD,
    )
    errors = build_error_analysis(x_test, y_test, y_pred, confidences, y_proba, classes)

    class_distribution = y_test.value_counts().to_dict()
    class_distribution_pct = {
        str(label): round(count / len(y_test) * 100, 4)
        for label, count in class_distribution.items()
    }

    per_class_metrics = {
        str(label): {
            "precision": float(report_dict[str(label)]["precision"]),
            "recall": float(report_dict[str(label)]["recall"]),
            "f1_score": float(report_dict[str(label)]["f1-score"]),
            "support": int(report_dict[str(label)]["support"]),
        }
        for label in classes
    }

    metrics = {
        "evaluation_timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "model": {
            "type": "LogisticRegression",
            "display_name": model_name,
            "model_key": model_key,
            "artifact_path": str(ARTIFACT_PATH),
            "preprocessing": "ColumnTransformer (median/most_frequent imputation + OneHotEncoder); no scaler",
            "features": ML_FEATURE_COLUMNS,
            "classes": [str(c) for c in classes],
            "target_column": TARGET_COLUMN,
        },
        "evaluation_data": {
            "dataset_path": str(DonorEligibilityPreprocessor().dataset_path),
            "split_method": "train_test_split",
            "test_size": TEST_SIZE,
            "random_state": RANDOM_STATE,
            "stratified": True,
            "evaluation_samples": int(len(y_test)),
            "training_samples_in_artifact": artifact.get("training_rows"),
            "note": "Evaluation uses held-out test split only; training split is excluded.",
        },
        "class_distribution": {
            "counts": {str(k): int(v) for k, v in class_distribution.items()},
            "percentages": class_distribution_pct,
            "num_classes": len(classes),
            "imbalance_note": (
                "The majority class is not_eligible (~50.4% of test set). "
                "eligible is the minority (~16.8%). Accuracy alone can be "
                "misleading when majority-class predictions dominate."
            ),
        },
        "metrics": {
            "accuracy": round(accuracy, 6),
            "accuracy_pct": round(accuracy * 100, 4),
            "precision_macro": round(float(macro_p), 6),
            "recall_macro": round(float(macro_r), 6),
            "f1_macro": round(float(macro_f1), 6),
            "precision_weighted": round(float(weighted_p), 6),
            "recall_weighted": round(float(weighted_r), 6),
            "f1_weighted": round(float(weighted_f1), 6),
            "roc_auc": roc_auc,
            "per_class": per_class_metrics,
        },
        "confusion_matrix": {
            "labels": [str(c) for c in classes],
            "matrix": cm.tolist(),
        },
        "confidence_analysis": confidence,
        "error_analysis": errors,
        "artifact_stored_test_metrics": artifact.get("metrics"),
    }

    (EVAL_DIR / "metrics.json").write_text(
        json.dumps(metrics, indent=2),
        encoding="utf-8",
    )
    (EVAL_DIR / "classification_report.txt").write_text(report_text, encoding="utf-8")
    (EVAL_DIR / "error_samples.json").write_text(
        json.dumps(errors["sample_misclassifications"], indent=2),
        encoding="utf-8",
    )
    save_confusion_matrix_plot(
        cm,
        [str(c) for c in classes],
        EVAL_DIR / "confusion_matrix.png",
    )

    summary_lines = [
        "BloodConnect Donor Eligibility Model Evaluation",
        "=" * 52,
        f"Model: {model_name}",
        f"Evaluation samples: {len(y_test):,}",
        f"Accuracy: {accuracy * 100:.4f}%",
        f"Precision (macro): {macro_p * 100:.4f}%",
        f"Recall (macro): {macro_r * 100:.4f}%",
        f"F1-score (macro): {macro_f1 * 100:.4f}%",
        f"Precision (weighted): {weighted_p * 100:.4f}%",
        f"Recall (weighted): {weighted_r * 100:.4f}%",
        f"F1-score (weighted): {weighted_f1 * 100:.4f}%",
    ]

    if roc_auc.get("macro") is not None:
        summary_lines.append(f"ROC-AUC (OvR macro): {roc_auc['macro'] * 100:.4f}%")
        summary_lines.append(f"ROC-AUC (OvR weighted): {roc_auc['weighted'] * 100:.4f}%")
    else:
        summary_lines.append(f"ROC-AUC: N/A ({roc_auc.get('note', 'not computed')})")

    summary_lines.extend(
        [
            "",
            "Confusion Matrix (rows=actual, cols=predicted):",
            f"Labels: {[str(c) for c in classes]}",
            str(cm),
            "",
            f"Confidence >= {LOW_CONFIDENCE_THRESHOLD}: "
            f"{confidence['high_confidence_pct']:.4f}% "
            f"(accuracy {confidence['high_confidence_accuracy'] * 100:.4f}%)",
            f"Confidence < {LOW_CONFIDENCE_THRESHOLD}: "
            f"{confidence['low_confidence_pct']:.4f}% "
            f"(accuracy {confidence['low_confidence_accuracy'] * 100:.4f}%)",
            "",
            "Classification Report:",
            report_text,
        ]
    )

    summary_text = "\n".join(summary_lines)
    (EVAL_DIR / "evaluation_summary.txt").write_text(summary_text, encoding="utf-8")

    print(summary_text)
    print(f"\nSaved evaluation outputs to: {EVAL_DIR}")

    return metrics


def main() -> None:
    evaluate()


if __name__ == "__main__":
    main()
