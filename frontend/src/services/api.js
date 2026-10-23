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

export async function figmaRequest(action, data) {
  const res = await fetch(`${BASE}/figma/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw await toError(res);
  return res.json();
}

export async function pasteFigmaClipboard(input) {
  const res = await fetch(`${BASE}/clipboard`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(typeof input === 'string' ? { html: input } : input),
  });
  if (!res.ok) throw await toError(res);
  return res.json();
}


export async function previewLayerFile(file) {
  if (file.size > 128 * 1024 * 1024) throw new Error('Choose a layer JSON file smaller than 128 MB.');
  const layers = await file.text();
  let design;
  try { design = JSON.parse(layers); }
  catch { throw new Error('This JSON file is incomplete or invalid. Export it again from the Figma plugin.'); }
  if (!['figma-to-tailwind', 'figma-to-tailwind-packed'].includes(design?.format) || design.version !== 1 || !design.frame) {
    throw new Error('Upload the complete layer JSON from the Frame to Code plugin. A paste troubleshooting sample or Figma API JSON is a different format.');
  }
  return pasteFigmaClipboard({ layers });
}
