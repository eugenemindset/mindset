import { createRoomRenderer } from 'duo/room-renderer.js';
import { createBeamEditor } from 'duo/beam-editor.js';
import { createBrightnessDrum } from 'duo/brightness-drum.js';

const $ = selector => document.querySelector(selector);
const screen = $('.screen'), field = $('#light-field'), canvas = $('#room-canvas');
const controls = [...document.querySelectorAll('.source-control')];
const toolbar = $('.toolbar'), adjustment = $('#light-adjustment'), drum = $('#brightness-drum');
const back = $('#back'), status = $('#status');
const types = { sun: { name: 'Fresnel', code: 'FR', icon: 'fresnel' }, softbox: { name: 'Panel', code: 'PNL', icon: 'panel' }, regular: { name: 'COB', code: 'COB', icon: 'cob' } };
const kinds = Object.keys(types), MAX_LIGHTS = 6, SESSION_KEY = 'duo-kitchen-lighting-v1';
// A 48 px marker plus its label ends 56 px below its anchor. Leave an
// 8 px gutter above the glass control, which starts at y=713.
const MARKER_MAX_Y = 713 - 56 - 8;
const markers = new Map(), history = [];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
let lights = [], nextId = 1, selected = null, scene = null, draggingId = null;
let adjustmentStart = null, adjustmentOwner = null, cancelDrag = null;
const clone = () => structuredClone(lights);
const selectedLight = () => lights.find(light => light.id === selected);
const remember = previous => { history.push(previous); if (history.length > 100) history.shift(); };
const announce = message => { status.textContent = message; };
function forgetSavedSource(id) {
  // A confirmed deletion must survive reload even when the last source was
  // removed and the selection-only save button is no longer available.
  try {
    const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
    if (saved?.version === 1 && Array.isArray(saved.lights) && saved.lights.some(light => light?.id === id)) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...saved, lights: saved.lights.filter(light => light?.id !== id) }));
    }
  } catch { /* Deleting a source must still work when browser storage is blocked. */ }
}

