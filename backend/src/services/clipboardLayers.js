import { createHash } from 'node:crypto';
import { vectorNetworkPaths } from './vectorNetworkService.js';

const idOf = guid => guid ? `${guid.sessionID}:${guid.localID}` : '';
const numeric = (v, fallback = 0) => Number.isFinite(v) && Math.abs(v) <= 100000 ? v : fallback;
const rgba = (c, opacity = 1) => `rgba(${Math.round((c?.r || 0) * 255)},${Math.round((c?.g || 0) * 255)},${Math.round((c?.b || 0) * 255)},${(c?.a ?? 1) * opacity})`;
const visiblePaints = paints => (paints || []).filter(p => p.visible !== false);

export function pathFromBlob(bytes) {
  const data = Buffer.from(bytes);
  const commands = [];
  for (let i = 0; i < data.length;) {
    const opcode = data[i++];
    const command = { 0: ['Z', 0], 1: ['M', 2], 2: ['L', 2], 3: ['Q', 4], 4: ['C', 6] }[opcode];
    if (!command || i + command[1] * 4 > data.length) throw new Error('Unsupported vector path.');
    const points = [];
    for (let n = 0; n < command[1]; n++, i += 4) {
      const point = data.readFloatLE(i);
      if (!Number.isFinite(point) || Math.abs(point) > 1000000) throw new Error('Invalid vector path.');
      points.push(Math.round(point * 10000) / 10000);
    }
    commands.push(`${command[0]}${points.join(' ')}`);
  }
  return commands.join(' ');
}

function textCss(node) {
  const css = { 'line-height': 'normal' };
  if (node.fontName?.family) css['font-family'] = node.fontName.family;
  const style = node.fontName?.style || '';
  css['font-weight'] = String(node.fontWeight || (/black|heavy/i.test(style) ? 900 : /extrabold/i.test(style) ? 800 : /semibold|demibold/i.test(style) ? 600 : /bold/i.test(style) ? 700 : /medium/i.test(style) ? 500 : /light/i.test(style) ? 300 : 400));
  if (/italic/i.test(style)) css['font-style'] = 'italic';
  if (node.fontSize != null) css['font-size'] = `${numeric(node.fontSize, 16)}px`;
  for (const [key, field] of [['line-height', node.lineHeight], ['letter-spacing', node.letterSpacing]]) {
    if (field?.units === 'PIXELS') css[key] = `${numeric(field.value)}px`;
    else if (field?.units === 'PERCENT') css[key] = key === 'letter-spacing' ? `${numeric(field.value) / 100 * (node.fontSize || 16)}px` : `${numeric(field.value)}%`;
  }
  if (node.textAlignHorizontal) css['text-align'] = node.textAlignHorizontal.toLowerCase().replace('justified', 'justify');
  if (node.textDecoration && node.textDecoration !== 'NONE') css['text-decoration'] = node.textDecoration.toLowerCase().replace('strikethrough', 'line-through');
  if (['UPPER', 'LOWER'].includes(node.textCase)) css['text-transform'] = node.textCase === 'UPPER' ? 'uppercase' : 'lowercase';
  const fill = visiblePaints(node.fillPaints).find(p => p.type === 'SOLID');
  if (fill) css.color = rgba(fill.color, fill.opacity);
  return css;
}

