# Donor Eligibility Data Dictionary

**Dataset:** `donor_eligibility.csv`  
**Size:** 200,000 synthetic development records  
**Type:** Synthetic / development dataset — **not clinical data**

This dictionary describes the tabular features used for future preliminary donor eligibility modeling in BloodConnect.

---

## Medical and safety disclaimer

- This dataset is for **software development, ML experimentation, and Master's project prototyping only**.
- Labels were generated using **documented synthetic project assumptions** in `config/dataset_assumptions.py`.
- These assumptions are **NOT clinical guidelines**.
- The future model is **decision support**, not a diagnosis or final eligibility determination.
- Real deployment requires medically validated data, expert review, and jurisdiction-specific blood-bank policy.

---

## Configured screening assumptions (PROJECT — not clinical)

All thresholds below live in **`config/dataset_assumptions.py`**:

| Setting | Value | Type |
|---------|------:|------|
| `MIN_AGE` | 18 | PROJECT / SYNTHETIC ASSUMPTION |
| `MAX_AGE` | 65 | PROJECT / SYNTHETIC ASSUMPTION |
| `MIN_WEIGHT_KG` | 50.0 | PROJECT / SYNTHETIC ASSUMPTION |
| `WEIGHT_REVIEW_UPPER_KG` | 55.0 | PROJECT / SYNTHETIC ASSUMPTION |
| `MIN_DAYS_BETWEEN_DONATIONS` | 56 | PROJECT / SYNTHETIC ASSUMPTION |
| `HEMOGLOBIN_REVIEW_LOW` | 12.0 | PROJECT / SYNTHETIC ASSUMPTION |
| `HEMOGLOBIN_REVIEW_HIGH` | 18.0 | PROJECT / SYNTHETIC ASSUMPTION |

Replace these values with validated blood-service policy before production use.

---

## Target definition

| Column | Type | Description |
|--------|------|-------------|
| `eligibility_status` | categorical | **Target class** for ML. Preliminary screening outcome. |

**Allowed values:**

| Value | Meaning |
|-------|---------|
| `eligible` | No blocking synthetic flags; may proceed in development screening |
| `not_eligible` | Blocking synthetic flags present |
| `needs_review` | Ambiguous/incomplete information; route to human review |

**Labeling note:** Labels emerge **naturally** from multi-feature synthetic rules in `scripts/generate_synthetic_dataset.py`. No forced class quotas are applied.

---

## Identifier

| Column | Type | Used by ML | Description |
|--------|------|------------|-------------|
| `record_id` | string | No | Unique synthetic identifier (`SYN-000001` … `SYN-200000`) |

---

## ML features

| Feature | Type | Description | Allowed values / range | Missing behavior | Used by ML |
|---------|------|-------------|------------------------|------------------|------------|
| `age` | integer | Donor age in years | Majority 18–65; edge cases below 18 and above 65 | Not expected missing | Yes |
| `weight_kg` | float | Donor body weight in kilograms | Synthetic adult range ~40–130 kg | Not expected missing | Yes |
| `days_since_last_donation` | integer | Days since previous donation | Present for repeat donors; missing for first-time donors | Missing allowed | Yes |
| `recent_illness` | boolean | Self-reported recent illness | `true` / `false` | Impute most frequent | Yes |
| `fever` | boolean | Current or recent fever | `true` / `false` | Impute most frequent | Yes |
| `current_medication` | boolean | Currently taking medication | `true` / `false` | Impute most frequent | Yes |
| `antibiotics` | boolean | Currently taking antibiotics | `true` / `false` | Impute most frequent | Yes |
| `recent_surgery` | boolean | Recent surgery | `true` / `false` | Impute most frequent | Yes |
| `recent_dental_procedure` | boolean | Recent dental procedure | `true` / `false` | Impute most frequent | Yes |
| `recent_tattoo_or_piercing` | boolean | Recent tattoo or piercing | `true` / `false` | Impute most frequent | Yes |
| `pregnancy_status` | categorical | Pregnancy screening answer | `not_applicable`, `no`, `yes`, `unknown` | Impute most frequent | Yes |
| `chronic_condition_reported` | boolean | Self-reported chronic condition | `true` / `false` | Impute most frequent | Yes |
| `recent_blood_transfusion` | boolean | Recent blood transfusion | `true` / `false` | Impute most frequent | Yes |
| `hemoglobin_known` | boolean | Whether hemoglobin is available | `true` / `false` | Impute most frequent | Yes |
| `hemoglobin_value` | float | Hemoglobin when known | Synthetic varied values | Missing when `hemoglobin_known` is false | Yes |

---

## Synthetic labeling logic (development assumptions)

Labels are assigned by **multi-feature rules**, not a single feature alone.

**Examples of `not_eligible` patterns:**
- `age < 18` or `age > 65`
- `weight_kg < MIN_WEIGHT_KG`
- `fever` or `antibiotics`
- `pregnancy_status == yes`
- Repeat donor with `days_since_last_donation < MIN_DAYS_BETWEEN_DONATIONS`
- `recent_illness` combined with `fever`
- Multiple concurrent concerning factors (≥ 3)

**Examples of `needs_review` patterns:**
- Recent surgery, tattoo/piercing, or transfusion
- Chronic condition or unknown pregnancy status
- Illness or medication without clear deferral
- Borderline hemoglobin or borderline weight band
- First-time donor with incomplete/uncertain information
- Missing hemoglobin with other uncertainty flags

**`eligible`:** remaining cases inside configured age range that pass other screening assumptions.

---

## Features excluded from ML

| Feature | Reason |
|---------|--------|
| `record_id` | Identifier only |
| `sex` / `gender` | Not included in this prototype dataset |

---

## Deterministic rules for future production system

These should remain configurable policy checks alongside ML:

| Rule area | Why deterministic |
|-----------|-------------------|
| Age outside configured band | Policy-driven |
| Weight below minimum | Policy-driven |
| Active fever / antibiotics | Safety-critical deferral |
| Pregnancy | Safety-critical |
| Donation interval | Policy-driven |
| Hemoglobin thresholds | Requires validated lab policy |
| `needs_review` outcomes | Must route to human review |

---

## Class distribution

Distribution is **natural** (not forced). Verify after generation:

```powershell
python scripts/validate_dataset.py
```
