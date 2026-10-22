# Mindset

[Open the final concepts](https://eugenemindset.github.io/mindset/concepts/)

## Final concepts

Only finished concepts live in `concepts/`:

- [Duo · Dark Room](concepts/dark-room/): the original final Islands light editor, published in commit `7f841f680227e6e546b393e8a2ba097edd7ce135`. Its existing files and URL are retained unchanged. Its README identifies it as the final Duo version; no replacement prototype was invented.
- [Character Reactions / человечек](concepts/character-reactions/): the existing character and gesture interaction concept, unchanged.
- [Water / вода](concepts/water/): a complete, byte-for-byte copy of [eugenemindset/water](https://github.com/eugenemindset/water) at commit `51b31d7b98d7604278c53e4b9a5d77e2d379aa14`, including fonts, screenshot, README and MIT license. The source repository is independent and unchanged. This is a pinned copy, not a submodule or an automatic sync.

## Experiments

[experiments/archive/](experiments/archive/) holds all earlier first-screen studies, `scratch-panel`, the separate `work-corner` furniture study and their `shared` cursor script. Whole folders were moved together so their assets and `../shared/` links stay intact. No draft assets were discarded.

The [Home Screen app](app/) still rotates the same four screens. Its URLs now point into the archive; the generated service worker precaches the new locations. The unrelated `sobrano-fjallbo/` prototype remains at its existing location.

## Run locally

From the repository root:

```sh
python3 tools/serve.py 8787
```

Open `http://localhost:8787/concepts/` for finished concepts, `/experiments/archive/` for studies, or `/app/` for the rotating Home Screen app. No build step is needed to serve the site. Camera and gyroscope features need browser permission and a secure context (HTTPS or localhost).

After changing the app, archive screens or catalogues, regenerate the offline cache:

```sh
python3 tools/build-sw.py
```

Concept-specific instructions, asset credits and licenses remain in their original folders.
