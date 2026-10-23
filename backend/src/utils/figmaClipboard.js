/** Extract data only. Never insert clipboard HTML into the document. */
export function figmaPayload(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const number = entity[2]?.toLowerCase() === 'x' ? parseInt(entity.slice(3, -1), 16) : parseInt(entity.slice(2, -1), 10);
    return number > 0 && number <= 127 ? String.fromCharCode(number) : entity;
  });
  const marker = text.match(/\(figma\)([\s\S]*?)\(\/figma\)/i)?.[1];
  const attribute = text.match(/\bdata-buffer\s*=\s*(["'])([\s\S]*?)\1/i)?.[2];
  const trimmed = text.trim();
  const raw = /^ZmlnLWtpd2[A-Za-z0-9+/=\s]+$/.test(trimmed) ? trimmed : null;
  const payload = (marker || attribute || raw)?.replace(/\s/g, '');
  return payload && /^ZmlnLWtpd2/.test(payload) && /^[A-Za-z0-9+/]+={0,2}$/.test(payload) ? payload : null;
}
