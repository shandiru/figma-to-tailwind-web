import { ApiError } from '../utils/ApiError.js';

export function parseFigmaUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ApiError(400, 'Paste a valid Figma design link.'); }
  const match = url.pathname.match(/^\/(?:design|file|proto)\/([a-zA-Z0-9]+)(?:\/|$)/);
  if (!['figma.com', 'www.figma.com'].includes(url.hostname) || url.protocol !== 'https:' || !match) {
    throw new ApiError(400, 'Use an https://www.figma.com/design/… or /file/… link.');
  }
  return { key: match[1], nodeId: url.searchParams.get('node-id')?.replace(/-/g, ':') };
}

export function createFigmaClient(token, request = fetch) {
  if (typeof token !== 'string' || !token.trim() || token.length > 500 || /[\r\n]/.test(token)) {
    throw new ApiError(400, 'Enter a Figma personal access token with file_content:read permission.');
  }
  return async path => {
    let response;
    try { response = await request(`https://api.figma.com/v1/${path}`, { headers: { 'X-Figma-Token': token.trim() }, signal: AbortSignal.timeout(45000) }); }
    catch { throw new ApiError(502, 'Figma did not respond. Please try again.'); }
    if (!response.ok) {
      const messages = { 403: 'Figma access denied. Check your token, its expiry and file permissions.', 404: 'Figma file or frame not found. Check the link and your access.', 429: 'Figma rate limit reached. Wait before trying again.' };
      throw new ApiError(response.status === 429 ? 429 : 400, messages[response.status] || 'Unable to read this Figma file.');
    }
    return response.json();
  };
}

