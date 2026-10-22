import sharp from 'sharp';
import { ApiError } from '../utils/ApiError.js';

const WEBP_MAX_SIDE = 16383;
const INPUT_PIXEL_LIMIT = 64 * 1024 * 1024;

/** Give subpixel/zero-intrinsic SVGs a usable raster viewport, retaining their coordinates. */
function repairSvgViewport(input, geometry) {
  const text = input.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null;
  const match = /<svg\b(?:[^>"']|"[^"]*"|'[^']*')*>/i.exec(text.slice(0, 65536));
  if (!match) return null;
  let root = match[0];
  const attribute = name => root.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2];
  const length = value => {
    const parsed = String(value ?? '').match(/^\s*([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)\s*(px|pt|pc|in|mm|cm)?\s*$/i);
    if (!parsed) return null;
    const factor = { px: 1, pt: 1, pc: 12, in: 72, mm: 72 / 25.4, cm: 72 / 2.54 }[parsed[2]?.toLowerCase()] || 1;
    const result = Number(parsed[1]) * factor;
    return Number.isFinite(result) && result > 0 ? result : null;
  };
  const values = (attribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const viewBox = values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0 ? values : null;
  let usedGeometry = false;
  const dimension = (name, index) => {
    const fromSvg = length(attribute(name)) || viewBox?.[index];
    if (fromSvg) return fromSvg;
    const fallback = geometry?.[name];
    if (typeof fallback !== 'number' || !Number.isFinite(fallback) || fallback <= 0 || fallback > 100000) return null;
    usedGeometry = true; return fallback;
  };
  const width = dimension('width', 2);
  const height = dimension('height', 3);
  if (!width || !height) return null;
  const ratio = Math.min(1, 4096 / Math.max(width, height));
  const rasterWidth = Math.max(1, Math.ceil(width * ratio));
  const rasterHeight = Math.max(1, Math.ceil(height * ratio));
  const setAttribute = (name, value) => {
    root = root.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'gi'), '');
    root = root.replace(/\s*(\/?>)$/, ` ${name}="${value}"$1`);
  };
  const style = attribute('style') || '';
  setAttribute('width', rasterWidth);
  setAttribute('height', rasterHeight);
  setAttribute('viewBox', (viewBox || [0, 0, width, height]).join(' '));
  setAttribute('preserveAspectRatio', 'none');
  // SVG2 geometry CSS can override width/height attributes; preserve other styles.
  setAttribute('style', `${style.replace(/"/g, '&quot;')};width:${rasterWidth}px!important;height:${rasterHeight}px!important`);
  return { input: Buffer.from(text.slice(0, match.index) + root + text.slice(match.index + match[0].length)), usedGeometry };
}

/** Keep artwork within WebP dimensions without changing its HTML geometry. */
export async function encodeArtwork(encoded, layerPath, geometry) {
  const name = String(layerPath || 'Unnamed layer').slice(-240);
  if (typeof encoded !== 'string' || encoded.length > 64 * 1024 * 1024 || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    throw new ApiError(400, `Invalid artwork data in layer "${name}".`);
  }
  let input = Buffer.from(encoded, 'base64');
  const svg = /<svg[\s>]/i.test(input.subarray(0, 8192).toString('utf8'));
  let allowLargeXml = false;
  let viewportRepaired = false;
  let usedGeometry = false;
  const attempt = async (density, maxSide) => {
    const image = sharp(input, { density, limitInputPixels: INPUT_PIXEL_LIMIT, ...(allowLargeXml ? { unlimited: true } : {}) });
    const metadata = await image.metadata();
    const buffer = await image.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ lossless: true, alphaQuality: 100 }).toBuffer();
    return { buffer, reduced: metadata.width > maxSide || metadata.height > maxSide || density < 144, viewportRepaired, usedGeometry };
  };
  try {
    return await attempt(144, WEBP_MAX_SIDE);
  } catch (firstError) {
    let failure = firstError;
    // Lowering density makes subpixel SVGs smaller and cannot fix a zero raster
    // side. Repair only the image viewport; measured HTML layer geometry stays intact.
    if (svg && /bad dimensions|invalid.*(?:width|height|dimension)/i.test(failure.message || '')) {
      const repaired = repairSvgViewport(input, geometry);
      if (repaired) {
        input = repaired.input; usedGeometry = repaired.usedGeometry; viewportRepaired = true;
        try { return await attempt(144, WEBP_MAX_SIDE); }
        catch (error) { failure = error; }
      }
    }
    // Figma can embed a large photo as a single SVG data-URI attribute. The
    // XML parser's 10 MB text limit rejects it even when the canvas is small.
    // Relax only that SVG parser limit, retaining input-byte/pixel/output caps.
    if (svg && /XML_PARSE_HUGE|Buffer size limit exceeded|Resource limit exceeded/i.test(failure.message || '')
      && !/<!DOCTYPE|<!ENTITY/i.test(input.toString('utf8'))) {
      allowLargeXml = true;
      try { return await attempt(144, WEBP_MAX_SIDE); }
      catch (error) { failure = error; }
    }
    // Large vector canvases can exceed the decoder pixel limit at 2x DPI.
    // Lower the rasterisation density instead of dropping the image or frame.
    if (svg && /pixel limit|exceeds|too large|bad dimensions|memory/i.test(failure.message || '')) {
      for (const density of [72, 36, 18, 9, 4, 1]) {
        try { return await attempt(density, 8192); }
        catch (error) { failure = error; }
      }
    }
    const reason = String(failure.message || failure).replace(/\s+/g, ' ').slice(0, 240);
    throw new ApiError(400, `Artwork conversion failed in layer "${name}": ${reason}`);
  }
}