try {
  const saved = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
  if (saved?.version === 1 && Array.isArray(saved.lights) && saved.lights.length <= MAX_LIGHTS) {
    const ids = new Set();
    const valid = saved.lights.every(light => kinds.includes(light.kind) && Number.isInteger(light.id) && light.id > 0 && !ids.has(light.id) && (ids.add(light.id), true) && Array.isArray(light.position) && light.position.length === 3 && light.position.every(Number.isFinite) && light.position[1] >= .6 && light.position[1] <= 5.5 && Math.abs(light.position[0]) <= 8 && Math.abs(light.position[2]) <= 8 && Number.isFinite(light.intensity) && light.intensity >= 0 && light.intensity <= 100 && Number.isFinite(light.beamWidth) && light.beamWidth >= 0 && light.beamWidth <= 100 && /^#[0-9a-f]{6}$/i.test(light.color));
    if (valid) { lights = saved.lights; nextId = Math.max(1, ...lights.map(light => light.id + 1)); }
  }
} catch { /* Storage can be unavailable; the current page remains fully usable. */ }

function beginAdjustment(owner) {
  if (adjustmentOwner && adjustmentOwner !== owner) commitAdjustment();
  if (!adjustmentStart) adjustmentStart = clone();
  adjustmentOwner = owner;
}
function commitAdjustment() {
  if (adjustmentStart && JSON.stringify(adjustmentStart) !== JSON.stringify(lights)) remember(adjustmentStart);
  adjustmentStart = null; adjustmentOwner = null;
}
function cancelAdjustment() {
  if (adjustmentStart) lights = adjustmentStart;
  adjustmentStart = null; adjustmentOwner = null;
}
const editor = createBeamEditor({
  host: $('#beam-editor-host'),
  onBegin() { cancelDrag?.(); finishDrum(); beginAdjustment('beam'); },
  onChange(patch) { const light = selectedLight(); if (light) { Object.assign(light, patch); render(); } },
  onCommit() { commitAdjustment(); render(); },
  onCancel() { cancelAdjustment(); render(); }
});

const brightness = createBrightnessDrum({
  element: drum,
  getScale: () => screen.getBoundingClientRect().width / 587,
  onBegin() { editor.end(); beginAdjustment('drum'); },
  onChange(value) { const light = selectedLight(); if (light) { light.intensity = value; render(); } },
  onCommit() { commitAdjustment(); render(); },
  onCancel() { cancelAdjustment(); render(); }
});
function updateDrum(light) {
  brightness.sync(light ? { id: light.id, value: light.intensity, label: `Яркость ${types[light.kind].name}, источник ${light.id}` } : null);
}
function finishDrum(cancel = false) { brightness.finish(cancel); }
function finishEdits() { finishDrum(); editor.end(); commitAdjustment(); }

function render() {
  const active = selectedLight();
  toolbar.hidden = !!active; adjustment.hidden = !active;
  for (const control of controls) {
    const count = lights.filter(light => light.kind === control.dataset.kind).length;
    control.querySelector('.activate').hidden = count > 0;
    control.querySelector('.stepper').hidden = count === 0;
    control.querySelector('output').value = String(count);
    control.querySelector('.add').disabled = lights.length >= MAX_LIGHTS || !scene;
    control.querySelector('.activate').disabled = lights.length >= MAX_LIGHTS || !scene;
  }
  for (const [id, marker] of markers) if (!lights.some(light => light.id === id)) { marker.remove(); markers.delete(id); }
  for (const light of lights) {
    if (!scene) continue;
    let marker = markers.get(light.id);
    if (!marker) {
      marker = document.createElement('button'); marker.type = 'button'; marker.className = 'light-marker'; marker.dataset.id = String(light.id); marker.dataset.kind = light.kind;
      const body = document.createElement('span'); body.className = 'marker-body';
      const icon = document.createElement('span'); icon.className = 'marker-icon' + (light.kind === 'softbox' ? ' is-panel' : light.kind === 'regular' ? ' is-large' : '');
      const image = document.createElement('img'); image.width = light.kind === 'softbox' ? 12 : light.kind === 'sun' ? 16 : 32; image.height = image.width; image.alt = ''; icon.append(image); body.append(icon);
      const label = document.createElement('span'); label.className = 'marker-label'; label.innerHTML = '<span></span><span></span>'; marker.append(body, label);
      marker.addEventListener('pointerdown', startDrag); marker.addEventListener('keydown', moveByKey);
      marker.addEventListener('click', () => {
        if (marker.dataset.skipClick === 'true') { delete marker.dataset.skipClick; return; }
        finishEdits(); selected = light.id; render();
      });
      field.append(marker); markers.set(light.id, marker);
    }
    const position = scene.projectLight(light), isSelected = selected === light.id;
    const index = lights.filter(item => item.kind === light.kind).findIndex(item => item.id === light.id) + 1;
    marker.style.left = `${position.x}px`; marker.style.top = `${position.y}px`;
    marker.setAttribute('aria-pressed', String(isSelected)); marker.setAttribute('aria-expanded', String(isSelected));
    marker.setAttribute('aria-controls', 'light-adjustment');
    marker.setAttribute('aria-label', `L${index}, ${types[light.kind].name}, ${Math.round(light.intensity)} LM. Переместить или настроить источник`);
    marker.title = 'Перетащить — положение. Нажать — яркость и ширина луча.';
    const iconPath = light.kind === 'sun' ? (isSelected ? 'fresnel-selected' : 'fresnel-marker') : light.kind === 'softbox' ? 'panel-marker' : types[light.kind].icon;
    const image = marker.querySelector('img'); const iconURL = globalThis.__duoAssets[`assets/figma-ui/${iconPath}.svg`]; if (image.src !== iconURL) image.src = iconURL;
    const labels = marker.querySelectorAll('.marker-label span'); labels[0].textContent = `L${index} / ${types[light.kind].code}`; labels[1].textContent = `${Math.round(light.intensity)} LM`;
  }
  if (active && !draggingId && scene) editor.show(active, scene.projectLight(active)); else editor.hide();
  updateDrum(active);
  back.setAttribute('aria-disabled', String(history.length === 0));
  canvas.dataset.lightCount = String(lights.length); canvas.dataset.selectedLight = selected ?? '';
  scene?.update(lights);
}
function deselect() { finishEdits(); selected = null; editor.hide(); render(); }
function change(kind, delta) {
  const typed = lights.filter(light => light.kind === kind);
  if (!scene || (delta > 0 && lights.length >= MAX_LIGHTS) || (delta < 0 && !typed.length)) return;
  finishEdits(); cancelDrag?.(); remember(clone());
  if (delta > 0) {
    const light = { ...scene.defaultLight(kind, typed.length), kind, id: nextId++ };
    const anchor = scene.projectLight(light), occupied = lights.map(item => scene.projectLight(item));
    const candidates = [[0,0]];
    for (const radius of [58,116,174]) for (let i = 0; i < 8; i++) candidates.push([Math.cos(i*Math.PI/4)*radius, Math.sin(i*Math.PI/4)*radius]);
    for (const [dx,dy] of candidates) {
      const position = scene.lightFromScreen(light, clamp(anchor.x+dx,36,551), clamp(anchor.y+dy,444,MARKER_MAX_Y));
      const projected = scene.projectLight({ ...light, position });
      if (occupied.every(point => Math.hypot(point.x-projected.x,point.y-projected.y) >= 58)) { light.position = position; break; }
    }
    lights.push(light);
  } else {
    const light = typed.find(item => item.id === selected) ?? typed.at(-1);
    lights = lights.filter(item => item.id !== light.id); forgetSavedSource(light.id);
  }
  selected = null; render(); announce(`${types[kind].name}: ${lights.filter(light => light.kind === kind).length}`);
}
for (const control of controls) {
  const kind = control.dataset.kind;
  control.querySelector('.activate').addEventListener('click', () => { change(kind, 1); control.querySelector('.add').focus({ preventScroll: true }); });
  control.querySelector('.add').addEventListener('click', () => change(kind, 1));
  control.querySelector('.remove').addEventListener('click', () => { change(kind, -1); if (!lights.some(light => light.kind === kind)) control.querySelector('.activate').focus({ preventScroll: true }); });
}
$('#delete-selected').addEventListener('click', () => { const light = selectedLight(); if (light) { const kind = light.kind; change(kind, -1); controls.find(control => control.dataset.kind === kind).querySelector(lights.some(item => item.kind === kind) ? '.add' : '.activate').focus({ preventScroll: true }); } });
$('#save-lighting').addEventListener('click', () => {
  finishEdits();
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, lights: clone() })); announce('Свет сохранён в этой сессии'); }
  catch { announce('Свет применён. Сохранение в браузере недоступно.'); }
  const source = selected; selected = null; render(); markers.get(source)?.focus({ preventScroll: true });
});

