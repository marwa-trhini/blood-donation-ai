import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, REQUEST_TIMEOUT_MS } from '../constants/api';

function createApiError(message, status, data) {
  const error = new Error(message);
  error.name = 'ApiError';
  error.status = status;
  error.data = data;
  return error;
}

function mapRequestError(error, fallbackMessage) {
  if (error?.name === 'AbortError') {
    console.warn('[api] Request timed out:', {
      timeoutMs: REQUEST_TIMEOUT_MS,
      fallbackMessage,
      hint: 'The backend may be waking up on Render (free tier cold starts can take 50+ seconds).',
    });
    return createApiError(
      `The server took too long to respond (${REQUEST_TIMEOUT_MS / 1000}s). It may be waking up — please wait a moment and try again.`,
      408
    );
  }

  if (error?.message === 'Network request failed') {
    console.warn('[api] Network request failed:', {
      apiBaseUrl: API_BASE_URL,
      fallbackMessage,
      hint: 'Check device connectivity and that the backend URL is reachable.',
    });
    return createApiError(
      'Unable to reach the server. Check your internet connection and try again.',
      0
    );
  }

  if (error?.name === 'ApiError') {
    return error;
  }

  if (error instanceof Error && error.message) {
    return error;
  }

  console.warn('[api] Unmapped request error:', {
    name: error?.name,
    message: error?.message,
    fallbackMessage,
  });
  return createApiError(fallbackMessage);
}

async function readResponsePayload(response) {
  const raw = await response.text();
  console.log('[api] Raw response status:', response.status);
  console.log('[api] Raw response body:', raw);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (parseError) {
    console.error('[api] JSON parse error:', parseError);
    throw createApiError(
      'Unexpected response from server. Please try again.',
      response.status
    );
  }
}

