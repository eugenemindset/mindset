/* Landmark geometry, expression thresholds and temporal gating are independent of rendering. */
const MotionWave =
  typeof module !== "undefined"
    ? require("./wave-detector.js").WaveDetector
    : self.WaveDetector;
const distance = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
function segmentDistance(p, a, b) {
  const v = { x: b.x - a.x, y: b.y - a.y, z: (b.z || 0) - (a.z || 0) };
  const length = v.x * v.x + v.y * v.y + v.z * v.z;
  const t = length
    ? Math.max(
        0,
        Math.min(
          1,
          ((p.x - a.x) * v.x +
            (p.y - a.y) * v.y +
            ((p.z || 0) - (a.z || 0)) * v.z) /
            length,
        ),
      )
    : 0;
  return distance(p, {
    x: a.x + v.x * t,
    y: a.y + v.y * t,
    z: (a.z || 0) + v.z * t,
  });
}
function classifyHand(points) {
  if (!points || points.length < 21) return null;
  // A hand tilted toward the camera can almost collapse the wrist→MCP projection.
  // Palm width remains measurable in that view and prevents unstable scale ratios.
  const palm = Math.max(
    distance(points[0], points[9]),
    distance(points[5], points[17]) * 0.9,
  );
  if (palm < 0.0001) return null;
  const extended = (tip, pip, mcp) =>
    distance(points[tip], points[0]) >
      distance(points[pip], points[0]) * 1.15 &&
    distance(points[tip], points[mcp]) > palm * 0.62;
  const index = extended(8, 6, 5),
    middle = extended(12, 10, 9),
    ring = extended(16, 14, 13),
    pinky = extended(20, 18, 17);
  if (middle && !index && !ring && !pinky) return "middle";
  // A crossed finger heart can touch the SIDE of the index, not just its tip.
  // Two curled fingers are sufficient: the third is often partially occluded.
  const pinch = distance(points[4], points[8]) / palm;
  const crossed =
    Math.min(
      segmentDistance(points[4], points[6], points[7]),
      segmentDistance(points[4], points[7], points[8]),
    ) / palm;
  const protrudes = distance(points[8], points[5]) / palm;
  const thumbOut = distance(points[4], points[0]) / palm;
  const folded = [12, 16, 20].filter(
    (t) =>
      distance(points[t], points[0]) <
        distance(points[t - 2], points[0]) * 1.05 &&
      distance(points[t], points[t - 3]) < palm * 0.8,
  ).length;
  // The proximal index segment defines finger direction even when the palm faces down.
  const indexLength = distance(points[5], points[6]);
  if (indexLength < 0.0001) return null;
  const axis = {
    x: (points[6].x - points[5].x) / indexLength,
    y: (points[6].y - points[5].y) / indexLength,
    z: ((points[6].z || 0) - (points[5].z || 0)) / indexLength,
  };
  const aboveKnuckle = (t) =>
    ((points[t].x - points[5].x) * axis.x +
      (points[t].y - points[5].y) * axis.y +
      ((points[t].z || 0) - (points[5].z || 0)) * axis.z) /
    palm;
  const touching = pinch < 0.38 || (crossed < 0.22 && pinch < 0.65);
  if (
    !middle &&
    !ring &&
    !pinky &&
    folded >= 2 &&
    touching &&
    protrudes > 0.28 &&
    protrudes < 1.6 &&
    thumbOut > 0.78 &&
    aboveKnuckle(8) > 0.12 &&
    aboveKnuckle(4) > 0.05
  )
    return "heart";
  return null;
}
class SurpriseDetector {
  constructor() {
    this.reset();
  }
  reset() {
    this.baseline = null;
    this.firstFace = null;
    this.lastFace = 0;
    this.lastSample = null;
    this.detected = false;
  }
  update(result, now) {
    const categories = result?.faceBlendshapes?.[0]?.categories;
    if (!categories) {
      if (now - this.lastFace > 1500) this.reset();
      return false;
    }
    this.lastFace = now;
    // The worker reuses a face result between inference frames; do not recalibrate twice.
    if (result === this.lastSample) return this.detected;
    this.lastSample = result;
    const scores = Object.fromEntries(
      categories.map((c) => [c.categoryName, c.score]),
    );
    const left = scores.eyeWideLeft || 0,
      right = scores.eyeWideRight || 0;
    const eyes = (left + right) / 2,
      brow = Math.max(
        scores.browInnerUp || 0,
        ((scores.browOuterUpLeft || 0) + (scores.browOuterUpRight || 0)) / 2,
      ),
      jaw = scores.jawOpen || 0;
    if (!this.baseline) {
      this.baseline = { eyes, brow, jaw };
      this.firstFace = now;
    }
    if (now - this.firstFace < 600) {
      for (const [key, value] of Object.entries({ eyes, brow, jaw }))
        this.baseline[key] += (value - this.baseline[key]) * 0.2;
      return false;
    }
    const wide =
      Math.min(left, right) > 0.08 &&
      eyes > Math.max(0.15, this.baseline.eyes + 0.075);
    const raised = brow > Math.max(0.18, this.baseline.brow + 0.1);
    const mouth = jaw > Math.max(0.16, this.baseline.jaw + 0.1);
    const eyesAndBrows =
      Math.min(left, right) > 0.045 &&
      eyes > this.baseline.eyes + 0.04 &&
      raised;
    this.detected = wide || (mouth && raised) || eyesAndBrows;
    if (!this.detected) {
      // Slow neutral adaptation must not learn away a held expression.
      for (const [key, value] of Object.entries({ eyes, brow, jaw }))
        this.baseline[key] += (value - this.baseline[key]) * 0.008;
    }
    return this.detected;
  }
}
class ReactionDetector {
  constructor() {
    this.wave = new MotionWave();
    this.surprise = new SurpriseDetector();
    this.reset();
  }
  reset() {
    this.wave.reset();
    this.surprise.reset();
    this.candidate = null;
    this.since = 0;
    this.lastMatch = 0;
    this.hits = 0;
    this.latched = null;
    this.neutralSince = null;
    this.cooldown = 0;
    this.faceBounds = null;
    this.faceBoundsAt = -Infinity;
    this.lastFaceGeometry = null;
  }
  update(hands, face, now, blocked = false) {
    // Keep a short face envelope through a missed inference, never indefinitely.
    if (face !== this.lastFaceGeometry) {
      this.lastFaceGeometry = face;
      const landmarks = face?.faceLandmarks?.[0];
      if (landmarks?.length) {
        const xs = landmarks.map((p) => p.x),
          ys = landmarks.map((p) => p.y);
        this.faceBounds = {
          left: Math.min(...xs),
          right: Math.max(...xs),
          top: Math.min(...ys),
          bottom: Math.max(...ys),
        };
        this.faceBoundsAt = now;
      }
    }
    const faceBounds = now - this.faceBoundsAt < 450 ? this.faceBounds : null;
    const touchesFace = (p) => {
      if (!faceBounds) return false;
      const b = faceBounds,
        dx = (b.right - b.left) * 0.06,
        dy = (b.bottom - b.top) * 0.1;
      return [4, 6, 8].some(
        (i) =>
          p[i].x > b.left - dx &&
          p[i].x < b.right + dx &&
          p[i].y > b.top - dy &&
          p[i].y < b.bottom + dy,
      );
    };
    const aspect = hands.aspect || 1;
    const kinds = (hands.landmarks || []).map((p, i) => {
      const projected = classifyHand(
        p.map((v) => ({ x: v.x * aspect, y: v.y, z: 0 })),
      );
      // A heart must be visible in the image. Inferred depth alone is too permissive.
      if (projected === "heart") return touchesFace(p) ? null : "heart";
      return (
        projected ||
        (classifyHand(hands.worldLandmarks?.[i]) === "middle" ? "middle" : null)
      );
    });
    const surprised = this.surprise.update(face, now);
    const kind = kinds.includes("middle")
      ? "middle"
      : kinds.includes("heart")
        ? "heart"
        : surprised
          ? "surprise"
          : null;
    const waving = this.wave.update(hands, now);
    if (!kind) {
      if (now - this.lastMatch > 160) {
        this.candidate = null;
        this.hits = 0;
      }
      if (this.neutralSince === null) this.neutralSince = now;
      if (now - this.neutralSince >= 250) this.latched = null;
      if (waving && !blocked && now >= this.cooldown) {
        this.cooldown = now + 2300;
        return "wave";
      }
      return null;
    }
    this.neutralSince = null;
    if (blocked) {
      this.candidate = null;
      this.hits = 0;
      return null;
    }
    if (kind !== this.candidate || now - this.lastMatch > 160) {
      this.candidate = kind;
      this.since = now;
      this.hits = 0;
    }
    this.lastMatch = now;
    this.hits++;
    if (
      now - this.since <
        (kind === "heart" ? 360 : kind === "surprise" ? 180 : 140) ||
      this.hits < (kind === "heart" ? 5 : 3) ||
      this.latched === kind ||
      now < this.cooldown
    )
      return null;
    // Only a reaction actually emitted is latched. Cooldown must not swallow a held pose.
    this.latched = kind;
    this.cooldown = now + 2300;
    return kind;
  }
}
if (typeof self !== "undefined") self.ReactionDetector = ReactionDetector;
if (typeof module !== "undefined")
  module.exports = { classifyHand, SurpriseDetector, ReactionDetector };
