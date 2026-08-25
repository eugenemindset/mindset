/*
  Replaces the mouse pointer with a finger-tap disc while it is over a phone
  mockup, so desktop previews read like touch. Shared by every concept:

    <script src="../shared/touch-cursor.js" data-target=".frame"></script>

  Touch and pen input are left alone — there the real finger is already there.
*/
(() => {
  const script = document.currentScript;
  const targetSelector = (script && script.dataset.target) || ".frame";

  const css = `
    .tap-cursor {
      position: fixed;
      left: 0;
      top: 0;
      width: 46px;
      height: 46px;
      margin: -23px 0 0 -23px;
      pointer-events: none;
      z-index: 2147483000;
      opacity: 0;
      transition: opacity 130ms ease-out;
      will-change: transform;
    }
    .tap-cursor.is-visible { opacity: 1; }
    .tap-cursor__dot {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: rgba(18, 18, 20, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.5);
      box-shadow:
        0 4px 13px rgba(0, 0, 0, 0.2),
        0 1px 3px rgba(0, 0, 0, 0.12);
      transform: scale(1);
      transition: transform 110ms cubic-bezier(0.22, 0.61, 0.36, 1);
    }
    .tap-cursor.is-down .tap-cursor__dot {
      transform: scale(0.86);
      background: rgba(18, 18, 20, 0.1);
      border-color: rgba(255, 255, 255, 0.65);
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
    }
    html.tap-cursor-on ${targetSelector},
    html.tap-cursor-on ${targetSelector} * { cursor: none !important; }
  `;

  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);

  const el = document.createElement("div");
  el.className = "tap-cursor";
  el.innerHTML = '<span class="tap-cursor__dot"></span>';

  function mount() {
    document.body.appendChild(el);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  let visible = false;
  let frame = 0;
  let px = 0;
  let py = 0;

  function render() {
    frame = 0;
    el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
  }

  function show(on) {
    if (on === visible) return;
    visible = on;
    el.classList.toggle("is-visible", on);
    document.documentElement.classList.toggle("tap-cursor-on", on);
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType !== "mouse") return;
      const over = e.target instanceof Element && e.target.closest(targetSelector);
      show(!!over);
      if (!over) return;
      px = e.clientX;
      py = e.clientY;
      // one write per frame, otherwise a fast mouse queues up layout work
      if (!frame) frame = requestAnimationFrame(render);
    },
    { passive: true }
  );

  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || !visible) return;
    el.classList.add("is-down");
  });

  const release = () => el.classList.remove("is-down");
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  window.addEventListener("blur", release);

  document.addEventListener("pointerleave", () => show(false));
  window.addEventListener("blur", () => show(false));
})();
