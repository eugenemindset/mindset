import * as THREE from 'duo/vendor/three.module.js';

// Add before enhanceRoomMaterials() and the model's material-batch finalization.
// The model owns all resulting geometry, materials and disposal. Its add() helper
// transforms/merges these real surfaces into shadow-casting room batches.
export function addWindowCurtains({ material, add, rod, m }) {
  const linen = material('gathered window curtain linen', 0xaaa58f, .95, {
    side: THREE.DoubleSide, shadowSide: THREE.DoubleSide, metalness: 0,
    transparent: false, opacity: 1, emissive: 0x000000
  });
  const hem = material('stitched curtain linen hem', 0x9f9985, .97, {
    side: THREE.DoubleSide, shadowSide: THREE.DoubleSide, metalness: 0,
    transparent: false, opacity: 1, emissive: 0x000000
  });
  linen.userData.surfaceMeters = [.48, 1.74];
  hem.userData.surfaceMeters = [.48, 1.74];
  const hardware = m.brass || m.iron;
  const rodMaterial = m.iron || hardware;
  const TAU = Math.PI * 2;

  // Place the rod forward of the jamb. Its two small brackets genuinely join
  // the rear plaster, and fabric hangs in front of the projecting window sill.
  rod([-.20, 3.20, -2.28], [2.21, 3.20, -2.28], .012, .012, rodMaterial, undefined, 18);
  for (const x of [-.08, 2.09]) {
    rod([x, 3.155, -2.486], [x, 3.155, -2.28], .01, .01, hardware, undefined, 12);
    rod([x, 3.155, -2.28], [x, 3.20, -2.28], .009, .009, hardware, undefined, 10);
    add(new THREE.CylinderGeometry(.033, .033, .009, 16), hardware,
      [x, 3.155, -2.491], [Math.PI / 2, 0, 0]);
  }
  for (const x of [-.223, 2.233]) {
    add(new THREE.SphereGeometry(.024, 12, 8), hardware, [x, 3.20, -2.28], [0, 0, 0], [1.22, 1, 1]);
  }

  function makePanel(right) {
    const phase = right ? .43 : .11;
    const length = right ? 1.74 : 1.82;
    // Each panel stays predominantly beside the opening. The curved inner
    // edges leave roughly 80–93% of the aperture open at the height of the beam.
    function point(u, v, depthOffset = 0) {
      const gathering = Math.exp(-Math.pow((v - (right ? .53 : .68)) / .26, 2));
      const width = .35 - .055 * gathering + .035 * v * v;
      const center = (right ? 1.70 : .29) + (right ? .027 : -.032) * gathering
        + .009 * Math.sin(v * 4.7 + phase);
      // Three broad unequal folds drift and open as the cloth falls. The
      // variable spacing and depth prevent parallel cylindrical "wire" ridges.
      const fold = TAU * ((2.8 - .45 * v) * u + .15 * u * u
        + .15 * Math.sin(v * 2.9 + u * .8) + phase);
      const amplitude = (.023 + .012 * (1 - v)) * (.78 + .22 * Math.sin(u * 5.4 + phase));
      const x = center + (u - .5) * width + .007 * Math.sin(TAU * (1.2 * u + .3 * v + phase)) * Math.sin(v * Math.PI);
      const y = 3.12 - length * v + .004 * Math.sin(fold) * (1 - v)
        + .041 * Math.pow(v, 7) * Math.sin(TAU * (1.2 * u + phase))
        + .009 * Math.pow(v, 8) * Math.sin(u * 8.7 + phase * 1.3);
      const z = -2.27 + .11 * v + amplitude * Math.sin(fold)
        + .008 * Math.sin(TAU * (.7 * u + .35 * v + phase)) * Math.sin(v * Math.PI)
        + .0017 * Math.sin(v * 13 + u * 6) * v + depthOffset;
      return new THREE.Vector3(x, y, z);
    }

    function clothGrid(vStart, vEnd, across, down, mat, depthOffset = 0) {
      const positions = [], uv = [], indices = [];
      for (let j = 0; j <= down; j++) {
        const v = THREE.MathUtils.lerp(vStart, vEnd, j / down);
        for (let i = 0; i <= across; i++) {
          const u = i / across;
          const p = point(u, v, depthOffset);
          positions.push(p.x, p.y, p.z);
          uv.push(u, 1 - v);
        }
      }
      for (let j = 0; j < down; j++) for (let i = 0; i < across; i++) {
        const a = j * (across + 1) + i, b = a + 1, c = a + across + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      add(geometry, mat);
    }

    function seam(points, radius, segments = 40, sides = 5) {
      const curve = new THREE.CatmullRomCurve3(points);
      add(new THREE.TubeGeometry(curve, segments, radius, sides, false), hem);
    }

    // The cloth silhouette supplies a continuous hem. Separate millimetre-wide
    // seam tubes intersected the sampled fabric and made bright dotted edges.
    // The heading and panel meet at one edge instead of overlapping skins.
    clothGrid(.052, 1, 48, 54, linen);
    clothGrid(0, .052, 48, 3, hem);

    // Six small independently spaced rings, with fabric tabs connecting the
    // gathered heading. Ring geometry is deliberately modest at this scale.
    for (let i = 0; i < 6; i++) {
      const u = .035 + i * .186;
      const attachment = point(u, 0);
      const x = attachment.x;
      add(new THREE.TorusGeometry(.023, .0032, 5, 18), hardware,
        [x, 3.184, -2.28], [0, Math.PI / 2, 0]);
      const tabCurve = new THREE.CatmullRomCurve3([
        attachment,
        new THREE.Vector3(x, 3.145, attachment.z),
        new THREE.Vector3(x, 3.165, -2.268)
      ]);
      add(new THREE.TubeGeometry(tabCurve, 7, .005, 5, false), hem);
    }

    // A loose cotton tie follows the folds rather than slicing through a flat
    // panel. The slightly unequal drops avoid a mirrored, manufactured hem.
    const tieV = right ? .53 : .68;
    const tiePoints = Array.from({ length: 25 }, (_, i) => point(i / 24, tieV + .014 * Math.sin(Math.PI * i / 24)));
    const front = Math.max(...tiePoints.map(p => p.z)) + .006;
    tiePoints.forEach((p, i) => { p.z = front + .004 * Math.sin(Math.PI * i / 24); });
    seam(tiePoints, .0025, 30, 6);
    const knot = point(right ? .82 : .18, tieV);
    knot.z = front + .006;
    add(new THREE.SphereGeometry(.0085, 8, 6), hem, knot.toArray(), [0, 0, 0], [1, .85, 1]);
    const tail = [knot,
      knot.clone().add(new THREE.Vector3(right ? .018 : -.017, -.08, .013)),
      knot.clone().add(new THREE.Vector3(right ? .010 : -.023, -.17, .020))];
    seam(tail, .0023, 17, 5);
  }

  makePanel(false);
  makePanel(true);
}
