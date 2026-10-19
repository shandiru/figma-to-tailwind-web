/** Accept the structured layer data produced by the included Figma plugin. */
export function fileFromTransfer(dt) {
  const files = [...(dt.files || [])];
  const json = files.find(file => file.type === 'application/json' || /\.json$/i.test(file.name));
  if (json) return new File([json], json.name, { type: 'application/json' });
  const text = (dt.getData('text/plain') || '').trim();
  if (text.startsWith('{')) {
    let data;
    try { data = JSON.parse(text); } catch {
      throw new Error('The copied layer data is incomplete. Export and copy the frame again from the plugin.');
    }
    if (['figma-to-tailwind', 'figma-to-tailwind-packed'].includes(data.format) && data.version === 1 && data.frame) {
      return new File([text], 'figma-layers.json', { type: 'application/json' });
    }
  }
  if (text || dt.getData('text/html') || files.length || [...(dt.items || [])].some(item => item.kind === 'file')) {
    throw new Error('Use the Frame to Code plugin > Export selected frame > Copy layers, then paste here. Normal Figma copy and screenshots do not contain the editable layer data this converter needs.');
  }
  return null;
}
