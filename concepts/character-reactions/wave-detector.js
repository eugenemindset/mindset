/** A bounded motion history: an open palm must move, a held hand is not a wave. */
class WaveDetector {
  constructor() {
    this.samples = [];
    this.lastHand = 0;
    this.cooldown = 0;
  }
  reset() {
    this.samples = [];
    this.lastHand = 0;
    this.cooldown = 0;
  }
  update(result, now) {
    const candidates = (result.landmarks || []).map((points, i) => ({
      points,
      gesture: result.gestures?.[i]?.[0],
    }));
    const hand = candidates.find(({ points: p, gesture: g }) => {
      if (g?.categoryName === "Open_Palm" && g.score > 0.5) return true;
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      return (
        [
          [8, 6],
          [12, 10],
          [16, 14],
          [20, 18],
        ].filter(([t, k]) => distance(p[t], p[0]) > distance(p[k], p[0]) * 1.18)
          .length >= 3
      );
    });
    if (!hand) {
      if (now - this.lastHand > 200) this.samples = [];
      return false;
    }
    this.lastHand = now;
    const p = hand.points;
    const x = (p[0].x + p[9].x + p[12].x) / 3;
    this.samples.push({ x, t: now });
    this.samples = this.samples.filter((s) => now - s.t < 650);
    if (now < this.cooldown || this.samples.length < 4) return false;
    const xs = this.samples.map((s) => s.x),
      span = Math.max(...xs) - Math.min(...xs);
    let turns = 0,
      previous = 0;
    for (let i = 1; i < xs.length; i++) {
      const d = xs[i] - xs[i - 1];
      if (Math.abs(d) < 0.008) continue;
      const sign = Math.sign(d);
      if (previous && sign !== previous) turns++;
      previous = sign;
    }
    if (span > 0.045 && (turns > 0 || span > 0.09)) {
      this.cooldown = now + 2700;
      this.samples = [];
      return true;
    }
    return false;
  }
}
if (typeof self !== "undefined") self.WaveDetector = WaveDetector;
if (typeof module !== "undefined") module.exports = { WaveDetector };
