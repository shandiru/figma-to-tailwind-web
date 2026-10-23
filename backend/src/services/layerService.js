import { ApiError } from '../utils/ApiError.js';
import { validateHtml } from './validatorService.js';
import { encodeArtwork } from './artworkService.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const VISUAL_PROPERTIES = new Set([
  'background', 'background-color', 'background-image', 'background-size', 'background-position',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-radius',
  'border-color', 'border-width', 'border-style', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
  'box-shadow', 'opacity', 'color', 'font', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration', 'text-transform',
  'white-space', 'word-break', 'mix-blend-mode', 'filter', 'backdrop-filter',
]);

function number(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 100_000 ? Math.round(value * 1000) / 1000 : fallback;
}

function cssFallbacks(value, depth = 0) {
  if (depth > 10) return value;
  let output = '';
  let cursor = 0;
  const pattern = /var\s*\(/ig;
  let match;
  while ((match = pattern.exec(value))) {
    let nesting = 1;
    let comma = -1;
    let quote = '';
    let end = pattern.lastIndex;
    for (; end < value.length; end++) {
      const char = value[end];
      if (quote) { if (char === quote) quote = ''; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(') nesting++;
      else if (char === ')' && --nesting === 0) break;
      else if (char === ',' && nesting === 1 && comma === -1) comma = end;
    }
    if (nesting) break;
    output += value.slice(cursor, match.index);
    output += comma === -1 ? value.slice(match.index, end + 1) : cssFallbacks(value.slice(comma + 1, end).trim(), depth + 1);
    cursor = end + 1;
    pattern.lastIndex = cursor;
  }
  return output + value.slice(cursor);
}

function visualClasses(css, frameWidth) {
  if (!css || typeof css !== 'object' || Array.isArray(css)) return [];
  return Object.entries(css).map(([key, value]) => [key, typeof value === 'string'
    ? cssFallbacks(value).replace(/\/\*[\s\S]*?\*\//g, '').trim() : value])
    .filter(([key, value]) => VISUAL_PROPERTIES.has(key)
    && typeof value === 'string' && value.length < 2000
    && !/[;{}<>\\]/.test(value) && !/url\s*\(|expression\s*\(|@|var\s*\(/i.test(value))
    .map(([key, value]) => {
      // Every measured length scales with its exported frame, using native CSS
      // container units. No generated inline styles or JavaScript resizing.
      const scaled = value.replace(/(-?(?:\d*\.)?\d+)px\b/g, (_, pixels) => `${Number((Number(pixels) / frameWidth * 100).toFixed(8))}cqw`);
      const encoded = scaled.replaceAll('_', '\\_').replace(/\s+/g, '_');
      if (key === 'font-size') return `text-[length:${encoded}]`;
      if (key === 'color') return `text-[color:${encoded}]`;
      if (key === 'line-height') return `leading-[${encoded}]`;
      if (key === 'font-weight') return `font-[${encoded}]`;
      if (key === 'text-align' && ['left', 'right', 'center', 'justify'].includes(value)) return `text-${value}`;
      if (key === 'font-style' && ['normal', 'italic'].includes(value)) return value === 'italic' ? 'italic' : 'not-italic';
      return `[${key}:${encoded}]`;
    });
}

const lengthClass = (utility, pixels, frameWidth) => `${utility}-[${Number((pixels / frameWidth * 100).toFixed(8))}cqw]`;

const buttonCandidate = node => node && node.type !== 'TEXT' && !node.asset &&
  (/(^|\b)button(\b|$)/i.test(node.name || '') || /^\s*cta\s*$/i.test(node.name || ''));

function borderOffsets(css) {
  const pixels = value => typeof value === 'string' ? Number(cssFallbacks(value).match(/^\s*(-?(?:\d*\.)?\d+)px\b/)?.[1]) || 0 : 0;
  const widths = typeof css['border-width'] === 'string' ? css['border-width'].trim().split(/\s+/) : [];
  const general = pixels(css.border);
  const side = name => {
    if (css[`border-${name}-width`] !== undefined) return pixels(css[`border-${name}-width`]);
    if (css[`border-${name}`] !== undefined && !/var\s*\(/.test(cssFallbacks(css[`border-${name}`]))) return pixels(css[`border-${name}`]);
    if (widths.length) return pixels(name === 'top' ? widths[0] : widths[3] || widths[1] || widths[0]);
    return general;
  };
  return { left: side('left'), top: side('top') };
}

/** Render structured Figma layers as editable elements, never a screenshot of the frame. */
export async function convertLayers(desktop, mobile, opts) {
  const files = [];
  const buttonDescendants = new WeakMap();
  function containsButton(node, depth = 0) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return false;
    if (depth > 50) throw new ApiError(400, 'Invalid or overly complex layer data. Export a smaller frame.');
    if (!buttonDescendants.has(node)) buttonDescendants.set(node,
      Boolean(buttonCandidate(node)) || (Array.isArray(node.children) && node.children.some(child => containsButton(child, depth + 1))));
    return buttonDescendants.get(node);
  }
  const fonts = new Set();
  const fontStyles = new Map();
  function registerFont(css, inherited = {}) {
    const style = { ...inherited, ...css };
    const family = String(style['font-family'] || '').split(',')[0].trim().replace(/^["']|["']$/g, '');
    if (!/^[\p{L}\p{N} -]{1,80}$/u.test(family)) return;
    const requested = style['font-weight'];
    const weight = requested === 'bold' ? 700 : Number(requested) || 400;
    if (weight < 1 || weight > 1000) return;
    const italic = style['font-style'] === 'italic' ? 1 : 0;
    if (!fontStyles.has(family)) fontStyles.set(family, new Set());
    fontStyles.get(family).add(`${italic},${weight}`);
  }
  const warnings = new Set();
  let count = 0;
  let assets = 0;
  let textCount = 0;
  const assetCache = new Map();
  const frames = {};
  const imageAsset = async (encoded, prefix, layerPath, geometry) => {
    const geometryKey = `${geometry.width}:${geometry.height}`;
    const cached = assetCache.get(encoded);
    if (cached?.has('*')) return cached.get('*');
    if (cached?.has(geometryKey)) return cached.get(geometryKey);
    const file = `${prefix}-${++assets}.webp`;
    const { buffer, reduced, viewportRepaired, usedGeometry } = await encodeArtwork(encoded, layerPath, geometry);
    files.push({ file, buffer });
    if (reduced) warnings.add(`Artwork "${String(layerPath).slice(-200)}" was rasterised at a reduced resolution to fit image format limits. Its layout dimensions are unchanged.`);
    if (viewportRepaired) warnings.add(`SVG raster dimensions were repaired for "${String(layerPath).slice(-200)}". Its measured layer size and position are unchanged.`);
    const src = `assets/images/${file}`;
    if (!cached) assetCache.set(encoded, new Map());
    assetCache.get(encoded).set(usedGeometry ? geometryKey : '*', src);
    return src;
  };

  async function render(node, frameWidth, root = false, depth = 0, parentPath = '', parentBorder = { left: 0, top: 0 }) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || ++count > 6000 || depth > 50) {
      throw new ApiError(400, 'Invalid or overly complex layer data. Export a smaller frame.');
    }
    const width = number(node.width);
    const height = number(node.height);
    // Unclipped Figma groups can have zero-sized bounds and visible children.
    if (width < 0 || height < 0 || ((width === 0 || height === 0) &&
      (node.clipsContent || node.asset || !Array.isArray(node.children) || !node.children.length))) return '';
    const layerPath = `${parentPath}${parentPath ? ' / ' : ''}${node.name || node.type || 'Unnamed layer'}`;
    const m = node.transform;
    const matrix = Array.isArray(m) && m.length === 2 && m.every(row => Array.isArray(row) && row.length === 3)
      ? [number(m[0][0], 1), number(m[1][0]), number(m[0][1]), number(m[1][1], 1), number(m[0][2]), number(m[1][2])]
      : [1, 0, 0, 1, number(node.x), number(node.y)];
    const css = { ...node.css, ...node.resolvedCss };
    if (Object.values(css).some(value => typeof value === 'string' && /var\s*\(/i.test(cssFallbacks(value)))) {
      warnings.add('Some Figma style variables have no exported values. Re-export with plugin v1.4 or later to preserve bound colors and borders.');
    }
    const classes = [root ? 'relative' : 'absolute', 'box-border', lengthClass('w', width, frameWidth), lengthClass('h', height, frameWidth)];
    if (!root) {
      // Figma child coordinates start at the outer frame edge, whereas CSS
      // absolute positioning starts inside the parent's border.
      classes.push(lengthClass('left', matrix[4] - parentBorder.left, frameWidth), lengthClass('top', matrix[5] - parentBorder.top, frameWidth));
      if (matrix[0] !== 1 || matrix[1] !== 0 || matrix[2] !== 0 || matrix[3] !== 1) classes.push('origin-top-left', `[transform:matrix(${matrix.slice(0, 4).join(',')},0,0)]`);
    }
    classes.push(...visualClasses(css, frameWidth));
    if (node.clipsContent) classes.push('overflow-hidden');
    let background = '';
    if (node.backgroundImage) {
      const src = await imageAsset(node.backgroundImage, 'background', layerPath, { width, height });
      const fit = node.backgroundMode === 'EXACT' ? 'object-fill' : node.backgroundMode === 'FIT' ? 'object-contain' : 'object-cover';
      background = `<img src="${src}" alt="" aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full rounded-[inherit] ${fit}">`;
      if (node.backgroundMode && !['FIT', 'FILL', 'EXACT'].includes(node.backgroundMode)) warnings.add('Some image crops use a centered cover approximation. Re-export with plugin v1.5 or later to retain their Figma crop.');
    }
    const name = escape(node.name || node.type || 'Layer');
    // Icon fonts are outlined by the plugin but retain their Figma TEXT type.
    // Render their exported artwork instead of an empty text container.
    if (node.type === 'TEXT' && !node.asset) {
      textCount++;
      registerFont(css);
      let text = escape(node.text);
      if (Array.isArray(node.segments) && node.segments.length) {
        if (node.segments.length > 10000) throw new ApiError(400, 'Too many text segments in a layer.');
        text = node.segments.map(segment => {
          registerFont(segment?.css, css);
          return `<span class="${escape(visualClasses(segment?.css, frameWidth).join(' '))}">${escape(segment?.text)}</span>`;
        }).join('');
      }
      const alignment = node.verticalAlign === 'CENTER' ? 'justify-center' : node.verticalAlign === 'BOTTOM' ? 'justify-end' : 'justify-start';
      const wrapping = node.textAutoResize === 'WIDTH_AND_HEIGHT' ? 'whitespace-pre' : 'whitespace-pre-wrap break-words';
      const paragraphClass = `relative m-0 w-full shrink-0 ${wrapping} [font-kerning:normal]`;
      let paragraphs = `<p class="${paragraphClass}">${text}</p>`;
      if (number(node.paragraphSpacing) > 0) {
        // Split styled text runs at paragraph boundaries, retaining each run's
        // classes rather than turning paragraph spacing into extra blank lines.
        const lines = [''];
        const runs = Array.isArray(node.segments) && node.segments.length ? node.segments : [{ text: node.text }];
        for (const run of runs) {
          const values = String(run.text || '').split('\n');
          values.forEach((value, index) => {
            if (index) lines.push('');
            lines[lines.length - 1] += `<span class="${escape(visualClasses(run.css, frameWidth).join(' '))}">${escape(value)}</span>`;
          });
        }
        paragraphs = lines.map((line, index) => `<p class="${paragraphClass}${index ? ` ${lengthClass('mt', node.paragraphSpacing, frameWidth)}` : ''}">${line || '<br>'}</p>`).join('');
      }
      return `<div data-layer="${name}" class="${escape(classes.join(' '))} flex min-h-0 flex-col ${alignment}">${background}${paragraphs}</div>`;
    }
    if (node.asset) {
      const src = await imageAsset(node.asset, 'artwork', layerPath, { width, height });
      return `<img data-layer="${name}" alt="${name}" src="${src}" class="${escape(classes.join(' '))} max-w-none object-fill">`;
    }
    if (node.children !== undefined && !Array.isArray(node.children)) throw new ApiError(400, 'Invalid layer children.');
    const children = [];
    const ownBorder = borderOffsets(css);
    for (const child of node.children || []) children.push(await render(child, frameWidth, false, depth + 1, layerPath, ownBorder));
    // A CTA section is a layout container. Nested buttons cause HTML parsers
    // to close ancestors early and reparent later artwork outside the section.
    const isButton = !root && buttonCandidate(node) && !(node.children || []).some(child => containsButton(child));
    const tag = isButton ? 'button' : 'div';
    return `<${tag}${isButton ? ' type="button"' : ''} data-layer="${name}" class="${escape(classes.join(' '))}${isButton ? ' cursor-pointer' : ''}">\n${background}${children.join('\n')}\n</${tag}>`;
  }

  const sections = [];
  for (const [label, input] of [['desktop', desktop], ['mobile', mobile]]) {
    if (!input) continue;
    if (input.kind !== 'layers' || input.design?.format !== 'figma-to-tailwind' || input.design.version !== 1 || !input.design.frame) {
      throw new ApiError(400, 'Editable HTML needs Figma layers. Use the included Figma plugin to Copy layers, then paste or upload its JSON. A PNG/SVG screenshot cannot provide editable text and layout.');
    }
    const design = input.design;
    if (Array.isArray(design.fonts)) for (const font of design.fonts.slice(0, 50)) {
      if (typeof font === 'string' && /^[\p{L}\p{N} -]{1,80}$/u.test(font)) fonts.add(font);
    }
    if (Array.isArray(design.warnings)) for (const warning of design.warnings.slice(0, 100)) {
      if (typeof warning === 'string') warnings.add(warning.slice(0, 500));
    }
    const width = number(design.frame.width);
    const height = number(design.frame.height);
    if (width <= 0 || height <= 0) throw new ApiError(400, 'The exported frame must have a positive width and height.');
    frames[label] = { width, height };
    const visibility = desktop && mobile
      ? (label === 'desktop' ? 'hidden sm:hidden md:block lg:block xl:block 2xl:block' : 'block sm:block md:hidden lg:hidden xl:hidden 2xl:hidden')
      : 'block sm:block md:block lg:block xl:block 2xl:block';
    // Keep the mobile frame fluid up to the desktop switch, preserving its
    // exact geometry at its original width. Larger screens use desktop data.
    const maxWidth = label === 'mobile' && desktop ? Math.max(width, 768) : width;
    sections.push(`<!-- ${label === 'mobile' ? 'Mobile layout: base and sm; desktop takes over at md (768px).' : 'Desktop layout: md, lg, xl and 2xl.'} -->\n<section aria-label="${label} layout" class="${visibility} mx-auto w-full max-w-[${maxWidth}px] overflow-hidden [container-type:inline-size]" data-frame-width="${width}" data-frame-height="${height}">\n${await render(design.frame, width, true)}\n</section>`);
  }
  for (const font of fonts) if (!fontStyles.has(font)) fontStyles.set(font, new Set(['0,400']));
  // Request actual used weights only, and isolate families so an unavailable
  // custom font does not invalidate every other font in the same request.
  const fontLink = [...fontStyles].map(([font, styles]) => {
    const tuples = [...styles].sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a.slice(2)) - Number(b.slice(2)));
    return `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:ital,wght@${tuples.join(';')}&amp;display=swap" rel="stylesheet">`;
  }).join('\n  ');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(opts.pageName || 'Untitled page')}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  ${fontLink}
</head>
<body class="m-0 bg-white [text-size-adjust:none] [-webkit-text-size-adjust:none]">
  <!-- Tailwind utilities only. Container-relative dimensions preserve each supplied frame. -->
  <main>${sections.join('\n')}</main>
</body>
</html>`;
  const errors = validateHtml(html, { responsive: Boolean(desktop && mobile) });
  if (errors.length) throw new ApiError(422, `Generated HTML validation failed: ${errors.join(' ')}`);
  return { html, files, stats: { layers: count, textLayers: textCount, assets, frames }, warnings: [...warnings] };
}
