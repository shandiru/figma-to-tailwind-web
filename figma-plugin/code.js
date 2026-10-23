const EXPORTER_VERSION = '1.14';
figma.showUI(__html__, { width: 440, height: 560, title: `Frame to Code v${EXPORTER_VERSION}` });
let exporting = false;

function errorMessage(error) {
  return error && typeof error.message === 'string' ? error.message : String(error);
}

function rgba(color, opacity) {
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${(color.a === undefined ? 1 : color.a) * (opacity === undefined ? 1 : opacity)})`;
}

async function resolvedPaint(paint, node, state) {
  let color = paint.color;
  const alias = paint.boundVariables && paint.boundVariables.color;
  if (alias && figma.variables && typeof figma.variables.getVariableByIdAsync === 'function') {
    try {
      if (!state.variables.has(alias.id)) state.variables.set(alias.id, await figma.variables.getVariableByIdAsync(alias.id));
      const variable = state.variables.get(alias.id);
      const resolved = variable && variable.resolveForConsumer(node);
      if (resolved && resolved.resolvedType === 'COLOR') color = resolved.value;
    } catch (error) {
      state.warnings.push(`Used the paint color for "${node.name}" because a bound color could not be resolved: ${errorMessage(error)}`);
    }
  }
  // SolidPaint already exposes its effective alpha as opacity. COLOR variable
  // values also have an alpha channel; multiplying both squares transparency.
  return color ? rgba({ r: color.r, g: color.g, b: color.b }, paint.opacity === undefined ? color.a : paint.opacity) : null;
}

async function resolvedStyles(node, state) {
  const css = fallbackStyles(node);
  const paints = Array.isArray(node.fills) ? node.fills.filter(paint => paint.visible !== false) : [];
  // Resolve bound colors in the consuming node's variable mode, including aliases.
  if (paints.length === 1 && paints[0].type === 'SOLID') {
    const color = await resolvedPaint(paints[0], node, state);
    if (color) css[node.type === 'TEXT' ? 'color' : 'background'] = color;
  } else if (paints.some(paint => paint.type.startsWith('GRADIENT'))) {
    delete css.background; // Keep computed gradients instead of replacing them with a solid fallback.
  }
  const stroke = Array.isArray(node.strokes) && node.strokes.find(paint => paint.visible !== false && paint.type === 'SOLID');
  if (stroke) {
    const color = await resolvedPaint(stroke, node, state);
    if (color) css['border-color'] = color;
    css['border-style'] = 'solid';
    if (typeof node.strokeWeight === 'number') css['border-width'] = `${node.strokeWeight}px`;
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    const weight = node[`stroke${side}Weight`];
    if (stroke && typeof weight === 'number') css[`border-${side.toLowerCase()}-width`] = `${weight}px`;
  }
  for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
    const radius = node[corner[0].toLowerCase() + corner.slice(1) + 'Radius'];
    if (typeof radius === 'number') css[`border-${corner.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}-radius`] = `${radius}px`;
  }
  return css;
}

function fallbackStyles(node) {
  const css = {};
  const fills = Array.isArray(node.fills) ? node.fills : [];
  const solid = fills.find(paint => paint.type === 'SOLID' && paint.visible !== false);
  if (solid) {
    const color = solid.color;
    css[node.type === 'TEXT' ? 'color' : 'background'] = `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${solid.opacity === undefined ? 1 : solid.opacity})`;
  }
  if (typeof node.cornerRadius === 'number') css['border-radius'] = `${node.cornerRadius}px`;
  if (typeof node.fontSize === 'number') css['font-size'] = `${node.fontSize}px`;
  if (node.fontName && typeof node.fontName === 'object') css['font-family'] = node.fontName.family;
  if (typeof node.textAlignHorizontal === 'string') css['text-align'] = node.textAlignHorizontal.toLowerCase().replace('justified', 'justify');
  return css;
}

function textStyle(segment) {
  const font = segment.fontName && typeof segment.fontName === 'object' ? segment.fontName : { family: 'Inter', style: 'Regular' };
  const size = typeof segment.fontSize === 'number' ? segment.fontSize : 16;
  const lineHeight = segment.lineHeight || { unit: 'AUTO' };
  const spacing = segment.letterSpacing || { unit: 'PIXELS', value: 0 };
  const style = {
    'font-family': font.family,
    'font-size': `${size}px`,
    'font-style': /italic/i.test(font.style) ? 'italic' : 'normal',
    'font-weight': String(segment.fontWeight || (/bold/i.test(font.style) ? 700 : 400)),
  };
  const fill = Array.isArray(segment.fills) && segment.fills.find(paint => paint.type === 'SOLID' && paint.visible !== false);
  if (fill) style.color = `rgba(${Math.round(fill.color.r * 255)},${Math.round(fill.color.g * 255)},${Math.round(fill.color.b * 255)},${fill.opacity === undefined ? 1 : fill.opacity})`;
  style['line-height'] = lineHeight.unit === 'AUTO' ? 'normal' : `${lineHeight.value}${lineHeight.unit === 'PIXELS' ? 'px' : '%'}`;
  style['letter-spacing'] = `${spacing.unit === 'PIXELS' ? spacing.value : spacing.value * size / 100}px`;
  if (segment.textDecoration === 'UNDERLINE') style['text-decoration'] = 'underline';
  if (segment.textDecoration === 'STRIKETHROUGH') style['text-decoration'] = 'line-through';
  if (segment.textCase === 'UPPER') style['text-transform'] = 'uppercase';
  if (segment.textCase === 'LOWER') style['text-transform'] = 'lowercase';
  return style;
}

function containsText(node) {
  if (node.visible === false) return false;
  return node.type === 'TEXT' || ('children' in node && node.children.some(containsText));
}

function iconText(node) {
  if (node.type !== 'TEXT') return false;
  const font = node.fontName;
  return font && typeof font === 'object' && (/font\s*awesome|material\s*(icons|symbols)|iconfont|icomoon|ionicons|glyphicons/i.test(font.family) || /[\uE000-\uF8FF]/.test(node.characters || ''));
}

async function exportImageFill(node, paint, state) {
  const paints = node.fills.filter(fill => fill.visible !== false);
  // FILL and FIT can also carry an off-centre image transform. Render every
  // image paint through Figma instead of recreating its crop with object-cover.
  const exact = true;
  if (exact && typeof figma.createRectangle === 'function') {
    const key = JSON.stringify({ width: node.width, height: node.height, paints, modes: node.resolvedVariableModes });
    if (state.imageFills.has(key)) return state.imageFills.get(key);
    // Render only the paint, preserving Figma's crop/rotation/filters while the
    // original frame's text and children continue to become editable HTML.
    const temporary = figma.createRectangle();
    try {
      temporary.name = '__frame_to_code_temporary_paint__';
      temporary.resize(node.width, node.height);
      temporary.x = -100000; temporary.y = -100000;
      await inheritVariableModes(node, temporary, state);
      temporary.fills = paints;
      temporary.strokes = [];
      const bytes = await temporary.exportAsync({ format: 'PNG', contentsOnly: true, useAbsoluteBounds: true, constraint: { type: 'SCALE', value: artworkScale(node.width, node.height) } });
      const result = { data: figma.base64Encode(bytes), mode: 'EXACT' };
      state.imageFills.set(key, result);
      return result;
    } finally { temporary.remove(); }
  }
  const image = figma.getImageByHash(paint.imageHash);
  if (!image) throw new Error(`Image fill is unavailable on "${node.name}". Re-link the image in Figma.`);
  if (exact) state.warnings.push(`Image crop on "${node.name}" uses a cover approximation because exact paint export is unavailable.`);
  return { data: figma.base64Encode(await image.getBytesAsync()), mode: paint.scaleMode };
}

// 2x3 affine transforms shared by Figma export and legacy JSON import.

function multiply(a, b) {
  return [
    [a[0][0]*b[0][0]+a[0][1]*b[1][0], a[0][0]*b[0][1]+a[0][1]*b[1][1], a[0][0]*b[0][2]+a[0][1]*b[1][2]+a[0][2]],
    [a[1][0]*b[0][0]+a[1][1]*b[1][0], a[1][0]*b[0][1]+a[1][1]*b[1][1], a[1][0]*b[0][2]+a[1][1]*b[1][2]+a[1][2]],
  ];
}
function inverse(m) {
  const det = m[0][0]*m[1][1]-m[0][1]*m[1][0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('Singular layer transform');
  const a=m[1][1]/det, b=-m[0][1]/det, c=-m[1][0]/det, d=m[0][0]/det;
  return [[a,b,-a*m[0][2]-b*m[1][2]],[c,d,-c*m[0][2]-d*m[1][2]]];
}

function parentTransform(node) {
  const absolute = node.absoluteTransform;
  const parent = node.parent && node.parent.absoluteTransform;
  // absoluteTransform avoids Figma's special container-parent semantics for groups.
  if (absolute && parent) return multiply(inverse(parent), absolute);
  return node.relativeTransform || [[1, 0, 0], [0, 1, 0]];
}

function artworkScale(width, height) {
  return Math.min(2, 8192 / Math.max(width, height, 1), Math.sqrt(16000000 / Math.max(1, width * height)));
}

async function inheritVariableModes(source, target, state) {
  if (typeof target.setExplicitVariableModeForCollection !== 'function') return;
  for (const [collectionId, mode] of Object.entries(source.resolvedVariableModes || {})) {
    if (!state.collections.has(collectionId)) {
      const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
      if (!collection) throw new Error(`Variable collection "${collectionId}" is unavailable. Restore access to its library and export again.`);
      state.collections.set(collectionId, collection);
    }
    // dynamic-page/incremental mode requires the collection object, not its ID.
    target.setExplicitVariableModeForCollection(state.collections.get(collectionId), mode);
  }
}

async function isolatedArtwork(node, layer, state) {
  if (typeof node.clone !== 'function' || typeof figma.createFrame !== 'function') return null;
  const matrix = (layer.transform || [[1, 0, 0], [0, 1, 0]]).map(row => [...row]);
  const width = node.width, height = node.height;
  const stage = figma.createFrame();
  let clone;
  try {
    stage.name = '__frame_to_code_artwork_viewport__';
    stage.x = -100000; stage.y = -100000;
    stage.fills = []; stage.strokes = []; stage.clipsContent = false;
    stage.resize(Math.max(0.01, width), Math.max(0.01, height));
    await inheritVariableModes(node, stage, state);
    clone = node.clone();
    stage.appendChild(clone);
    await inheritVariableModes(node, clone, state);
    if ('constraints' in clone) clone.constraints = { horizontal: 'MIN', vertical: 'MIN' };
    if ((clone.width !== width || clone.height !== height) && typeof clone.resizeWithoutConstraints === 'function') clone.resizeWithoutConstraints(width, height);
    clone.relativeTransform = [[1, 0, 0], [0, 1, 0]];
    // Measure the neutral clone in local coordinates. Exported pixels contain
    // nested effects, but the node's own rotation/skew is applied once in HTML.
    const bounds = clone.absoluteRenderBounds;
    const origin = stage.absoluteTransform;
    if (!bounds || !origin || bounds.width <= 0 || bounds.height <= 0) throw new Error('Artwork has no visible layers after isolation.');
    const x = bounds.x - origin[0][2], y = bounds.y - origin[1][2];
    stage.resize(Math.max(0.01, bounds.width), Math.max(0.01, bounds.height));
    clone.relativeTransform = [[1, 0, -x], [0, 1, -y]];
    stage.clipsContent = true;
    const bytes = await stage.exportAsync({ format: 'PNG', contentsOnly: true, useAbsoluteBounds: true, constraint: { type: 'SCALE', value: artworkScale(bounds.width, bounds.height) } });
    layer.width = bounds.width; layer.height = bounds.height;
    layer.transform = [
      [matrix[0][0], matrix[0][1], matrix[0][2] + matrix[0][0] * x + matrix[0][1] * y],
      [matrix[1][0], matrix[1][1], matrix[1][2] + matrix[1][0] * x + matrix[1][1] * y],
    ];
    return bytes;
  } finally {
    if (clone && !clone.removed) clone.remove();
    stage.remove();
  }
}

async function exportArtwork(node, layer, state, outlineText) {
  const bounds = node.absoluteRenderBounds;
  if (node.opacity === 0 || (bounds && (bounds.width <= 0 || bounds.height <= 0))) {
    state.warnings.push(`Empty artwork "${node.name}" was skipped because it has no visible render bounds.`);
    return null;
  }
  if (state.rasterArtwork) {
    const bytes = await isolatedArtwork(node, layer, state);
    if (bytes) {
      layer.asset = figma.base64Encode(bytes); layer.css = {}; layer.resolvedCss = {};
      return layer;
    }
  }
  const origin = node.absoluteTransform || [[1, 0, 0], [0, 1, 0]];
  const relative = node.relativeTransform || [[1, 0, 0], [0, 1, 0]];
  const parent = node.parent && node.parent.absoluteTransform;
  if (bounds && parent && Math.abs(parent[0][1]) < 0.0001 && Math.abs(parent[1][0]) < 0.0001 && parent[0][0] && parent[1][1]) {
    layer.transform = [[1, 0, (bounds.x - parent[0][2]) / parent[0][0]], [0, 1, (bounds.y - parent[1][2]) / parent[1][1]]];
    layer.width = bounds.width / Math.abs(parent[0][0]);
    layer.height = bounds.height / Math.abs(parent[1][1]);
  } else if (Math.abs(origin[0][1]) > 0.0001 || Math.abs(relative[1][0]) > 0.0001) {
    state.warnings.push(`Rotated artwork "${node.name}" may need position adjustment.`);
  }
  const hasPhoto = Array.isArray(node.fills) && node.fills.some(paint => paint.type === 'IMAGE' && paint.visible !== false);
  const raster = hasPhoto || state.rasterArtwork;
  const pngSettings = { format: 'PNG', constraint: { type: 'SCALE', value: Math.min(2, 8192 / Math.max(layer.width, layer.height, 1), Math.sqrt(16000000 / Math.max(1, layer.width * layer.height))) } };
  let artwork;
  try {
    artwork = await node.exportAsync(raster ? pngSettings : { format: 'SVG', svgOutlineText: Boolean(outlineText) });
  } catch (error) {
    if (!/not have any visible layers|no visible layers/i.test(errorMessage(error))) throw error;
    // Some imported logo/vector nodes have no render bounds and fail SVG export
    // even though Figma can rasterise them. Try PNG before declaring them empty.
    try { artwork = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } }); }
    catch (pngError) {
      if (!/not have any visible layers|no visible layers/i.test(errorMessage(pngError))) throw pngError;
      state.warnings.push(`Artwork "${node.name}" could not be exported as SVG or PNG because Figma found no visible content.`);
      return null;
    }
  }
  if (!artwork || artwork.length === 0) { state.warnings.push(`Empty artwork "${node.name}" was skipped.`); return null; }
  if (!raster) {
    // Figma can export a visible thin stripe with an SVG viewport that rounds
    // to zero pixels in image decoders. Prefer a native PNG when available.
    let header = '';
    for (let index = 0; index < Math.min(artwork.length, 8192); index++) header += String.fromCharCode(artwork[index]);
    const svgRoot = header.match(/<svg\b[^>]*>/i)?.[0];
    const dimensions = svgRoot ? [...svgRoot.matchAll(/\s(?:width|height)\s*=\s*["']\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s*(?:px)?\s*["']/gi)].map(match => Number(match[1])) : [];
    if (dimensions.some(value => !Number.isFinite(value) || value < 0.5)) {
      try {
        const png = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });
        if (png && png.length) {
          artwork = png;
          state.warnings.push(`Thin artwork "${node.name}" was exported as PNG to avoid a zero-sized SVG raster viewport. Layer geometry is unchanged.`);
        }
      } catch {
        // Retain the SVG; the backend can repair its raster viewport using the
        // original viewBox or measured layer size, including already-copied data.
      }
    }
  }
  layer.asset = figma.base64Encode(artwork);
  layer.css = {};
  layer.resolvedCss = {};
  return layer;
}

async function exportLayer(node, root, state, depth) {
  if (node.visible === false) return null;
  if (++state.count > 3000 || depth > 50) throw new Error('This frame is too complex. Export a smaller section (up to 3,000 layers).');
  state.currentLayer = node.name;
  if (state.count === 1 || state.count % 15 === 0) figma.ui.postMessage({ type: 'progress', count: state.count, name: node.name });
  if (node.blendMode && !['NORMAL', 'PASS_THROUGH'].includes(node.blendMode)) state.warnings.push(`Check the blend effect on "${node.name}" in the preview.`);
  const layer = {
    name: node.name, type: node.type, width: node.width, height: node.height,
    transform: root ? [[1, 0, 0], [0, 1, 0]] : parentTransform(node),
    css: {},
    clipsContent: Boolean(node.clipsContent),
  };
  const concrete = await resolvedStyles(node, state);
  try {
    if (typeof node.getCSSAsync === 'function') layer.css = await node.getCSSAsync();
  } catch (error) {
    state.warnings.push(`Computed CSS unavailable for "${node.name}"; basic layer styles used. ${errorMessage(error)}`);
  }
  // Figma's computed CSS may contain var(--token) without definitions or fallbacks.
  // Actual paint/geometry values must win so exported HTML is self-contained.
  layer.css = Object.assign({}, layer.css, concrete);
  layer.resolvedCss = concrete;
  if (typeof node.opacity === 'number') layer.css.opacity = String(node.opacity);
  // Keep masked vector illustrations intact, rather than exporting unrelated
  // mask pieces that can cover or erase the artwork in HTML.
  const maskedArtwork = !root && 'children' in node && node.children.some(child => child.visible !== false && child.isMask) && !containsText(node);
  const graphicGroup = state.rasterArtwork && !root && ['GROUP', 'BOOLEAN_OPERATION', 'INSTANCE', 'COMPONENT'].includes(node.type) && node.children?.length && !containsText(node);
  if (maskedArtwork || graphicGroup || iconText(node)) return exportArtwork(node, layer, state, true);
  if (node.isMask) state.warnings.push(`Mask "${node.name}" contains editable text or crosses container boundaries and may need manual clipping adjustment.`);
  if (node.type === 'TEXT') {
    layer.text = node.characters;
    if (typeof node.paragraphSpacing === 'number') layer.paragraphSpacing = node.paragraphSpacing;
    layer.textAutoResize = node.textAutoResize;
    let segments;
    const fields = ['fontName', 'fontSize', 'fontWeight', 'fills', 'lineHeight', 'letterSpacing', 'textDecoration', 'textCase'];
    try { segments = node.getStyledTextSegments(fields); }
    catch {
      // Older Figma runtimes may not expose fontWeight as a segment field.
      try { segments = node.getStyledTextSegments(fields.filter(field => field !== 'fontWeight')); }
      catch { segments = []; }
    }
    if (!Array.isArray(segments) || segments.map(segment => segment.characters || '').join('') !== node.characters) {
      state.warnings.push(`Text styles on "${node.name}" were unavailable; its complete text was retained with layer styles.`);
      segments = [{ ...node, characters: node.characters, fontName: node.fontName, fontSize: node.fontSize, fills: node.fills, lineHeight: node.lineHeight, letterSpacing: node.letterSpacing }];
    }
    layer.segments = [];
    for (const segment of segments) {
      const css = textStyle(segment);
      const fill = Array.isArray(segment.fills) && segment.fills.find(paint => paint.type === 'SOLID' && paint.visible !== false);
      if (fill) css.color = await resolvedPaint(fill, node, state);
      layer.segments.push({ text: segment.characters, css });
    }
    layer.verticalAlign = node.textAlignVertical;
    state.fonts.push(...layer.segments.map(segment => segment.css['font-family']));
    return layer;
  }
  if ('children' in node) {
    const imageFill = Array.isArray(node.fills) && node.fills.find(paint => paint.type === 'IMAGE' && paint.visible !== false && paint.imageHash);
    if (imageFill) {
      const image = await exportImageFill(node, imageFill, state);
      layer.backgroundImage = image.data;
      layer.backgroundMode = image.mode;
      if (image.mode === 'EXACT') for (const key of ['background', 'background-color', 'background-image']) {
        delete layer.css[key]; delete layer.resolvedCss[key];
      }
    }
    layer.children = [];
    for (const child of [...node.children]) {
      const exported = await exportLayer(child, false, state, depth + 1);
      if (exported) layer.children.push(exported);
    }
  } else return exportArtwork(node, layer, state, false);
  return layer;
}

figma.ui.onmessage = async message => {
  if (message.type === 'ready') {
    figma.ui.postMessage({ type: 'version', version: EXPORTER_VERSION });
    return;
  }
  if (message.type !== 'export' || exporting) return;
  exporting = true;
  const state = { count: 0, fonts: [], warnings: [], currentLayer: '', variables: new Map(), collections: new Map(), imageFills: new Map(), rasterArtwork: Boolean(message.rasterArtwork) };
  try {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1 || !('children' in selection[0])) throw new Error('Select one frame, component, or group in Figma first.');
    const frame = await exportLayer(selection[0], true, state, 0);
    if (!frame) throw new Error('The selected frame is hidden. Make it visible, then export again.');
    state.currentLayer = ''; // Packaging errors apply to the frame, not the last visited layer.
    const assets = {};
    const assetIds = new Map();
    const data = { format: 'figma-to-tailwind', version: 1, exporterVersion: EXPORTER_VERSION, coordinateSpace: 'parent', frame, fonts: [...new Set(state.fonts)], warnings: state.warnings, assets };
    if (message.includeReference) {
      try {
        const scale = Math.min(1, 8192 / Math.max(frame.width, frame.height), Math.sqrt(16000000 / (frame.width * frame.height)));
        const bytes = await selection[0].exportAsync({ format: 'PNG', contentsOnly: true, useAbsoluteBounds: true, constraint: { type: 'SCALE', value: scale } });
        data.reference = { format: 'png', image: figma.base64Encode(bytes), width: frame.width, height: frame.height };
      } catch (error) { state.warnings.push(`Figma comparison image unavailable: ${errorMessage(error)}`); }
    }
    const json = JSON.stringify(data, (key, value) => {
      if ((key === 'asset' || key === 'backgroundImage') && typeof value === 'string') {
        let id = assetIds.get(value);
        if (!id) { id = `asset-${assetIds.size + 1}`; assetIds.set(value, id); assets[id] = value; }
        return { assetId: id };
      }
      return value;
    });
    if (json.length > 256 * 1024 * 1024) throw new Error('Frame data exceeds 256 MB after artwork deduplication. Export this exceptionally large frame in sections.');
    figma.ui.postMessage({ type: 'result', json, name: frame.name, width: frame.width, height: frame.height, count: state.count, exporterVersion: EXPORTER_VERSION });
  } catch (error) {
    const detail = `[v${EXPORTER_VERSION}] ${state.currentLayer ? `Layer "${state.currentLayer}": ` : ''}${errorMessage(error)}`;
    figma.ui.postMessage({ type: 'error', message: detail });
    if (figma.notify) figma.notify(detail, { error: true, timeout: 10000 });
  } finally {
    exporting = false;
  }
};
