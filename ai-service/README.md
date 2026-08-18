# BloodConnect AI Service

Independent Python service for NLP, intent detection, entity extraction, and donor eligibility assessment.

This service runs separately from the Node.js backend and the React Native mobile app.

## Requirements

- Python 3.10+
- pip

## Setup (Windows)

From the `ai-service` directory:

```powershell
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

## Run

From the `ai-service` directory, start the service with the **project virtual environment** (not Windows Store Python):

```powershell
cd C:\Projects\BloodDonationApp\ai-service
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Optional reload during development:

```powershell
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Verify the active build after starting (expect `step-10.4-recipient-conversation-hardening` or later):

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/ai/version
```

If `/api/ai/version` shows an older version, a stale process may still be bound to port 8000. Check listeners and stop old workers before restarting:

```powershell
netstat -ano | findstr ":8000"
# Stop the LISTENING PID if it is an old uvicorn/python process for this service
```

Do **not** start the service with bare `uvicorn` or `python -m uvicorn` from Windows Store Python outside the project venv — that can leave an old worker serving port 8000.

The service will be available at:

- Base URL: `http://localhost:8000`
- Interactive docs: `http://localhost:8000/docs`

## Endpoints

### Health check

```http
GET /api/ai/health
```

Example response:

```json
{
  "status": "ok",
  "service": "BloodConnect AI"
}
```

### Chat (placeholder)

```http
POST /api/ai/chat
Content-Type: application/json

{
  "message": "I donated blood six weeks ago and I am taking antibiotics."
}
```

Example response:

```json
{
  "success": true,
  "message": "AI service is running.",
  "intent": null,
  "entities": {},
  "eligibility": null
}
```

Optional request fields (future-ready):

- `conversation_id`
- `user_id`

---

## Donor eligibility dataset (Step 2)

### Purpose

Prepare a structured tabular dataset and preprocessing pipeline for a **preliminary** donor eligibility classifier with target classes:

- `eligible`
- `not_eligible`
- `needs_review`

This is **decision support**, not a medical diagnosis.

### Dataset source

**No suitable public or project dataset was found.**

BloodConnect Step 2 therefore uses a **synthetic / development dataset** with **200,000 records**:

- **Canonical file:** `data/donor_eligibility.csv`
- **Generator:** `scripts/generate_synthetic_dataset.py`
- **Central assumptions:** `config/dataset_assumptions.py`
- **Dictionary:** `data/DATA_DICTIONARY.md`
- **Random seed:** `42` (reproducible)

**Configured prototype assumptions (NOT clinical guidelines):**

| Setting | Value |
|---------|------:|
| Donor age range | 18–65 (with edge cases below/above) |
| Minimum weight | `MIN_WEIGHT_KG = 50` |
| Minimum donation interval | `MIN_DAYS_BETWEEN_DONATIONS = 56` days |

**Features:** age, weight_kg, days_since_last_donation, health screening booleans, pregnancy_status, hemoglobin fields.

**Class distribution:** emerges naturally from synthetic multi-feature rules — **not forced** to fixed percentages.

The synthetic data is clearly labeled as **not clinical data**. Real deployment would require medically validated datasets and expert review.

**Purpose:** ML experimentation / Master's project prototype

**Limitation:** Synthetic data cannot establish clinical model performance.

### Regenerate synthetic data

```powershell
python scripts/generate_synthetic_dataset.py
```

Default output: **200,000 rows** (`--rows` and `--seed` are optional).

If `donor_eligibility.csv` is open in another program, close it and re-run. The generator writes via a temporary file and removes stale `donor_eligibility_generated.csv` on success.

### Validate dataset

```powershell
python scripts/validate_dataset.py
```

Validation checks:

- required columns (17 total including `weight_kg`)
- natural class distribution
- age distribution (below 18, 18–65, above 65)
- weight and donation interval statistics
- hemoglobin consistency
- missing values
- duplicate `record_id` / duplicate rows
- invalid categorical values

### Preprocessing

Implemented in `app/services/data_preprocessing.py`:

- feature validation and type normalization
- missing-value handling strategy (median / most frequent)
- categorical one-hot encoding for `pregnancy_status`
- reproducible `train_test_split` with stratification (prepared, not trained yet)
- sklearn `ColumnTransformer` pipeline builder for Step 3

### Limitations

- Synthetic labels use placeholder rules, not clinical guidelines
- No NLP features yet
- No mobile or Node.js integration yet
- No production medical thresholds hardcoded as facts

### Medical safety disclaimer

The AI service must be presented as **preliminary screening / decision support**. Final eligibility decisions require qualified human review and official blood-bank policy.

---

## ML model training (Step 3)

### Purpose

We evaluated **Logistic Regression**, **Decision Tree**, and **Random Forest** classifiers and compared their performance using multiple classification metrics (accuracy, precision, recall, F1, macro averages, weighted F1, and per-class scores for `eligible`, `not_eligible`, `needs_review`).

