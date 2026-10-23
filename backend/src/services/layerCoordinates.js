import { identity, inverse, multiply } from '../utils/affine.js';

/** v1.10-v1.12 used Figma container-relative transforms as direct-parent transforms. */
export function normalizeLayerCoordinates(design) {
  if (design.coordinateSpace === 'parent' || !/^1\.(10|11|12)$/.test(design.exporterVersion || '')) return;
  const valid = matrix => Array.isArray(matrix) && matrix.length === 2 && matrix.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite));
  let count = 0;
  const walk = (node, containerWorld, parentWorld, depth, root = false) => {
    if (!node || typeof node !== 'object' || ++count > 6000 || depth > 50) throw new Error('Invalid layer hierarchy');
    const raw = node.transform || identity();
    if (!valid(raw)) throw new Error('Invalid layer transform');
    const world = root ? identity() : multiply(containerWorld, raw);
    node.transform = root ? identity() : multiply(inverse(parentWorld), world);
    // Figma skips ordinary groups and boolean operations when resolving the
    // containing parent for relativeTransform. HTML does not skip them.
    const nextContainer = ['GROUP', 'BOOLEAN_OPERATION'].includes(node.type) ? containerWorld : world;
    for (const child of node.children || []) walk(child, nextContainer, world, depth + 1);
  };
  walk(design.frame, identity(), identity(), 0, true);
  design.coordinateSpace = 'parent';
}
