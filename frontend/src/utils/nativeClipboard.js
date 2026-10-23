import { figmaPayload } from './figmaClipboard.js';

export function snapshotTransfer(transfer) {
  const types = [...(transfer?.types || [])];
  const values = [];
  for (const type of new Set(['text/html', 'text/plain', ...types.filter(type => /figma/i.test(type))])) {
    const text = transfer?.getData(type) || '';
    if (text) { values.push(text); if (!types.includes(type)) types.push(type); }
  }
  if (transfer?.files?.length && !types.includes('Files')) types.push('Files');
  return { types, values };
}

export function clipboardInput(values) {
  for (const value of values) {
    const payload = figmaPayload(value);
    if (payload) return { html: `<!--(figma)${payload}(/figma)-->` };
  }
  for (const value of values) {
    if (!value.trim().startsWith('{')) continue;
    try {
      const data = JSON.parse(value);
      if (['figma-to-tailwind', 'figma-to-tailwind-packed'].includes(data.format) && data.version === 1 && data.frame) return { layers: value };
    } catch { /* Other plain text does not establish a layer export. */ }
  }
  return null;
}

export async function readOriginalClipboard(clipboard) {
  if (!clipboard?.read) throw new Error('Your browser does not support the paste button. Focus the paste area and press Ctrl/Cmd+V.');
  let items;
  try { items = await clipboard.read({ unsanitized: ['text/html'] }); }
  catch (error) {
    if (!['TypeError', 'NotSupportedError'].includes(error.name)) throw error;
    items = await clipboard.read();
  }
  const types = [];
  const values = [];
  for (const item of items) for (const type of item.types) {
    if (!types.includes(type)) types.push(type);
    if (['text/html', 'text/plain'].includes(type) || /figma/i.test(type)) values.push(await (await item.getType(type)).text());
  }
  return { types, values };
}

export function clipboardProblem({ types, values }) {
  if (types.some(type => /^image\//.test(type)) || types.includes('Files') && !values.length) return 'The browser provided an image without editable Figma layers. Copy the selected frame with normal Copy in Figma, wait for copying to finish, then use Ctrl/Cmd+V here.';
  if (values.some(value => /^https?:\/\//i.test(value.trim()))) return 'The clipboard contains a link. Select the frame on the Figma canvas and copy the object, then paste here.';
  if (types.includes('text/html')) return 'The browser provided HTML, but the Figma layer payload is missing. Try Read original clipboard below. If it is still missing, copy the selected frame again in Figma or use the plugin’s Copy layers.';
  if (values.length) return 'Only text reached the app. In Figma, exit text editing, select the frame in the Layers panel and copy it. Then paste here, or use the plugin’s Copy layers.';
  return 'No readable design data reached the app. Focus this window and press Ctrl/Cmd+V after copying a frame in Figma.';
}
