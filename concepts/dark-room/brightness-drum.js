import { createDrumSound } from 'duo/drum-sound.js';

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));
// One physical notch is exactly one lumen, for both drawing and dragging.
const TICK_STEP = 17, PIXELS_PER_LM = TICK_STEP, TICK_COUNT = 101;
const DETENT_EPSILON = .000001;
const centeredDetent = value => Math.abs(value - Math.round(value)) < DETENT_EPSILON ? Math.round(value) : null;

// Values increase from left to right under the fixed index. This is a finite
// ruler: at zero its left side is empty; at 100 its right side is empty.
export function getDrumTicks(position) {
  const value = clamp(position);
  const leftFade = [1, 1, .8, .6, .5, .4, .3, .2, .1, 0];
  const rightFade = [1, 1, .8, .6, .4, .3, .2, .15, .1, 0];
  return Array.from({ length: TICK_COUNT }, (_, tickValue) => {
    const x = 153.5 + (tickValue - value) * PIXELS_PER_LM;
    const offset = Math.abs(x - 153.5), distance = offset / TICK_STEP;
    const fade = x < 153.5 ? leftFade : rightFade;
    const stop = Math.min(8, Math.floor(distance));
    const edgeFade = distance >= 9 ? 0 : fade[stop] + (fade[stop + 1] - fade[stop]) * (distance - stop);
    // Keep a calm channel around the orange index, instead of letting a
    // second crisp white stroke flash directly through it.
    const channel = clamp((offset - 4) / 8, 0, 1);
    const opacity = edgeFade * channel * channel * (3 - 2 * channel);
    return { value: tickValue, x, opacity };
  });
}

// A fixed capsule lens. Only the live ruler strokes are refracted; the value
// and orange index stay sharp. The displacement map is generated once.
function createRuler(element) {
  const canvas = document.createElement('canvas');
  canvas.width = 262; canvas.height = 120;
  const context = canvas.getContext('2d');
  const map = context.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const px = (x + .5) / 2, py = (y + .5) / 2;
    const dx = px - clamp(px, 30, 101), dy = py - 30;
    const distance = Math.hypot(dx, dy), edge = clamp((distance - 16.25) / 13.75, 0, 1);
    const bend = Math.sin(edge * Math.PI / 2) * .82;
    const offset = (y * canvas.width + x) * 4;
    map.data[offset] = Math.round(128 + dx / Math.max(distance, 1) * bend * 127);
    map.data[offset + 1] = Math.round(128 + dy / Math.max(distance, 1) * bend * 127);
    map.data[offset + 2] = 128; map.data[offset + 3] = 255;
  }
  context.putImageData(map, 0, 0);
  const capsule = 'M118 0H189A30 30 0 0 1 219 30A30 30 0 0 1 189 60H118A30 30 0 0 1 88 30A30 30 0 0 1 118 0Z';
  element.innerHTML = `<svg class="drum-ruler" viewBox="0 0 307 72" aria-hidden="true">
    <defs>
      <clipPath id="drum-outside-glass"><path clip-rule="evenodd" d="M0 0H307V72H0Z ${capsule}"/></clipPath>
      <clipPath id="drum-inside-glass"><path d="${capsule}"/></clipPath>
      <filter id="drum-glass-refraction" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="84" y="-4" width="139" height="68" color-interpolation-filters="sRGB">
        <feImage href="${canvas.toDataURL()}" x="88" y="0" width="131" height="60" preserveAspectRatio="none" result="lens"/>
        <feDisplacementMap in="SourceGraphic" in2="lens" scale="6" xChannelSelector="R" yChannelSelector="G" result="bent"/>
        <feGaussianBlur in="bent" stdDeviation="2"/>
      </filter>
    </defs>
    <g class="drum-ticks" clip-path="url(#drum-outside-glass)" fill="none" stroke="white" stroke-width="1" stroke-linecap="round"></g>
    <g clip-path="url(#drum-inside-glass)"><g class="drum-glass-ticks" filter="url(#drum-glass-refraction)" fill="none" stroke="white" stroke-width="1" stroke-linecap="round"></g></g>
  </svg><output class="drum-value" aria-hidden="true"><span class="drum-number"></span><span>LM</span></output><i class="drum-center" aria-hidden="true"></i>`;
  const number = element.querySelector('.drum-number');
  const groups = [element.querySelector('.drum-ticks'), element.querySelector('.drum-glass-ticks')];
  const ticks = Array.from({ length: TICK_COUNT }, () => groups.map(group => {
    const tick = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    group.append(tick); return tick;
  }));
  let lastLabel = '';
  return position => {
    getDrumTicks(position).forEach(({ x, opacity, value }, index) => {
      for (const tick of ticks[index]) {
        tick.setAttribute('d', `M${x.toFixed(3)} 48.5V71.5`);
        tick.setAttribute('opacity', opacity.toFixed(3));
        tick.dataset.value = String(value);
      }
    });
    const label = String(Math.round(clamp(position)));
    if (label !== lastLabel) { number.textContent = label; element.setAttribute('aria-valuenow', label); element.setAttribute('aria-valuetext', `${label} LM`); lastLabel = label; }
  };
}

