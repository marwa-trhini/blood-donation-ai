const ALLOWED_AI_ROLES = ['donor', 'recipient'];

function isAllowedAIRole(role) {
  return ALLOWED_AI_ROLES.includes(role);
}

/**
 * Resolve the role forwarded to the AI service.
 * Authenticated primaryRole is authoritative when present.
 */
function resolveAIChatRole(authenticatedUser, clientRole) {
  const authRole = authenticatedUser?.primaryRole;

  if (isAllowedAIRole(authRole)) {
    return authRole;
  }

  if (isAllowedAIRole(clientRole)) {
    return clientRole;
  }

  return undefined;
}

function buildAIChatPayload(body, authenticatedUser) {
  const {
    message,
    session_id: sessionId,
    conversation_id: conversationId,
    user_id: userId,
    role: clientRole,
  } = body || {};

  const payload = {
    message: String(message).trim(),
  };

  if (sessionId) {
    payload.session_id = sessionId;
  }

  if (conversationId) {
    payload.conversation_id = conversationId;
  }

  if (userId) {
    payload.user_id = userId;
  } else if (authenticatedUser?.id) {
    payload.user_id = authenticatedUser.id;
  }

  const resolvedRole = resolveAIChatRole(authenticatedUser, clientRole);
  if (resolvedRole) {
    payload.role = resolvedRole;
  }

  return payload;
}

module.exports = {
  ALLOWED_AI_ROLES,
  isAllowedAIRole,
  resolveAIChatRole,
  buildAIChatPayload,
};
