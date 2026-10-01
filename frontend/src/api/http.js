import { useAuth } from '../composables/useAuth';
import { useToast } from '../composables/useToast';
import { i18n } from '../i18n';
import { translateApiError } from '../i18n/apiErrors';

const { showToast } = useToast();
// /auth/ calls (login, refresh, logout) get their own dedicated UI feedback — a generic
// "Saved"/error toast on top of that would just be noise.
const SILENT_PREFIX = '/auth/';

function buildUrl(path, params) {
  const url = new URL(`/api${path}`, window.location.origin);
  url.searchParams.set('locale', i18n.global.locale.value);
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  return url.pathname + url.search;
}

async function rawRequest(path, { method = 'GET', params, body, isFormData } = {}) {
  const { getAccessToken } = useAuth();
  const headers = {};
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isFormData) headers['Content-Type'] = 'application/json';

  const res = await fetch(buildUrl(path, params), {
    method,
    headers,
    credentials: 'include',
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// Central fetch wrapper: attaches the bearer token + locale, retries once via a
// silent refresh on 401 (unless the call is itself an /auth/ endpoint), and throws
// an Error carrying the server's message for callers to display.
export async function apiRequest(path, options = {}) {
  let res = await rawRequest(path, options);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    const { refresh } = useAuth();
    const refreshed = await refresh();
    if (refreshed) res = await rawRequest(path, options);
  }

  const isCsv = res.headers.get('content-type')?.includes('text/csv');
  if (isCsv) {
    if (!res.ok) throw new Error('Request failed');
    return res.blob();
  }

  const data = res.status === 204 ? null : await res.json().catch(() => null);
  const silent = path.startsWith(SILENT_PREFIX) || options.silent;
  if (!res.ok) {
    // The backend's error messages are English-only (see frontend/src/i18n/apiErrors.js
    // for why) — translate here, once, so every caller that reads err.message (toasts,
    // inline form errors alike) sees the viewer's own language instead of raw English.
    const rawMessage = data?.message || `Request failed (${res.status})`;
    const message = translateApiError(rawMessage, i18n.global.locale.value);
    if (!silent) showToast(message, 'error');
    throw new Error(message);
  }
  if (!silent && options.method && options.method !== 'GET') {
    const key = options.method === 'DELETE' ? 'toast.deleted' : 'toast.saved';
    showToast(i18n.global.t(key), 'success');
  }
  return data;
}

export const api = {
  get: (path, params) => apiRequest(path, { method: 'GET', params }),
  post: (path, body, params, options) => apiRequest(path, { method: 'POST', body, params, ...options }),
  put: (path, body) => apiRequest(path, { method: 'PUT', body }),
  patch: (path, body, options) => apiRequest(path, { method: 'PATCH', body, ...options }),
  del: (path) => apiRequest(path, { method: 'DELETE' }),
  upload: (path, formData) => apiRequest(path, { method: 'POST', body: formData, isFormData: true }),
};