export async function listFigmaFrames({ url, token }, request = fetch) {
  const { key, nodeId } = parseFigmaUrl(url);
  const api = createFigmaClient(token, request);
  const file = await api(`files/${key}?depth=3`);
  const frames = [];
  for (const page of file.document?.children || []) {
    const walk = nodes => {
      for (const node of nodes || []) {
        if (node.visible === false) continue;
        if (['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(node.type) && node.absoluteBoundingBox) {
          frames.push({ id: node.id, name: node.name, page: page.name, width: node.absoluteBoundingBox.width, height: node.absoluteBoundingBox.height });
        } else walk(node.children);
      }
    };
    walk(page.children);
  }
  return { name: file.name, frames, selectedNodeId: nodeId || null };
}

const color = (c, opacity = 1) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${(c.a ?? 1) * opacity})`;

export function figmaTextCss(style = {}, fills = []) {
  const css = {};
  for (const [source, target] of [['fontFamily', 'font-family'], ['fontWeight', 'font-weight']]) if (style[source] != null) css[target] = String(style[source]);
  for (const [source, target] of [['fontSize', 'font-size'], ['letterSpacing', 'letter-spacing']]) if (style[source] != null) css[target] = `${style[source]}px`;
  if (style.lineHeightUnit === 'PIXELS' && style.lineHeightPx) css['line-height'] = `${style.lineHeightPx}px`;
  else if (style.lineHeightPercentFontSize && style.lineHeightUnit !== 'INTRINSIC_%') css['line-height'] = `${style.lineHeightPercentFontSize}%`;
  if (style.textAlignHorizontal) css['text-align'] = style.textAlignHorizontal.toLowerCase();
  if (style.italic) css['font-style'] = 'italic';
  if (style.textDecoration) css['text-decoration'] = style.textDecoration.toLowerCase().replace('strikethrough', 'line-through');
  const fill = fills.find(p => p.visible !== false && p.type === 'SOLID');
  if (fill) css.color = color(fill.color, fill.opacity);
  return css;
}

// Download only assets returned by Figma, never user-supplied URLs.
async function artwork(url, request) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !/(^|\.)(figma\.com|amazonaws\.com)$/.test(parsed.hostname)) throw new ApiError(502, 'Figma returned an unsupported asset host.');
  const response = await request(url, { signal: AbortSignal.timeout(45000), redirect: 'error' });
  if (!response.ok) throw new ApiError(502, 'Could not download Figma artwork. Try importing again.');
  let size = 0;
  const parts = [];
  for await (const part of response.body) {
    size += part.length;
    if (size > 24 * 1024 * 1024) throw new ApiError(413, 'A Figma artwork exceeds 24 MB. Use the plugin for this frame.');
    parts.push(part);
  }
  return Buffer.concat(parts).toString('base64');
}

export async function importFigmaFrames({ url, token, desktopId, tabletId, mobileId }, request = fetch) {
  const { key } = parseFigmaUrl(url);
  const ids = [...new Set([desktopId, tabletId, mobileId].filter(Boolean))];
  if (!ids.length || ids.some(id => typeof id !== 'string' || !/^\d+:\d+$/.test(id))) throw new ApiError(400, 'Select a desktop, tablet, or mobile frame.');
  const api = createFigmaClient(token, request);
  const response = await api(`files/${key}/nodes?ids=${encodeURIComponent(ids.join(','))}&geometry=paths`);
  const leaves = [];
  let count = 0;
  const collect = (node, depth = 0) => {
    if (node.visible === false) return;
    if (++count > 6000 || depth > 50) throw new ApiError(400, 'Select a smaller frame (maximum 6,000 layers and 50 levels).');
    if (node.type !== 'TEXT' && !node.children?.length) leaves.push(node.id);
    for (const child of node.children || []) collect(child, depth + 1);
  };
  for (const id of ids) {
    const node = response.nodes?.[id]?.document;
    if (!node || !['FRAME', 'COMPONENT', 'INSTANCE', 'GROUP'].includes(node.type)) throw new ApiError(400, 'Select a frame, component or group.');
    collect(node);
  }
  const assets = {};
  let assetBytes = 0;
  const download = async url => {
    const data = await artwork(url, request);
    assetBytes += data.length;
    if (assetBytes > 48 * 1024 * 1024) throw new ApiError(413, 'Selected artwork exceeds 48 MB. Import a smaller frame or use the plugin.');
    return data;
  };
  for (let i = 0; i < leaves.length; i += 50) {
    const rendered = await api(`images/${key}?ids=${encodeURIComponent(leaves.slice(i, i + 50).join(','))}&format=png&scale=2`);
    for (const id of leaves.slice(i, i + 50)) {
      if (!rendered.images?.[id]) throw new ApiError(502, 'Figma could not render an artwork layer. Use the plugin or try again.');
      assets[id] = await download(rendered.images[id]);
    }
  }
  let fillImages;
  const imageCache = new Map();
  const warnings = new Set(['Direct import preserves measured layers. Check custom fonts, masks, rotations and image crops against Figma; use the plugin for complex designs.']);
  const map = async (node, parentBox, root = false) => {
    const box = node.absoluteBoundingBox;
    if (node.visible === false || !box) return null;
    const renderedLeaf = assets[node.id];
    const bounds = renderedLeaf ? node.absoluteRenderBounds || box : box;
    const layer = { name: node.name, type: node.type, width: bounds.width, height: bounds.height, x: root ? 0 : bounds.x - parentBox.x, y: root ? 0 : bounds.y - parentBox.y, clipsContent: node.clipsContent, css: {} };
    if (renderedLeaf) return { ...layer, asset: renderedLeaf };
    if (!root && node.relativeTransform && node.size) {
      layer.transform = node.relativeTransform;
      layer.width = node.size.x;
      layer.height = node.size.y;
    }
    const fills = (node.fills || []).filter(p => p.visible !== false);
    const solid = fills.find(p => p.type === 'SOLID');
    if (solid) layer.css[node.type === 'TEXT' ? 'color' : 'background'] = color(solid.color, solid.opacity);
    if (node.opacity != null) layer.css.opacity = String(node.opacity);
    if (node.cornerRadius) layer.css['border-radius'] = `${node.cornerRadius}px`;
    const shadows = (node.effects || []).filter(effect => effect.visible !== false && ['DROP_SHADOW', 'INNER_SHADOW'].includes(effect.type));
    if (shadows.length) layer.css['box-shadow'] = shadows.map(effect => `${effect.type === 'INNER_SHADOW' ? 'inset ' : ''}${effect.offset.x}px ${effect.offset.y}px ${effect.radius}px ${effect.spread || 0}px ${color(effect.color)}`).join(', ');
    if (node.rectangleCornerRadii) ['top-left', 'top-right', 'bottom-right', 'bottom-left'].forEach((side, i) => { layer.css[`border-${side}-radius`] = `${node.rectangleCornerRadii[i]}px`; });
    const stroke = node.strokes?.find(p => p.visible !== false && p.type === 'SOLID');
    if (stroke) Object.assign(layer.css, { 'border-color': color(stroke.color, stroke.opacity), 'border-width': `${node.strokeWeight || 0}px`, 'border-style': 'solid' });
    if (node.type === 'TEXT') {
      Object.assign(layer.css, figmaTextCss(node.style, fills));
      layer.text = node.characters;
      layer.verticalAlign = node.style?.textAlignVertical;
      layer.textAutoResize = node.style?.textAutoResize;
      layer.paragraphSpacing = node.style?.paragraphSpacing;
      if (node.characterStyleOverrides?.length) {
        layer.segments = [];
        // Figma offsets use UTF-16 code units, matching JavaScript indexing.
        for (let i = 0; i < node.characters.length;) {
          const id = node.characterStyleOverrides[i] || 0;
          let end = i + 1;
          while (end < node.characters.length && (node.characterStyleOverrides[end] || 0) === id) end++;
          const override = node.styleOverrideTable?.[id] || {};
          layer.segments.push({ text: node.characters.slice(i, end), css: figmaTextCss({ ...node.style, ...override }, override.fills || fills) });
          i = end;
        }
      }
    } else {
      const image = fills.find(p => p.type === 'IMAGE');
      if (image?.imageRef) {
        fillImages ??= api(`files/${key}/images`);
        const src = (await fillImages).meta?.images?.[image.imageRef];
        if (!src) throw new ApiError(502, 'A Figma image fill is unavailable. Try the plugin export.');
        if (!imageCache.has(image.imageRef)) imageCache.set(image.imageRef, await download(src));
        layer.backgroundImage = imageCache.get(image.imageRef);
        layer.backgroundMode = image.scaleMode === 'FIT' ? 'FIT' : 'FILL';
      }
      const gradient = fills.find(p => p.type === 'GRADIENT_LINEAR');
      if (gradient?.gradientHandlePositions?.length >= 2) {
        const [a, b] = gradient.gradientHandlePositions;
        const angle = Math.atan2((b.y - a.y) * layer.height, (b.x - a.x) * layer.width) * 180 / Math.PI + 90;
        layer.css.background = `linear-gradient(${angle}deg,${gradient.gradientStops.map(stop => `${color(stop.color, gradient.opacity)} ${stop.position * 100}%`).join(',')})`;
      }
      if (fills.some(p => p.type.startsWith('GRADIENT') && p.type !== 'GRADIENT_LINEAR')) warnings.add('Nonlinear container gradients need review. Use the plugin to preserve computed gradient styles.');
      layer.children = [];
      for (const child of node.children || []) {
        const mapped = await map(child, box);
        if (mapped) layer.children.push(mapped);
      }
    }
    return layer;
  };
  const result = {};
  for (const [label, id] of [['desktop', desktopId], ['tablet', tabletId], ['mobile', mobileId]]) if (id) result[label] = { format: 'figma-to-tailwind', version: 1, frame: await map(response.nodes[id].document, null, true), warnings: [...warnings] };
  return result;
}
