const clamp = value => Math.max(0, Math.min(100, value));
const HALF_SPAN_PER_UNIT = .54;

// At zero this is a short straight stroke; widening adds span and curvature.
export function getBeamArc(value) {
  const width = clamp(value), halfSpan = 9 + width * HALF_SPAN_PER_UNIT;
  const rise = width * .22;
  return `M ${80 - halfSpan} ${36 + rise} Q 80 ${36 - rise} ${80 + halfSpan} ${36 + rise}`;
}

export function createBeamEditor({ host, onChange = () => {}, onBegin = () => {}, onCommit = () => {}, onCancel = () => {} }) {
  const root = document.createElement('div');
  root.className = 'beam-editor'; root.hidden = true;
  root.innerHTML = `<svg class="beam-editor__control" viewBox="0 0 160 140" role="slider" tabindex="0" aria-label="Ширина луча" aria-valuemin="0" aria-valuemax="100" aria-orientation="horizontal" aria-describedby="beam-instructions"><path class="beam-editor__arc" aria-hidden="true"/><path class="beam-editor__hit" aria-hidden="true"/></svg><span id="beam-instructions" class="sr-only">Потяните край дуги наружу, чтобы расширить луч, или внутрь, чтобы сузить. Середину можно двигать вправо или влево. Стрелки меняют ширину, Home и End задают минимум и максимум.</span>`;
  host.append(root);
  const control = root.querySelector('.beam-editor__control');
  const arc = root.querySelector('.beam-editor__arc'), hit = root.querySelector('.beam-editor__hit');
  const listeners = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let light = null, gesture = null, angle = 0, anchor = null, destroyed = false;
  let displayed = 0, target = 0, velocity = 0, frame = 0, lastFrame = 0;

  function paint(value) {
    const path = getBeamArc(value);
    arc.setAttribute('d', path); hit.setAttribute('d', path);
  }
  function stopMotion() { cancelAnimationFrame(frame); frame = 0; velocity = 0; }
  function animate(now) {
    frame = 0;
    if (destroyed || root.hidden) return;
    const dt = Math.min(1 / 30, Math.max(.001, (now - lastFrame) / 1000)); lastFrame = now;
    velocity += ((target - displayed) * 380 - velocity * 39) * dt;
    displayed = clamp(displayed + velocity * dt);
    if (Math.abs(target - displayed) < .015 && Math.abs(velocity) < .12) {
      displayed = target; velocity = 0; paint(displayed); return;
    }
    paint(displayed); frame = requestAnimationFrame(animate);
  }
  function setWidth(value, immediate = false) {
    target = clamp(value);
    control.setAttribute('aria-valuenow', String(Math.round(target)));
    control.setAttribute('aria-valuetext', `${Math.round(target)}% ширины луча`);
    if (immediate || gesture || reducedMotion.matches) {
      stopMotion(); displayed = target; paint(displayed);
    } else if (!frame && Math.abs(target - displayed) > .001) {
      lastFrame = performance.now(); frame = requestAnimationFrame(animate);
    }
  }
  function emit(value) {
    if (!light) return;
    const width = Math.round(clamp(value) * 10) / 10;
    if (width === light.beamWidth) return;
    light = { ...light, beamWidth: width }; setWidth(width); onChange({ beamWidth: width });
  }
  function finish(cancel = false) {
    if (!gesture) return;
    const previous = gesture; gesture = null; root.classList.remove('is-adjusting');
    if (control.hasPointerCapture(previous.pointerId)) control.releasePointerCapture(previous.pointerId);
    if (cancel) onCancel(); else onCommit();
  }
  const listen = (element, type, callback, options = {}) => element.addEventListener(type, callback, { ...options, signal: listeners.signal });
  listen(control, 'pointerdown', event => {
    event.stopPropagation();
    if (!light || !anchor || gesture || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    const screen = host.closest('.screen').getBoundingClientRect(), scale = screen.width / 587;
    const radians = angle * Math.PI / 180;
    const dx = (event.clientX - screen.left) / scale - anchor.x;
    const dy = (event.clientY - screen.top) / scale - anchor.y;
    const across = dx * Math.cos(radians) + dy * Math.sin(radians);
    const centreZone = Math.max(4, Math.min(14, (9 + displayed * HALF_SPAN_PER_UNIT) * .25));
    // Keep the chosen side stable while the arc itself changes shape.
    const side = Math.abs(across) <= centreZone ? 0 : Math.sign(across);
    gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      value: light.beamWidth ?? 60, scale, radians, side };
    setWidth(gesture.value, true);
    control.setPointerCapture(event.pointerId); control.focus({ preventScroll: true });
    root.classList.add('is-adjusting', 'has-pointer-input'); onBegin();
  });
  listen(control, 'pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    const delta = gesture.side === 0 ? dx :
      (dx * Math.cos(gesture.radians) + dy * Math.sin(gesture.radians)) * gesture.side;
    // Incremental motion lets reversing away from 0/100 respond immediately.
    gesture.value = clamp(gesture.value + delta / gesture.scale / HALF_SPAN_PER_UNIT);
    gesture.x = event.clientX; gesture.y = event.clientY;
    emit(gesture.value);
  });
  listen(control, 'pointerup', event => { if (event.pointerId === gesture?.pointerId) finish(); });
  for (const type of ['pointercancel', 'lostpointercapture']) listen(control, type, event => {
    if (event.pointerId === gesture?.pointerId) finish(true);
  });
  listen(control, 'keydown', event => {
    root.classList.remove('has-pointer-input');
    if (!light || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && gesture) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
    if (gesture) { event.preventDefault(); event.stopPropagation(); return; }
    const step = event.shiftKey ? 10 : 2;
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step, PageDown: -10, PageUp: 10 }[event.key];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault(); event.stopPropagation(); onBegin();
    emit(event.key === 'Home' ? 0 : event.key === 'End' ? 100 : (light.beamWidth ?? 60) + delta); onCommit();
  });
  listen(control, 'click', event => event.stopPropagation());
  function stopMotionAtTarget() { stopMotion(); displayed = target; paint(displayed); }
  listen(control, 'blur', () => { root.classList.remove('has-pointer-input'); if (!gesture) stopMotionAtTarget(); });
  listen(window, 'blur', () => finish());
  listen(document, 'visibilitychange', () => { if (document.hidden) { finish(); stopMotionAtTarget(); } });
  listen(reducedMotion, 'change', () => { if (reducedMotion.matches) stopMotionAtTarget(); });

  return {
    show(next, nextAnchor) {
      if (destroyed || !next) return;
      const changed = light?.id !== next.id;
      if (changed) finish();
      light = { ...next }; root.hidden = false; setWidth(light.beamWidth ?? 60, changed);
      if (gesture) return;
      anchor = { ...nextAnchor };
      angle = Math.atan2(566 - anchor.y, 293.5 - anchor.x) * 180 / Math.PI + 90;
      root.style.left = `${anchor.x - 80}px`; root.style.top = `${anchor.y - 108}px`; root.style.transform = `rotate(${angle}deg)`;
    },
    hide() { finish(); stopMotion(); root.hidden = true; light = null; anchor = null; },
    end() { finish(); },
    cancel() { finish(true); },
    destroy() { finish(); stopMotion(); destroyed = true; listeners.abort(); root.remove(); }
  };
}
