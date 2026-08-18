/**
 * End-to-end smoke test: Node backend proxy -> Python AI service.
 *
 * Usage:
 *   node scripts/test-ai-dual-role-e2e.js
 *
 * Requires:
 *   - Python AI service on http://localhost:8000
 *   - Node backend on http://localhost:5000 (default port from env)
 */

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';

async function postChat(body, token) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}/api/ai/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = await response.json();
  return { status: response.status, data };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  console.log(`Testing AI dual-role flow via ${BASE_URL}`);

  const versionResponse = await fetch('http://localhost:8000/api/ai/version');
  const versionData = await versionResponse.json();
  console.log('AI version:', versionData.version);
  assert(
    versionData.version === 'step-10.1-end-to-end-dual-role',
    `Expected AI version step-10.1-end-to-end-dual-role, got ${versionData.version}`
  );

  const donor = await postChat({ message: 'Hi', role: 'donor' });
  assert(donor.data.success, 'Donor chat failed');
  assert(donor.data.role === 'donor', `Expected donor role, got ${donor.data.role}`);
  assert(
    /old|weight|age|donated|eligibility/i.test(donor.data.message),
    `Unexpected donor response: ${donor.data.message}`
  );
  console.log('Donor Hi -> donor screening OK');

  const recipient = await postChat({ message: 'Hi', role: 'recipient' });
  assert(recipient.data.success, 'Recipient chat failed');
  assert(recipient.data.role === 'recipient', `Expected recipient role, got ${recipient.data.role}`);
  assert(
    !/how old are you|how much do you weigh|donated blood before/i.test(
      recipient.data.message
    ),
    `Recipient entered donor screening: ${recipient.data.message}`
  );
  assert(
    /blood request|compatibility|donor/i.test(recipient.data.message),
    `Unexpected recipient greeting: ${recipient.data.message}`
  );
  console.log('Recipient Hi -> recipient assistance OK');

  const compatibility = await postChat({
    message: 'Can O negative receive O positive?',
    role: 'recipient',
  });
  assert(compatibility.data.success, 'Compatibility chat failed');
  assert(compatibility.data.role === 'recipient', `Expected recipient role, got ${compatibility.data.role}`);
  assert(
    /compatible|cannot|O-/i.test(compatibility.data.message),
    `Unexpected compatibility response: ${compatibility.data.message}`
  );
  console.log('Recipient compatibility -> OK');

  const noRole = await postChat({ message: 'Hi' });
  assert(noRole.data.success, 'No-role chat failed');
  assert(noRole.data.role === 'donor', `Expected donor default role, got ${noRole.data.role}`);
  console.log('Missing role -> donor default OK');

  console.log('All end-to-end AI proxy checks passed.');
}

main().catch((error) => {
  console.error('E2E test failed:', error.message);
  process.exit(1);
});
