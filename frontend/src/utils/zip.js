import JSZip from 'jszip';

/** Embed preview images so the sandboxed iframe does not need parent-origin blob URLs. */
export async function readResult(blob) {
  const zip = await JSZip.loadAsync(blob);
  const indexEntry = zip.file(/index\.html$/)[0];
  if (!indexEntry) throw new Error('index.html missing from ZIP');
  const code = await indexEntry.async('string');
  let preview = code;
  for (const entry of zip.file(/assets\/images\/.+\.webp$/)) {
    const name = entry.name.split('assets/images/')[1];
    const url = `data:image/webp;base64,${await entry.async('base64')}`;
    preview = preview.split(`assets/images/${name}`).join(url);
  }
  const reportEntry = zip.file(/conversion\.json$/)[0];
  const report = reportEntry ? JSON.parse(await reportEntry.async('string')) : {};
  return { code, preview, stats: report.stats, warnings: report.warnings || [] };
}
