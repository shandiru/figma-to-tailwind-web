export function sectionEntries(design) {
  const entries = [];
  const walk = (node, path = [], depth = 0, parent = [1, 0, 0, 1, 0, 0]) => {
    const m = node.transform;
    const local = path.length ? (m ? [m[0][0], m[1][0], m[0][1], m[1][1], m[0][2], m[1][2]] : [1, 0, 0, 1, node.x || 0, node.y || 0]) : [1, 0, 0, 1, 0, 0];
    const [a, b, c, d, e, f] = parent;
    const [g, h, i, j, k, l] = local;
    const matrix = [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
    if (node.width > 0 && node.height > 0) entries.push({ key: path.join('.') || 'root', path, depth, node, matrix });
    (node.children || []).forEach((child, index) => walk(child, [...path, index], depth + 1, matrix));
  };
  if (design?.frame) walk(design.frame);
  return entries;
}

export function extractSection(design, path) {
  let node = design.frame;
  const inherited = {};
  let backdrop;
  for (const index of path) {
    for (const key of ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align']) if (node.css?.[key]) inherited[key] = node.css[key];
    const background = node.css?.background || node.css?.['background-color'];
    if (background && !/gradient|url\(/i.test(background)) backdrop = background;
    node = node.children?.[index];
    if (!node) throw new Error('This section is no longer available. Upload your JSON file again.');
  }
  const frame = { ...node, x: 0, y: 0, css: { ...inherited, ...node.css } };
  if (backdrop && !frame.backgroundImage && !frame.css.background && !frame.css['background-color']) frame.css.background = backdrop;
  delete frame.transform;
  const assets = {};
  const issues = [];
  const collect = layer => {
    issues.push(...(layer.importIssues || []));
    for (const key of ['asset', 'backgroundImage']) {
      const id = layer[key]?.assetId;
      if (id && design.assets?.[id]) assets[id] = design.assets[id];
    }
    for (const child of layer.children || []) collect(child);
  };
  collect(frame);
  return { ...design, frame, assets, issues, ...(path.length ? { reference: undefined } : {}) };
}
