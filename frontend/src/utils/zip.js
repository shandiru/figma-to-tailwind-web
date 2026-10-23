import JSZip from 'jszip';

/** Embed preview images so the sandboxed iframe does not need parent-origin blob URLs. */
export async function readResult(blob) {
  const zip = await JSZip.loadAsync(blob);
  const indexEntry = zip.file(/index\.html$/)[0];
  if (!indexEntry) throw new Error('index.html missing from ZIP');
  const format = JSON.parse(await (zip.file(/conversion\.json$/)[0]?.async('string') || Promise.resolve('{}'))).format || 'html';
  const codeEntry = format === 'react' ? zip.file(/src\/App\.jsx$/)[0]
    : format === 'vue' ? zip.file(/src\/App\.vue$/)[0]
      : zip.file(/preview\.html$/)[0] || indexEntry;
  const code = await codeEntry.async('string');
  const previewEntry = zip.file(/preview\.html$/)[0] || indexEntry;
  let preview = await previewEntry.async('string');
  for (const entry of zip.file(/assets\/images\/.+\.webp$/)) {
    const name = entry.name.split('assets/images/')[1];
    const url = `data:image/webp;base64,${await entry.async('base64')}`;
    preview = preview.split(`assets/images/${name}`).join(url);
  }
  const reportEntry = zip.file(/conversion\.json$/)[0];
  const report = reportEntry ? JSON.parse(await reportEntry.async('string')) : {};
  return { code, preview, format, stats: report.stats, warnings: report.warnings || [] };
}
