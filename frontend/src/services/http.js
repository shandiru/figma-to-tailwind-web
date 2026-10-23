export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
let csrfToken = '';
export const setCsrfToken = value => { csrfToken = value || ''; };

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers);
  if (csrfToken && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase())) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    let message = `Request failed (${response.status}). Please try again.`;
    if (response.status === 413) message = 'This upload exceeds the server size limit. On Vercel, requests must be smaller than 4.5 MB. Export a smaller section.';
    try { message = (await response.json()).error || message; } catch { /* Hosting errors may be plain text. */ }
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth:expired'));
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response;
}
export async function authRequest(action, data) {
  const response = await apiFetch(`/auth/${action}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (response.status === 204) { setCsrfToken(''); return null; }
  const result = await response.json();
  if (result.csrfToken) setCsrfToken(result.csrfToken);
  return result;
}
