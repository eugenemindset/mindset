// Press feedback preserves native clicks, focus and the UI's drag capture.
import { createButtonSound } from 'duo/drum-sound.js';
let cleanup = null;

export function initUIMotion() {
  if (cleanup) return cleanup;

  const controller = new AbortController();
  const sound = createButtonSound();
  const options = { capture: true, passive: true, signal: controller.signal };
  let active = null;

  function resolve(target) {
    if (!(target instanceof Element)) return null;
    const button = target.closest('button');
    if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true' || button.closest('[hidden]')) return null;
    const screen = button.closest('.screen');
    if (!screen) return null;
    const tile = button.closest('.source-control');
    if (tile) return { button, visual: tile, screen, marker: false };
    if (button.matches('.adjustment-action, #back')) return { button, visual: button, screen, marker: false };
    if (button.matches('.light-marker')) return { button, visual: button.querySelector('.marker-body'), screen, marker: true };
    return null;
  }

  // Only adding/removing a light uses the physical switch sound. Selection,
  // saving and undo keep their press animation without audio.
  const playsSwitchSound = control => control?.button.matches('.source-control .activate, .source-control .add, .source-control .remove, #delete-selected');

  function release() {
    if (!active) return;
    active.visual.classList.remove('ui-motion-pressed');
    active = null;
  }

  function press(control, input) {
    release();
    if (!control?.visual) return;
    active = { ...control, ...input };
    active.visual.classList.add('ui-motion-target', 'ui-motion-pressed');
  }

  window.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    const control = resolve(event.target);
    if (!control) { release(); return; }
    if (playsSwitchSound(control)) sound.unlock();
    press(control, {
      type: 'pointer', id: event.pointerId, x: event.clientX, y: event.clientY,
      dragThreshold: 5 * control.screen.getBoundingClientRect().width / 587
    });
  }, options);

  window.addEventListener('pointermove', event => {
    if (active?.type !== 'pointer' || active.id !== event.pointerId) return;
    // A source's press is selection feedback; its actual drag keeps full size.
    if (!(event.buttons & 1) || active.marker && Math.hypot(event.clientX - active.x, event.clientY - active.y) >= active.dragThreshold) release();
  }, options);

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(type, event => {
      if (active?.type === 'pointer' && active.id === event.pointerId) release();
    }, options);
  }
  window.addEventListener('pointerout', event => {
    if (!event.relatedTarget && active?.type === 'pointer' && active.id === event.pointerId) release();
  }, options);

  const activationKey = event => event.key === 'Enter' ? 'Enter' : event.key === ' ' || event.key === 'Spacebar' ? 'Space' : null;
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === 'Tab') { release(); return; }
    const key = activationKey(event);
    if (!key || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const control = resolve(event.target);
    if (control) { if (playsSwitchSound(control)) sound.unlock(); press(control, { type: 'keyboard', key }); }
  }, options);
  window.addEventListener('keyup', event => {
    if (active?.type === 'keyboard' && active.key === activationKey(event)) release();
  }, options);
  window.addEventListener('focusout', event => {
    // Activating an empty source tile moves focus from its icon to its plus.
    if (active?.type === 'keyboard' && !active.visual.contains(event.relatedTarget)) release();
  }, options);
  window.addEventListener('blur', release, { signal: controller.signal });
  window.addEventListener('pagehide', () => { release(); sound.destroy(); }, { signal: controller.signal });
  window.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const control = resolve(event.target);
    if (!playsSwitchSound(control)) return;
    sound.unlock(); sound.click();
  }, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); }, { signal: controller.signal });

  cleanup = () => {
    release();
    controller.abort();
    sound.destroy();
    document.querySelectorAll('.ui-motion-target').forEach(element => element.classList.remove('ui-motion-target', 'ui-motion-pressed'));
    cleanup = null;
  };
  return cleanup;
}

initUIMotion();