export function createBrightnessDrum({ element, getScale, onBegin, onChange, onCommit, onCancel }) {
  const paint = createRuler(element), sound = createDrumSound();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const listeners = new AbortController();
  let selectedId = null, position = 0, value = 0, target = 0, velocity = 0;
  let active = false, gesture = null, frame = 0, timer = 0, lastFrame = 0, lastDetent = 0;
  let pending = null, destroyed = false, inputMode = null;

  function publish(next) {
    const previous = position;
    position = clamp(next); paint(position);
    const nextValue = position;
    // A detent sounds when its stroke reaches the fixed centre, not halfway
    // to the next stroke. Reversing over the same notch does not chatter.
    const increasing = nextValue > previous;
    const detent = increasing ? Math.floor(nextValue + DETENT_EPSILON) : Math.ceil(nextValue - DETENT_EPSILON);
    const crossed = increasing
      ? detent > Math.floor(previous + DETENT_EPSILON)
      : detent < Math.ceil(previous - DETENT_EPSILON);
    if (active && crossed && detent !== lastDetent) {
      sound.tick(.4 + Math.min(1, Math.abs(velocity) / 100) * .3);
      lastDetent = detent;
    }
    if (Math.abs(value - nextValue) > .0001) { value = nextValue; onChange(value); }
  }
  function stopFrame() { cancelAnimationFrame(frame); clearTimeout(timer); frame = 0; timer = 0; pending = null; }
  function begin() {
    if (selectedId === null || destroyed) return false;
    if (!active) { onBegin(); active = true; lastDetent = centeredDetent(value); }
    element.classList.add('is-adjusting');
    return true;
  }
  function releasePointer() {
    element.classList.remove('is-dragging');
    if (!gesture) return;
    const id = gesture.id; gesture = null;
    if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
  }
  function finish(cancel = false) {
    const finalValue = pending ?? (inputMode === 'keyboard' ? target : position);
    stopFrame(); releasePointer(); velocity = 0;
    if (!active) return;
    if (!cancel) publish(Math.round(clamp(finalValue)));
    inputMode = null;
    active = false; element.classList.remove('is-adjusting');
    if (cancel) onCancel(); else onCommit();
  }
  function springStep(now) {
    const dt = Math.min(1 / 30, Math.max(.001, (now - lastFrame) / 1000)); lastFrame = now;
    const acceleration = (target - position) * 360 - velocity * 39;
    velocity += acceleration * dt;
    const next = position + velocity * dt;
    if (next <= 0 && velocity < 0 || next >= 100 && velocity > 0) velocity = 0;
    publish(next);
    if (Math.abs(target - position) < .008 && Math.abs(velocity) < .1) {
      if (Math.abs(target - Math.round(target)) > .0001) {
        target = Math.round(target);
      } else { publish(target); frame = 0; finish(); return; }
    }
    frame = requestAnimationFrame(springStep);
  }
  function settle(next, initialVelocity = 0, mode = 'momentum') {
    stopFrame();
    if (!begin()) return;
    target = clamp(next); velocity = initialVelocity; inputMode = mode;
    if (position <= 0 && velocity < 0 || position >= 100 && velocity > 0) velocity = 0;
    if (reducedMotion.matches) { publish(target); timer = setTimeout(() => finish(), 120); return; }
    lastFrame = performance.now(); frame = requestAnimationFrame(springStep);
  }
  function queueDrag(next) {
    pending = next;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; const nextPosition = pending; pending = null; if (nextPosition !== null) publish(nextPosition); });
  }
  const listen = (targetElement, type, callback, options = {}) => targetElement.addEventListener(type, callback, { ...options, signal: listeners.signal });

  listen(element, 'pointerdown', event => {
    if (event.button !== 0 || event.isPrimary === false || selectedId === null || gesture) return;
    event.preventDefault(); event.stopPropagation(); sound.unlock();
    // Grabbing a coasting wheel stops it immediately and continues the same
    // undo transaction, without jumping to its former destination.
    stopFrame(); velocity = 0;
    if (!begin()) return;
    inputMode = 'pointer';
    element.classList.add('has-pointer-input');
    position = value;
    gesture = { id: event.pointerId, scale: getScale(), lastX: event.clientX, time: performance.now() };
    element.classList.add('is-dragging');
    element.setPointerCapture(event.pointerId); element.focus({ preventScroll: true });
  });
  listen(element, 'pointermove', event => {
    if (event.pointerId !== gesture?.id) return;
    event.preventDefault();
    const now = performance.now(), dt = Math.max(8, now - gesture.time);
    // Pulling the ruler left brings its higher values under the fixed index.
    const delta = (gesture.lastX - event.clientX) / gesture.scale / PIXELS_PER_LM;
    const instantaneous = delta / dt * 1000;
    velocity = clamp(instantaneous * .65 + velocity * .35, -120, 120);
    const next = clamp((pending ?? position) + delta);
    if (next <= 0 && delta < 0 || next >= 100 && delta > 0) velocity = 0;
    gesture.lastX = event.clientX; gesture.time = now;
    queueDrag(next);
  });
  listen(element, 'pointerup', event => {
    if (event.pointerId !== gesture?.id) return;
    const releaseVelocity = performance.now() - gesture.time < 100 ? velocity : 0;
    const finalPosition = pending ?? position;
    stopFrame(); publish(finalPosition); releasePointer();
    settle(Math.round(clamp(finalPosition + releaseVelocity * .055)), releaseVelocity);
  });
  for (const type of ['pointercancel', 'lostpointercapture']) listen(element, type, event => { if (event.pointerId === gesture?.id) finish(true); });
  listen(element, 'wheel', event => {
    if (selectedId === null || event.ctrlKey) return;
    event.preventDefault(); event.stopPropagation();
    if (gesture) return;
    sound.unlock();
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : -event.deltaY;
    const step = clamp(delta * (event.deltaMode === 2 ? 50 : event.deltaMode === 1 ? .7 : .05), -8, 8);
    if (!step) return;
    settle((active ? target : value) + step, velocity, 'wheel');
  }, { passive: false });
  listen(element, 'keydown', event => {
    element.classList.remove('has-pointer-input');
    if (selectedId === null || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = event.shiftKey ? 10 : 1;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 }[event.key];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); event.stopPropagation();
    if (gesture) return;
    sound.unlock();
    settle(event.key === 'Home' ? 0 : event.key === 'End' ? 100 : Math.round((active ? target : value) + delta), velocity, 'keyboard');
  });
  listen(element, 'blur', () => { element.classList.remove('has-pointer-input'); if (!gesture) finish(); });
  listen(window, 'blur', () => finish());
  listen(document, 'visibilitychange', () => { if (document.hidden) finish(); });
  paint(position);
  return {
    sync(light) {
      if (destroyed) return;
      if ((light?.id ?? null) !== selectedId) {
        // The host commits edits before changing selection. Stop any stale
        // visual work without writing the previous value into a new source.
        stopFrame(); releasePointer(); active = false; velocity = 0;
        element.classList.remove('is-adjusting');
      }
      if (!light) { selectedId = null; return; }
      if (selectedId !== light.id || !active) {
        selectedId = light.id; value = light.value; position = value; target = value; lastDetent = centeredDetent(value); paint(position);
      }
      element.setAttribute('aria-label', light.label);
    },
    finish,
    destroy() { if (destroyed) return; finish(); destroyed = true; listeners.abort(); sound.destroy(); }
  };
}
