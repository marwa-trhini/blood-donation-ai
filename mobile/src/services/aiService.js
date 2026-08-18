import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../constants/api';
import {
  buildAIChatRequestBody,
  normalizeSendOptions,
} from './aiChatHelpers';

export {
  DONOR_INITIAL_ASSISTANT_MESSAGE,
  RECIPIENT_INITIAL_ASSISTANT_MESSAGE,
  buildAIChatRequestBody,
  getAIUserRole,
  getInitialAssistantMessage,
  normalizeSendOptions,
  shouldResetConversation,
} from './aiChatHelpers';

const AI_REQUEST_TIMEOUT_MS = 20000;

function createAIError(message) {
  const error = new Error(message);
  error.name = 'AIApiError';
  return error;
}

function mapAIRequestError(error) {
  if (error?.name === 'AbortError') {
    return createAIError(
      "Sorry, I couldn't connect to the AI assistant. Please try again."
    );
  }

  if (error?.message === 'Network request failed') {
    return createAIError(
      "Sorry, I couldn't connect to the AI assistant. Please try again."
    );
  }

  if (error?.name === 'AIApiError') {
    return error;
  }

  return createAIError(
    "Sorry, I couldn't connect to the AI assistant. Please try again."
  );
}

async function readResponsePayload(response) {
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw createAIError(
      "Sorry, I couldn't connect to the AI assistant. Please try again."
    );
  }
}

/**
 * Send a message to the BloodConnect AI assistant.
 *
 * @param {string} message - User message text
 * @param {string|{ sessionId?: string|null, role?: 'donor'|'recipient'|null }|null} sessionIdOrOptions
 * @returns {Promise<object>} Parsed AI chat response
 */
export async function sendAIMessage(message, sessionIdOrOptions = null) {
  const trimmed = String(message || '').trim();

  if (!trimmed) {
    throw createAIError('Please enter a message.');
  }

  const { sessionId, role } = normalizeSendOptions(sessionIdOrOptions);
  const url = `${API_BASE_URL}/api/ai/chat`;
  const body = buildAIChatRequestBody(trimmed, { sessionId, role });

  const token = await AsyncStorage.getItem('token');
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    if (!response.ok || !data?.success) {
      throw createAIError(
        "Sorry, I couldn't connect to the AI assistant. Please try again."
      );
    }

    return {
      sessionId: data.session_id || sessionId || null,
      message: data.message || '',
      status: data.status || null,
      intent: data.intent || null,
      role: data.role || role || null,
      nextQuestion: data.next_question || null,
      eligibility: data.eligibility || null,
      collectedInformation: data.collected_information || {},
      missingInformation: Array.isArray(data.missing_information)
        ? data.missing_information
        : [],
    };
  } catch (error) {
    throw mapAIRequestError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
