const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let accessToken = null;
let refreshPromise = null;

export class ApiError extends Error {
  constructor(message, status, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

function notifySessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('billscope:session-expired'));
}

async function readResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.text().catch(() => '');
  if (!response.ok) {
    const message = typeof body === 'object' ? (body.error || body.message) : body;
    throw new ApiError(message || 'The request could not be completed.', response.status, body?.code || 'REQUEST_FAILED');
  }
  return body;
}

async function rawRequest(path, options = {}, includeAuthorization = true) {
  const headers = new Headers(options.headers || {});
  headers.set('X-Billscope-Client', 'web');
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (includeAuthorization && accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const body = options.body !== undefined && typeof options.body !== 'string' && !(options.body instanceof FormData)
    ? JSON.stringify(options.body)
    : options.body;
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    body,
    headers,
    credentials: 'include'
  });
  return readResponse(response);
}

export async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST' }, false)
      .then((session) => {
        if (!session?.accessToken || !session?.user) throw new ApiError('Session could not be restored.', 401, 'SESSION_INVALID');
        setAccessToken(session.accessToken);
        return session;
      })
      .catch(() => {
        clearAccessToken();
        return null;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

export async function apiRequest(path, options = {}) {
  const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/register') || path.startsWith('/auth/refresh') || path.startsWith('/auth/logout');
  try {
    return await rawRequest(path, options, true);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || isAuthEndpoint || options._retried) throw error;
    const session = await refreshSession();
    if (!session) {
      clearAccessToken();
      notifySessionExpired();
      throw error;
    }
    return apiRequest(path, { ...options, _retried: true });
  }
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) => apiRequest(path, { ...options, method: 'DELETE' })
};
