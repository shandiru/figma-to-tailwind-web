export function resolveApiBase({ production, configured } = {}) {
  // Keep HttpOnly cookies first-party even with a stale absolute deployment URL.
  if (production) return '/api';
  return (configured?.trim() || '/api').replace(/\/$/, '');
}
