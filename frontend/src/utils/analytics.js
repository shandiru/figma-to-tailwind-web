const permittedEvents = new Set(['convert_start', 'convert_success', 'code_copy', 'code_download', 'signup', 'login']);
const permittedFormats = new Set(['html', 'react', 'vue']);

export function trackEvent(name, params = {}) {
  if (!permittedEvents.has(name) || typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const eventParams = {};
  if (permittedFormats.has(params.framework)) eventParams.framework = params.framework;
  window.gtag('event', name, eventParams);
}

export function trackPageView() {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', 'page_view', { page_location: window.location.href, page_title: document.title });
}
