import sharp from 'sharp';
import { normalizeLayerCoordinates } from './layerCoordinates.js';
import { ApiError } from '../utils/ApiError.js';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

const decompress = promisify(gunzip);

const looksLikeSvg = (t) => /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(t);

/** Normalises an uploaded frame, retaining its full resolution for local export. */
export async function prepareInput(file, label) {
  if (!file) return null;
  if (file.mimetype === 'application/json' || /\.json$/i.test(file.originalname || '')) {
    try {
      let design = JSON.parse(file.buffer.toString('utf8'));
      if (design?.format === 'figma-to-tailwind-packed') {
        if (design.version !== 1 || design.encoding !== 'gzip-base64' || typeof design.data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(design.data)) throw new Error('Invalid packed export');
        const unpacked = await decompress(Buffer.from(design.data, 'base64'), { maxOutputLength: 256 * 1024 * 1024 });
        design = JSON.parse(unpacked.toString('utf8'));
      }
      if (design?.format !== 'figma-to-tailwind' || design.version !== 1 || !design.frame) throw new Error('Invalid format');
      if (design.reference) {
        const reference = design.reference;
        // A reference is optional comparison media, never a replacement for layers.
        if (reference.format !== 'png' || typeof reference.image !== 'string' ||
          reference.image.length > 24 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(reference.image) ||
          !Buffer.from(reference.image.slice(0, 12), 'base64').subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          reference.width !== design.frame.width || reference.height !== design.frame.height) delete design.reference;
      }
      const pending = [{ node: design.frame, depth: 0 }];
      let count = 0;
      while (pending.length) {
        const { node, depth } = pending.pop();
        if (!node || typeof node !== 'object' || ++count > 6000 || depth > 50) throw new Error('Invalid layer tree');
        for (const key of ['asset', 'backgroundImage']) {
          if (node[key] && typeof node[key] === 'object') {
            const id = node[key].assetId;
            if (typeof id !== 'string' || !Object.hasOwn(design.assets || {}, id) || typeof design.assets[id] !== 'string') throw new Error('Missing artwork');
            node[key] = design.assets[id];
          }
        }
        if (Array.isArray(node.children)) for (const child of node.children) pending.push({ node: child, depth: depth + 1 });
      }
      normalizeLayerCoordinates(design);
      delete design.assets;
      return { label, kind: 'layers', design };
    } catch {
      throw new ApiError(400, 'Upload layer JSON exported by the Frame to Code Figma plugin.');
    }
  }
  const text = /^(text\/|image\/svg)/.test(file.mimetype) ? file.buffer.toString('utf8') : null;

  if (file.mimetype === 'image/svg+xml' || (text && looksLikeSvg(text))) {
    try {
      const original = await sharp(Buffer.from(text), { density: 144 }).png().toBuffer();
      return { label, ...(await imageDetails(original)), original };
    } catch {
      throw new ApiError(400, `The ${label} file is not a readable SVG image.`);
    }
  }
  if (text !== null) return { label, kind: 'text', text: text.slice(0, 200_000) };

  try {
    const original = await sharp(file.buffer).png().toBuffer();
    return { label, ...(await imageDetails(original)), original };
  } catch {
    throw new ApiError(400, `The ${label} file is not a readable image.`);
  }
}

async function imageDetails(png) {
  const meta = await sharp(png).metadata();
  return { kind: 'image', width: meta.width, height: meta.height };
}
