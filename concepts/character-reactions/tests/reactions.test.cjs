const assert = require("node:assert/strict");
const {
  classifyHand,
  SurpriseDetector,
  ReactionDetector,
} = require("../reaction-detector.js");
function hand(kind) {
  const p = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  p[1] = { x: -0.3, y: -0.2 };
  p[2] = { x: -0.5, y: -0.4 };
  p[3] = { x: -0.65, y: -0.5 };
  p[4] = { x: -0.7, y: -0.6 };
  for (const [mcp, x, y] of [
    [5, -0.3, -0.8],
    [9, 0, -1],
    [13, 0.25, -0.9],
    [17, 0.45, -0.75],
  ]) {
    p[mcp] = { x, y };
    p[mcp + 1] = { x, y: y - 0.25 };
    p[mcp + 2] = { x, y: y - 0.12 };
    p[mcp + 3] = { x, y: y + 0.2 };
    if (
      kind === "open" ||
      (kind === "middle" && mcp === 9) ||
      (kind === "okay" && mcp !== 5)
    ) {
      p[mcp + 1] = { x, y: y - 0.45 };
      p[mcp + 2] = { x, y: y - 0.7 };
      p[mcp + 3] = { x, y: y - 0.95 };
    }
  }
  if (kind === "heart" || kind === "okay") {
    p[8] = { x: -0.4, y: -1.35 };
    p[4] = { x: -0.6, y: -1.3 };
  }
  if (kind === "thumb") {
    p[4] = { x: -0.6, y: -1.7 };
  }
  return p;
}
for (const kind of ["heart", "middle"]) {
  for (const angle of [0, 0.8, -0.8, Math.PI])
    for (const scale of [0.1, 1, 3]) {
      const transformed = hand(kind).map((p) => ({
        x: (p.x * Math.cos(angle) - p.y * Math.sin(angle)) * scale + 2,
        y: (p.x * Math.sin(angle) + p.y * Math.cos(angle)) * scale + 3,
        z: 0,
      }));
      assert.equal(
        classifyHand(transformed),
        kind,
        `${kind} must survive rotation and scale`,
      );
    }
}
for (const kind of ["fist", "open", "thumb", "okay"])
  assert.equal(
    classifyHand(hand(kind)),
    null,
    `${kind} must not be a heart or middle finger`,
  );
const loose = hand("heart");
loose[4] = { x: -0.85, y: -1.3 };
assert.equal(
  classifyHand(loose),
  null,
  "fingers near each other are not enough for a heart",
);
const relaxed = hand("heart");
relaxed[12] = { x: 0, y: -1.2 };
assert.equal(
  classifyHand(relaxed),
  "heart",
  "one partly occluded curled finger must not veto the heart",
);
const crossed = hand("heart");
crossed[8] = { x: -0.4, y: -1.55 };
crossed[7] = { x: -0.45, y: -1.3 };
crossed[4] = { x: -0.57, y: -1.13 };
assert.equal(
  classifyHand(crossed),
  "heart",
  "thumb against the side of the index counts as a crossed heart",
);
const tilted = hand("heart");
tilted[0] = { x: 0, y: -0.7 };
tilted[9] = { x: 0, y: -0.8 };
assert.equal(
  classifyHand(tilted),
  "heart",
  "a foreshortened wrist-to-knuckle projection must use palm width for scale",
);
const ordinaryPinch = hand("heart");
ordinaryPinch[8] = { x: -0.4, y: -0.98 };
ordinaryPinch[4] = { x: -0.55, y: -0.94 };
assert.equal(
  classifyHand(ordinaryPinch),
  null,
  "pinch folded into the palm must not trigger",
);
const face = (scores) => ({
  faceBlendshapes: [
    {
      categories: Object.entries(scores).map(([categoryName, score]) => ({
        categoryName,
        score,
      })),
    },
  ],
});
const neutral = face({
  eyeWideLeft: 0.05,
  eyeWideRight: 0.05,
  browInnerUp: 0.1,
  jawOpen: 0.05,
});
const wide = face({
  eyeWideLeft: 0.7,
  eyeWideRight: 0.65,
  browInnerUp: 0.2,
  jawOpen: 0.1,
});
let expression = new SurpriseDetector();
for (let i = 0; i < 10; i++)
  assert.equal(expression.update(neutral, i * 130), false);
assert.equal(expression.update(wide, 1400), true, "wide eyes trigger surprise");
assert.equal(
  expression.update(
    face({
      mouthSmileLeft: 1,
      mouthSmileRight: 1,
      eyeWideLeft: 0.05,
      eyeWideRight: 0.05,
    }),
    1500,
  ),
  false,
  "smile is excluded",
);
assert.equal(
  expression.update(face({ jawOpen: 0.8, browInnerUp: 0.1 }), 1600),
  false,
  "speech alone is excluded",
);
assert.equal(
  expression.update(face({ eyeWideLeft: 0.9, eyeWideRight: 0 }), 1700),
  false,
  "one wide eye is excluded",
);
assert.equal(
  expression.update(face({ jawOpen: 0.55, browInnerUp: 0.7 }), 1800),
  true,
  "mouth and brows trigger surprise",
);
assert.equal(
  expression.update(
    face({
      eyeWideLeft: 0.19,
      eyeWideRight: 0.17,
      browInnerUp: 0.12,
      jawOpen: 0.08,
    }),
    1900,
  ),
  true,
  "moderate bilateral eye opening is sufficient",
);
assert.equal(
  expression.update(
    face({ jawOpen: 0.22, browOuterUpLeft: 0.25, browOuterUpRight: 0.23 }),
    2000,
  ),
  true,
  "moderate mouth and outer brow lift is sufficient",
);
const result = (kind) => ({
  landmarks: kind ? [hand(kind)] : [],
  worldLandmarks: kind ? [hand(kind)] : [],
});
let detector = new ReactionDetector(),
  events = [];
