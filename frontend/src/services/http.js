import { resolveApiBase } from './apiConfig.js';

export const API_BASE = resolveApiBase({ production: import.meta.env.PROD, configured: import.meta.env.VITE_API_URL });
let csrfToken = '';
let sessionRevision = 0;
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
  const revision = ['login', 'verify-email', 'logout'].includes(action) ? ++sessionRevision : sessionRevision;
  const response = await apiFetch(`/auth/${action}`, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (response.status === 204) { if (revision === sessionRevision) setCsrfToken(''); return null; }
  const result = await response.json();
  if (result.csrfToken && revision === sessionRevision) setCsrfToken(result.csrfToken);
  if (action === 'login' || action === 'verify-email') {
    // Confirm the browser kept the cookie before opening the workspace.
    try { return await authRequest('me'); }
    catch (error) {
      if (revision === sessionRevision) setCsrfToken('');
      if (error.status === 401) throw new Error('Your browser could not keep the sign-in session. Allow cookies for this site and try again.');
      throw error;
    }
  }
  return result;
}
