import * as THREE from 'duo/vendor/three.module.js';
import { enhanceRoomMaterials } from 'duo/room-materials.js';
import { addWindowCurtains } from 'duo/room-curtains.js';

// An original, entirely procedural kitchen. Nothing in these materials emits light.
// Geometry is collected by material so the small objects do not cost a draw call each.
export function createRoom() {
  const group = new THREE.Group();
  group.name = 'The quiet kitchen';
  const batches = new Map();
  let activeBatches = batches;
  const textures = new Set();
  const materials = new Set();
  let seed = 472193;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const TAU = Math.PI * 2;

  function surfaceTexture(kind) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = kind === 'wood' ? 512 : 256;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(canvas.width, canvas.height);
    const width = canvas.width, height = canvas.height;
    const fibres = Array.from({ length: width }, () => random() * 7);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        let value;
        if (kind === 'wood') {
          const wave = Math.sin(y / 59) * 1.8 + Math.sin(y / 133) * 4;
          const band = Math.sin((x + wave) * .22) * 4 + Math.sin((x + wave) * .83) * 2;
          value = 204 + band - fibres[x] + (random() - .5) * 6;
        } else if (kind === 'cloth') {
          value = 226 + (x % 3 === 0 ? -11 : 0) + (y % 3 === 0 ? -9 : 0) + random() * 6;
        } else {
          value = 213 + Math.sin(x / 31 + Math.sin(y / 45)) * 3 + Math.sin(y / 21) * 2 + (random() - .5) * (kind === 'plaster' ? 18 : 10);
        }
        image.data[i] = value;
        image.data[i + 1] = value - (kind === 'wood' ? 3 : 0);
        image.data[i + 2] = value - (kind === 'wood' ? 8 : 0);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    if (kind === 'wood') {
      // Fine interrupted longitudinal grain, restrained enough to survive grazing light.
      for (let i = 0; i < 115; i++) {
        const x = random() * width, y = random() * height;
        ctx.strokeStyle = `rgba(55,44,29,${.025 + random() * .06})`;
        ctx.lineWidth = .25 + random() * .6;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + 1, y + 40, x - 2, y + 95, x + random() * 2, y + 140);
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const x = 32 + random() * 190, y = 70 + random() * 360;
        for (let j = 1; j <= 5; j++) {
          ctx.strokeStyle = `rgba(65,44,27,${.10 - j * .012})`;
          ctx.lineWidth = .6;
          ctx.beginPath();
          ctx.ellipse(x, y, j * 1.6, j * 5.3, 0, 0, TAU);
          ctx.stroke();
        }
      }
    }
    const map = new THREE.CanvasTexture(canvas);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    textures.add(map);
    const bump = map.clone();
    bump.colorSpace = THREE.NoColorSpace;
    bump.needsUpdate = true;
    textures.add(bump);
    return { map, bump };
  }
  const wood = surfaceTexture('wood');
  const plaster = surfaceTexture('plaster');
  const stone = surfaceTexture('stone');
  const cloth = surfaceTexture('cloth');
  function material(name, color, roughness = .75, extra = {}) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra });
    mat.name = name;
    materials.add(mat);
    return mat;
  }
  const agedWood = (name, color, roughness = .69) => material(name, color, roughness, { map: wood.map, bumpMap: wood.bump, bumpScale: .004 });
  const m = {
    wall: material('dusty mineral plaster', 0x788685, .96, { map: plaster.map, bumpMap: plaster.bump, bumpScale: .012 }),
    leftWall: material('aged blue green plaster', 0x6e7d7c, .96, { map: plaster.map, bumpMap: plaster.bump, bumpScale: .012 }),
    slab: material('cut stone slab edge', 0x3c4440, .97, { map: stone.map, bumpMap: stone.bump, bumpScale: .006 }),
    grout: material('warm gray grout', 0x535851, .98),
    walnut: agedWood('worn walnut', 0x796049),
    darkWood: agedWood('dark walnut end grain', 0x4f3c2d),
    lightWood: agedWood('polished walnut high points', 0x8b7053),
    cabinet: agedWood('worn painted pantry green', 0x526962, .84),
    panel: agedWood('inset painted panels', 0x485d57, .84),
    edge: agedWood('rubbed cabinet edge', 0x718073, .82),
    shutter: agedWood('weathered shutter', 0x777b6a, .93),
    frame: agedWood('old painted window oak', 0x9c9b81, .87),
    stone: material('honed charcoal countertop', 0x66675d, .63, { map: stone.map, bumpMap: stone.bump, bumpScale: .004 }),
    ceramic: material('warm old porcelain', 0xc7c8b9, .3),
    ceramicShade: material('porcelain foot and lid', 0xaeb5aa, .35),
    pottery: material('stoneware gray', 0x748479, .61, { map: stone.map, bumpMap: stone.bump, bumpScale: .001 }),
    iron: material('blackened iron', 0x363c37, .62, { metalness: .65 }),
    brass: material('tarnished brass', 0x8a7b51, .5, { metalness: .75 }),
    pewter: material('worn pewter tap', 0x87948d, .34, { metalness: .86 }),
    linen: material('flax dish linen', 0xa9ada0, .98, { map: cloth.map, bumpMap: cloth.bump, bumpScale: .002, side: THREE.DoubleSide }),
    linenStripe: material('faded linen stripe', 0x526b68, .98, { map: cloth.map, side: THREE.DoubleSide }),
    glass: material('old olive glass bottles', 0x505d38, .24, { metalness: .12 }),
    cork: material('old cork', 0x786347, .98, { map: stone.map }),
    food: material('bread crust', 0x8d7450, .99, { map: plaster.map, bumpMap: plaster.bump, bumpScale: .008 }),
    enamel: material('old stove enamel', 0x96a099, .31, { metalness: .25 }),
    radiator: material('cast iron radiator enamel', 0x84918a, .43, { metalness: .25 }),
    leaf: material('palm leaf deep olive', 0x344c32, .44, { side: THREE.DoubleSide }),
    leafLight: material('palm leaf silver edge', 0x596a41, .4, { side: THREE.DoubleSide }),
    planter: material('earthenware palm planter', 0x6c7565, .41),
    soil: material('dark potting soil', 0x252820, .97),
    book: material('faded cloth book covers', 0x535f52, .82),
    paper: material('ivory book page edges', 0x98977c, .92),
    floorInset: material('blue gray floor inserts', 0x52666b, .51, { map: stone.map, bumpMap: stone.bump, bumpScale: .002 }),
    tableOak: agedWood('warm natural oak tabletop', 0xa38a68, .46),
    chairOak: agedWood('dark smoked oak chair frames', 0x585044, .48),
    cushion: material('olive woven seat cushions', 0x6b7650, .91),
    piping: material('olive cushion piping', 0x5a6645, .91),
    tableLinen: material('natural oatmeal table linen', 0xc5bcaa, .94, { side: THREE.DoubleSide }),
  };
  // Heat-resistant smoked glass has its own optical material; the olive bottle
  // material remains independent. Transmission uses full opacity in Three.js.
  m.ovenGlass = new THREE.MeshPhysicalMaterial({
    color: 0x626262, metalness: 0, roughness: .075,
    transmission: .70, thickness: .007, ior: 1.5,
    attenuationColor: 0x606060, attenuationDistance: .025,
    clearcoat: .65, clearcoatRoughness: .065,
    envMapIntensity: 1.15, opacity: 1,
  });
  m.ovenGlass.name = 'smoked oven door glass';
  materials.add(m.ovenGlass);
  m.ovenInterior = material('dark oven cavity steel', 0x111315, .48, { metalness: .24 });
  m.tableOak.userData.surfaceMeters = [1.82, 1.30];
  m.cushion.userData.surfaceMeters = [.49, .47];
  m.piping.userData.surfaceMeters = [.49, .47];
  m.tableLinen.userData.surfaceMeters = [.30, .89];
  const tiles = [0x727c70, 0x778173, 0x6b776d, 0x808675, 0x70796d, 0x798073]
    .map((color, i) => material(`limestone floor ${i}`, color, .88, { map: stone.map, bumpMap: stone.bump, bumpScale: .005 }));
  const backsplash = [0xa0aaa0, 0x929e95, 0xa8aea1]
    .map((color, i) => material(`old glazed wall tile ${i}`, color, .45, { map: stone.map, bumpMap: stone.bump, bumpScale: .001 }));

  // A rounded rectangle with a small true bevel, rather than a painted cuboid.
  function roundedShape(width, height, radius) {
    const x = -width / 2, y = -height / 2;
    const r = Math.min(radius, width / 2 - .0001, height / 2 - .0001);
    const s = new THREE.Shape();
    s.moveTo(x + r, y);
    s.lineTo(x + width - r, y);
    s.quadraticCurveTo(x + width, y, x + width, y + r);
    s.lineTo(x + width, y + height - r);
    s.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    s.lineTo(x + r, y + height);
    s.quadraticCurveTo(x, y + height, x, y + height - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  function boxGeometry(width, height, depth, radius = .006) {
    if (!radius) return new THREE.BoxGeometry(width, height, depth);
    const bevel = Math.min(radius * .48, width / 8, height / 8, depth / 8);
    const shape = roundedShape(width - bevel * 2, height - bevel * 2, radius);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4, steps: 1 });
    geom.translate(0, 0, -depth / 2 + bevel);
    // Local box UVs keep painted wood grain coherent on the largest faces.
    const p = geom.attributes.position, n = geom.attributes.normal, uv = geom.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
      if (ny > nx && ny > nz) uv.setXY(i, p.getZ(i) / depth + .5, p.getX(i) / width + .5);
      else if (nx > nz) uv.setXY(i, p.getZ(i) / depth + .5, p.getY(i) / height + .5);
      else uv.setXY(i, p.getX(i) / width + .5, p.getY(i) / height + .5);
    }
    return geom;
  }
  const identity = new THREE.Matrix4();
  function transform(position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
    return new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
  }
  function add(geometry, mat, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], parent = identity) {
    const matrix = new THREE.Matrix4().multiplyMatrices(parent, transform(position, rotation, scale));
    let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    geometry.dispose();
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!activeBatches.has(mat)) activeBatches.set(mat, []);
    activeBatches.get(mat).push(g);
  }
  function box(w, h, d, mat, p, r = [0, 0, 0], bevel = .006, parent = identity) {
    add(boxGeometry(w, h, d, bevel), mat, p, r, [1, 1, 1], parent);
  }
  function cylinder(radiusTop, radiusBottom, height, mat, p, r = [0, 0, 0], radial = 20, parent = identity) {
    add(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radial), mat, p, r, [1, 1, 1], parent);
  }
  function sphere(radius, mat, p, scale = [1, 1, 1], parent = identity) {
    add(new THREE.SphereGeometry(radius, 20, 12), mat, p, [0, 0, 0], scale, parent);
  }
  function lathe(profile, mat, p, scale = [1, 1, 1], rotation = [0, 0, 0], parent = identity, segments = 32) {
    add(new THREE.LatheGeometry(profile.map(v => new THREE.Vector2(...v)), segments), mat, p, rotation, scale, parent);
  }
  function rod(a, b, r1, r2, mat, parent = identity, segments = 16) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), diff = end.clone().sub(start);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.clone().normalize());
    const matrix = new THREE.Matrix4().compose(start.clone().add(end).multiplyScalar(.5), q, new THREE.Vector3(1, 1, 1));
    const geometry = new THREE.CylinderGeometry(r2, r1, diff.length(), segments);
    add(geometry, mat, [0, 0, 0], [0, 0, 0], [1, 1, 1], new THREE.Matrix4().multiplyMatrices(parent, matrix));
  }
  function tube(points, radius, mat, p = [0, 0, 0], rotation = [0, 0, 0], parent = identity, tubular = 24) {
    const curve = new THREE.CatmullRomCurve3(points.map(v => new THREE.Vector3(...v)));
    add(new THREE.TubeGeometry(curve, tubular, radius, 12, false), mat, p, rotation, [1, 1, 1], parent);
  }
  function torus(radius, thickness, mat, p, rotation = [0, 0, 0], arc = TAU, parent = identity) {
    add(new THREE.TorusGeometry(radius, thickness, 12, 40, arc), mat, p, rotation, [1, 1, 1], parent);
  }
  function knob(p, parent = identity) {
    cylinder(.012, .012, .023, m.brass, [p[0] - .007, p[1], p[2]], [0, 0, -Math.PI / 2], 12, parent);
    sphere(.018, m.brass, p, [.58, 1, 1], parent);
  }
  function superellipsePoint(angle, halfWidth, halfDepth, exponent = 3) {
    const c = Math.cos(angle), s = Math.sin(angle);
    return [Math.sign(c) * Math.pow(Math.abs(c), 2 / exponent) * halfWidth, Math.sign(s) * Math.pow(Math.abs(s), 2 / exponent) * halfDepth];
  }
  function profiledSolid(width, depth, profile, mat, parent = identity, exponent = 3, segments = 80) {
    const positions = [], uvs = [], indices = [];
    for (let j = 0; j < profile.length; j++) for (let i = 0; i <= segments; i++) {
      const [x, z] = superellipsePoint(i / segments * TAU, width / 2 * profile[j][0], depth / 2 * profile[j][0], exponent);
      positions.push(x, profile[j][1], z); uvs.push(x / width + .5, z / depth + .5);
      if (j < profile.length - 1 && i < segments) {
        const a = j * (segments + 1) + i, b = a + segments + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    for (const [ring, flip] of [[0, false], [profile.length - 1, true]]) {
      const center = positions.length / 3;
      positions.push(0, profile[ring][1], 0); uvs.push(.5, .5);
      // Separate cap vertices retain a perfectly flat furniture surface.
      const start = positions.length / 3;
      for (let i = 0; i <= segments; i++) {
        const [x, z] = superellipsePoint(i / segments * TAU, width / 2 * profile[ring][0], depth / 2 * profile[ring][0], exponent);
        positions.push(x, profile[ring][1], z); uvs.push(x / width + .5, z / depth + .5);
      }
      for (let i = 0; i < segments; i++) indices.push(center, start + i + (flip ? 1 : 0), start + i + (flip ? 0 : 1));
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, mat, [0, 0, 0], [0, 0, 0], [1, 1, 1], parent);
  }
  // Rounded square cross-sections swept along curves give furniture real taper
  // and continuous joinery rather than overlapping primitive cylinders.
  function sweptWood(points, radiusStart, radiusEnd, mat, parent = identity, flatten = 1, steps = 28) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
    const frames = curve.computeFrenetFrames(steps, false), sides = 16;
    const positions = [], uvs = [], indices = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = curve.getPointAt(t), radius = THREE.MathUtils.lerp(radiusStart, radiusEnd, t);
      for (let j = 0; j <= sides; j++) {
        const a = j / sides * TAU, cosine = Math.cos(a), sine = Math.sin(a);
        const nx = Math.sign(cosine) * Math.pow(Math.abs(cosine), .60) * radius;
        const ny = Math.sign(sine) * Math.pow(Math.abs(sine), .60) * radius * flatten;
        const v = center.clone().addScaledVector(frames.normals[i], nx).addScaledVector(frames.binormals[i], ny);
        positions.push(v.x, v.y, v.z); uvs.push(j / sides, t);
        if (i < steps && j < sides) {
          const a = i * (sides + 1) + j, b = a + sides + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    for (const [ring, flip] of [[0, true], [steps, false]]) {
      const center = curve.getPointAt(ring / steps), index = positions.length / 3;
      positions.push(center.x, center.y, center.z); uvs.push(.5, .5);
      for (let j = 0; j < sides; j++) {
        const a = ring * (sides + 1) + j;
        indices.push(index, a + (flip ? 1 : 0), a + (flip ? 0 : 1));
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, mat, [0, 0, 0], [0, 0, 0], [1, 1, 1], parent);
  }
  function routedDoorFrame(width, height, rail, depth, mat, position, parent = identity) {
    const shape = roundedShape(width, height, .012);
    shape.holes.push(roundedShape(width - rail * 2, height - rail * 2, .009));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .0025, bevelThickness: .0025, bevelSegments: 2, curveSegments: 5, steps: 1 });
    geometry.translate(0, 0, -depth / 2);
    add(geometry, mat, position, [0, Math.PI / 2, 0], [1, 1, 1], parent);
  }

  // Stone diorama base and individually beveled flags, with actual grout gaps.
  box(5.68, .16, 5.08, m.slab, [0, -.12, 0], [0, 0, 0], .018);
  box(5.60, .035, 5.00, m.grout, [0, -.025, 0], [0, 0, 0], .004);
  const tileW = 5.6 / 10, tileD = 5 / 9;
  function flagGeometry() {
    const hw = (tileW - .014) / 2, hd = (tileD - .014) / 2, cut = .075;
    const outline = new THREE.Shape();
    outline.moveTo(-hw + cut, -hd);
    outline.lineTo(hw - cut, -hd); outline.lineTo(hw, -hd + cut);
    outline.lineTo(hw, hd - cut); outline.lineTo(hw - cut, hd);
    outline.lineTo(-hw + cut, hd); outline.lineTo(-hw, hd - cut);
    outline.lineTo(-hw, -hd + cut); outline.closePath();
    const geom = new THREE.ExtrudeGeometry(outline, { depth: .024, bevelEnabled: true, bevelThickness: .004, bevelSize: .003, bevelSegments: 1, steps: 1 });
    geom.translate(0, 0, -.012);
    return geom;
  }
  for (let x = 0; x < 10; x++) {
    for (let z = 0; z < 9; z++) {
      const mat = tiles[Math.floor(random() * tiles.length)];
      add(flagGeometry(), mat, [-2.8 + tileW * (x + .5), -.005, -2.5 + tileD * (z + .5)], [-Math.PI / 2, 0, 0]);
    }
  }
  for (let x = 1; x < 10; x++) for (let z = 1; z < 9; z++) {
    box(.102, .029, .102, m.floorInset, [-2.8 + tileW * x, -.005, -2.5 + tileD * z], [0, Math.PI / 4, 0], .003);
  }

  // The rear wall is four solids surrounding a REAL opening, with no dark plane in it.
  box(.15, 3.5, 5.00, m.leftWall, [-2.875, 1.75, 0], [0, 0, 0], 0);
  box(3.15, 3.5, .15, m.wall, [-1.225, 1.75, -2.575], [0, 0, 0], 0);
  box(1.15, 3.5, .15, m.wall, [2.225, 1.75, -2.575], [0, 0, 0], 0);
  box(1.3, 1.425, .15, m.wall, [1, .7125, -2.575], [0, 0, 0], 0);
  box(1.3, .525, .15, m.wall, [1, 3.2375, -2.575], [0, 0, 0], 0);
  box(.056, .13, 4.98, m.darkWood, [-2.773, .075, 0], [0, 0, 0], .007);
  box(.064, .024, 4.98, m.walnut, [-2.768, .152, 0], [0, 0, 0], .004);
  box(5.56, .13, .056, m.darkWood, [0, .075, -2.47], [0, 0, 0], .007);
  box(5.56, .024, .064, m.walnut, [0, .152, -2.465], [0, 0, 0], .004);

  // Recessed jambs and a shutter parked beside a completely open single pane.
  for (const x of [.329, 1.671]) box(.076, 1.67, .23, m.frame, [x, 2.2, -2.51], [0, 0, 0], .005);
  for (const y of [1.403, 2.997]) box(1.41, .073, .23, m.frame, [1, y, -2.51], [0, 0, 0], .005);
  box(1.55, .072, .37, m.frame, [1, 1.38, -2.405], [0, 0, 0], .012);
  const shutterTransform = transform([-.036, 2.2, -2.394], [0, -.16, 0]);
  for (const x of [-.23, .23]) box(.045, 1.55, .045, m.shutter, [x, 0, 0], [0, 0, 0], .004, shutterTransform);
  for (let i = 0; i < 10; i++) box(.435, .125, .035, m.shutter, [0, -.687 + i * .153, 0], [.10, 0, 0], .003, shutterTransform);
  for (const y of [-.48, .48]) {
    box(.48, .045, .025, m.darkWood, [0, y, .033], [0, 0, 0], .003, shutterTransform);
    box(.105, .03, .015, m.iron, [.23, y, .04], [0, 0, 0], .002, shutterTransform);
  }

  // Pantry cupboards along the left wall. Fronts face +X.
  // A hollow cabinet carcass leaves space for the sink below the counter.
  box(.055, .79, 3.00, m.cabinet, [-2.708, .47, -.79], [0, 0, 0], .009);
  box(.75, .075, 3.00, m.cabinet, [-2.36, .16, -.79], [0, 0, 0], .009);
  for (const z of [-2.262, .682]) box(.75, .79, .055, m.cabinet, [-2.36, .47, z], [0, 0, 0], .009);
  for (const z of [-1.682, -1.092, -.502, .088]) box(.72, .49, .033, m.cabinet, [-2.37, .425, z], [0, 0, 0], .004);
  box(.66, .11, 2.91, m.darkWood, [-2.40, .105, -.79], [0, 0, 0], .004);
  box(.025, .075, 2.99, m.edge, [-1.974, .88, -.79], [0, 0, 0], .004);
  for (let i = 0; i < 5; i++) {
    const z = -1.977 + i * .59, beneathSink = i === 1 || i === 2;
    const doorHeight = beneathSink ? .584 : .504, doorY = beneathSink ? .472 : .432;
    box(.023, doorHeight - .008, .548, m.panel, [-1.969, doorY, z], [0, 0, 0], .007);
    routedDoorFrame(.551, doorHeight, .049, .027, m.cabinet, [-1.935 + (i % 2) * .0015, doorY, z]);
    routedDoorFrame(.462, doorHeight - .089, .010, .010, m.edge, [-1.942, doorY, z]);
    box(.009, doorHeight - .12, .431, m.panel, [-1.945, doorY, z], [0, 0, 0], .008);
    knob([-1.904, doorY + doorHeight * .29, z + .178]);
    if (!beneathSink) {
      box(.036, .127, .551, m.cabinet, [-1.951, .790 + i * .0007, z], [0, 0, 0], .012);
      routedDoorFrame(.461, .070, .011, .008, m.edge, [-1.929, .790, z]);
      tube([[-1.924, .797, z - .063], [-1.884, .806, z - .041], [-1.877, .807, z + .042], [-1.924, .797, z + .063]], .008, m.brass);
      for (const zz of [z - .063, z + .063]) sphere(.014, m.brass, [-1.925, .796, zz], [.36, 1, 1]);
    }
    for (const y of [doorY - doorHeight * .30, doorY + doorHeight * .30]) cylinder(.0065, .0065, .049, m.brass, [-1.925, y, z - .254], [0, 0, 0], 10);
  }
  // Counter segments surround the sink instead of intersecting its bowl.
  const counterY = .934;
  box(.90, .084, .77, m.stone, [-2.342, counterY, -1.957], [0, 0, 0], .012);
  box(.90, .084, 1.63, m.stone, [-2.342, counterY, .065], [0, 0, 0], .012);
  box(.19, .084, .80, m.stone, [-2.697, counterY, -1.165], [0, 0, 0], .009);
  box(.19, .084, .80, m.stone, [-1.987, counterY, -1.165], [0, 0, 0], .009);
  for (let i = 0; i < 11; i++) for (let j = 0; j < 2; j++) {
    box(.025, .172, .273, backsplash[(i + j * 2) % 3], [-2.785, 1.08 + j * .18, -2.16 + i * .284], [0, 0, 0], .003);
  }

  // Hand-built porcelain bowl, rolled lip, sloping interior, and drain.
  function roundedLoop(w, d, r, y, count = 10) {
    const points = [];
    const centers = [[w / 2 - r, d / 2 - r], [-w / 2 + r, d / 2 - r], [-w / 2 + r, -d / 2 + r], [w / 2 - r, -d / 2 + r]];
    for (let c = 0; c < 4; c++) for (let i = 0; i <= count; i++) {
      const angle = c * Math.PI / 2 + i / count * Math.PI / 2;
      points.push([centers[c][0] + Math.cos(angle) * r, y, centers[c][1] + Math.sin(angle) * r]);
    }
    return points;
  }
  function basin() {
    const rings = [roundedLoop(.598, .805, .085, .957), roundedLoop(.60, .807, .085, .984), roundedLoop(.512, .719, .082, .998), roundedLoop(.468, .675, .085, .969), roundedLoop(.382, .565, .11, .758), roundedLoop(.32, .49, .11, .741)];
    const positions = [], uv = [];
    const push = p => { positions.push(...p); uv.push(p[0] + .5, p[2] + .5); };
    const count = rings[0].length;
    for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < count; i++) {
      const k = (i + 1) % count;
      push(rings[j][i]); push(rings[j + 1][i]); push(rings[j][k]);
      push(rings[j][k]); push(rings[j + 1][i]); push(rings[j + 1][k]);
    }
    for (let i = 0; i < count; i++) { push([0, .741, 0]); push(rings.at(-1)[(i + 1) % count]); push(rings.at(-1)[i]); }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geom.computeVertexNormals();
    add(geom, m.ceramic, [-2.342, 0, -1.165]);
  }
  basin();
  box(.045, .213, .794, m.ceramic, [-1.918, .862, -1.165], [0, 0, 0], .016);
  cylinder(.035, .035, .009, m.pewter, [-2.342, .75, -1.165], [0, 0, 0], 24);
  for (let i = 0; i < 5; i++) cylinder(.003, .003, .001, m.iron, [-2.342 + Math.cos(i * TAU / 5) * .019, .755, -1.165 + Math.sin(i * TAU / 5) * .019], [0, 0, 0], 6);
  cylinder(.045, .052, .025, m.pewter, [-2.659, .999, -1.165]);
  tube([[-2.659, 1.006, -1.165], [-2.657, 1.267, -1.165], [-2.57, 1.405, -1.165], [-2.408, 1.374, -1.165], [-2.392, 1.256, -1.165]], .018, m.pewter, [0, 0, 0], [0, 0, 0], identity, 34);
  cylinder(.024, .022, .044, m.pewter, [-2.392, 1.246, -1.165]);
  for (const z of [-1.38, -.949]) {
    cylinder(.032, .042, .043, m.pewter, [-2.663, .995, z]);
    cylinder(.015, .019, .08, m.pewter, [-2.663, 1.057, z]);
    rod([-2.718, 1.105, z], [-2.608, 1.105, z], .012, .012, m.pewter);
    rod([-2.663, 1.105, z - .05], [-2.663, 1.105, z + .05], .009, .009, m.pewter);
    sphere(.016, m.ceramic, [-2.663, 1.117, z]);
  }

  // The upper case includes recessed fronts and a projecting crown / cornice.
  box(.39, .93, 1.37, m.darkWood, [-2.582, 2.28, -1.608], [0, 0, 0], .01);
  box(.448, .043, 1.46, m.cabinet, [-2.55, 2.772, -1.608], [0, 0, 0], .009);
  box(.417, .023, 1.42, m.edge, [-2.565, 2.738, -1.608], [0, 0, 0], .005);
  box(.424, .05, 1.42, m.cabinet, [-2.556, 1.80, -1.608], [0, 0, 0], .006);
  for (const z of [-1.955, -1.261]) {
    box(.021, .865, .656, m.panel, [-2.36, 2.28, z], [0, 0, 0], .007);
    routedDoorFrame(.663, .877, .058, .026, m.cabinet, [-2.327, 2.28, z]);
    routedDoorFrame(.556, .770, .012, .010, m.edge, [-2.338, 2.28, z]);
    box(.008, .729, .515, m.panel, [-2.345, 2.28, z], [0, 0, 0], .009);
    knob([-2.293, 2.12, z + (z < -1.6 ? .22 : -.22)]);
    for (const y of [2.0, 2.56]) cylinder(.01, .01, .089, m.iron, [-2.322, y, z + (z < -1.6 ? -.315 : .315)], [0, 0, 0], 10);
  }

  // Open shelves with shaped brackets and a gathered collection of kitchenware.
  for (const y of [1.875, 2.41]) {
    box(.456, .05, 1.34, m.walnut, [-2.548, y, -.087], [0, 0, 0], .008);
    box(.015, .045, 1.32, m.lightWood, [-2.315, y, -.087], [0, 0, 0], .003);
    for (const z of [-.60, .43]) {
      box(.035, .235, .032, m.darkWood, [-2.757, y - .125, z], [0, 0, 0], .003);
      rod([-2.75, y - .22, z], [-2.365, y - .031, z], .019, .018, m.darkWood);
    }
  }
  function jar(x, y, z, radius, height, mat = m.pottery, lid = true) {
    lathe([[0, 0], [radius * .72, 0], [radius * .88, .012], [radius, height * .14], [radius, height * .77], [radius * .83, height * .88], [radius * .76, height], [radius * .64, height], [radius * .65, height * .83]], mat, [x, y, z]);
    if (lid) {
      cylinder(radius * .81, radius * .83, .023, m.darkWood, [x, y + height + .008, z]);
      sphere(radius * .19, m.darkWood, [x, y + height + .027, z], [1, .65, 1]);
    }
  }
  jar(-2.544, 2.435, -.52, .11, .255, m.ceramic);
  jar(-2.539, 2.435, -.24, .085, .212, m.pottery);
  jar(-2.529, 2.435, .04, .111, .299, m.ceramicShade);
  jar(-2.54, 2.435, .34, .07, .186, m.pottery);
  for (let i = 0; i < 5; i++) {
    // Stacked shallow plates, each with a rolled foot and rim.
    lathe([[0, 0], [.07, 0], [.078, .008], [.113, .02], [.135, .025], [.14, .031], [.128, .036], [.105, .025], [0, .014]], m.ceramic, [-2.537, 1.905 + i * .019, -.435]);
  }
  bowl([-2.537, 1.90, -.045], .126, .072, m.pottery);

  function bowl(p, radius, height, mat = m.ceramic) {
    lathe([[0, 0], [radius * .45, 0], [radius * .51, .011], [radius * .68, height * .27], [radius * .93, height * .77], [radius, height], [radius * .92, height + .004], [radius * .85, height * .75], [radius * .57, height * .22], [0, height * .13]], mat, p);
  }
  function cup(p, radius = .064, height = .10, mat = m.ceramic, angle = 0) {
    const parent = transform(p, [0, angle, 0]);
    lathe([[0, 0], [radius * .65, 0], [radius * .70, .011], [radius * .86, height * .14], [radius, height], [radius - .008, height + .002], [radius - .012, height * .88], [radius * .7, height * .2], [0, height * .15]], mat, [0, 0, 0], [1, 1, 1], [0, 0, 0], parent);
    torus(height * .32, .010, mat, [radius + height * .18, height * .56, 0], [0, 0, 0], TAU, parent);
  }
  cup([-2.54, 1.9, .27], .06, .119, m.ceramicShade, -Math.PI / 2);
  cup([-2.54, 1.9, .48], .063, .115, m.ceramic, -Math.PI / 2);

  // A hanging iron pan and utensils are modeled in profile, including their hollows.
  rod([-2.69, 1.684, -.585], [-2.69, 1.684, .50], .012, .012, m.iron);
  for (const z of [-.48, -.11, .23, .45]) {
    tube([[-2.69, 1.69, z], [-2.64, 1.672, z], [-2.65, 1.604, z], [-2.69, 1.618, z]], .006, m.brass);
  }
  const panParent = transform([-2.695, 1.293, .245], [0, 0, -Math.PI / 2]);
  lathe([[0, 0], [.115, 0], [.156, .009], [.173, .033], [.177, .048], [.165, .05], [.151, .025], [.113, .014], [0, .014]], m.iron, [0, 0, 0], [1, 1, 1], [0, 0, 0], panParent);
  rod([-2.67, 1.44, .245], [-2.67, 1.618, .245], .016, .012, m.iron);
  torus(.016, .005, m.iron, [-2.67, 1.617, .245], [0, Math.PI / 2, 0]);
  rod([-2.67, 1.355, -.1], [-2.67, 1.602, -.1], .008, .007, m.walnut);
  sphere(.041, m.walnut, [-2.67, 1.323, -.1], [.25, 1.3, .72]);
  rod([-2.67, 1.35, -.48], [-2.67, 1.604, -.48], .007, .007, m.iron);
  lathe([[0, 0], [.035, 0], [.045, .018], [.047, .027], [.04, .03], [0, .011]], m.iron, [-2.669, 1.319, -.48], [1, 1, 1], [0, 0, -Math.PI / 2]);

  // Bottles, a bread board and a fluted utensil crock on the counter.
  function bottle(p, height, radius) {
    lathe([[0, 0], [radius * .8, 0], [radius, .017], [radius, height * .66], [radius * .81, height * .75], [radius * .36, height * .82], [radius * .34, height], [radius * .19, height], [radius * .19, height * .89]], m.glass, p);
    cylinder(radius * .26, radius * .30, .025, m.cork, [p[0], p[1] + height + .006, p[2]], [0, 0, 0], 12);
  }
  bottle([-2.66, .979, -2.10], .30, .073);
  bottle([-2.47, .979, -2.17], .251, .055);
  box(.405, .025, .33, m.lightWood, [-2.176, .995, .225], [0, .13, 0], .027);
  box(.102, .021, .10, m.lightWood, [-2.161, .995, .425], [0, .13, 0], .017);
  sphere(.11, m.food, [-2.18, 1.053, .213], [1.22, .60, .85]);
  jar(-2.548, .979, .49, .096, .187, m.pottery, false);
  for (let i = 0; i < 4; i++) {
    const z = .44 + i * .035;
    rod([-2.55, 1.023, z], [-2.53 + i * .016, 1.351 + (i % 2) * .055, z - .03], .009, .012, m.lightWood);
    sphere(.029, m.lightWood, [-2.53 + i * .016, 1.381 + (i % 2) * .055, z - .03], [.6, 1.6, .8]);
  }

  // Soft oval oak table. A five-step solid edge profile rolls continuously into
  // the flat top, whose exact height keeps the existing tea service grounded.
  const table = transform([.35, 0, .40], [0, -.022, 0]);
  profiledSolid(1.82, 1.30, [[.969, .796], [.990, .800], [1, .817], [.999, .836], [.992, .850], [.979, .858]], m.tableOak, table, 3.2, 112);
  const apronShape = new THREE.Shape();
  const apronHole = new THREE.Path();
  for (let i = 0; i <= 80; i++) {
    const outer = superellipsePoint(i / 80 * TAU, .765, .495, 3.1);
    const inner = superellipsePoint(i / 80 * TAU, .727, .457, 3.1);
    if (i === 0) { apronShape.moveTo(...outer); apronHole.moveTo(...inner); }
    else { apronShape.lineTo(...outer); apronHole.lineTo(...inner); }
  }
  apronShape.holes.push(apronHole);
  const apron = new THREE.ExtrudeGeometry(apronShape, { depth: .074, bevelEnabled: true, bevelSize: .004, bevelThickness: .004, bevelSegments: 2, steps: 1 });
  add(apron, m.tableOak, [0, .714, 0], [-Math.PI / 2, 0, 0], [1, 1, 1], table);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sweptWood([[sx * .705, .024, sz * .479], [sx * .690, .29, sz * .455], [sx * .656, .59, sz * .421], [sx * .649, .800, sz * .413]], .024, .040, m.tableOak, table, .91, 32);
    cylinder(.006, .006, .006, m.darkWood, [sx * .650, .754, sz * .462], [Math.PI / 2, 0, 0], 10, table);
  }

  function chairBack(parent, variation) {
    const positions = [], uvs = [], indices = [], cols = 40, rows = 8;
    for (let side = 0; side < 2; side++) for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const u = i / cols * 2 - 1, v = j / rows;
      const top = 1.096 - .046 * u * u + variation * .0015 * u;
      const bottom = .957 - .027 * u * u;
      const x = u * (.263 - Math.sin(v * Math.PI) * .004);
      const y = THREE.MathUtils.lerp(bottom, top, v);
      const z = .276 + .061 * (1 - u * u) + v * .014 + (side ? .011 : -.011);
      positions.push(x, y, z); uvs.push((u + 1) / 2, v);
      if (i < cols && j < rows) {
        const a = side * (cols + 1) * (rows + 1) + j * (cols + 1) + i, b = a + cols + 1;
        if (side) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const surfaceSize = (cols + 1) * (rows + 1);
    for (let i = 0; i < cols; i++) {
      const bottom = i, top = rows * (cols + 1) + i;
      indices.push(bottom, bottom + 1, bottom + surfaceSize, bottom + 1, bottom + surfaceSize + 1, bottom + surfaceSize);
      indices.push(top, top + surfaceSize, top + 1, top + 1, top + surfaceSize, top + surfaceSize + 1);
    }
    for (let j = 0; j < rows; j++) {
      const left = j * (cols + 1), right = left + cols;
      indices.push(left, left + surfaceSize, left + cols + 1, left + cols + 1, left + surfaceSize, left + surfaceSize + cols + 1);
      indices.push(right, right + cols + 1, right + surfaceSize, right + cols + 1, right + surfaceSize + cols + 1, right + surfaceSize);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, m.chairOak, [0, 0, 0], [0, 0, 0], [1, 1, 1], parent);
  }
  function upholsteredSeat(parent, variation) {
    const tufts = [[-.42, -.38], [.43, -.35], [-.39, .38], [.40, .35]];
    const cushionPoint = (u, v, bottom = false) => {
      const x = u * .248 * Math.sqrt(1 - .23 * v * v) * (1 - (v + 1) * .024);
      const z = v * .238 * Math.sqrt(1 - .23 * u * u) - .007;
      const fullness = Math.pow(Math.max(0, (1 - u * u) * (1 - v * v)), .43);
      let y = bottom ? .453 - fullness * .006 : .483 + fullness * .051;
      if (!bottom) {
        for (const [tx, tz] of tufts) {
          const dx = u - tx - variation * .006, dz = v - tz, distance = dx * dx + dz * dz;
          y -= Math.exp(-distance / .014) * .041;
          y -= Math.exp(-distance / .06) * Math.cos(Math.atan2(dz, dx) * 4 + .4) * .0025;
        }
        y += Math.sin(u * 19 + v * 8 + variation) * .0012 * fullness;
      }
      return [x + variation * .002, y, z];
    };
    const positions = [], uvs = [], indices = [], grid = 40;
    for (let side = 0; side < 2; side++) for (let j = 0; j <= grid; j++) for (let i = 0; i <= grid; i++) {
      positions.push(...cushionPoint(i / grid * 2 - 1, j / grid * 2 - 1, side === 1)); uvs.push(i / grid, j / grid);
      if (i < grid && j < grid) {
        const a = side * (grid + 1) * (grid + 1) + j * (grid + 1) + i, b = a + grid + 1;
        if (side) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const perimeter = [];
    for (let i = 0; i < grid; i++) perimeter.push(i);
    for (let j = 0; j < grid; j++) perimeter.push(j * (grid + 1) + grid);
    for (let i = grid; i > 0; i--) perimeter.push(grid * (grid + 1) + i);
    for (let j = grid; j > 0; j--) perimeter.push(j * (grid + 1));
    const backOffset = (grid + 1) * (grid + 1);
    for (let i = 0; i < perimeter.length; i++) {
      const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
      indices.push(a, a + backOffset, b, b, a + backOffset, b + backOffset);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, m.cushion, [0, 0, 0], [0, 0, 0], [1, 1, 1], parent);
    const seam = perimeter.filter((_, i) => i % 2 === 0).map(index => {
      const u = index % (grid + 1) / grid * 2 - 1, v = Math.floor(index / (grid + 1)) / grid * 2 - 1;
      const point = cushionPoint(u, v); point[1] = .476 + Math.sin(u * 3 + v * 2) * .001;
      return new THREE.Vector3(...point);
    });
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seam, true), 112, .0024, 8, true), m.piping, [0, 0, 0], [0, 0, 0], [1, 1, 1], parent);
    for (const [u, v] of tufts) {
      const p = cushionPoint(u + variation * .006, v); p[1] += .002;
      sphere(.0065, m.piping, p, [1, .32, 1], parent);
    }
    for (const x of [-.197, .197]) {
      tube([[x, .475, .181], [x + .015, .469, .222], [x + .03, .448, .237], [x + .012, .426, .229]], .0031, m.piping, [0, 0, 0], [0, 0, 0], parent, 18);
      tube([[x, .471, .185], [x - .021, .465, .223], [x - .03, .436, .247]], .0026, m.piping, [0, 0, 0], [0, 0, 0], parent, 16);
    }
  }
  // A coherent set of dark oak chairs: swept rear legs, slim tapered front legs,
  // cupped crest rails and genuinely stuffed, tied and tufted olive seat pads.
  function chair(position, angle, variation) {
    const c = transform(position, [0, angle, 0]);
    profiledSolid(.546, .524, [[.943, .418], [.985, .423], [1, .437], [.986, .449], [.959, .453]], m.chairOak, c, 3.3, 64);
    for (const side of [-1, 1]) {
      sweptWood([[side * .237, .022, -.231], [side * .222, .245, -.212], [side * .203, .443, -.184]], .0145, .0235, m.chairOak, c, .88, 24);
      sweptWood([[side * .237, .022, .247], [side * .215, .254, .207], [side * .202, .453, .192], [side * .219, .73, .236], [side * .231, 1.048, .290]], .0155, .0215, m.chairOak, c, .86, 42);
      sweptWood([[side * .223, .205, -.212], [side * .221, .196, -.02], [side * .214, .219, .209]], .0105, .012, m.chairOak, c, .88, 18);
    }
    sweptWood([[-.227, .172, -.219], [0, .166, -.230], [.227, .172, -.219]], .0105, .0105, m.chairOak, c, .92, 22);
    sweptWood([[-.205, .412, -.197], [0, .398, -.240], [.205, .412, -.197]], .016, .016, m.chairOak, c, .76, 26);
    sweptWood([[-.214, .582, .217], [0, .581, .246], [.214, .582, .217]], .012, .012, m.chairOak, c, .86, 22);
    for (const x of [-.131, 0, .131]) {
      sweptWood([[x, .566, .229], [x * .96, .749, .279], [x * .98, .961, .327 - Math.abs(x) * .11]], .0135, .015, m.chairOak, c, .57, 28);
    }
    chairBack(c, variation);
    upholsteredSeat(c, variation);
  }
  chair([.24, 0, 1.54], -.04, 0);
  chair([.16, 0, -.80], Math.PI + .11, 1);
  chair([1.72, 0, .42], Math.PI / 2 - .09, 2);

  // An unlit teapot, tea cup, saucer, and folded linen occupy the table naturally.
  function teapot(p, rotation) {
    const t = transform(p, [0, rotation, 0]);
    lathe([[0, 0], [.072, 0], [.09, .009], [.116, .039], [.137, .11], [.132, .183], [.109, .232], [.083, .252], [.069, .255], [.067, .243], [0, .243]], m.ceramic, [0, 0, 0], [1, 1, 1], [0, 0, 0], t);
    lathe([[0, 0], [.045, 0], [.077, -.004], [.084, .003], [.072, .016], [.055, .025], [0, .031]], m.ceramicShade, [0, .252, 0], [1, 1, 1], [0, 0, 0], t);
    sphere(.022, m.ceramic, [0, .299, 0], [1, .76, 1], t);
    // A tapered hollow spout bends upward, with a genuinely open mouth.
    const path = new THREE.CatmullRomCurve3([new THREE.Vector3(.098, .095, 0), new THREE.Vector3(.157, .127, 0), new THREE.Vector3(.203, .211, 0), new THREE.Vector3(.254, .23, 0)]);
    const frames = path.computeFrenetFrames(24, false);
    const pos = [], uvs = [], idx = [], sides = 14;
    for (let i = 0; i <= 24; i++) {
      const center = path.getPointAt(i / 24), radius = .04 * (1 - i / 24) + .017 * (i / 24);
      for (let j = 0; j <= sides; j++) {
        const theta = j / sides * TAU;
        const v = center.clone().addScaledVector(frames.normals[i], Math.cos(theta) * radius).addScaledVector(frames.binormals[i], Math.sin(theta) * radius);
        pos.push(v.x, v.y, v.z); uvs.push(j / sides, i / 24);
        if (i < 24 && j < sides) {
          const a = i * (sides + 1) + j, b = a + sides + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    const spout = new THREE.BufferGeometry();
    spout.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    spout.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    spout.setIndex(idx); spout.computeVertexNormals();
    add(spout, m.ceramic, [0, 0, 0], [0, 0, 0], [1, 1, 1], t);
    tube([[-.103, .205, 0], [-.175, .221, 0], [-.204, .154, 0], [-.184, .08, 0], [-.112, .067, 0]], .017, m.ceramic, [0, 0, 0], [0, 0, 0], t, 28);
  }
  teapot([.29, .861, .30], -.29);
  lathe([[0, 0], [.062, 0], [.084, .007], [.107, .014], [.116, .019], [.109, .024], [.073, .014], [0, .011]], m.ceramicShade, [.856, .862, .666]);
  cup([.856, .88, .666], .066, .104, m.ceramic, -.38);
  bowl([-.202, .862, .252], .098, .061, m.pottery);

  // Cloth surfaces have sag and curled edges, so their shadows are physical as well.
  function clothPatch(width, depth, p, rotation, hanging = false, mat = m.linen) {
    const geom = new THREE.PlaneGeometry(width, depth, 14, 20);
    const vertices = geom.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), along = vertices.getY(i);
      let lift = .002 + Math.sin(x * 51 + along * 12) * .002;
      if (hanging) lift = Math.sin(x * 55) * .009 + Math.cos(along * 9) * .007;
      else lift += Math.pow(Math.abs(x / (width * .5)), 8) * .007;
      vertices.setZ(i, lift);
    }
    geom.computeVertexNormals();
    add(geom, mat, p, rotation);
  }
  clothPatch(.32, .43, [.56, .865, .163], [-Math.PI / 2, 0, -.11]);
  clothPatch(.014, .422, [.676, .869, .17], [-Math.PI / 2, 0, -.11], false, m.linenStripe);
  // A narrow piece of oatmeal linen follows the actual oval edge, rolls over
  // its lip, then hangs freely. It passes between the existing place settings.
  const drapePoint = (u, v) => {
    const x = .095 + u * .30;
    const frontEdge = .65 * .979 * Math.pow(1 - Math.pow(Math.abs(x / (.91 * .979)), 3.2), 1 / 3.2);
    const startZ = .08, distance = v * .89, flatLength = frontEdge - startZ - .003;
    const radius = .023, bendLength = radius * Math.PI / 2;
    let z, y;
    if (distance <= flatLength) { z = startZ + distance; y = .8595; }
    else if (distance < flatLength + bendLength) {
      const a = (distance - flatLength) / radius;
      z = frontEdge - .003 + Math.sin(a) * radius;
      y = .8595 - (1 - Math.cos(a)) * radius;
    } else {
      const hanging = distance - flatLength - bendLength;
      z = frontEdge - .003 + radius + Math.sin(hanging * 15 + u * 6) * .004;
      y = .8595 - radius - hanging + Math.pow(v, 8) * (.007 * Math.sin(u * 8 + .7) + u * .012);
    }
    // Broad unequal folds read as relaxed linen rather than pressed pleats.
    const foldPhase = u * 13 + .48 * Math.sin(u * 8 + 1.1) + v * 1.7;
    const ripple = Math.sin(foldPhase) * .0017 + Math.sin(u * 37 - v * 4.3) * .00045;
    if (distance < flatLength) y += .002 + ripple * Math.sin(v * Math.PI / 2);
    else z += ripple * 2.0;
    return [x + Math.sin(v * 5) * .003, y, z];
  };
  const drapePositions = [], drapeUvs = [], drapeIndices = [], drapeCols = 24, drapeRows = 72;
  for (let j = 0; j <= drapeRows; j++) for (let i = 0; i <= drapeCols; i++) {
    drapePositions.push(...drapePoint(i / drapeCols - .5, j / drapeRows)); drapeUvs.push(i / drapeCols, j / drapeRows);
    if (i < drapeCols && j < drapeRows) {
      const a = j * (drapeCols + 1) + i, b = a + drapeCols + 1;
      drapeIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const drapeGeometry = new THREE.BufferGeometry();
  drapeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(drapePositions, 3));
  drapeGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(drapeUvs, 2));
  drapeGeometry.setIndex(drapeIndices); drapeGeometry.computeVertexNormals();
  add(drapeGeometry, m.tableLinen, [0, 0, 0], [0, 0, 0], [1, 1, 1], table);
  for (const u of [-.476, .476]) {
    tube(Array.from({ length: 28 }, (_, i) => {
      const p = drapePoint(u, i / 27); p[1] += .0008; return p;
    }), .0011, m.tableLinen, [0, 0, 0], [0, 0, 0], table, 64);
  }
  // Towel hung from a brass rail on the cabinet at the open end.
  rod([-1.891, .791, .27], [-1.891, .791, .67], .01, .01, m.brass);
  for (const z of [.27, .67]) rod([-1.952, .791, z], [-1.881, .791, z], .012, .012, m.brass);
  clothPatch(.27, .395, [-1.877, .597, .48], [0, Math.PI / 2, 0], true);
  clothPatch(.012, .385, [-1.867, .599, .388], [0, Math.PI / 2, 0], true, m.linenStripe);

  // A small traditional clock gives the bare rear wall a quiet point of detail.
  cylinder(.205, .205, .065, m.darkWood, [-1.327, 2.934, -2.452], [Math.PI / 2, 0, 0], 48);
  cylinder(.174, .174, .015, m.ceramicShade, [-1.327, 2.934, -2.408], [Math.PI / 2, 0, 0], 48);
  torus(.181, .009, m.brass, [-1.327, 2.934, -2.397]);
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    box(.009, i % 3 === 0 ? .027 : .017, .003, m.iron, [-1.327 + Math.sin(a) * .144, 2.934 + Math.cos(a) * .144, -2.398], [0, 0, -a], .001);
  }
  rod([-1.327, 2.934, -2.392], [-1.394, 2.989, -2.392], .005, .004, m.iron);
  rod([-1.327, 2.934, -2.389], [-1.305, 3.057, -2.389], .004, .002, m.iron);
  sphere(.012, m.brass, [-1.327, 2.934, -2.385], [1, 1, .4]);

  // Low storage crate at the front end of the kitchen, with visible gaps and joints.
  const crate = transform([2.24, 0, -.59], [0, -.07, 0]);
  for (const x of [-.296, .296]) for (const z of [-.25, .25]) box(.046, .35, .046, m.darkWood, [x, .194, z], [0, 0, 0], .003, crate);
  for (let i = 0; i < 3; i++) {
    for (const x of [-.303, .303]) box(.032, .09, .56, m.walnut, [x, .084 + i * .111, 0], [0, 0, 0], .005, crate);
    for (const z of [-.271, .271]) box(.584, .09, .031, m.walnut, [0, .084 + i * .111, z], [0, 0, 0], .005, crate);
  }
  box(.61, .038, .54, m.darkWood, [0, .035, 0], [0, 0, 0], .005, crate);
  for (let i = 0; i < 5; i++) box(.119, .025, .568, m.walnut, [-.247 + i * .124, .373, 0], [0, 0, 0], .004, crate);
  jar(2.22, .39, -.60, .162, .296, m.pottery, false);

  // Enameled range: rounded corners, recessed oven door, mechanical dials and
  // individual iron trivets. Its proportions match the adjacent counter run.
  // Five enclosing panels leave a genuine cavity behind the door aperture.
  // Their outside bounds match the original range body.
  box(.048, .813, .878, m.enamel, [-2.750, .487, 1.272], [0, 0, 0], .023);
  for (const z of [.858, 1.686]) box(.810, .813, .05, m.enamel, [-2.321, .487, z], [0, 0, 0], .023);
  box(.858, .172, .828, m.enamel, [-2.345, .8075, 1.272], [0, 0, 0], .019);
  box(.858, .139, .828, m.enamel, [-2.345, .150, 1.272], [0, 0, 0], .019);
  box(.89, .055, .912, m.iron, [-2.345, .921, 1.272], [0, 0, 0], .013);
  box(.852, .023, .875, m.enamel, [-2.345, .952, 1.272], [0, 0, 0], .015);
  box(.028, .143, .862, m.enamel, [-1.907, .825, 1.272], [0, 0, 0], .009);
  for (const x of [-2.568, -2.145]) for (const z of [1.053, 1.476]) {
    cylinder(.091, .10, .014, m.iron, [x, .974, z], [0, 0, 0], 32);
    torus(.104, .009, m.iron, [x, .982, z], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      rod([x + Math.sin(a) * .067, .994, z + Math.cos(a) * .067], [x + Math.sin(a) * .138, .994, z + Math.cos(a) * .138], .009, .009, m.iron);
    }
  }
  for (let i = 0; i < 4; i++) {
    const z = .984 + i * .19;
    cylinder(.036, .036, .012, m.pewter, [-1.884, .823, z], [0, 0, -Math.PI / 2], 24);
    cylinder(.027, .031, .028, m.iron, [-1.864, .823, z], [0, 0, -Math.PI / 2], 24);
    box(.005, .023, .004, m.ceramicShade, [-1.846, .832, z], [0, 0, 0], .001);
    for (let j = -1; j <= 1; j++) {
      const a = j * .7;
      sphere(.003, m.iron, [-1.89, .823 + Math.cos(a) * .052, z + Math.sin(a) * .052], [.3, 1, 1]);
    }
  }
  function ovenDoorFrame(width, height, depth, radius, apertureW, apertureH, mat, x, y) {
    const shape = roundedShape(width, height, radius);
    // The opening remains centred on the glass despite the slight asymmetry
    // of the old door's outer borders.
    const hole = new THREE.Path(roundedShape(apertureW, apertureH, .020).getPoints(12).map(p => new THREE.Vector2(p.x, p.y + .495 - y)));
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - .0016, bevelEnabled: true, bevelSize: .0008,
      bevelThickness: .0008, bevelSegments: 2, curveSegments: 12, steps: 1,
    });
    geometry.translate(0, 0, -depth / 2 + .0008);
    add(geometry, mat, [x, y, 1.272], [0, Math.PI / 2, 0]);
  }
  ovenDoorFrame(.776, .515, .022, .018, .499, .265, m.iron, -1.903, .492);
  ovenDoorFrame(.734, .472, .032, .026, .499, .265, m.enamel, -1.883, .490);
  ovenDoorFrame(.525, .289, .015, .025, .481, .247, m.iron, -1.862, .494);
  const ovenPane = new THREE.ExtrudeGeometry(roundedShape(.491, .257, .021), {
    depth: .0055, bevelEnabled: true, bevelSize: .00075,
    bevelThickness: .00075, bevelSegments: 2, curveSegments: 16, steps: 1,
  });
  ovenPane.translate(0, 0, -.00275);
  add(ovenPane, m.ovenGlass, [-1.851, .495, 1.272], [0, Math.PI / 2, 0]);
  // Dark liners and a restrained metal shelf remain visible through the pane.
  box(.025, .358, .582, m.ovenInterior, [-2.478, .491, 1.272], [0, 0, 0], .009);
  for (const y of [.322, .660]) box(.568, .020, .582, m.ovenInterior, [-2.185, y, 1.272], [0, 0, 0], .006);
  for (const z of [.991, 1.553]) box(.568, .338, .020, m.ovenInterior, [-2.185, .491, z], [0, 0, 0], .006);
  for (const z of [1.017, 1.527]) rod([-2.429, .410, z], [-1.960, .410, z], .004, .004, m.pewter, identity, 10);
  for (let i = 0; i < 9; i++) {
    const z = 1.026 + i * .0615;
    rod([-2.419, .414, z], [-1.971, .414, z], .0023, .0023, m.pewter, identity, 8);
  }
  for (const x of [-2.419, -1.971]) rod([x, .414, 1.019], [x, .414, 1.526], .003, .003, m.pewter, identity, 10);
  for (const z of [1.005, 1.539]) rod([-1.881, .70, z], [-1.811, .70, z], .013, .013, m.pewter);
  rod([-1.802, .70, 1.003], [-1.802, .70, 1.541], .018, .018, m.pewter);
  box(.022, .102, .773, m.enamel, [-1.903, .166, 1.272], [0, 0, 0], .009);
  rod([-1.874, .17, 1.16], [-1.874, .17, 1.384], .009, .009, m.pewter);
  for (const x of [-2.639, -2.049]) for (const z of [.943, 1.601]) cylinder(.032, .037, .10, m.iron, [x, .063, z]);
  // A covered saucepan catches a small highlight across its rolled rim.
  lathe([[0, 0], [.09, 0], [.114, .018], [.119, .128], [.126, .148], [.12, .158], [.109, .149], [.104, .032], [0, .02]], m.pewter, [-2.56, 1.006, 1.478]);
  lathe([[0, 0], [.083, .003], [.12, -.006], [.126, 0], [.11, .014], [.075, .025], [0, .029]], m.pewter, [-2.56, 1.158, 1.478]);
  sphere(.027, m.iron, [-2.56, 1.207, 1.478], [1, .7, 1]);
  rod([-2.462, 1.10, 1.478], [-2.258, 1.111, 1.478], .012, .018, m.iron);
  box(.108, .028, .043, m.darkWood, [-2.24, 1.113, 1.478], [0, 0, .03], .012);

  // A wire draining rack holds distinct upright plates beside the porcelain sink.
  for (const x of [-2.635, -2.155]) {
    rod([x, 1.023, -.654], [x, 1.023, -.037], .006, .006, m.pewter);
    rod([x, 1.154, -.654], [x, 1.154, -.037], .006, .006, m.pewter);
    for (const z of [-.654, -.037]) rod([x, .981, z], [x, 1.17, z], .006, .006, m.pewter);
  }
  for (let i = 0; i < 8; i++) {
    const z = -.645 + i * .086;
    rod([-2.637, 1.023, z], [-2.153, 1.023, z], .004, .004, m.pewter);
    if (i > 0 && i < 7) {
      lathe([[0, 0], [.072, 0], [.087, .005], [.117, .015], [.139, .022], [.146, .028], [.143, .036], [.129, .036], [.105, .019], [0, .012]], i % 3 === 0 ? m.ceramicShade : m.ceramic, [-2.398, 1.16, z], [1, 1, 1], [Math.PI / 2 - .10, 0, 0]);
    }
  }

  // A compact walnut sideboard sits against the rear wall, with real inset
  // door framing, stepped mouldings and a row of worn cookbooks on the top.
  const sideboard = transform([-.72, 0, -2.224]);
  box(1.33, .79, .437, m.darkWood, [0, .567, 0], [0, 0, 0], .009, sideboard);
  box(1.421, .068, .504, m.walnut, [0, .997, .005], [0, 0, 0], .012, sideboard);
  box(1.365, .031, .468, m.lightWood, [0, .953, .005], [0, 0, 0], .004, sideboard);
  box(1.371, .056, .473, m.walnut, [0, .185, .005], [0, 0, 0], .006, sideboard);
  for (const x of [-.572, .572]) for (const z of [-.153, .153]) {
    lathe([[0, 0], [.037, 0], [.042, .027], [.035, .096], [.047, .155], [0, .155]], m.walnut, [x, .025, z], [1, 1, 1], [0, 0, 0], sideboard, 24);
  }
  for (const x of [-.334, .334]) {
    box(.617, .559, .024, m.walnut, [x, .493, .234], [0, 0, 0], .007, sideboard);
    box(.493, .435, .014, m.lightWood, [x, .493, .248], [0, 0, 0], .008, sideboard);
    box(.455, .397, .019, m.darkWood, [x, .493, .258], [0, 0, 0], .008, sideboard);
    box(.617, .117, .029, m.walnut, [x, .841, .237], [0, 0, 0], .006, sideboard);
    sphere(.018, m.brass, [x, .845, .271], [1, 1, .65], sideboard);
    sphere(.017, m.brass, [x + (x < 0 ? .227 : -.227), .638, .272], [1, 1, .65], sideboard);
    for (const y of [.317, .665]) cylinder(.008, .008, .064, m.brass, [x + (x < 0 ? -.276 : .276), y, .252], [0, 0, 0], 10, sideboard);
  }
  function book(position, width, height, depth, tilt, cover = m.book) {
    const b = transform(position, [0, 0, tilt]);
    box(width - .01, height - .018, depth - .016, m.paper, [0, height / 2, 0], [0, 0, 0], .002, b);
    for (const x of [-width / 2, width / 2]) box(.008, height, depth, cover, [x, height / 2, 0], [0, 0, 0], .002, b);
    box(width, height, .014, cover, [0, height / 2, depth / 2], [0, 0, 0], .006, b);
    for (const y of [height * .13, height * .22, height * .76, height * .84]) box(width - .003, .006, .005, m.lightWood, [0, y, depth / 2 + .01], [0, 0, 0], .001, b);
  }
  for (let i = 0; i < 6; i++) book([-1.248 + i * .059, 1.032, -2.172], .044 + (i % 2) * .009, .222 + (i % 3) * .021, .17, -.045 + i * .011, i % 3 === 0 ? m.darkWood : m.book);
  jar(-.49, 1.032, -2.255, .108, .227, m.ceramicShade);
  lathe([[0, 0], [.072, 0], [.09, .024], [.106, .095], [.097, .148], [.063, .23], [.06, .269], [.073, .287], [.061, .289], [.05, .258], [.052, .23]], m.ceramic, [-.183, 1.032, -2.17]);
  tube([[-.105, 1.248, -2.17], [-.035, 1.264, -2.17], [-.021, 1.174, -2.17], [-.094, 1.114, -2.17]], .013, m.ceramic);

  // Old cast-iron radiator below the window. Each section has two rounded
  // columns and connecting shoulders; warm brass valves are separate solids.
  const radiatorProfile = [[0, 0], [.027, 0], [.043, .03], [.046, .073], [.036, .114], [.034, .493], [.045, .534], [.045, .576], [.025, .61], [0, .615]];
  for (let i = 0; i < 11; i++) {
    const x = .401 + i * .109;
    for (const z of [-2.335, -2.187]) lathe(radiatorProfile, m.radiator, [x, .174, z], [1, 1, 1], [0, 0, 0], identity, 20);
    for (const y of [.223, .747]) rod([x, y, -2.343], [x, y, -2.18], .035, .035, m.radiator);
  }
  for (const y of [.239, .733]) rod([.36, y, -2.263], [1.565, y, -2.263], .025, .025, m.radiator);
  for (const x of [.50, 1.39]) {
    box(.083, .162, .221, m.radiator, [x, .098, -2.255], [0, 0, 0], .012);
    box(.125, .021, .243, m.radiator, [x, .027, -2.25], [0, 0, 0], .006);
  }
  tube([[1.549, .249, -2.263], [1.736, .249, -2.263], [1.765, .274, -2.34], [1.765, .28, -2.477]], .017, m.brass);
  cylinder(.034, .034, .052, m.brass, [1.728, .273, -2.263]);
  cylinder(.032, .032, .024, m.iron, [1.728, .327, -2.263], [0, 0, 0], 12);

  // Botanical palm: every narrow leaflet is a curved, folded surface with a
  // physical shadow. There are no cutout textures, billboards, or painted leaves.
  const palmX = 1.97, palmZ = -1.65;
  lathe([[0, 0], [.182, 0], [.192, .026], [.203, .06], [.252, .413], [.27, .443], [.27, .478], [.247, .49], [.232, .462], [.217, .422], [.163, .083], [0, .069]], m.planter, [palmX, .034, palmZ]);
  lathe([[0, 0], [.222, 0], [.247, .018], [.253, .033], [.244, .046], [.203, .041], [0, .021]], m.ceramicShade, [palmX, .015, palmZ]);
  cylinder(.222, .222, .015, m.soil, [palmX, .468, palmZ], [0, 0, 0], 36);
  torus(.262, .010, m.planter, [palmX, .496, palmZ], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = random() * TAU, r = random() * .18;
    sphere(.024 + random() * .016, m.soil, [palmX + Math.cos(a) * r, .478, palmZ + Math.sin(a) * r], [1, .35, .8]);
  }
  function leaflet(start, end, width, shade) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const direction = b.clone().sub(a).normalize();
    const across = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const positions = [], uvs = [], indices = [];
    const rows = 9;
    for (let i = 0; i <= rows; i++) {
      const t = i / rows;
      const center = a.clone().lerp(b, t);
      center.y += Math.sin(t * Math.PI) * .033;
      const halfWidth = Math.pow(Math.sin(t * Math.PI), .78) * width;
      for (let j = 0; j < 3; j++) {
        const v = center.clone().addScaledVector(across, (j - 1) * halfWidth);
        v.y += j === 1 ? Math.sin(t * Math.PI) * width * .23 : 0;
        positions.push(v.x, v.y, v.z); uvs.push(j / 2, t);
        if (i < rows && j < 2) {
          const base = i * 3 + j;
          indices.push(base, base + 3, base + 1, base + 1, base + 3, base + 4);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    add(geometry, shade);
  }
  const fronds = [
    [-2.71, 1.61, .62], [-1.94, 1.85, .51], [-1.12, 1.47, .61],
    [-.24, 1.71, .49], [.66, 1.36, .59], [1.63, 1.83, .50], [2.55, 1.44, .66],
  ];
  for (let f = 0; f < fronds.length; f++) {
    const [angle, crownY, reach] = fronds[f];
    const dx = Math.cos(angle), dz = Math.sin(angle), sx = -dz, sz = dx;
    const crown = new THREE.Vector3(palmX + dx * .10, crownY, palmZ + dz * .10);
    tube([[palmX + dx * .047, .467, palmZ + dz * .047], [palmX + dx * .068, crownY * .58, palmZ + dz * .068], crown.toArray()], .010 - f * .0004, f % 2 ? m.leafLight : m.leaf, [0, 0, 0], [0, 0, 0], identity, 16);
    const frondPoint = t => new THREE.Vector3(crown.x + dx * reach * t, crown.y + Math.sin(t * Math.PI * .82) * .29 - t * .115, crown.z + dz * reach * t);
    tube(Array.from({ length: 6 }, (_, i) => frondPoint(i / 5).toArray()), .0045, m.leafLight, [0, 0, 0], [0, 0, 0], identity, 24);
    for (let i = 0; i < 13; i++) {
      const t = .13 + i * .064;
      const length = (.16 + Math.sin(t * Math.PI) * .17) * (1 - t * .22);
      const start = frondPoint(t);
      for (const side of [-1, 1]) {
        const end = start.clone().add(new THREE.Vector3(sx * side * length + dx * length * .44, -.07 - length * .12 - t * .035, sz * side * length + dz * length * .44));
        leaflet(start.toArray(), end.toArray(), .014 + Math.sin(t * Math.PI) * .010, (i + f) % 4 === 0 ? m.leafLight : m.leaf);
      }
    }
    leaflet(frondPoint(.89).toArray(), frondPoint(1.16).toArray(), .018, m.leaf);
  }

  // Another setting and slender spoon give the worn tabletop different scales
  // of reflection, while keeping its original teapot and chair arrangement.
  lathe([[0, 0], [.088, 0], [.114, .006], [.153, .015], [.164, .022], [.162, .029], [.147, .028], [.11, .014], [0, .013]], m.ceramic, [-.175, .862, .773]);
  rod([.654, .876, .662], [.697, .876, .838], .005, .007, m.pewter);
  sphere(.02, m.pewter, [.65, .879, .644], [.62, .14, 1.3]);

  // The cinematic camera sits inside a continued room; the isometric view keeps
  // the original cutaway. These layer-1-only surfaces never cast new shadows.
  const cinematicEnclosure = new THREE.Group();
  cinematicEnclosure.name = 'Cinematic room continuation';
  cinematicEnclosure.layers.set(1);
  const enclosureBatches = new Map();
  activeBatches = enclosureBatches;
  const extendedWidth = tileW * 12, extendedDepth = tileD * 16;
  const rightEdge = -2.8 + extendedWidth, frontEdge = -2.5 + extendedDepth;
  box(extendedWidth + .15, .08, extendedDepth + .15, m.wall, [(-2.8 + rightEdge) / 2, 3.54, (-2.5 + frontEdge) / 2], [0, 0, 0], 0);
  box(.15, 3.5, frontEdge - 2.5, m.leftWall, [-2.875, 1.75, (frontEdge + 2.5) / 2], [0, 0, 0], 0);
  box(rightEdge - 2.8, 3.5, .15, m.wall, [(rightEdge + 2.8) / 2, 1.75, -2.575], [0, 0, 0], 0);
  box(.15, 3.5, extendedDepth, m.wall, [rightEdge + .075, 1.75, (-2.5 + frontEdge) / 2], [0, 0, 0], 0);
  box(extendedWidth, .035, frontEdge - 2.5, m.grout, [(-2.8 + rightEdge) / 2, -.025, (frontEdge + 2.5) / 2], [0, 0, 0], 0);
  box(rightEdge - 2.8, .035, 5, m.grout, [(rightEdge + 2.8) / 2, -.025, 0], [0, 0, 0], 0);
  for (let x = 0; x < 12; x++) for (let z = 0; z < 16; z++) {
    if (x < 10 && z < 9) continue;
    add(flagGeometry(), tiles[(x * 3 + z * 5) % tiles.length], [-2.8 + tileW * (x + .5), -.005, -2.5 + tileD * (z + .5)], [-Math.PI / 2, 0, 0]);
  }
  for (let x = 1; x < 12; x++) for (let z = 1; z < 16; z++) {
    if (x < 10 && z < 9) continue;
    box(.102, .029, .102, m.floorInset, [-2.8 + tileW * x, -.005, -2.5 + tileD * z], [0, Math.PI / 4, 0], .003);
  }
  activeBatches = batches;
  addWindowCurtains({ material, add, rod, m });
  enhanceRoomMaterials(materials, textures);

  // Finalize into one mesh per material. No lights, baked shadows, or emissive terms.
  for (const [collection, parent, cinematic] of [[batches, group, false], [enclosureBatches, cinematicEnclosure, true]]) {
  for (const [mat, geometries] of collection) {
    const vertexCount = geometries.reduce((sum, g) => sum + g.attributes.position.count, 0);
    const position = new Float32Array(vertexCount * 3);
    const normal = new Float32Array(vertexCount * 3);
    const uv = new Float32Array(vertexCount * 2);
    let offset = 0;
    for (const g of geometries) {
      position.set(g.attributes.position.array, offset * 3);
      normal.set(g.attributes.normal.array, offset * 3);
      uv.set(g.attributes.uv.array, offset * 2);
      offset += g.attributes.position.count;
      g.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = mat.name;
    mesh.castShadow = !cinematic && mat !== m.ovenGlass;
    mesh.receiveShadow = true;
    mesh.layers.set(cinematic ? 1 : 0);
    parent.add(mesh);
  }
  }
  group.add(cinematicEnclosure);
  group.userData.description = 'Original procedural nocturnal kitchen; genuine window aperture; physical materials only.';
  group.userData.staticDrawCalls = batches.size;
  group.userData.cinematicDrawCalls = batches.size + enclosureBatches.size;
  return {
    group,
    cinematicEnclosure,
    window: { center: new THREE.Vector3(1, 2.2, -2.5), width: 1.3, height: 1.55, normal: new THREE.Vector3(0, 0, 1) },
    target: new THREE.Vector3(0, 1.15, -.4),
    dispose() {
      group.traverse(node => { if (node.isMesh) node.geometry.dispose(); });
      for (const mat of materials) mat.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
