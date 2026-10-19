const BASE = import.meta.env.VITE_API_URL || '/api';

async function toError(res) {
  try {
    return new Error((await res.json()).error || `Request failed (${res.status})`);
  } catch {
    return new Error(`Request failed (${res.status})`);
  }
}

export async function convertDesigns({ desktop, mobile, options }) {
  const body = new FormData();
  if (desktop) body.append('desktop', desktop);
  if (mobile) body.append('mobile', mobile);
  body.append('options', JSON.stringify(options));
  const res = await fetch(`${BASE}/convert`, { method: 'POST', body });
  if (!res.ok) throw await toError(res);
  return res.blob();
}

export async function fetchHistory() {
  const res = await fetch(`${BASE}/history`);
  if (!res.ok) throw await toError(res);
  return res.json();
}

export const downloadUrl = (id) => `${BASE}/history/${id}/download`;
