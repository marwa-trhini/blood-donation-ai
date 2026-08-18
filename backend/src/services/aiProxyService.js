const { aiServiceUrl, aiServiceTimeoutMs } = require('../config/env');

function buildChatUrl() {
  return `${aiServiceUrl.replace(/\/$/, '')}/api/ai/chat`;
}

async function forwardChatRequest(body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), aiServiceTimeoutMs);

  try {
    const response = await fetch(buildChatUrl(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let data = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        const error = new Error('Invalid JSON response from AI service');
        error.code = 'AI_INVALID_RESPONSE';
        throw error;
      }
    }

    return {
      status: response.status,
      data,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  forwardChatRequest,
};
