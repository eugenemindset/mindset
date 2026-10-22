// Both controls share one lazy AudioContext and reusable synthetic buffers.
// Call unlock() synchronously from a real user gesture; never await audio in UI.
let sharedEngine = null;

const profiles = {
  drum: { duration: .014, cutoff: 1500, highpass: 260, attack: .00075, decay: .0022,
    rebound: .15, reboundDelay: .0031, reboundAttack: .0003, reboundDecay: .0009,
    peak: .58, interval: .032, gain: .017, range: .014, variants: 3 },
  button: { duration: .025, cutoff: 2400, highpass: 170, attack: .0005, decay: .0023,
    rebound: .38, reboundDelay: .0065, reboundAttack: .0006, reboundDecay: .0018,
    peak: .70, interval: .055, gain: .029, range: .015, variants: 2 }
};
const wallTime = () => globalThis.performance?.now?.() ?? Date.now();

function makeBuffer(context, profile, variant) {
  const rate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.ceil(rate * profile.duration), rate);
  const samples = buffer.getChannelData(0);
  const cutoff = 1 - Math.exp(-2 * Math.PI * profile.cutoff / rate);
  const highpass = 1 - Math.exp(-2 * Math.PI * profile.highpass / rate);
  const reboundDelay = profile.reboundDelay + variant * .00022;
  let seed = 4271 + variant * 3191, low = 0, soft = 0, bass = 0, peak = 0;
  const smoothAttack = (time, duration) => {
    const progress = Math.max(0, Math.min(1, time / duration));
    return progress * progress * (3 - 2 * progress);
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    low += cutoff * ((seed / 2147483648 - 1) - low);
    soft += cutoff * (low - soft);
    bass += highpass * (soft - bass);
    // Filtered contact noise only: no pitched oscillator or ringing sine tail.
    // The detent has a tiny secondary contact; the switch has a distinct short
    // rebound a few milliseconds later, like its mechanism reaching the stop.
    const contact = smoothAttack(t, profile.attack) * Math.exp(-t / profile.decay);
    const reboundTime = t - reboundDelay;
    const rebound = reboundTime > 0 ? profile.rebound * smoothAttack(reboundTime, profile.reboundAttack)
      * Math.exp(-reboundTime / profile.reboundDecay) : 0;
    const tail = Math.min(1, (samples.length - 1 - i) / (rate * .003));
    samples[i] = (soft - bass) * (contact + rebound) * tail;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  const scale = profile.peak / Math.max(peak, .001);
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return buffer;
}

function createEngine() {
  const clients = new Set(), voices = new Set();
  let context = null, buffers = {}, resuming = false, disposed = false;

  function releaseVoice(voice, stop = false) {
    voices.delete(voice);
    if (voice.source) {
      voice.source.onended = null;
      if (stop) { try { voice.source.stop(); } catch { /* Already finished. */ } }
      try { voice.source.disconnect(); } catch { /* Partial setup or shutdown. */ }
    }
    try { voice.gain?.disconnect(); } catch { /* Audio remains optional. */ }
  }

  function clearPending() { for (const client of clients) client.pending = null; }

  function play(client, strength) {
    if (disposed || client.destroyed || context?.state !== 'running' || globalThis.document?.hidden) return false;
    const profile = profiles[client.kind], now = context.currentTime;
    if (now - client.lastTick < profile.interval) return false;
    const voice = { source: null, gain: null, client };
    try {
      // Only a buffer source and gain per accepted click: no live oscillator,
      // worklet, filter chain or sample generation in the animation loop.
      if (voices.size >= 5) releaseVoice(voices.values().next().value, true);
      voice.source = context.createBufferSource();
      voice.gain = context.createGain();
      voice.source.buffer = buffers[client.kind][client.sequence % profile.variants];
      voice.source.playbackRate.value = .98 + strength * .035 + (client.sequence % 3) * .004;
      voice.gain.gain.value = profile.gain + strength * profile.range;
      voice.source.connect(voice.gain);
      voice.gain.connect(context.destination);
      voice.source.onended = () => releaseVoice(voice);
      voices.add(voice);
      voice.source.start(now);
      client.lastTick = now;
      client.sequence++;
      return true;
    } catch {
      releaseVoice(voice, true);
      return false;
    }
  }

  function flushPending() {
    if (disposed || context?.state !== 'running') return;
    const now = wallTime();
    for (const client of clients) {
      const pending = client.pending;
      client.pending = null;
      // Keep the first click during normal async resume, never a stale click
      // after a permission prompt or a later return to the tab.
      if (pending && now - pending.time <= 300) play(client, pending.strength);
    }
  }

  function unlock(client) {
    if (disposed || client.destroyed) return false;
    try {
      if (!context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) return false;
        context = new AudioContext({ latencyHint: 'interactive' });
        buffers = Object.fromEntries(Object.entries(profiles).map(([kind, profile]) =>
          [kind, Array.from({ length: profile.variants }, (_, i) => makeBuffer(context, profile, i))]));
        context.addEventListener?.('statechange', flushPending);
      }
      client.unlocked = true;
      if (context.state === 'running') { flushPending(); return true; }
      if (context.state === 'closed') return false;
      if (!resuming) {
        resuming = true;
        Promise.resolve(context.resume()).then(flushPending, clearPending).finally(() => { resuming = false; });
      }
      return true;
    } catch {
      resuming = false;
      clearPending();
      return false;
    }
  }

  function request(client, strength) {
    if (disposed || client.destroyed || !client.unlocked || !context) return false;
    const amount = Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : .5;
    if (!amount || globalThis.document?.hidden) return false;
    if (context.state === 'running') { client.pending = null; return play(client, amount); }
    if (!resuming) return false;
    // One pending sound per consumer, not a backlog of missed detents.
    if (!client.pending || wallTime() - client.pending.time > 300) client.pending = { strength: amount, time: wallTime() };
    return true;
  }

  function detach(client) {
    if (client.destroyed) return;
    client.destroyed = true;
    client.pending = null;
    clients.delete(client);
    for (const voice of [...voices]) if (voice.client === client) releaseVoice(voice, true);
    if (clients.size) return;
    disposed = true;
    if (sharedEngine === engine) sharedEngine = null;
    buffers = {};
    const oldContext = context;
    context = null;
    try {
      oldContext?.removeEventListener?.('statechange', flushPending);
      if (oldContext && oldContext.state !== 'closed') Promise.resolve(oldContext.close()).catch(() => {});
    } catch { /* The host may already have torn down the audio device. */ }
  }

  const engine = {
    attach(kind) {
      const client = { kind, destroyed: false, unlocked: false, pending: null, sequence: 0, lastTick: -Infinity };
      clients.add(client);
      return { unlock: () => unlock(client), play: strength => request(client, strength), destroy: () => detach(client) };
    }
  };
  return engine;
}

function createSound(kind) {
  if (!sharedEngine) sharedEngine = createEngine();
  return sharedEngine.attach(kind);
}

export function createDrumSound() {
  const sound = createSound('drum');
  return { unlock: sound.unlock, tick: (strength = .5) => sound.play(strength), destroy: sound.destroy };
}

export function createButtonSound() {
  const sound = createSound('button');
  return { unlock: sound.unlock, click: (strength = .6) => sound.play(strength), destroy: sound.destroy };
}
