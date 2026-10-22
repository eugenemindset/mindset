// A visual touch indicator only; every click and drag reaches the original UI.
const root = document.documentElement;
const mouseAvailable = matchMedia('(any-hover: hover) and (any-pointer: fine)');
const cursor = document.createElement('div');
cursor.className = 'prototype-cursor';
cursor.setAttribute('aria-hidden', 'true');
document.body.append(cursor);

function hide() {
  root.classList.remove('touch-cursor-active');
  cursor.classList.remove('is-pressed');
  cursor.classList.remove('is-on-drum');
}

function track(event) {
  if (!mouseAvailable.matches || event.pointerType !== 'mouse') {
    hide();
    return;
  }
  cursor.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
  cursor.classList.toggle('is-pressed', (event.buttons & 1) !== 0);
  cursor.classList.toggle('is-on-drum', !!event.target.closest?.('.brightness-drum'));
  root.classList.add('touch-cursor-active');
}

// Capture keeps the indicator following sources and sliders during pointer capture.
const options = { capture: true, passive: true };
for (const type of ['pointermove', 'pointerdown', 'pointerup']) {
  window.addEventListener(type, track, options);
}
window.addEventListener('pointerout', event => {
  if (!event.relatedTarget) hide();
}, options);
window.addEventListener('pointercancel', hide, options);
window.addEventListener('lostpointercapture', () => cursor.classList.remove('is-pressed'), options);
window.addEventListener('blur', hide);
window.addEventListener('pagehide', hide);
window.addEventListener('keydown', event => { if (event.key === 'Tab') hide(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
mouseAvailable.addEventListener('change', hide);
