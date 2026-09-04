/**
 * Thin fetch wrapper. The API is same-origin, so the session cookie rides along
 * on its own — there is no token to attach.
 */

const BASE = '/api';

/**
 * Called when any request comes back 401, so a session that expired mid-session
 * drops the user back to the login screen instead of showing a broken page.
 * AuthProvider registers this on mount.
 */
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    // Endpoints attach extras (duplicates, requiresConfirmation, field errors)
    // that callers need in order to prompt the user.
    this.body = body || {};
  }
}

async function request(method, path, body, options = {}) {
  // Pulled out so it never reaches fetch() as a stray init property.
  const { skipAuthRedirect = false, ...fetchOptions } = options;

  const init = {
    method,
    credentials: 'same-origin',
    headers: {},
    ...fetchOptions,
  };

  if (body !== undefined && !(body instanceof FormData)) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    init.body = body; // let the browser set the multipart boundary
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError('Cannot reach the server. Is it still running?', 0);
  }

  if (response.status === 204) return null;

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json().catch(() => ({})) : null;

  if (!response.ok) {
    // `skipAuthRedirect` lets the login request and the initial session probe
    // report their own 401 rather than triggering a redirect loop.
    if (response.status === 401 && !skipAuthRedirect) onUnauthorized?.();

    throw new ApiError(
      payload?.error || `Request failed (${response.status})`,
      response.status,
      payload,
    );
  }

  return payload;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  patch: (path, body, options) => request('PATCH', path, body, options),
  del: (path, options) => request('DELETE', path, undefined, options),
};