function startDrag(event) {
  if (event.button !== 0 || event.isPrimary === false || cancelDrag) return;
  const marker = event.currentTarget, light = lights.find(item => item.id === Number(marker.dataset.id));
  if (!light || !scene) return;
  finishEdits(); delete marker.dataset.skipClick;
  const scale = screen.getBoundingClientRect().width / 587, initial = clone(), start = scene.projectLight(light);
  const pointerStart = { x: event.clientX, y: event.clientY };
  let moved = false, ended = false, dragFrame = 0;
  marker.setPointerCapture(event.pointerId);
  function move(e) {
    if (e.pointerId !== event.pointerId) return;
    const dx = (e.clientX-pointerStart.x)/scale, dy = (e.clientY-pointerStart.y)/scale;
    if (!moved && Math.hypot(dx,dy) < 5) return;
    if (!moved) { moved = true; selected = light.id; draggingId = light.id; marker.classList.add('dragging'); }
    light.position = scene.lightFromScreen(light, clamp(start.x+dx,36,551), clamp(start.y+dy,444,MARKER_MAX_Y));
    if (!dragFrame) dragFrame = requestAnimationFrame(() => { dragFrame = 0; render(); });
  }
  function finish(cancel = false) {
    if (ended) return; ended = true;
    cancelAnimationFrame(dragFrame); dragFrame = 0;
    marker.removeEventListener('pointermove', move); marker.removeEventListener('pointerup', up); marker.removeEventListener('pointercancel', abort); marker.removeEventListener('lostpointercapture', abort);
    if (marker.hasPointerCapture(event.pointerId)) marker.releasePointerCapture(event.pointerId);
    marker.classList.remove('dragging'); draggingId = null;
    if (moved) { marker.dataset.skipClick = 'true'; if (cancel) lights = initial; else if (JSON.stringify(initial) !== JSON.stringify(lights)) remember(initial); }
    cancelDrag = null; render();
  }
  const up = e => { if (e.pointerId === event.pointerId) finish(); }, abort = () => finish(true);
  cancelDrag = abort;
  marker.addEventListener('pointermove', move); marker.addEventListener('pointerup', up); marker.addEventListener('pointercancel', abort); marker.addEventListener('lostpointercapture', abort);
}
function moveByKey(event) {
  const light = lights.find(item => item.id === Number(event.currentTarget.dataset.id)); if (!light || !scene) return;
  const vectors = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
  if (vectors[event.key]) {
    event.preventDefault(); finishEdits(); remember(clone()); selected = light.id;
    const step = event.shiftKey ? 16 : 5, p = scene.projectLight(light);
    light.position = scene.lightFromScreen(light, clamp(p.x+vectors[event.key][0]*step,36,551), clamp(p.y+vectors[event.key][1]*step,444,MARKER_MAX_Y)); render();
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault(); finishEdits(); remember(clone()); selected = light.id;
    light.position[1] = clamp(light.position[1] + (event.key === 'PageUp' ? .2 : -.2), .6, 5.5); render();
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault(); selected = light.id; change(light.kind, -1);
  }
}
back.addEventListener('click', () => {
  finishEdits(); cancelDrag?.(); if (!history.length) return;
  lights = history.pop(); selected = null; render(); announce('Последнее изменение отменено');
});
document.addEventListener('pointerdown', event => { if (!event.target.closest('button,[role="slider"]') && selected !== null) deselect(); });
addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.defaultPrevented) { cancelDrag?.(); finishDrum(true); editor.cancel(); selected = null; render(); }
});
function resize() {
  const scale = Math.min(1, Math.max(1, window.innerWidth-32)/644, Math.max(1, window.innerHeight-32)/887);
  document.documentElement.style.setProperty('--scale', String(scale));
  $('.presentation').style.width = `${644*scale}px`; $('.presentation').style.height = `${887*scale}px`; scene?.resize();
}
addEventListener('resize', resize); resize();
try {
  scene = createRoomRenderer({ canvas,
    onError(error) { canvas.dataset.renderState = 'error'; $('#scene-error').textContent = 'Не удалось включить 3D. Обновите страницу в браузере с поддержкой WebGL 2.'; $('#scene-error').hidden = false; console.error('Room rendering failed', error); },
    onReady() { canvas.dataset.renderState = 'ready'; }
  }); resize(); render();
} catch (error) { console.error(error); canvas.dataset.renderState = 'error'; $('#scene-error').hidden = false; $('#scene-error').textContent = 'Для этой сцены нужен браузер с поддержкой WebGL 2.'; render(); }

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const state = () => ({ counts: Object.fromEntries(kinds.map(kind => [kind, lights.filter(light => light.kind === kind).length])), sources: clone(), selectedId: selected, renderState: canvas.dataset.renderState });
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
  register({ name: 'read_light_sources', title: 'Источники света', description: 'Read the real lights shared by the two live 3D cameras. sun is Fresnel, softbox is Panel, regular is COB.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: state });
  register({ name: 'change_light_count', title: 'Добавить или убрать свет', description: 'Add or remove a real light. Six sources maximum; sun is Fresnel, softbox is Panel, regular is COB.', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: kinds }, delta: { type: 'integer', enum: [-1,1] } }, required: ['kind','delta'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
    if (!scene || !input || !kinds.includes(input.kind) || ![-1,1].includes(input.delta) || Object.keys(input).some(key => !['kind','delta'].includes(key))) throw new Error('Invalid light change.');
    if (input.delta > 0 && lights.length >= MAX_LIGHTS || input.delta < 0 && !lights.some(light => light.kind === input.kind)) throw new Error('Light count limit reached.');
    change(input.kind, input.delta); return state();
  } });
  register({ name: 'set_light', title: 'Настроить 3D-свет', description: 'Change a real light position, cone width, intensity or tint. Both 3D cameras update live. Position is x,y,z in metres.', inputSchema: { type: 'object', properties: { id: { type: 'integer' }, position: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, beamWidth: { type: 'number', minimum: 0, maximum: 100 }, intensity: { type: 'number', minimum: 0, maximum: 100 }, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, required: ['id'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) {
    if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['id','position','beamWidth','intensity','color'].includes(key))) throw new Error('Invalid settings.');
    const light = lights.find(item => item.id === input.id); if (!light) throw new Error('Unknown light.');
    if (input.position && (!Array.isArray(input.position) || input.position.length !== 3 || !input.position.every(Number.isFinite) || Math.abs(input.position[0]) > 8 || Math.abs(input.position[2]) > 8 || input.position[1] < .6 || input.position[1] > 5.5)) throw new Error('Position outside room controls.');
    for (const key of ['intensity','beamWidth']) if (input[key] !== undefined && (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100)) throw new Error('Invalid range.');
    if (input.color !== undefined && !/^#[0-9a-fA-F]{6}$/.test(input.color)) throw new Error('Invalid colour.');
    finishEdits(); remember(clone()); for (const key of ['position','intensity','beamWidth','color']) if (input[key] !== undefined) light[key] = structuredClone(input[key]); selected = light.id; render(); return state();
  } });
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
addEventListener('pagehide', () => { brightness.destroy(); editor.destroy(); scene?.destroy(); }, { once: true });
