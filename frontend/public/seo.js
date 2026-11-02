document.addEventListener('click', event => {
  const toggle = event.target.closest('.nav-toggle');
  if (toggle) {
    const nav = document.getElementById(toggle.getAttribute('aria-controls'));
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Close' : 'Menu';
    nav?.classList.toggle('is-open', open);
  }
  if (event.target.closest('#main-nav a')) {
    const nav = document.getElementById('main-nav');
    nav?.classList.remove('is-open');
    const button = document.querySelector('.nav-toggle');
    button?.setAttribute('aria-expanded', 'false');
    if (button) button.textContent = 'Menu';
  }
  const link = event.target.closest('[data-cta-location]');
  if (link && typeof window.gtag === 'function') {
    window.gtag('event', 'cta_click', { cta_location: link.dataset.ctaLocation, destination: new URL(link.href, location.href).pathname });
  }
});
