# Architecture

## Overview

The Blood Donation App is a three-tier system:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     mobile/     │────▶│    backend/     │────▶│   ai-service/   │
│  React Native   │     │  Node + Express │     │ Python + FastAPI│
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │    MongoDB      │
                        │   (future)      │
                        └─────────────────┘
```

## Folder Structure

### `mobile/` — React Native Mobile App

| Folder / File | Purpose |
| ------------- | ------- |
| `App.js` | Root component |
| `index.js` | App entry point |
| `src/components/` | Reusable UI components (buttons, cards, forms) |
| `src/screens/` | Full-screen views (login, donor profile, requests) |
| `src/navigation/` | React Navigation setup (stack, tabs) |
| `src/services/` | API client calls to the backend |
| `src/utils/` | Helper functions (date formatting, validation) |
| `src/constants/` | App-wide constants (blood types, colors, API URLs) |
| `src/assets/` | Images, icons, fonts |

### `backend/` — Node.js REST API

| Folder / File | Purpose |
| ------------- | ------- |
| `server.js` | Express app entry point |
| `src/config/` | Environment variables, DB connection, JWT settings |
| `src/controllers/` | Request handlers (business logic per route) |
| `src/middleware/` | Auth (JWT), validation, error handling |
| `src/models/` | Mongoose schemas (User, Donor, Request) |
| `src/routes/` | Express route definitions |
| `src/utils/` | Shared helpers (token generation, email) |

### `ai-service/` — Python ML/NLP Microservice

| Folder / File | Purpose |
| ------------- | ------- |
| `main.py` | FastAPI app entry point |
| `app/api/` | API route handlers (prediction, NLP endpoints) |
| `app/models/` | scikit-learn model loading and inference |
| `app/services/` | Business logic (donor matching, text analysis) |
| `app/utils/` | Data preprocessing, feature engineering |

### `docs/` — Project Documentation

Architecture notes, API specs, setup guides, and university deliverables.

## Authentication Flow (planned)

JWT-based authentication: the mobile app sends credentials to the backend, receives a token, and includes it in subsequent requests.

## Data Flow (planned)

1. Mobile app sends requests to the backend API.
2. Backend validates JWT, reads/writes MongoDB via Mongoose.
3. Backend calls the AI service for donor matching or NLP tasks.
4. AI service returns predictions; backend forwards results to the mobile app.
