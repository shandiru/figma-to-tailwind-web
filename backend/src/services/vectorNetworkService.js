/** Decode the local vector-network fallback when Figma omits rendered paths. */
export function vectorNetworkPaths(input) {
  const bytes = Buffer.from(input);
  let offset = 0;
  const uint = () => {
    if (offset + 4 > bytes.length) throw new Error('Incomplete vector network.');
    const value = bytes.readUInt32LE(offset); offset += 4; return value;
  };
  const float = () => {
    if (offset + 4 > bytes.length) throw new Error('Incomplete vector coordinate.');
    const value = bytes.readFloatLE(offset); offset += 4;
    if (!Number.isFinite(value) || Math.abs(value) > 1000000) throw new Error('Invalid vector coordinate.');
    return Math.round(value * 100000) / 100000;
  };
  const vertexCount = uint();
  const segmentCount = uint();
  const regionCount = uint();
  if (!vertexCount || vertexCount + segmentCount + regionCount > 100000 || offset + vertexCount * 12 + segmentCount * 28 > bytes.length) throw new Error('Invalid vector network counts.');
  const vertices = Array.from({ length: vertexCount }, () => ({ style: uint(), x: float(), y: float() }));
  const segments = Array.from({ length: segmentCount }, () => {
    const style = uint(); const start = uint(); const tx = float(); const ty = float(); const end = uint(); const ex = float(); const ey = float();
    if (start >= vertexCount || end >= vertexCount) throw new Error('Invalid vector vertex reference.');
    return { style, start, end, tx, ty, ex, ey };
  });
  const move = index => `M${vertices[index].x} ${vertices[index].y}`;
  const edge = (segment, forward) => {
    const a = vertices[forward ? segment.start : segment.end];
    const b = vertices[forward ? segment.end : segment.start];
    if (![segment.tx, segment.ty, segment.ex, segment.ey].some(Boolean)) return `L${b.x} ${b.y}`;
    const [tx, ty, ex, ey] = forward ? [segment.tx, segment.ty, segment.ex, segment.ey] : [segment.ex, segment.ey, segment.tx, segment.ty];
    return `C${a.x + tx} ${a.y + ty} ${b.x + ex} ${b.y + ey} ${b.x} ${b.y}`;
  };
  let totalReferences = 0;
  const regions = Array.from({ length: regionCount }, () => {
    const packed = uint(); const loopCount = uint();
    if (loopCount > 100000) throw new Error('Too many vector loops.');
    const loops = Array.from({ length: loopCount }, () => {
      const count = uint(); totalReferences += count;
      if (!count || totalReferences > 200000 || offset + count * 4 > bytes.length) throw new Error('Invalid vector loop length.');
      const indices = Array.from({ length: count }, () => {
        const index = uint(); if (index >= segments.length) throw new Error('Invalid vector segment reference.'); return index;
      });
      const first = segments[indices[0]];
      const second = segments[indices[1]];
      const forward = !second || first.end === second.start || first.end === second.end;
      const start = forward ? first.start : first.end;
      let cursor = start;
      const commands = [move(start)];
      for (const index of indices) {
        const segment = segments[index];
        if (segment.start !== cursor && segment.end !== cursor) throw new Error('Disconnected vector loop.');
        const direction = segment.start === cursor;
        commands.push(edge(segment, direction)); cursor = direction ? segment.end : segment.start;
      }
      if (cursor !== start) throw new Error('Unclosed vector region.');
      return commands.join(' ') + ' Z';
    });
    return { d: loops.join(' '), styleID: packed >>> 1, windingRule: packed & 1 ? 'NONZERO' : 'ODD' };
  });
  if (offset !== bytes.length) throw new Error('Unsupported vector-network extension.');
  // Render open/branched strokes without inventing a filled bounding box.
  const strokes = segments.map(segment => `${move(segment.start)} ${edge(segment, true)}`);
  return { regions, strokes, hasVertexStyles: vertices.some(vertex => vertex.style !== 0) };
}