Train baseline tabular classifiers on the synthetic donor eligibility dataset, compare models, and persist the best pipeline for future API integration.

This is **decision support only** — not a medical diagnosis or replacement for deterministic screening rules.

### Experiment results (synthetic data)

| Model | Accuracy | Macro F1 | Notes |
|-------|----------|----------|-------|
| Logistic Regression | ~75% | ~0.75 | **Selected baseline** |
| Decision Tree | ~100% | ~1.00 | Suspicious — likely memorizing synthetic rules |
| Random Forest | ~100% | ~1.00 | Suspicious — likely memorizing synthetic rules |

Decision Tree and Random Forest achieved approximately **100%** test accuracy. These results are **not** evidence of medical superiority — they reflect that synthetic target labels were generated using rules based on the same input features. **Logistic Regression** (~75% Macro F1) was selected as the more conservative, stable baseline.

### Train models

```powershell
python scripts/train_models.py
```

The script:

1. Loads `data/donor_eligibility.csv` (read-only)
2. Validates the dataset
3. Splits **80/20** with `stratify=y`, `random_state=42`
4. Fits preprocessing **only on the training split** (avoids leakage)
5. Trains and evaluates:
   - Logistic Regression (default + `class_weight='balanced'`)
   - Decision Tree (default + balanced)
   - Random Forest (default + balanced)
6. Saves confusion matrices, comparison CSV, feature importance, and selected model artifact

KNN is skipped — 160k training rows makes full-data KNN impractical.

### Artifacts

After training, see `artifacts/`:

| File | Description |
|------|-------------|
| `donor_eligibility_model.joblib` | Selected pipeline + metadata |
| `model_comparison.csv` | Best variant per model family |
| `feature_importance.csv` | Tree importances / LR coefficients |
| `*_confusion_matrix.png` | Confusion matrix per family |
| `training_report.json` | Full reproducibility report |

### Prediction service

`app/services/eligibility_model.py` exposes `EligibilityModelService.predict(features)` for raw feature dictionaries. Not wired to FastAPI yet.

### Class imbalance

The dataset has a natural imbalance (~17% eligible, ~50% not_eligible, ~33% needs_review). Labels are **not** rebalanced. Suitable models are evaluated with and without `class_weight='balanced'`. **Macro F1** is the primary comparison metric.

### Selected model criteria

1. Macro F1 (primary)
2. Minority-class (`eligible`) F1
3. `needs_review` recall
4. Overall stability

Random Forest is not selected by default — the best stable family variant wins on metrics.

**Step 3 result:** Logistic Regression selected (Macro F1 ≈ 0.75). Decision Tree and Random Forest reached ~100% test accuracy, indicating memorization of deterministic synthetic labeling rules rather than generalizable clinical performance.

### Data leakage and synthetic-data limitations

Synthetic labels were generated from the **same tabular features** using documented project rules in `config/dataset_assumptions.py`. High accuracy therefore reflects **rule recoverability**, not clinical validity. If accuracy exceeds ~99%, the training script flags this explicitly.

Deterministic safety rules (age, weight, donation interval, etc.) remain configurable in `config/dataset_assumptions.py` and should be evaluated alongside ML in production.

### Reproducibility

| Setting | Value |
|---------|------:|
| Dataset rows | 200,000 |
| Train rows | ~160,000 |
| Test rows | ~40,000 |
| `random_state` | 42 |
| `test_size` | 0.20 |

---

## NLP information extraction (Step 4)

### Purpose

Convert natural donor messages into structured fields that align with the ML feature schema — without requiring a fixed message format.

**The NLP layer is a deterministic prototype and is not a medical diagnostic system.**

### Approach

Local, lightweight extraction using:

- Python `re` (regex)
- Text normalization and contraction expansion
- Keyword / synonym matching
- Explicit negation handling
- Approximate relative-time normalization (NLP-only, not medical rules)

No OpenAI or external LLM APIs. No transformer models. No conversation-state system yet.

### Service

`app/services/nlp_service.py`

```python
from app.services.nlp_service import parse_message

result = parse_message("I'm 24 years old and weigh 65 kg.")
print(result.intent)      # provide_information
print(result.entities)    # {"age": 24, "weight_kg": 65.0, ...}
```

Output schema: `app/models/nlp_schemas.py` (`NLPParseResult`)

### Supported entities

| Entity | Examples |
|--------|----------|
| `age` | "I'm 24", "24 years old" |
| `weight_kg` | "65 kg", "65 kilos", "65kg" |
| `days_since_last_donation` | "2 months ago", "8 weeks ago", "yesterday" |
| `recent_illness`, `fever`, `current_medication`, `antibiotics` | explicit mentions + negation |
| `recent_surgery`, `recent_dental_procedure`, `recent_tattoo_or_piercing` | explicit mentions |
| `pregnancy_status`, `chronic_condition_reported`, `recent_blood_transfusion` | explicit mentions |
| `hemoglobin_known`, `hemoglobin_value` | "My hemoglobin is 13.2" |

