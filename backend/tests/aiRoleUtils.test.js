const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAIChatRole,
  buildAIChatPayload,
} = require('../src/utils/aiRoleUtils');

test('resolveAIChatRole uses authenticated primaryRole when present', () => {
  assert.equal(
    resolveAIChatRole({ primaryRole: 'recipient' }, 'donor'),
    'recipient'
  );
});

test('resolveAIChatRole falls back to client role without auth', () => {
  assert.equal(resolveAIChatRole(null, 'recipient'), 'recipient');
  assert.equal(resolveAIChatRole(undefined, 'donor'), 'donor');
});

test('resolveAIChatRole returns undefined when role missing', () => {
  assert.equal(resolveAIChatRole(null, null), undefined);
  assert.equal(resolveAIChatRole({ primaryRole: null }, 'invalid'), undefined);
});

test('buildAIChatPayload forwards session and resolved role', () => {
  const payload = buildAIChatPayload(
    {
      message: ' Hi ',
      session_id: 'session-1',
      role: 'donor',
    },
    { id: 'user-1', primaryRole: 'recipient' }
  );

  assert.equal(payload.message, 'Hi');
  assert.equal(payload.session_id, 'session-1');
  assert.equal(payload.role, 'recipient');
  assert.equal(payload.user_id, 'user-1');
});

test('buildAIChatPayload omits role when unresolved', () => {
  const payload = buildAIChatPayload(
    {
      message: 'Hi',
    },
    null
  );

  assert.equal(payload.message, 'Hi');
  assert.equal(payload.role, undefined);
});

test('authenticated recipient cannot be overridden by client donor role', () => {
  const payload = buildAIChatPayload(
    {
      message: 'Hi',
      role: 'donor',
    },
    { id: 'user-2', primaryRole: 'recipient' }
  );

  assert.equal(payload.role, 'recipient');
});