for (let t = 0; t < 5000; t += 65) {
  const event = detector.update(result("heart"), null, t);
  if (event) events.push(event);
}
assert.deepEqual(
  events,
  ["heart"],
  "a held gesture must fire once, even beyond cooldown",
);
for (let t = 5000; t < 5400; t += 65) detector.update(result(null), null, t);
events = [];
for (let t = 5400; t < 5800; t += 65) {
  const e = detector.update(result("heart"), null, t);
  if (e) events.push(e);
}
assert.deepEqual(events, ["heart"], "release re-arms the gesture");
detector.reset();
for (let t = 0; t < 220; t += 65)
  assert.equal(
    detector.update(result("heart"), null, t),
    null,
    "a fleeting pinch must not trigger a heart",
  );
detector.reset();
assert.equal(detector.update(result("middle"), null, 0), null);
assert.equal(
  detector.update(result(null), null, 65),
  null,
  "one-frame noise is ignored",
);
for (let t = 100; t < 500; t += 65)
  assert.equal(
    detector.update(result("middle"), null, t, true),
    null,
    "playing clip cannot be interrupted",
  );
assert.equal(
  detector.update(result("middle"), null, 4000),
  null,
  "after playback, a pose must be freshly held instead of queued",
);
assert.equal(detector.update(result("middle"), null, 4065), null);
assert.equal(detector.update(result("middle"), null, 4130), null);
assert.equal(
  detector.update(result("middle"), null, 4195),
  "middle",
  "a pose still intentionally held after playback can trigger",
);
detector.reset();
events = [];
for (let t = 0; t < 600; t += 65) {
  const e = detector.update(result(t === 195 ? null : "heart"), null, t);
  if (e) events.push(e);
}
assert.deepEqual(
  events,
  ["heart"],
  "one lost tracking frame must not erase a stable heart",
);
detector.reset();
for (let t = 0; t < 400; t += 65) detector.update(result("middle"), null, t);
for (let t = 400; t < 800; t += 65) detector.update(result(null), null, t);
events = [];
for (let t = 800; t < 3000; t += 65) {
  const e = detector.update(result("heart"), null, t);
  if (e) events.push(e);
}
assert.deepEqual(
  events,
  ["heart"],
  "a held gesture during cooldown must not be marked consumed without emitting it",
);
// A wink and ordinary speech held for seconds must stay quiet, not just one frame.
for (const scores of [
  { eyeWideLeft: 0.8, eyeWideRight: 0 },
  { jawOpen: 0.5, browInnerUp: 0.1 },
  { mouthSmileLeft: 1, mouthSmileRight: 1 },
]) {
  detector.reset();
  for (let t = 0; t < 1000; t += 130)
    detector.update(
      result(null),
      face({
        eyeWideLeft: 0.04,
        eyeWideRight: 0.04,
        browInnerUp: 0.1,
        jawOpen: 0.03,
      }),
      t,
    );
  for (let t = 1000; t < 3000; t += 130)
    assert.equal(detector.update(result(null), face(scores), t), null);
}
console.log(
  "PASS: crossed hearts, moderate surprise, negative poses, tracking gaps, cooldown, hold/release and uninterrupted playback",
);
// Face contact must not be accepted as a heart, including brief face-tracking loss.
const normalized = hand("heart").map((p) => ({
  x: 0.45 + p.x * 0.1,
  y: 0.55 + p.y * 0.1,
  z: 0,
}));
const visibleHeart = {
  landmarks: [normalized],
  worldLandmarks: [hand("heart")],
  aspect: 1,
};
const faceEnvelope = () => ({
  faceLandmarks: [
    [
      { x: 0.3, y: 0.3 },
      { x: 0.7, y: 0.7 },
    ],
  ],
});
detector.reset();
for (let t = 0; t < 1000; t += 65)
  assert.equal(
    detector.update(visibleHeart, faceEnvelope(), t),
    null,
    "touching the face must not trigger heart",
  );
for (let t = 1000; t < 1300; t += 65)
  assert.equal(
    detector.update(visibleHeart, { faceLandmarks: [] }, t),
    null,
    "brief face occlusion must retain the contact guard",
  );
detector.reset();
const besideFace = {
  landmarks: [normalized.map((p) => ({ ...p, x: p.x - 0.25 }))],
  worldLandmarks: [hand("heart")],
  aspect: 1,
};
events = [];
for (let t = 0; t < 1000; t += 65) {
  const e = detector.update(besideFace, faceEnvelope(), t);
  if (e) events.push(e);
}
assert.deepEqual(
  events,
  ["heart"],
  "a deliberate heart beside the face still triggers once",
);
detector.reset();
for (let t = 0; t < 1000; t += 65)
  assert.equal(
    detector.update(
      { landmarks: [hand("fist")], worldLandmarks: [hand("heart")] },
      null,
      t,
    ),
    null,
    "inferred depth alone must not invent a visible heart",
  );
console.log(
  "PASS: face contact, short face occlusion, deliberate heart beside face, and world-only false positives",
);
