import sharp from 'sharp';
import { ApiError } from '../utils/ApiError.js';

const WEBP_MAX_SIDE = 16383;
const INPUT_PIXEL_LIMIT = 64 * 1024 * 1024;

/** Keep artwork within WebP dimensions without changing its HTML geometry. */
export async function encodeArtwork(encoded, layerPath) {
  const name = String(layerPath || 'Unnamed layer').slice(-240);
  if (typeof encoded !== 'string' || encoded.length > 64 * 1024 * 1024 || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) {
    throw new ApiError(400, `Invalid artwork data in layer "${name}".`);
  }
  const input = Buffer.from(encoded, 'base64');
  const svg = /<svg[\s>]/i.test(input.subarray(0, 8192).toString('utf8'));
  let allowLargeXml = false;
  const attempt = async (density, maxSide) => {
    const image = sharp(input, { density, limitInputPixels: INPUT_PIXEL_LIMIT, ...(allowLargeXml ? { unlimited: true } : {}) });
    const metadata = await image.metadata();
    const buffer = await image.resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 95, alphaQuality: 100 }).toBuffer();
    return { buffer, reduced: metadata.width > maxSide || metadata.height > maxSide || density < 144 };
  };
  try {
    return await attempt(144, WEBP_MAX_SIDE);
  } catch (firstError) {
    let failure = firstError;
    // Figma can embed a large photo as a single SVG data-URI attribute. The
    // XML parser's 10 MB text limit rejects it even when the canvas is small.
    // Relax only that SVG parser limit, retaining input-byte/pixel/output caps.
    if (svg && /XML_PARSE_HUGE|Buffer size limit exceeded|Resource limit exceeded/i.test(firstError.message || '')
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
