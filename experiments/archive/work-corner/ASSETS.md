# Asset notes

Paths are relative to this directory. Preserve the paths inside glTF models when moving their textures or binary data.

- `assets/design/coast-original.png`: full-quality background supplied by the concept author, used inside the device.
- `assets/recording/background-source-1.jpg`: presentation background.
- `assets/recording/bezel.png`, `close-*.svg`, `assets/design/polish-*`: frame and interface exports from the author's design.
- `assets/design/avatar-user-original.png`: the author's demonstration avatar. `avatar-ai.png`: Astra avatar.
- `assets/corner-photo.png`: the starting room image in the demonstration.
- `assets/product-photos/sofa-room-matched.png`: generated interior image matching the chair study. `sofa-keva.jpg` is a separate [Keva chair reference](https://shrops-design.co.uk/products/keva-tub-chair-moss-green-fabric) used on Pinned.
- `assets/product-photos/tomons-elbow-close.png`: the selected close view of the wood-arm lamp.
- `assets/product-photos/upright-studio-v1.png` and `broadleaf-studio-v1.png`: generated plant illustrations. The IKEA links in product data refer to plant analogues, not the pictured planters.
- Other product pictures are visual studies. They are not a verified catalogue of manufacturer photography. `product-data.js` is the authoritative mapping from products to images.

Typography: GT Eesti Text Regular for headings, Helvetica Narrow for navigation, CoFo Mono for notes, SF Pro Text for conversation and SF Pro Rounded Bold for the clock. The included CoFo file is a trial. The author previously reported purchasing a regular-font license; license documents are not part of this repository. Inclusion preserves the existing concept and does not transfer font licenses.

Model authors, source links, CC BY 4.0 / CC0 notices and modifications are retained in [model credits](assets/credits.html). Several objects and the room are procedural geometry. Third-party models are not manufacturer CAD drawings or reliable room measurements.

Three.js r160, GLTFLoader and BufferGeometryUtils are local dependencies under the [MIT license](licenses/three-LICENSE.txt). Individual artwork and font licenses remain with their owners; this document records known provenance and does not claim all imagery is original or freely reusable.
