const assert = require("node:assert/strict");
const { WaveDetector } = require("../wave-detector.js");
const palm = (x) => ({
  landmarks: [Array.from({ length: 21 }, () => ({ x, y: 0.3 }))],
  gestures: [[{ categoryName: "Open_Palm", score: 0.99 }]],
});
let d = new WaveDetector();
for (let n = 0; n < 40; n++)
  assert.equal(
    d.update(palm(0.5 + Math.sin(n) * 0.002), n * 65),
    false,
    "stationary/noisy palm must not trigger",
  );
d = new WaveDetector();
const events = [0.3, 0.33, 0.38, 0.42, 0.39, 0.34].map((x, i) =>
  d.update(palm(x), 1000 + i * 65),
);
assert.equal(events.filter(Boolean).length, 1, "wave triggers once");
for (let n = 0; n < 20; n++)
  assert.equal(
    d.update(palm(0.5 + Math.sin(n) * 0.1), 1500 + n * 65),
    false,
    "cooldown must suppress repeated triggers",
  );
d.reset();
for (let n = 0; n < 10; n++)
  assert.equal(
    d.update({ landmarks: [] }, 4000 + n * 65),
    false,
    "missing hand must not trigger",
  );
console.log("PASS: palm noise, wave, cooldown, reset, missing hand");
