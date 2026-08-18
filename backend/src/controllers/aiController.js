const asyncHandler = require('../utils/asyncHandler');
const { forwardChatRequest } = require('../services/aiProxyService');
const { buildAIChatPayload } = require('../utils/aiRoleUtils');
const { nodeEnv } = require('../config/env');

const chat = asyncHandler(async (req, res) => {
  const { message } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({
      success: false,
      message: 'Message is required.',
    });
  }

  const payload = buildAIChatPayload(req.body, req.user || null);

  try {
    const { status, data } = await forwardChatRequest(payload);
    return res.status(status).json(data);
  } catch (error) {
    if (nodeEnv === 'development') {
      console.error('[AI proxy] Failed to reach AI service:', error.message);
    }

    return res.status(502).json({
      success: false,
      message: 'AI service is temporarily unavailable.',
    });
  }
});

module.exports = {
  chat,
};
