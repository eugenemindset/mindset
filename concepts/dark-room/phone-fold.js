import { createPhoneDevice } from 'duo/phone-device.js';

const WIDTH = 644, HEIGHT = 887, STORAGE_KEY = 'duo-phone-open-v1';
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = (start, end, value) => {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
};

// The room remains the source of truth. Its current pixels are copied inside
// its render callback, before WebGL releases the back buffer. No screenshots,
// duplicate room scene, or frozen lighting state are used for the fold.
export function createPhoneFold({ presentation, artboard, screen, deviceImage, onProgress, onBeforeClose }) {
  const lifetime = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.createElement('canvas');
  canvas.className = 'phone-device-canvas';
  canvas.width = WIDTH; canvas.height = HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  artboard.prepend(canvas);

  const innerCanvas = document.createElement('canvas');
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  innerCanvas.width = Math.round(587 * pixelRatio); innerCanvas.height = Math.round(827 * pixelRatio);
  const coverCanvas = document.createElement('canvas');
  coverCanvas.width = innerCanvas.width; coverCanvas.height = Math.round(400 * pixelRatio);
  const inner = innerCanvas.getContext('2d', { alpha: false });
  const cover = coverCanvas.getContext('2d', { alpha: false });
  for (const [context, image] of [[inner, innerCanvas], [cover, coverCanvas]]) {
    context.fillStyle = '#000'; context.fillRect(0, 0, image.width, image.height);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'phone-fold-keyboard-toggle';
  toggle.setAttribute('aria-controls', screen.id);
  toggle.hidden = true;
  presentation.append(toggle);
  const instructions = document.createElement('p');
  instructions.className = 'sr-only'; instructions.id = 'phone-fold-instructions';
  instructions.textContent = 'Нажмите на фон вокруг телефона, чтобы открыть или закрыть его. При закрытии настройки освещения сохраняются.';
  presentation.append(instructions);
  presentation.setAttribute('aria-describedby', instructions.id);

  let wantedOpen = false;
  try { wantedOpen = sessionStorage.getItem(STORAGE_KEY) === 'open'; } catch {}
  if (!wantedOpen) {
    presentation.classList.add('phone-loading');
    presentation.dataset.phoneState = 'loading';
    screen.inert = true; screen.setAttribute('aria-hidden', 'true');
  }
  let device = null, progress = 1, target = wantedOpen ? 1 : 0;
  let velocity = 0, frame = 0, previousTime = 0, lastPresented = 1;
  let destroyed = false, ready = false, backgroundPress = null;
  let currentWidth = canvas.width, currentHeight = canvas.height;
  let currentDPR = window.devicePixelRatio || 1;
  let lastDeviceProgress = -1;
  let closeHandoffPending = false;

  function renderDevice(presentedProgress = lastPresented) {
    if (!device) return;
    device.setProgress(presentedProgress);
    device.render(); lastDeviceProgress = presentedProgress;
  }

  function updateUI() {
    if (!ready) return;
    // Reveal follows the texture and pose actually on screen, never a future
    // animation request. The wider interval gives the glass handoff ~200 ms.
    const reveal = smooth(.80, 1, lastDeviceProgress);
    const interactive = target === 1 && progress === 1 && lastPresented === 1 && lastDeviceProgress === 1;
    presentation.style.setProperty('--phone-ui-opacity', String(reveal));
    presentation.style.setProperty('--phone-ui-blur', `${(1 - reveal) * 12}px`);
    presentation.dataset.phoneState = interactive ? 'open' : progress === 0 ? 'closed' : target ? 'opening' : 'closing';
    screen.inert = !interactive;
    screen.setAttribute('aria-hidden', String(!interactive));
    toggle.setAttribute('aria-expanded', String(target === 1));
    toggle.setAttribute('aria-label', target === 1 ? 'Закрыть телефон' : 'Открыть телефон');
    toggle.textContent = target === 1 ? 'Закрыть телефон' : 'Открыть телефон';
  }

  function paintProgress() {
    const scheduled = onProgress(progress);
    // The next room frame supplies the matching textures and renders the
    // device once; hidden tabs and renderer failure have no such callback.
    if (scheduled === false || document.hidden) renderDevice(progress);
    updateUI();
  }
  function startAnimation() {
    if (!frame && progress !== target) { previousTime = performance.now(); frame = requestAnimationFrame(step); }
  }
  function settleImmediately() {
    closeHandoffPending = false;
    cancelAnimationFrame(frame); frame = 0; velocity = 0; progress = target;
    paintProgress();
  }
  function step(now) {
    frame = 0;
    if (destroyed || !ready) return;
    const dt = Math.min(.05, Math.max(.001, (now - previousTime) / 1000));
    previousTime = now;
    // A restrained spring keeps the angled, frosted phase visible, while
    // preserving velocity on a reversal and settling without a hard stop.
    const rate = target === 0 ? 4.2 : 5, displacement = progress - target;
    const impulse = velocity + rate * displacement, decay = Math.exp(-rate * dt);
    progress = clamp(target + (displacement + impulse * dt) * decay);
    velocity = (velocity - rate * impulse * dt) * decay;
    if (Math.abs(progress - target) < .0005 && Math.abs(velocity) < .005) {
      progress = target; velocity = 0;
    }
    paintProgress();
    if (progress !== target) frame = requestAnimationFrame(step);
  }
  function setOpen(open) {
    if (!ready || destroyed) return;
    target = open ? 1 : 0;
    closeHandoffPending = false;
    if (!open) onBeforeClose();
    if (screen.contains(document.activeElement)) document.activeElement.blur();
    try { sessionStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed'); } catch {}
    updateUI();
    if (reducedMotion.matches || document.hidden) { settleImmediately(); return; }
    if (!open && progress === 1) {
      // The fully open optimization skips texture uploads during light edits.
      // Refresh at the same flat pose BEFORE revealing the 3D display, so its
      // first closing frame can never contain an older lighting setup.
      closeHandoffPending = true;
      cancelAnimationFrame(frame); frame = 0; velocity = 0;
      if (onProgress(1) === false) { closeHandoffPending = false; startAnimation(); }
      return;
    }
    startAnimation();
  }

  function isBackground(event) {
    if (!ready || event.target.closest('button,a,input,[role="slider"],.light-marker')) return false;
    // Screen hit testing stays precise at rest, and the device raycast follows
    // its real silhouette throughout folding (including the empty canvas).
    if (progress === 1 && screen.contains(event.target)) return false;
    return !device.hitTest(event.clientX, event.clientY);
  }
  const listen = (element, type, callback, options = {}) => element.addEventListener(type, callback, { ...options, signal: lifetime.signal });
  listen(document, 'pointerdown', event => {
    backgroundPress = event.button === 0 && event.isPrimary !== false && isBackground(event)
      ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  }, { passive: true });
  listen(document, 'pointerup', event => {
    const press = backgroundPress; backgroundPress = null;
    if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6 && isBackground(event)) setOpen(target !== 1);
  }, { passive: true });
  listen(document, 'pointercancel', () => { backgroundPress = null; });
  listen(window, 'blur', () => { backgroundPress = null; });
  listen(toggle, 'click', () => setOpen(target !== 1));
  listen(document, 'visibilitychange', () => { if (document.hidden && ready) settleImmediately(); });
  listen(reducedMotion, 'change', () => { if (reducedMotion.matches && ready) settleImmediately(); });

  function captureFrame({ canvas: source, cinematicRect, progress: renderedProgress }) {
    if (destroyed) return;
    lastPresented = renderedProgress;
    // The real DOM screen covers the inner texture at the fully open endpoint.
    // Avoid an extra texture upload/device render on every light-drag frame.
    if (ready && progress === 1 && target === 1 && renderedProgress === 1) {
      if (lastDeviceProgress !== 1) renderDevice(1);
      updateUI(); return;
    }
    if (innerCanvas.width !== source.width || innerCanvas.height !== source.height) {
      innerCanvas.width = source.width; innerCanvas.height = source.height;
      coverCanvas.width = source.width; coverCanvas.height = Math.round(400 * source.height / 827);
    }
    inner.drawImage(source, 0, 0, source.width, source.height, 0, 0, innerCanvas.width, innerCanvas.height);
    const sx = source.width / 587, sy = source.height / 827;
    cover.drawImage(source, cinematicRect.x * sx, cinematicRect.y * sy, cinematicRect.width * sx, cinematicRect.height * sy, 0, 0, coverCanvas.width, coverCanvas.height);
    if (ready) {
      renderDevice(renderedProgress); updateUI();
      if (closeHandoffPending && target === 0 && renderedProgress === 1) {
        closeHandoffPending = false; startAnimation();
      }
    }
  }
  function resize() {
    if (destroyed) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    const dpr = window.devicePixelRatio || 1;
    if (device && (width !== currentWidth || height !== currentHeight || dpr !== currentDPR)) {
      currentWidth = width; currentHeight = height; currentDPR = dpr; device.resize();
      renderDevice(lastDeviceProgress >= 0 ? lastDeviceProgress : progress);
    }
  }

  const loaded = createPhoneDevice({ canvas, innerCanvas, coverCanvas,
    onError(error) { console.error('Phone rendering failed', error); }
  }).then(result => {
    if (destroyed) { result.destroy(); return; }
    device = result; ready = true; progress = target;
    presentation.classList.remove('phone-loading');
    presentation.classList.add('has-fold-device');
    deviceImage.hidden = true; toggle.hidden = false;
    resize(); paintProgress();
  }).catch(error => {
    if (destroyed) return;
    // The original flat phone remains fully usable if WebGL/model loading fails.
    device?.destroy(); ready = false; canvas.remove(); toggle.remove(); progress = 1; target = 1;
    presentation.classList.remove('has-fold-device', 'phone-loading'); deviceImage.hidden = false;
    screen.inert = false; screen.removeAttribute('aria-hidden');
    onProgress(1); console.error('Phone model unavailable', error);
  });

  return {
    captureFrame, resize, setOpen,
    get progress() { return ready ? progress : 1; },
    get ready() { return loaded; },
    destroy() {
      if (destroyed) return;
      destroyed = true; cancelAnimationFrame(frame); lifetime.abort();
      device?.destroy(); canvas.remove(); toggle.remove(); instructions.remove();
      screen.inert = false; screen.removeAttribute('aria-hidden');
      presentation.classList.remove('has-fold-device', 'phone-loading'); deviceImage.hidden = false;
    }
  };
}