export async function registerUser({ fullName, email, phoneNumber, password }) {
  const url = `${API_BASE_URL}/api/auth/register`;
  const body = {
    fullName,
    email,
    phoneNumber,
    password,
  };

  console.log('[registerUser] Request URL:', url);
  console.log('[registerUser] Method: POST');
  console.log('[registerUser] Request body:', {
    fullName: body.fullName,
    email: body.email,
    phoneNumber: body.phoneNumber,
    password: '***',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[registerUser] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Registration failed. Please try again.';

      console.error('[registerUser] Backend rejected registration:', {
        status: response.status,
        message,
        data,
      });

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error('[registerUser] Error:', {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      timeoutMs: REQUEST_TIMEOUT_MS,
      url,
    });
    throw mapRequestError(error, 'Registration failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function loginUser({ email, password }) {
  const url = `${API_BASE_URL}/api/auth/login`;
  const body = { email, password };

  console.log('[loginUser] Request URL:', url);
  console.log('[loginUser] Method: POST');
  console.log('[loginUser] Request body:', {
    email: body.email,
    password: '***',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[loginUser] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Invalid email or password.';

      console.error('[loginUser] Backend rejected login:', {
        status: response.status,
        message,
        data,
      });

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error('[loginUser] Error:', {
      name: error?.name,
      message: error?.message,
      status: error?.status,
      timeoutMs: REQUEST_TIMEOUT_MS,
      url,
    });
    throw mapRequestError(error, 'Login failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getCurrentUser() {
  const url = `${API_BASE_URL}/api/auth/me`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[getCurrentUser] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[getCurrentUser] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Unable to fetch user profile.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error('[getCurrentUser] Error:', error?.name, error?.message || error);
    throw mapRequestError(error, 'Unable to fetch user profile.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkEmailAvailability(email) {
  const normalizedEmail = String(email || '')
    .trim()
    .toLowerCase();
  const url = `${API_BASE_URL}/api/auth/check-email?email=${encodeURIComponent(normalizedEmail)}`;

  console.log('[checkEmailAvailability] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[checkEmailAvailability] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Unable to check email availability.';
      throw createApiError(message, response.status, data);
    }

    return {
      exists: Boolean(data.exists),
    };
  } catch (error) {
    console.error('[checkEmailAvailability] Error:', error?.name, error?.message || error);
    throw mapRequestError(error, 'Unable to check email availability.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function updateUserRole(role) {
  const url = `${API_BASE_URL}/api/auth/role`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw new Error('Not authenticated. Please register or log in again.');
  }

  console.log('[updateUserRole] Request URL:', url);
  console.log('[updateUserRole] Method: PATCH');
  console.log('[updateUserRole] Role:', role);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ role }),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[updateUserRole] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to update role. Please try again.';
      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error('[updateUserRole] Error:', error?.name, error?.message || error);
    throw mapRequestError(error, 'Failed to update role. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createDonorProfile(profileData) {
  const url = `${API_BASE_URL}/api/donor-profiles`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[createDonorProfile] Request URL:', url);
  console.log('[createDonorProfile] Method: POST');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(profileData),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[createDonorProfile] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to save donor profile. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error('[createDonorProfile] Error:', error?.name, error?.message || error);
    throw mapRequestError(error, 'Failed to save donor profile. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createRecipientProfile(profileData) {
  const url = `${API_BASE_URL}/api/recipient-profiles`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[createRecipientProfile] Request URL:', url);
  console.log('[createRecipientProfile] Method: POST');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(profileData),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[createRecipientProfile] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to save recipient profile. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[createRecipientProfile] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to save recipient profile. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authorizedProfileRequest(url, method, profileData) {
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
        ...(profileData ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(profileData ? { body: JSON.stringify(profileData) } : {}),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    if (response.status === 404) {
      throw createApiError(
        (typeof data?.message === 'string' && data.message.trim()) ||
          'Profile not found.',
        404,
        data
      );
    }

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Request failed. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    throw mapRequestError(error, 'Request failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getMyDonorProfile() {
  const url = `${API_BASE_URL}/api/donor-profiles/me`;

  console.log('[getMyDonorProfile] Request URL:', url);

  try {
    const data = await authorizedProfileRequest(url, 'GET');
    return data.profile;
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }

    console.error('[getMyDonorProfile] Error:', error?.name, error?.message || error);
    throw error;
  }
}

export async function updateDonorProfile(profileData) {
  const url = `${API_BASE_URL}/api/donor-profiles/me`;

  console.log('[updateDonorProfile] Request URL:', url);
  console.log('[updateDonorProfile] Method: PATCH');

  try {
    return await authorizedProfileRequest(url, 'PATCH', profileData);
  } catch (error) {
    console.error('[updateDonorProfile] Error:', error?.name, error?.message || error);
    throw error;
  }
}

export async function getMyRecipientProfile() {
  const url = `${API_BASE_URL}/api/recipient-profiles/me`;

  console.log('[getMyRecipientProfile] Request URL:', url);

  try {
    const data = await authorizedProfileRequest(url, 'GET');
    return data.profile;
  } catch (error) {
    if (error?.status === 404) {
      return null;
    }

    console.error(
      '[getMyRecipientProfile] Error:',
      error?.name,
      error?.message || error
    );
    throw error;
  }
}

export async function updateRecipientProfile(profileData) {
  const url = `${API_BASE_URL}/api/recipient-profiles/me`;

  console.log('[updateRecipientProfile] Request URL:', url);
  console.log('[updateRecipientProfile] Method: PATCH');

  try {
    return await authorizedProfileRequest(url, 'PATCH', profileData);
  } catch (error) {
    console.error(
      '[updateRecipientProfile] Error:',
      error?.name,
      error?.message || error
    );
    throw error;
  }
}

export async function resolvePostLoginScreen(user) {
  if (!user?.primaryRole) {
    return 'RoleSelection';
  }

  if (user.primaryRole === 'donor') {
    const profile = await getMyDonorProfile();
    return profile ? 'DonorHome' : 'DonorProfile';
  }

  if (user.primaryRole === 'recipient') {
    const profile = await getMyRecipientProfile();
    return profile ? 'RecipientHome' : 'RecipientProfile';
  }

  return 'RoleSelection';
}

export async function createBloodRequest(requestData) {
  const url = `${API_BASE_URL}/api/blood-requests`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[createBloodRequest] Request URL:', url);
  console.log('[createBloodRequest] Method: POST');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify(requestData),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[createBloodRequest] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to submit blood request. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[createBloodRequest] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to submit blood request. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getBloodRequest(requestId) {
  const normalizedRequestId =
    requestId != null ? String(requestId).trim() : '';
  const url = `${API_BASE_URL}/api/blood-requests/${encodeURIComponent(normalizedRequestId)}`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[getBloodRequest] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[getBloodRequest] Response status:', response.status);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to load blood request details. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[getBloodRequest] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to load blood request details. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getBloodRequestMatches(requestId) {
  const normalizedRequestId =
    requestId != null ? String(requestId).trim() : '';
  const url = `${API_BASE_URL}/api/blood-requests/${encodeURIComponent(normalizedRequestId)}/matches`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[getBloodRequestMatches] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[getBloodRequestMatches] Response status:', response.status);
    console.log(
      '[getBloodRequestMatches] Matches count:',
      Array.isArray(data?.matches) ? data.matches.length : 0
    );
    console.log('[getBloodRequestMatches] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to load matching donors. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[getBloodRequestMatches] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to load matching donors. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getMyBloodRequests() {
  const url = `${API_BASE_URL}/api/blood-requests/my`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[getMyBloodRequests] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[getMyBloodRequests] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to load blood requests. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[getMyBloodRequests] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to load blood requests. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function updateDonorAvailability(isAvailable) {
  const url = `${API_BASE_URL}/api/donor-profiles/me`;

  console.log('[updateDonorAvailability] Request URL:', url);
  console.log('[updateDonorAvailability] isAvailable:', isAvailable);

  try {
    return await authorizedProfileRequest(url, 'PATCH', { isAvailable });
  } catch (error) {
    console.error(
      '[updateDonorAvailability] Error:',
      error?.name,
      error?.message || error
    );
    throw error;
  }
}

export async function getCompatibleBloodRequests() {
  const url = `${API_BASE_URL}/api/blood-requests/compatible`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[getCompatibleBloodRequests] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[getCompatibleBloodRequests] Parsed response:', data);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to load compatible blood requests. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[getCompatibleBloodRequests] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to load compatible blood requests. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authorizedDonationRequest(url, method, body) {
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Request failed. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    throw mapRequestError(error, 'Request failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createDonationRequest(donorId, bloodRequestId, message) {
  const url = `${API_BASE_URL}/api/donation-requests`;

  console.log('[createDonationRequest] Request URL:', url);

  return authorizedDonationRequest(url, 'POST', {
    donorId,
    bloodRequestId,
    message: message || undefined,
  });
}

export async function getMyDonorDonationRequests() {
  const url = `${API_BASE_URL}/api/donation-requests/my?as=donor`;

  console.log('[getMyDonorDonationRequests] Request URL:', url);

  return authorizedDonationRequest(url, 'GET');
}

export async function getMyRecipientDonationRequests() {
  const url = `${API_BASE_URL}/api/donation-requests/my?as=recipient`;
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  console.log('[RecipientDonationRequests] Loading...');
  console.log('[getMyRecipientDonationRequests] Request URL:', url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    console.log('[getMyRecipientDonationRequests] Response status:', response.status);
    console.log(
      '[getMyRecipientDonationRequests] Requests count:',
      Array.isArray(data?.requests) ? data.requests.length : 0
    );
    console.log('[getMyRecipientDonationRequests] Parsed requests:', data?.requests);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Failed to load donation requests. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    console.error(
      '[getMyRecipientDonationRequests] Error:',
      error?.name,
      error?.message || error
    );
    throw mapRequestError(
      error,
      'Failed to load donation requests. Please try again.'
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function respondToDonationRequest(requestId, status) {
  const url = `${API_BASE_URL}/api/donation-requests/${encodeURIComponent(requestId)}/respond`;

  console.log('[respondToDonationRequest] Request URL:', url);
  console.log('[respondToDonationRequest] status:', status);

  return authorizedDonationRequest(url, 'PATCH', { status });
}

export async function cancelDonationRequest(requestId) {
  const url = `${API_BASE_URL}/api/donation-requests/${encodeURIComponent(requestId)}/cancel`;

  console.log('[cancelDonationRequest] Request URL:', url);

  return authorizedDonationRequest(url, 'PATCH');
}

export async function completeDonationRequest(requestId) {
  const url = `${API_BASE_URL}/api/donation-requests/${encodeURIComponent(requestId)}/complete`;

  console.log('[completeDonationRequest] Request URL:', url);

  return authorizedDonationRequest(url, 'PATCH');
}

export async function getCompletedDonations() {
  const url = `${API_BASE_URL}/api/donation-requests/completed`;

  console.log('[getCompletedDonations] Request URL:', url);

  return authorizedDonationRequest(url, 'GET');
}

async function authorizedRideRequest(url, method, body) {
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Request failed. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    throw mapRequestError(error, 'Request failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createRideRequest(donationRequestId) {
  const url = `${API_BASE_URL}/api/ride-requests`;

  return authorizedRideRequest(url, 'POST', { donationRequestId });
}

export async function getMyRideRequests() {
  const url = `${API_BASE_URL}/api/ride-requests/my`;

  return authorizedRideRequest(url, 'GET');
}

export async function previewRideRequest(donationRequestId) {
  const url = `${API_BASE_URL}/api/ride-requests/preview?donationRequestId=${encodeURIComponent(donationRequestId)}`;

  return authorizedRideRequest(url, 'GET');
}

export async function getRecipientRideRequests() {
  const url = `${API_BASE_URL}/api/ride-requests/recipient`;

  return authorizedRideRequest(url, 'GET');
}

export async function getRideRequest(rideId) {
  const url = `${API_BASE_URL}/api/ride-requests/${encodeURIComponent(rideId)}`;

  return authorizedRideRequest(url, 'GET');
}

export async function updateRideStatus(rideId, status) {
  const url = `${API_BASE_URL}/api/ride-requests/${encodeURIComponent(rideId)}/status`;

  return authorizedRideRequest(url, 'PATCH', { status });
}

async function authorizedChatRequest(url, method, body) {
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Request failed. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    throw mapRequestError(error, 'Request failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getChatConversations() {
  const url = `${API_BASE_URL}/api/chat/conversations`;

  return authorizedChatRequest(url, 'GET');
}

export async function getChatMessages(donationRequestId) {
  const url = `${API_BASE_URL}/api/chat/${encodeURIComponent(donationRequestId)}/messages`;

  return authorizedChatRequest(url, 'GET');
}

export async function sendChatMessage(donationRequestId, message) {
  const url = `${API_BASE_URL}/api/chat/${encodeURIComponent(donationRequestId)}/messages`;

  return authorizedChatRequest(url, 'POST', { message });
}

export async function markChatMessagesAsRead(donationRequestId) {
  const url = `${API_BASE_URL}/api/chat/${encodeURIComponent(donationRequestId)}/read`;

  return authorizedChatRequest(url, 'PATCH');
}

export async function deleteChatConversation(donationRequestId) {
  const url = `${API_BASE_URL}/api/chat/${encodeURIComponent(donationRequestId)}`;

  return authorizedChatRequest(url, 'DELETE');
}

async function authorizedNotificationRequest(url, method, body) {
  const token = await AsyncStorage.getItem('token');

  if (!token) {
    throw createApiError('Not authenticated. Please log in again.', 401);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    const data = await readResponsePayload(response);

    if (!response.ok || !data?.success) {
      const message =
        (typeof data?.message === 'string' && data.message.trim()) ||
        'Request failed. Please try again.';

      throw createApiError(message, response.status, data);
    }

    return data;
  } catch (error) {
    throw mapRequestError(error, 'Request failed. Please try again.');
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getNotifications() {
  const url = `${API_BASE_URL}/api/notifications`;

  console.log('[getNotifications] Request URL:', url);

  return authorizedNotificationRequest(url, 'GET');
}

export async function getUnreadNotificationCount() {
  const url = `${API_BASE_URL}/api/notifications/unread-count`;

  console.log('[getUnreadNotificationCount] Request URL:', url);

  return authorizedNotificationRequest(url, 'GET');
}

export async function markNotificationAsRead(notificationId) {
  const url = `${API_BASE_URL}/api/notifications/${notificationId}/read`;

  console.log('[markNotificationAsRead] Request URL:', url);

  return authorizedNotificationRequest(url, 'PATCH');
}

export async function markAllNotificationsAsRead() {
  const url = `${API_BASE_URL}/api/notifications/read-all`;

  console.log('[markAllNotificationsAsRead] Request URL:', url);

  return authorizedNotificationRequest(url, 'PATCH');
}

export async function logoutUser() {
  await AsyncStorage.removeItem('token');
}
