import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAIUserRole,
  getInitialAssistantMessage,
  buildAIChatRequestBody,
  normalizeSendOptions,
  shouldResetConversation,
} from '../src/services/aiChatHelpers.js';

test('getAIUserRole reads primaryRole', () => {
  assert.equal(getAIUserRole({ primaryRole: 'donor' }), 'donor');
  assert.equal(getAIUserRole({ primaryRole: 'recipient' }), 'recipient');
  assert.equal(getAIUserRole({ primaryRole: null }), null);
  assert.equal(getAIUserRole(null), null);
});

test('getInitialAssistantMessage is role-specific', () => {
  assert.match(getInitialAssistantMessage('donor'), /donor eligibility/i);
  assert.match(getInitialAssistantMessage('recipient'), /blood request/i);
  assert.match(getInitialAssistantMessage(null), /donor eligibility/i);
});

test('buildAIChatRequestBody includes role and session', () => {
  assert.deepEqual(
    buildAIChatRequestBody('Hi', { sessionId: 'abc', role: 'recipient' }),
    {
      message: 'Hi',
      session_id: 'abc',
      role: 'recipient',
    }
  );
});

test('buildAIChatRequestBody omits invalid role', () => {
  assert.deepEqual(buildAIChatRequestBody('Hi', { role: 'admin' }), {
    message: 'Hi',
  });
});

test('normalizeSendOptions supports legacy session string', () => {
  assert.deepEqual(normalizeSendOptions('session-1'), {
    sessionId: 'session-1',
    role: null,
  });
});

test('shouldResetConversation when role changes', () => {
  assert.equal(shouldResetConversation('donor', 'recipient'), true);
  assert.equal(shouldResetConversation('donor', 'donor'), false);
  assert.equal(shouldResetConversation(null, 'recipient'), true);
});
