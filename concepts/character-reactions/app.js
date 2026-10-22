import { createChromaRenderer } from "./chroma-renderer.js";
import { REACTIONS } from "./reactions.js";
const $ = (s) => document.querySelector(s);
const canvas = $("#character"),
  character = $(".character"),
  camera = $("#webcam"),
  cameraButton = $("#camera-toggle"),
  status = $("#status");
let ready = false,
  playing = false,
  workerReady = false,
  workerBusy = false,
  stream = null,
  worker = null,
  request = 0,
  lastFrame = 0,
  lastCameraTime = -1,
  cameraGeneration = 0,
  active = null,
  idle = null,
  render,
  playbackSerial = 0;
const timers = new Set(),
  clips = new Map(),
  variantCounts = new Map();
$("#grain").checked = false;
function cameraLabel(text) {
  cameraButton.querySelector("span").textContent = text;
}
function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle("error", error);
}
function delay(fn, ms) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}
function once(target, event) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => finish(new Error(`${event} timeout`)),
      30000,
    );
    const success = () => finish();
    const error = () => finish(new Error("Video could not load"));
    function finish(e) {
      clearTimeout(timeout);
      target.removeEventListener(event, success);
      target.removeEventListener("error", error);
      e ? reject(e) : resolve();
    }
    target.addEventListener(event, success, { once: true });
    target.addEventListener("error", error, { once: true });
  });
}
function redraw() {
  if (active && render) render(active.video.currentTime);
}
$("#grain").addEventListener("change", redraw);
$("#edge-mode").addEventListener("change", redraw);
async function cue(clip) {
  clip.video.pause();
  if (clip.video.currentTime !== clip.start) {
    const settled = once(clip.video, "seeked");
    clip.video.currentTime = clip.start;
    await settled;
  }
}
function clearBubbles() {
  for (const timer of timers) clearTimeout(timer);
  timers.clear();
  $("#bubbles").replaceChildren();
}
let bubbleCount = 0;
function addBubbles(clip, count) {
  if (!$("#comments").checked || bubbleCount++ % 4 === 3) return;
  delay(() => {
    if (!playing) return;
    const bubble = document.createElement("span");
    bubble.className = "bubble";
    bubble.textContent = clip.lines[Math.floor(count / 2) % clip.lines.length];
    $("#bubbles").append(bubble);
    bubble.addEventListener("animationend", () => bubble.remove(), {
      once: true,
    });
  }, 380);
}
function drawFrame(serial, clip, metadata) {
  if (!playing || serial !== playbackSerial || active !== clip) return;
  render(metadata?.mediaTime ?? clip.video.currentTime);
  if (clip.video.requestVideoFrameCallback)
    clip.video.requestVideoFrameCallback((now, meta) =>
      drawFrame(serial, clip, meta),
    );
  else requestAnimationFrame(() => drawFrame(serial, clip));
}
async function restoreIdle(clip) {
  ++playbackSerial;
  clip.video.pause();
  if (clip !== idle) {
    active = idle;
    redraw();
  }
  try {
    clip.preparing = cue(clip);
    await clip.preparing;
    active = idle;
    redraw();
  } finally {
    playing = false;
    document.body.dataset.reaction = "idle";
  }
  message(
    stream ? "ready for your reaction" : "turn on camera · 1–4 to preview",
  );
}
async function playReaction(kind) {
  if (!ready || playing || !REACTIONS[kind]) return;
  playing = true;
  const definition = REACTIONS[kind],
    count = variantCounts.get(kind) || 0;
  const clip = clips.get(
    definition.clips[count % definition.clips.length].file,
  );
  const serial = ++playbackSerial;
  clearBubbles();
  try {
    await clip.preparing;
    clip.video.playbackRate =
      (clip.video.duration - clip.start) / (3 / Number($("#speed").value));
    active = clip;
    document.body.dataset.reaction = kind;
    document.body.dataset.clip = clip.file;
    render(clip.start);
    await clip.video.play();
    variantCounts.set(kind, count + 1);
    drawFrame(serial, clip);
    addBubbles(clip, count);
    message(definition.label);
  } catch (error) {
    console.error(error);
    await restoreIdle(clip);
    message("Ролик не запустился. Попробуй кнопку реакции ещё раз.", true);
  }
}
async function loadClip(spec) {
  const response = await fetch("assets/" + spec.file);
  if (!response.ok) throw Error("Video fetch failed: " + spec.file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.hidden = true;
  const clip = {
    ...spec,
    video,
    url: URL.createObjectURL(await response.blob()),
    preparing: Promise.resolve(),
  };
  clips.set(spec.file, clip);
  document.body.append(video);
  video.src = clip.url;
  video.load();
  if (video.readyState < 2) await once(video, "loadeddata");
  if (video.videoWidth !== 2160 || video.videoHeight !== 3840)
    throw Error("Unexpected clip dimensions: " + spec.file);
  await video.play();
  video.pause();
  await cue(clip);
  video.addEventListener("ended", () => {
    if (active === clip && playing) restoreIdle(clip).catch(console.error);
  });
  return clip;
}
async function preload() {
  try {
    const specs = Object.values(REACTIONS).flatMap((r) => r.clips);
    idle = await loadClip(specs[0]);
    active = idle;
    render = createChromaRenderer(
      canvas,
      () => active.video,
      () => $("#grain").checked,
      () => $("#edge-mode").value,
      () => !!active.alpha,
    );
    redraw();
    character.classList.add("ready");
    let loaded = 1,
      next = 1;
    cameraLabel(`loading ${loaded}/${specs.length}`);
    // Two decoders at a time during warm-up; every clip holds its own prepared first frame.
    async function lane() {
      while (next < specs.length) {
        const spec = specs[next++];
        await loadClip(spec);
        loaded++;
        cameraLabel(`loading ${loaded}/${specs.length}`);
      }
    }
    await Promise.all([lane(), lane()]);
    ready = true;
    document.body.dataset.video = "ready";
    cameraLabel("turn on");
    cameraButton.disabled = false;
    document
      .querySelectorAll("[data-demo]")
      .forEach((button) => (button.disabled = false));
    message("turn on camera · 1–4 to preview");
    warmTracker();
  } catch (error) {
    message("Не все ролики загрузились. Обнови страницу.", true);
    console.error(error);
    cameraLabel("reload");
    cameraButton.disabled = false;
  }
}
function warmTracker() {
  if (worker) return;
  worker = new Worker("tracking-worker.js");
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") {
      workerReady = true;
      document.body.dataset.tracking = "ready";
      if (stream) {
        cameraLabel("turn off");
        message("ready for your reaction");
        scheduleTracking();
      }
    }
    if (data.type === "result") {
      workerBusy = false;
      if (stream && data.reaction) playReaction(data.reaction);
    }
    if (data.type === "error") trackerError(data.message);
  };
  worker.onerror = (event) => trackerError(event.message);
  worker.postMessage({ type: "init" });
}
function trackerError(error) {
  if (stream) cameraLabel("turn off");
  workerBusy = false;
  workerReady = false;
  document.body.dataset.tracking = "error";
  message("Распознавание недоступно. Клавиши 1–4 — реакции вручную.", true);
  console.error(error);
  worker?.terminate();
  worker = null;
}
async function track(now) {
  if (!stream) return;
  request = requestAnimationFrame(track);
  if (
    document.hidden ||
    window.scrollY > startHeight ||
    !workerReady ||
    workerBusy ||
    now - lastFrame < 65 ||
    camera.readyState < 2 ||
    camera.currentTime === lastCameraTime
  )
    return;
  workerBusy = true;
  lastFrame = now;
  lastCameraTime = camera.currentTime;
  const generation = cameraGeneration;
  try {
    const frame = await createImageBitmap(camera, {
      resizeWidth: 480,
      resizeHeight: Math.round((camera.videoHeight * 480) / camera.videoWidth),
    });
    if (!stream || generation !== cameraGeneration || !worker) {
      frame.close();
      workerBusy = false;
      return;
    }
    worker.postMessage(
      { type: "frame", frame, timestamp: now, blocked: playing },
      [frame],
    );
  } catch (error) {
    workerBusy = false;
    console.warn(error);
  }
}
function scheduleTracking() {
  cancelAnimationFrame(request);
  request = requestAnimationFrame(track);
}
function stopCamera() {
  cameraGeneration++;
  cancelAnimationFrame(request);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  camera.srcObject = null;
  $("#webcam-wrap").hidden = true;
  cameraLabel("turn on");
  worker?.postMessage({ type: "reset" });
  message("turn on camera · 1–4 to preview");
}
async function toggleCamera() {
  if (!ready) {
    location.reload();
    return;
  }
  if (stream) {
    stopCamera();
    return;
  }
  cameraButton.disabled = true;
  cameraLabel("starting…");
  message("allow camera access");
  const generation = ++cameraGeneration;
  try {
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error("Открой сайт по localhost или HTTPS.");
    const next = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 360 },
        facingMode: "user",
      },
      audio: false,
    });
    if (generation !== cameraGeneration) {
      next.getTracks().forEach((t) => t.stop());
      return;
    }
    stream = next;
    camera.srcObject = stream;
    await camera.play();
    $("#webcam-wrap").hidden = false;
    cameraLabel(workerReady ? "turn off" : "starting…");
    stream
      .getVideoTracks()[0]
      .addEventListener("ended", stopCamera, { once: true });
    message(
      workerReady
        ? "ready for your reaction"
        : "preparing hand and face tracking…",
    );
    warmTracker();
    scheduleTracking();
  } catch (error) {
    stopCamera();
    message(
      error.name === "NotAllowedError"
        ? "Разреши камеру в адресной строке. Клавиши 1–4 — проверить реакции."
        : error.name === "NotReadableError"
          ? "Камера занята. Закрой другое приложение и попробуй ещё раз."
          : error.message,
      true,
    );
  } finally {
    cameraButton.disabled = false;
  }
}
cameraButton.addEventListener("click", toggleCamera);
document
  .querySelectorAll("[data-demo]")
  .forEach((button) =>
    button.addEventListener("click", () => playReaction(button.dataset.demo)),
  );
