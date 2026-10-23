import { API_BASE, apiFetch } from './http.js';

export async function convertDesigns({ desktop, tablet, mobile, options }) {
  const body = new FormData();
  if (desktop) body.append('desktop', desktop);
  if (tablet) body.append('tablet', tablet);
  if (mobile) body.append('mobile', mobile);
  body.append('options', JSON.stringify(options));
  const res = await apiFetch('/convert', { method: 'POST', body });
  return res.blob();
}

export async function fetchHistory() {
  const res = await apiFetch('/history');
  return res.json();
}

export async function fetchAdminDashboard() {
  const res = await apiFetch('/auth/admin/dashboard');
  return res.json();
}

export const downloadUrl = (id) => `${API_BASE}/history/${id}/download`;

export async function previewLayerFile(file) {
  if (file.size > 128 * 1024 * 1024) throw new Error('Choose a layer JSON file smaller than 128 MB.');
  const layers = await file.text();
  let design;
  try { design = JSON.parse(layers); }
  catch { throw new Error('This JSON file is incomplete or invalid. Export it again from the Figma plugin.'); }
  if (!['figma-to-tailwind', 'figma-to-tailwind-packed'].includes(design?.format) || design.version !== 1 || !design.frame) {
    throw new Error('Upload the complete layer JSON from the Frame to Code plugin.');
  }
  const res = await apiFetch('/layers/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ layers }),
  });
  return res.json();
}