**Unknown fields remain `null`** — the NLP does not invent weight, medication, or other values.

### Supported intents

| Intent | Example |
|--------|---------|
| `eligibility_check` | "Can I donate blood?" |
| `provide_information` | "I'm 24 and weigh 65kg." |
| `ask_requirements` | "What information do you need?" |
| `ask_clarification` | "What do you mean by recent illness?" |
| `greeting` | "Hi" |
| `unknown` | unrecognized messages |

### Negation handling

Distinguishes affirmative vs negative statements in local context:

- "I have a fever" → `fever: true`
- "I don't have a fever" → `fever: false`
- "I'm not taking antibiotics" → `antibiotics: false`

Negation is **entity-scoped** — the word "no" is not globally applied.

### Date/time normalization (NLP approximations)

| Phrase | Normalized days |
|--------|----------------:|
| 1 week | 7 |
| 1 month | 30 |
| 1 year | 365 |
| "never donated" | `null` (first-time donor) |

These are development approximations for parsing natural language — not blood-service medical intervals.

### Tests

```powershell
python -m pytest tests/test_nlp_service.py -v
```

### Limitations

- Rule-based NLP prototype; limited language coverage
- In-memory sessions only (not production-ready persistence)
- Not connected to mobile app yet

---

## Conversation state & orchestration (Step 5)

### Purpose

Multi-turn eligibility screening that merges NLP extractions across messages, asks only for missing fields, handles clarifications, applies deterministic rules, and runs the Logistic Regression model when screening information is complete.

**Preliminary decision support only — not a medical diagnosis.**

### Architecture

```
User → NLP → Conversation State → Required info check → Deterministic rules → ML → Response
```

### Session storage

In-memory `dict[session_id, ConversationState]`. Replace with persistent storage in production.

### Chat API

`POST /api/ai/chat` with `{ "message": "...", "session_id": "optional" }`.

Returns `session_id`, `status`, `collected_information`, `missing_information`, `next_question`, and `eligibility` when complete.

`conversation_id` remains a backward-compatible alias for `session_id`.

### Key behaviors

- **State merging:** information accumulates; latest explicit value wins; conflicts logged
- **Question order:** defined in `config/conversation_config.py`
- **Deterministic rules:** thresholds from `config/dataset_assumptions.py` only
- **ML trigger:** only when all required screening fields are collected and no blocking deterministic deferral applies

### Tests

```powershell
python -m pytest tests/ -v
```

---

## AI response & safety layer (Step 6)

### Purpose

`app/services/response_service.py` converts structured orchestration results into natural, safety-conscious user messages. It does **not** make eligibility decisions.

### Configuration (`config/ai_config.py`)

- `LOW_CONFIDENCE_THRESHOLD` (default 0.55) — ML results below this are not presented as reliable
- Standard safety disclaimers for preliminary-assessment wording

### Response types

Greeting, requirements explanation, acknowledgment + next question, clarification, conflict confirmation, out-of-scope redirect, eligible / not eligible / needs review results, low-confidence uncertainty, deterministic deferral explanations.

### Safety

Uses **"preliminary assessment"** and **"based on the information provided"**. Never claims guaranteed medical eligibility.

### Flow

```
User → NLP → Conversation State → Rules → ML → Response Service → Natural message
```

---

## Project structure

```
ai-service/
├── app/
│   ├── services/
│   │   ├── ai_service.py
│   │   ├── conversation_service.py
│   │   ├── response_service.py
│   │   ├── deterministic_rules.py
│   │   ├── nlp_service.py
│   │   ├── data_preprocessing.py
│   │   └── eligibility_model.py
│   └── models/
├── config/
│   ├── ai_config.py
│   ├── dataset_assumptions.py
│   └── conversation_config.py
├── tests/
│   ├── test_nlp_service.py
│   ├── test_conversation_service.py
│   └── test_response_service.py
└── ...
```

## Mobile integration (Step 7)

The React Native AI Assistant screen connects directly to this service:

```
Mobile app → POST /api/ai/chat → AI Service
```

It does **not** route through the Node.js backend.

### Mobile configuration

In `mobile/src/constants/api.js`:

```javascript
export const AI_API_BASE_URL = 'http://YOUR_PC_LAN_IP:8000';
```

| Environment | URL |
|-------------|-----|
| Android emulator | `http://10.0.2.2:8000` |
| Physical device (same Wi-Fi) | `http://YOUR_PC_LAN_IP:8000` |
| Tunnel | `https://YOUR_TUNNEL_URL` |

Do **not** use `http://localhost:8000` on a physical phone.

### Session behavior

- First user message creates a `session_id` returned by the API
- Subsequent messages in the same chat reuse that `session_id`
- Refresh icon in the AI screen starts a new conversation

### Run for mobile testing

```powershell
cd ai-service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Binding to `0.0.0.0` allows LAN devices to reach the service.

## Notes

- No authentication in the foundation step
- Does not modify the existing Node.js backend, MongoDB, or mobile app
