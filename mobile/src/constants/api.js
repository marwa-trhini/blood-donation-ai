// Node.js BloodConnect backend (AI chat is proxied through /api/ai/chat)
export const API_BASE_URL = 'https://bloodconnect-backend-k70n.onrender.com';

/** Allow Render free-tier cold starts (can exceed 50s) before aborting. */
export const REQUEST_TIMEOUT_MS = 90000;