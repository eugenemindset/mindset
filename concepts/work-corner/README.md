# Work corner · iPhone Duo

An interactive Mindset concept: furnish a workspace through a conversation, a canvas, a product shortlist and a live 3D room.

**[Open the concept](https://eugenemindset.github.io/mindset/concepts/work-corner/)**

## Explore

- Switch between Pinned, Products, My space, Ideas and My setup.
- Drag a tab out to open it beside the main surface. Drag the detached header to change sides; close it to return it to the tabs.
- Drag the dividers to resize the panels. Collapse and reopen the chat using the strip on its left.
- Move cards on Pinned and change the canvas zoom.
- Try a desk, chair, lamp or plant in My space. Add items to My setup to update the total.
- Use 50 / 75 / 100 / Fit to size the device. H hides the presentation controls; F enters fullscreen.

The demo opens in its framed presentation view. Add `?record=0` to use the editing view. Notes and selections are stored in this browser, separately from the other Mindset concepts.

## Run locally

From the repository root:

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765/concepts/work-corner/`. Use a local server rather than opening the HTML directly. No build step, API key or account is needed. A modern browser with WebGL is required for the room.

## Files

- `index.html`: shell and initial conversation.
- `product-data.js`: 14 products, images and demonstration prices.
- `workspace.js`: state, views, notes and scripted replies.
- `design.js`, `design.css`, `finish.css`: the finished visual design.
- `motion.js`, `motion.css`: dragging, panel layout, resizing and transitions.
- `recording.js`, `recording.css`: device frame, touch cursor and presentation size.
- `workroom-lab.js`: Three.js room, furniture and camera controls.
- `assets/`: images, fonts, frame, models and textures. `vendor/`: local Three.js dependencies.

Styles and scripts are layered in the order declared in `index.html`; later files refine earlier ones. Preserve this order when editing. Panel motion changes their bounds instead of stretching the typography. The final glass controls are 58 px high in design coordinates.

## Scope and credits

This is an interaction concept. The conversation uses local rules; there is no AI backend, real checkout or live product availability. Prices and delivery estimates are illustrative. One extra surface can be detached at a time.

The publication contains only the work-corner concept. Portofino, unrelated studies, superseded assets and the local PNG capture service are excluded. Source images and retained models keep their original quality.

See [asset notes](ASSETS.md), [model credits](assets/credits.html) and the [Three.js license](licenses/three-LICENSE.txt). Font and asset rights are separate from the source code; this repository does not grant a blanket license to those materials.
