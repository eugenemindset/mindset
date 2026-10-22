# Duo · Dark Room

[Open the project](https://eugenemindset.github.io/mindset/concepts/dark-room/)

A light editor concept for Duo. The upper screen previews a procedural room; the lower screen provides a miniature scene and controls for moving and adjusting lights.

Design: **@alx_mindset**.

This is the final Islands version: floating header controls, a full-screen room view, a warm blurred background, smoother foliage/window edges, and cached rendering. The experimental 20% folded variant is not included.

## Run and edit

Serve this folder or the repository with a static HTTP server. No installation or build step is required:

```sh
python3 -m http.server 4173
```

Open the served `index.html`. Use HTTPS when hosting publicly. The JavaScript modules, CSS, assets and Three.js dependencies are included locally.

- Add Fresnel, Panel or COB lights with the lower controls.
- Drag a source around the miniature room; select it to adjust brightness and beam width.
- **Save** stores lighting for the browser session. **Off** removes a source. **Back** undoes a change.
- Click the background around the phone to fold or unfold it.

`index.html` contains the interface, `style.css` its appearance, and `app.js` its state and interactions. `room-*.js` builds and renders the room; `phone-*.js` handles the phone. `bootstrap.js` resolves asset URLs and starts the app. Third-party modules are in `vendor/`, graphics and the phone model in `assets/`.

This is an interactive visual prototype, not a calibrated lighting calculation. LM values are interface levels, not measured lumens.

## Included notices

Three.js and its loaders retain their license headers; see `vendor/LICENSE`. The font notice supplied with the original project is retained as `assets/SF-Pro-License.rtf`. Other assets are retained from the supplied project.
