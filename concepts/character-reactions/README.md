# Character Reactions — Mindset

An interactive character concept exploring personality, Japanese mascot culture, and AI interface design. Wave, make a finger heart, look surprised, or give the character attitude: it reacts with short, preloaded videos and occasional speech bubbles.

[Open the concept](https://eugenemindset.github.io/mindset/concepts/character-reactions/) · [Black and white](https://eugenemindset.github.io/mindset/concepts/character-reactions/?theme=inverse)

## Run locally

From this folder, with Python 3 installed:

```sh
python3 -m http.server 8766 --bind 127.0.0.1
```

Open http://127.0.0.1:8766. No build, API key, external AI service, or package installation is required. Use HTTP on localhost or HTTPS on hosting; opening the HTML file directly does not work with modules and camera permissions.

## Controls

- **turn on / turn off**: enable or stop the camera. Audio is never requested.
- **1 / H**: hello; **2**: Korean finger heart; **3**: surprise; **4**: attitude.
- **+**: manual reactions, speed, edge treatment, grain, comments, and palette.
- **Scroll**: shrink the hero into a persistent header above the article.

All hand and face tracking runs in a Web Worker in the browser. Camera frames are not uploaded or recorded. The first load downloads roughly 91 MB of local video, model, and runtime assets. Clips are preloaded and cued before reactions become available. A held gesture fires once and must be released before it can trigger again. There is no smile trigger.

## One version

`index.html` is the only application entry point. The default palette is white/red; `?theme=inverse` selects black/white. Both palettes use the same layout and videos.

Hello uses the supplied transparent WebM without further keying. The other reactions each have two green-screen MP4 variants, composited locally with WebGL. Original video resolution is retained. MediaPipe detection is heuristic: lighting, hand occlusion and device performance affect results; manual controls work without camera access.

## Files

- `app.js`: preloading, playback, camera lifecycle, bubbles, scroll layout.
- `reactions.js`: clip manifest and bubble copy.
- `tracking-worker.js`: local MediaPipe models and inference.
- `reaction-detector.js`, `wave-detector.js`: gesture filtering, expression thresholds, cooldowns.
- `chroma-renderer.js`: alpha playback and green-screen compositing.
- `style.css`, `theme.js`: responsive presentation and palettes.
- `assets/`: required videos, models, runtime, fonts and article images.
- `tests/`: gesture regression tests; run `npm test` with Node.js 18+.

Publish this folder on a static host. All application asset paths are relative, so it also works under a GitHub Pages subdirectory. GitHub Pages already hosts the parent repository.

The social links and contact control are concept placeholders. This is a visual prototype, not a finished article or production gesture-recognition product.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for asset attribution. Debug pages, camera screenshots, source references, old video variants and hosting credentials are excluded.