/** Rebuild copied layer hierarchy and retain only local, editable scene data. */
export function clipboardLayers(message) {
  if (!Array.isArray(message.nodeChanges) || message.nodeChanges.length > 6000) throw new Error('Copy a design with at most 6,000 layers.');
  const nodes = new Map();
  for (const node of message.nodeChanges) {
    if (node.guid && node.phase !== 'REMOVED') nodes.set(idOf(node.guid), node);
  }
  const children = new Map();
  const roots = [];
  for (const [id, node] of nodes) {
    const parent = idOf(node.parentIndex?.guid);
    if (parent === id) throw new Error('Invalid clipboard hierarchy.');
    if (nodes.has(parent)) {
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(node);
    } else roots.push(node);
  }
  for (const list of children.values()) list.sort((a, b) => {
    const left = a.parentIndex?.position || '';
    const right = b.parentIndex?.position || '';
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const warnings = new Set();
  const issues = [];
  const assets = {};
  const assetIds = new Map();
  const asset = bytes => {
    const encoded = Buffer.from(bytes).toString('base64');
    if (!assetIds.has(encoded)) {
      const id = `clipboard-${assetIds.size + 1}`;
      assetIds.set(encoded, id); assets[id] = encoded;
    }
    return { assetId: assetIds.get(encoded) };
  };
  const blob = index => message.blobs?.[index - (message.blobBaseIndex || 0)]?.bytes;
  const imageBlobs = new Map();
  for (const entry of message.blobs || []) if (entry.bytes?.length) {
    const bytes = Buffer.from(entry.bytes);
    // Images can be referenced by hash without a dataBlob index in the paint.
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes[0] === 255 && bytes[1] === 216 || bytes.toString('ascii', 0, 4) === 'RIFF' || bytes.toString('ascii', 0, 3) === 'GIF') {
      imageBlobs.set(createHash('sha1').update(bytes).digest('hex'), bytes);
    }
  }
  const referencedSymbols = new Set([...nodes.values()].filter(node => node.type === 'INSTANCE').map(node => idOf(node.overriddenSymbolID || node.symbolData?.symbolID)));
  let expandedCount = 0;
  const map = (original, depth = 0, context = { overrides: new Map(), scope: '', ancestors: new Set() }) => {
    if (depth > 50) throw new Error('Copy a design with fewer than 50 nested levels.');
    if (++expandedCount > 6000) throw new Error('Expanded components exceed 6,000 layers. Copy a smaller section.');
    const sourceId = idOf(original.guid);
    if (context.ancestors.has(sourceId)) throw new Error('Invalid clipboard component hierarchy.');
    const identity = idOf(original.overrideKey || original.guid);
    const node = { ...original };
    for (const record of context.overrides.get(identity) || []) {
      for (const [key, value] of Object.entries(record)) {
        if (!['guid', 'parentIndex', 'guidPath', 'overrideKey'].includes(key)) node[key] = value;
      }
    }
    const id = context.scope ? `${context.scope}/${sourceId}` : sourceId;
    if (node.visible === false || node.internalOnly || ['VARIABLE', 'VARIABLE_SET', 'SLICE'].includes(node.type)) return [];
    const ancestors = new Set(context.ancestors); ancestors.add(sourceId);
    let childNodes = children.get(sourceId) || [];
    let childContext = { ...context, ancestors };
    if (node.type === 'INSTANCE') {
      const symbol = nodes.get(idOf(node.overriddenSymbolID || node.symbolData?.symbolID));
      const overrides = new Map();
      const append = (key, record) => { if (key) overrides.set(key, [...(overrides.get(key) || []), record]); };
      for (const record of [...(node.symbolData?.symbolOverrides || []), ...(node.derivedSymbolData || [])]) {
        append((record.guidPath?.guids || []).map(idOf).join('/'), record);
      }
      for (const [key, records] of context.overrides) if (key.startsWith(`${identity}/`)) {
        for (const record of records) append(key.slice(identity.length + 1), record);
      }
      if (!childNodes.length && symbol) {
        if (ancestors.has(idOf(symbol.guid))) throw new Error('Invalid clipboard component hierarchy.');
        ancestors.add(idOf(symbol.guid));
        childNodes = children.get(idOf(symbol.guid)) || [];
      }
      childContext = { overrides, scope: id, ancestors };
    }
    const childLayers = childNodes.flatMap(child => map(child, depth + 1, childContext));
    if (['DOCUMENT', 'CANVAS'].includes(node.type) || !node.size) return childLayers;
    const width = numeric(node.size.x);
    const height = numeric(node.size.y);
    if (width < 0 || height < 0 || ((width === 0 || height === 0) && !childLayers.length)) return [];
    const m = node.transform || {};
    const transform = [[numeric(m.m00, 1), numeric(m.m01), numeric(m.m02)], [numeric(m.m10), numeric(m.m11, 1), numeric(m.m12)]];
    const layer = { id, name: node.name || node.type, type: node.type === 'SYMBOL' ? 'COMPONENT' : node.type, width, height, x: transform[0][2], y: transform[1][2], transform, css: {}, children: childLayers };
    const missing = (kind, message) => {
      warnings.add(message);
      const issue = { id, name: layer.name, kind, message };
      issues.push(issue); (layer.importIssues ??= []).push(issue);
    };
    if (['FRAME', 'SYMBOL', 'INSTANCE'].includes(node.type)) layer.clipsContent = !node.frameMaskDisabled;
    if (node.opacity != null) layer.css.opacity = String(node.opacity);
    if (node.cornerRadius) layer.css['border-radius'] = `${numeric(node.cornerRadius)}px`;
    for (const [side, field] of [['top-left', 'TopLeft'], ['top-right', 'TopRight'], ['bottom-right', 'BottomRight'], ['bottom-left', 'BottomLeft']]) {
      const value = node[`rectangle${field}CornerRadius`];
      if (value != null) layer.css[`border-${side}-radius`] = `${numeric(value)}px`;
    }
    if (node.type === 'ELLIPSE') layer.css['border-radius'] = '50%';
    const fills = visiblePaints(node.fillPaints || node.backgroundPaints);
    const solid = fills.find(p => p.type === 'SOLID');
    if (solid && node.type !== 'TEXT') layer.css.background = rgba(solid.color, solid.opacity);
    else if (node.backgroundColor && node.backgroundEnabled !== false) layer.css.background = rgba(node.backgroundColor, node.backgroundOpacity);
    const gradient = fills.find(p => p.type === 'GRADIENT_LINEAR');
    if (gradient?.stops?.length && node.type !== 'TEXT') {
      const t = gradient.transform || {};
      const angle = Math.atan2(numeric(t.m10), numeric(t.m00, 1)) * 180 / Math.PI + 90;
      layer.css.background = `linear-gradient(${angle}deg,${gradient.stops.map(stop => `${rgba(stop.color, gradient.opacity)} ${stop.position * 100}%`).join(',')})`;
    }
    const stroke = visiblePaints(node.strokePaints).find(p => p.type === 'SOLID');
    if (stroke) Object.assign(layer.css, { 'border-color': rgba(stroke.color, stroke.opacity), 'border-width': `${numeric(node.strokeWeight, 1)}px`, 'border-style': 'solid' });
    const shadows = (node.effects || []).filter(e => e.visible !== false && ['INNER_SHADOW', 'DROP_SHADOW'].includes(e.type));
    if (shadows.length) layer.css['box-shadow'] = shadows.map(e => `${e.type === 'INNER_SHADOW' ? 'inset ' : ''}${numeric(e.offset?.x)}px ${numeric(e.offset?.y)}px ${numeric(e.radius)}px ${numeric(e.spread)}px ${rgba(e.color)}`).join(',');
    const image = fills.find(p => p.type === 'IMAGE');
    if (image) {
      const imageBytes = reference => {
        const hash = reference?.hash ? Buffer.from(reference.hash).toString('hex') : '';
        return (reference?.dataBlob != null ? blob(reference.dataBlob) : null) || imageBlobs.get(hash);
      };
      const originalBytes = imageBytes(image.image);
      const bytes = originalBytes?.length ? originalBytes : imageBytes(image.imageThumbnail);
      if (bytes?.length) {
        layer.backgroundImage = asset(bytes);
        layer.backgroundMode = image.imageScaleMode === 'FIT' ? 'FIT' : image.imageScaleMode === 'STRETCH' ? 'EXACT' : 'FILL';
        if (!originalBytes?.length) missing('image-resolution', `Recovered the clipboard thumbnail for "${layer.name}". The original image is unavailable, so this image may look less sharp.`);
      } else missing('image', `No original image or thumbnail bytes were found for "${layer.name}" in the clipboard.`);
    }
    if (node.type === 'TEXT') {
      delete layer.children;
      layer.text = node.textData?.characters || '';
      Object.assign(layer.css, textCss(node));
      layer.verticalAlign = node.textAlignVertical;
      layer.textAutoResize = node.textAutoResize;
      layer.paragraphSpacing = node.paragraphSpacing;
      const styles = node.textData?.characterStyleIDs;
      const iconFont = /font\s*awesome|material\s*(icons|symbols)|iconfont|icomoon|ionicons|glyphicons/i.test(node.fontName?.family || '') || /[\uE000-\uF8FF]/.test(layer.text);
      if (iconFont) {
        try {
          const glyphs = node.derivedTextData?.glyphs || node.textData?.glyphs || [];
          if (!glyphs.length) throw new Error('No glyph outlines.');
          const paths = glyphs.map(glyph => {
            const bytes = blob(glyph.commandsBlob);
            if (!bytes) throw new Error('Missing glyph outline.');
            const override = node.textData?.styleOverrideTable?.find(style => style.styleID === glyph.styleID);
            const paint = visiblePaints(override?.fillPaints || node.fillPaints).find(p => p.type === 'SOLID');
            const size = numeric(glyph.fontSize, numeric(node.fontSize, 16));
            return `<path d="${pathFromBlob(bytes)}" transform="translate(${numeric(glyph.position?.x)} ${numeric(glyph.position?.y)}) scale(${size} ${-size})" fill="${paint ? rgba(paint.color, paint.opacity) : '#000'}"/>`;
          });
          layer.asset = asset(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`));
          layer.type = 'VECTOR'; delete layer.text;
          return [layer];
        } catch { missing('icon', `Icon font artwork "${layer.name}" needs glyph outlines or the Figma plugin. The browser may display boxes instead of these icons.`); }
      }
      if (styles?.length) {
        layer.segments = [];
        const overrides = new Map((node.textData.styleOverrideTable || []).map(o => [o.styleID, o]));
        for (let i = 0; i < layer.text.length;) {
          const style = styles[i] || 0;
          let end = i + 1;
          while (end < layer.text.length && (styles[end] || 0) === style) end++;
          layer.segments.push({ text: layer.text.slice(i, end), css: textCss({ ...node, ...overrides.get(style) }) });
          i = end;
        }
      }
    } else if (['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'REGULAR_POLYGON', 'LINE'].includes(node.type)) {
      try {
        const paths = [];
        const paintsFor = (styleID, fallback) => {
          const override = node.vectorData?.styleOverrideTable?.find(style => style.styleID === styleID);
          return visiblePaints(override && Object.hasOwn(override, 'fillPaints') ? override.fillPaints : fallback);
        };
        const fillFor = paints => {
          const paint = paints.find(p => p.type === 'SOLID');
          if (paints.length && !paint) throw new Error('Unsupported vector paint.');
          return paint ? rgba(paint.color, paint.opacity) : 'none';
        };
        for (const [geometry, paints] of [[node.fillGeometry, fills], [node.strokeGeometry, visiblePaints(node.strokePaints)]]) for (const path of geometry || []) {
          const bytes = blob(path.commandsBlob);
          if (!bytes) throw new Error('Missing vector geometry.');
          paths.push(`<path d="${pathFromBlob(bytes)}" fill="${fillFor(paintsFor(path.styleID, paints))}" fill-rule="${path.windingRule === 'ODD' ? 'evenodd' : 'nonzero'}"/>`);
        }
        if (!paths.length && node.vectorData?.vectorNetworkBlob != null) {
          const bytes = blob(node.vectorData.vectorNetworkBlob);
          if (!bytes) throw new Error('Missing vector network.');
          const network = vectorNetworkPaths(bytes);
          if (network.hasVertexStyles) throw new Error('Styled vector vertices require rendered outlines.');
          const normalized = node.vectorData.normalizedSize;
          const sx = normalized?.x > 0 ? width / normalized.x : 1;
          const sy = normalized?.y > 0 ? height / normalized.y : 1;
          const shapes = network.regions.map(region => `<path d="${region.d}" fill="${fillFor(paintsFor(region.styleID, fills))}" fill-rule="${region.windingRule === 'ODD' ? 'evenodd' : 'nonzero'}"/>`);
          if (stroke) shapes.push(...network.strokes.map(d => `<path d="${d}" fill="none" stroke="${rgba(stroke.color, stroke.opacity)}" stroke-width="${numeric(node.strokeWeight, 1) / Math.max(sx, sy)}" stroke-linecap="${node.strokeCap === 'ROUND' ? 'round' : node.strokeCap === 'SQUARE' ? 'square' : 'butt'}"/>`));
          if (shapes.length) paths.push(`<g transform="scale(${sx} ${sy})">${shapes.join('')}</g>`);
        }
        if (!paths.length && ['STAR', 'REGULAR_POLYGON'].includes(node.type)) {
          const count = node.count ?? (node.type === 'STAR' ? 5 : 3);
          if (!Number.isInteger(count) || count < 3 || count > 256) throw new Error('Unsupported polygon.');
          const star = node.type === 'STAR';
          const inner = node.starInnerScale ?? 0.381966;
          if (star && (!Number.isFinite(inner) || inner < 0 || inner > 1)) throw new Error('Invalid star radius.');
          const points = Array.from({ length: count * (star ? 2 : 1) }, (_, index) => {
            const angle = -Math.PI / 2 + index * Math.PI * 2 / (count * (star ? 2 : 1));
            const radius = star && index % 2 ? inner : 1;
            return `${width / 2 + Math.cos(angle) * width / 2 * radius},${height / 2 + Math.sin(angle) * height / 2 * radius}`;
          });
          paths.push(`<polygon points="${points.join(' ')}" fill="${fillFor(fills)}"/>`);
        }
        if (paths.length) {
          layer.asset = asset(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths.join('')}</svg>`));
          delete layer.children; delete layer.css.background; delete layer.css['border-width'];
        } else if (!childLayers.length) throw new Error('Missing vector geometry.');
      } catch {
        // A vector's paint belongs to its path, never to a rectangular HTML box.
        for (const key of Object.keys(layer.css)) if (/^(background|border|box-shadow)/.test(key)) delete layer.css[key];
        missing('vector', `Vector artwork "${layer.name}" is incomplete in this clipboard. Re-copy with the plugin to preserve it.`);
        delete layer.backgroundImage;
      } finally {
        for (const key of Object.keys(layer.css)) if (/^(background|border|box-shadow)/.test(key)) delete layer.css[key];
      }
    }
    if (node.type === 'INSTANCE' && !childLayers.length) missing('component', `The internals of component "${layer.name}" are absent from this clipboard. Use the plugin to copy the complete component.`);
    if (node.mask) warnings.add('This design includes masks. Use the plugin for accurate clipping of masked artwork.');
    if (fills.some(p => !['SOLID', 'GRADIENT_LINEAR', 'IMAGE'].includes(p.type))) warnings.add('Some paint types need the plugin to preserve their appearance.');
    return [layer];
  };
  const layers = roots.filter(node => !(node.type === 'SYMBOL' && referencedSymbols.has(idOf(node.guid)))).flatMap(node => map(node));
  if (!layers.length) throw new Error('No visible design layers found. Copy a frame or section in Figma.');
  let frame;
  if (layers.length === 1) { frame = layers[0]; frame.x = 0; frame.y = 0; delete frame.transform; }
  else {
    const left = Math.min(...layers.map(n => n.x));
    const top = Math.min(...layers.map(n => n.y));
    const right = Math.max(...layers.map(n => n.x + n.width));
    const bottom = Math.max(...layers.map(n => n.y + n.height));
    for (const layer of layers) { layer.x -= left; layer.y -= top; layer.transform[0][2] -= left; layer.transform[1][2] -= top; }
    frame = { id: 'clipboard-selection', name: 'Pasted Figma selection', type: 'FRAME', x: 0, y: 0, width: right - left, height: bottom - top, css: {}, children: layers };
  }
  if (frame.width > 100000 || frame.height > 100000) throw new Error('Copied layers are too far apart. Copy a smaller selection.');
  return { format: 'figma-to-tailwind', version: 1, frame, assets, issues, warnings: [...warnings] };
}