$("#settings-toggle").addEventListener("click", () => {
  const panel = $("#settings");
  panel.hidden = !panel.hidden;
  $("#settings-toggle").setAttribute("aria-expanded", String(!panel.hidden));
});
$("#contact").addEventListener("click", () =>
  message("Контактная ссылка пока не добавлена в концепт."),
);
window.addEventListener("keydown", (event) => {
  if (event.target.matches("input,select,textarea")) return;
  const kind =
    event.key.toLowerCase() === "h"
      ? "wave"
      : Object.keys(REACTIONS).find((key) => REACTIONS[key].key === event.key);
  if (kind) {
    event.preventDefault();
    playReaction(kind);
  }
  if (event.key === "Escape") {
    $("#settings").hidden = true;
    $("#settings-toggle").setAttribute("aria-expanded", "false");
  }
});
let scrollQueued = false,
  startHeight = 0;
function layout() {
  startHeight =
    window.innerWidth < 700
      ? Math.min(window.innerHeight - 70, window.innerWidth * 1.32)
      : window.innerHeight - 70;
  document.body.style.setProperty("--start-height", `${startHeight}px`);
  updateScroll();
}
function updateScroll() {
  scrollQueued = false;
  const width = window.innerWidth,
    mobile = width < 700,
    tablet = width <= 1000 && !mobile;
  const compact = mobile ? 172 : Math.min(231, Math.max(195, width * 0.134));
  const artHeight = 270;
  const progress = Math.min(
    1,
    Math.max(0, window.scrollY / (startHeight - compact)),
  );
  const eased = progress * progress * (3 - 2 * progress);
  const scale = 1 + ((artHeight - 12) / startHeight - 1) * progress;
  const style = document.body.style;
  const expandedFont = width * 0.0434,
    compactFont = width * (mobile ? 0.037 : 0.028);
  // Center both two-line halves in the space below navigation, keeping the header height unchanged.
  const compactTitleY = (compact + (mobile ? 45 : 49) - compactFont * 1.92) / 2;
  const titleY = (mobile ? 54 : 48) * (1 - eased) + compactTitleY * eased;
  const titleFont = expandedFont * (1 - eased) + compactFont * eased;
  const compactTop = startHeight * (mobile ? 0.04 : tablet ? -0.06 : -0.09);
  const expandedTop = startHeight * (mobile ? 0.13 : tablet ? -0.05 : -0.08);
  const heroHeight = Math.max(compact, startHeight - window.scrollY);
  const artY = (mobile ? 12 : 0) * progress;
  const initialFont = width * (mobile ? 0.54 : 0.47);
  const headlineBottom = (mobile ? 54 : 48) + expandedFont * 1.92 + 18;
  // On narrow screens center the glyph pair in the hero instead of anchoring it under the headline.
  const expandedGlyphHeight = Math.min(initialFont, (width - 32) / 2) * 1.06;
  const expandedKanjiTop =
    width <= 1000
      ? Math.max(headlineBottom, (startHeight - expandedGlyphHeight) / 2)
      : headlineBottom;
  const kanjiTop = expandedKanjiTop * (1 - progress) + (67 / scale) * progress;
  const desiredFont =
    initialFont * (1 - progress) + ((artHeight * 0.58) / scale) * progress;
  // Cap both axes together, retaining the glyphs’ natural proportions at every scroll position.
  const heightLimit = ((heroHeight - artY - 12) / scale - kanjiTop) / 1.06;
  const widthLimit = (width - 32) / (2 * scale);
  const kanjiFont = Math.max(1, Math.min(desiredFont, heightLimit, widthLimit));
  style.setProperty(
    "--character-y",
    `${expandedTop * (1 - progress) + compactTop * progress}px`,
  );
  style.setProperty("--hero", `${heroHeight}px`);
  style.setProperty("--art-scale", scale);
  style.setProperty("--art-y", `${artY}px`);
  style.setProperty("--kanji-top", `${kanjiTop}px`);
  style.setProperty("--kanji-font", `${kanjiFont}px`);
  style.setProperty("--headline-y", `${titleY}px`);
  style.setProperty("--headline-size", `${titleFont}px`);
  style.setProperty("--headline-left", `${17 + 3 * eased}%`);
  style.setProperty("--headline-right", `${83 - 3 * eased}%`);
  style.setProperty("--fade", Math.max(0, 1 - eased * 3));
  const controlsProgress = Math.min(1, progress / 0.2);
  style.setProperty(
    "--controls-y",
    `${200 * controlsProgress * controlsProgress * (3 - 2 * controlsProgress)}px`,
  );
  style.setProperty(
    "--controls-visibility",
    progress >= 0.2 ? "hidden" : "visible",
  );
  $(".controls").inert = progress > 0.12;
  if (progress > 0.12) {
    $("#settings").hidden = true;
    $("#settings-toggle").setAttribute("aria-expanded", "false");
  }
}
window.addEventListener(
  "scroll",
  () => {
    if (!scrollQueued) {
      scrollQueued = true;
      requestAnimationFrame(updateScroll);
    }
  },
  { passive: true },
);
window.addEventListener("resize", layout);
layout();

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cancelAnimationFrame(request);
    if (playing) restoreIdle(active).catch(console.error);
    worker?.postMessage({ type: "reset" });
  } else if (stream) scheduleTracking();
});
window.addEventListener("pagehide", () => {
  stopCamera();
  worker?.terminate();
  ++playbackSerial;
  for (const clip of clips.values()) {
    clip.video.pause();
    URL.revokeObjectURL(clip.url);
  }
  clearBubbles();
});
preload();
