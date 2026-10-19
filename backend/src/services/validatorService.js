const BREAKPOINTS = ['sm', 'md', 'lg', 'xl', '2xl'];
const STATE_VARIANTS = new Set([
  'hover', 'focus', 'active', 'disabled', 'focus-visible', 'focus-within', 'group-hover', 'group-focus',
  'peer-checked', 'first', 'last', 'odd', 'even', 'dark', 'motion-safe', 'motion-reduce', 'placeholder',
  'before', 'after', 'marker', 'max-sm', 'max-md', 'max-lg',
]);

/** Returns a list of rule violations (empty list = valid). */
export function validateHtml(html, { responsive }) {
  const errors = [];
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) errors.push('Output must be a complete HTML document.');
  if (/<style[\s>]/i.test(html)) errors.push('Remove every <style> block.');
  if (/\sstyle\s*=/i.test(html)) errors.push('Remove every inline style="" attribute.');
  const withoutFonts = html.replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/gi, '');
  if (/<link[^>]+rel=["']stylesheet["'][^>]*>/i.test(withoutFonts)) errors.push('No external stylesheets except Google Fonts.');
  if (!/cdn\.tailwindcss\.com/.test(html)) errors.push('Include the Tailwind CDN script in <head>.');

  const unknown = new Set();
  const used = new Set();
  for (const [, cls] of html.matchAll(/\sclass\s*=\s*"([^"]*)"/g)) {
    for (const token of cls.split(/\s+/)) {
      const prefixes = token.replace(/\[[^\]]*\]/g, '').split(':').slice(0, -1);
      for (const p of prefixes) {
        if (BREAKPOINTS.includes(p)) used.add(p);
        else if (!STATE_VARIANTS.has(p) && !/^(group|peer)\//.test(p)) unknown.add(p);
      }
    }
  }
  if (unknown.size) errors.push(`Invalid breakpoint/variant prefixes: ${[...unknown].join(', ')}. Use only sm, md, lg, xl, 2xl.`);
  if (responsive) {
    const missing = BREAKPOINTS.filter((b) => !used.has(b));
    if (missing.length > 2) errors.push(`Responsive page must use the full breakpoint range; unused: ${missing.join(', ')}.`);
  }
  return errors;
}
