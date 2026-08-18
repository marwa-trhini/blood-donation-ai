export const DONOR_INITIAL_ASSISTANT_MESSAGE =
  "Hi! I'm BloodConnect's donor eligibility assistant. I can ask you a few questions and give you a preliminary assessment. You can answer naturally.";

export const RECIPIENT_INITIAL_ASSISTANT_MESSAGE =
  'Hello! I can help with blood requests, blood type compatibility, finding matching donors through BloodConnect, and general blood donation information. What would you like to know?';

export function getAIUserRole(user) {
  const role = user?.primaryRole;
  if (role === 'donor' || role === 'recipient') {
    return role;
  }
  return null;
}

export function getInitialAssistantMessage(role) {
  if (role === 'recipient') {
    return RECIPIENT_INITIAL_ASSISTANT_MESSAGE;
  }
  return DONOR_INITIAL_ASSISTANT_MESSAGE;
}

export function buildAIChatRequestBody(message, { sessionId = null, role = null } = {}) {
  const body = {
    message: String(message).trim(),
  };

  if (sessionId) {
    body.session_id = sessionId;
  }

  if (role === 'donor' || role === 'recipient') {
    body.role = role;
  }

  return body;
}

export function normalizeSendOptions(sessionIdOrOptions) {
  if (typeof sessionIdOrOptions === 'string') {
    return { sessionId: sessionIdOrOptions, role: null };
  }

  if (sessionIdOrOptions && typeof sessionIdOrOptions === 'object') {
    return {
      sessionId: sessionIdOrOptions.sessionId ?? null,
      role: sessionIdOrOptions.role ?? null,
    };
  }

  return { sessionId: null, role: null };
}

export function shouldResetConversation(previousRole, nextRole) {
  return previousRole !== nextRole;
}
