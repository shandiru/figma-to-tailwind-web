import sharp from 'sharp';

const WEBP = { quality: 90, alphaQuality: 100 };
const slug = (s) => String(s).toLowerCase().replace(/\.[a-z]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'asset';

/**
 * Converts model-declared assets to WebP.
 * SVG -> rasterised at 2x -> WebP (transparent). Raster crops -> WebP.
 */
export async function buildAssets(assets, inputs, html) {
  const out = [];
  const used = new Set();
  let finalHtml = html;

  for (const asset of assets) {
    const name = slug(asset.name);
    let unique = name;
    let n = 2;
    while (used.has(unique)) unique = `${name}-${n++}`;
    used.add(unique);

    try {
      let buffer;
      if (asset.type === 'svg' && asset.svg) {
        const svg = Buffer.from(asset.svg);
        const { width = 64 } = await sharp(svg).metadata();
        const density = Math.min(144 * Math.max(1, 64 / width), 1200); // 2x (144dpi), bumped for tiny icons
        buffer = await sharp(svg, { density }).webp(WEBP).toBuffer();
      } else if (asset.type === 'crop') {
        const src = inputs[asset.source] || inputs.desktop || inputs.mobile;
        if (!src?.original) throw new Error('no source image');
        const meta = await sharp(src.original).metadata();
        const s = src.scale || 1;
        const left = Math.max(0, Math.round(asset.x * s));
        const top = Math.max(0, Math.round(asset.y * s));
        const width = Math.min(meta.width - left, Math.round(asset.width * s));
        const height = Math.min(meta.height - top, Math.round(asset.height * s));
        buffer = await sharp(src.original).extract({ left, top, width, height }).webp(WEBP).toBuffer();
      } else continue;

      out.push({ file: `${unique}.webp`, buffer });
      if (unique !== asset.name) finalHtml = finalHtml.split(`assets/images/${asset.name}.webp`).join(`assets/images/${unique}.webp`);
    } catch (err) {
      console.warn(`Asset "${asset.name}" skipped: ${err.message}`);
    }
  }
  return { files: out, html: finalHtml };
}
