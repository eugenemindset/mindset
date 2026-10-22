import * as THREE from 'duo/vendor/three.module.js';

// Surface reflectance only: these maps contain no light, shadows, or ambient occlusion.
const TAU = Math.PI * 2;
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => value * value * (3 - 2 * value);
const fract = value => value - Math.floor(value);

// Interpolate visibility after the depth comparisons, never packed depth.
// This keeps the existing light radius while removing discrete shadow-texel
// jumps on the window's narrow trim, cloth and small overlapping leaves.
const filteredShadowChunk = THREE.ShaderChunk.shadowmap_pars_fragment
  .replace('float getShadow(', `
  float duoFilteredShadow(sampler2D depths, vec2 mapSize, vec2 uv, float compare) {
    vec2 texel = 1. / mapSize;
    vec2 grid = uv * mapSize - .5;
    vec2 blend = fract(grid);
    vec2 base = (floor(grid) + .5) * texel;
    float a = texture2DCompare(depths, base, compare);
    float b = texture2DCompare(depths, base + vec2(texel.x, 0.), compare);
    float c = texture2DCompare(depths, base + vec2(0., texel.y), compare);
    float d = texture2DCompare(depths, base + texel, compare);
    return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
  }
  float getShadow(`)
  .replace(/#if defined\( SHADOWMAP_TYPE_PCF \)([\s\S]*?)#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)/,
    block => block.replaceAll('texture2DCompare( shadowMap,', 'duoFilteredShadow( shadowMap, shadowMapSize,'));

function smoothFineShadows(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', filteredShadowChunk);
    // The room-wide 38 mm bias is larger than a leaf. Keep the receiver on
    // these thin surfaces rather than pushing it through adjacent geometry.
    shader.vertexShader = shader.vertexShader.replace('#include <shadowmap_vertex>',
      THREE.ShaderChunk.shadowmap_vertex.replaceAll('.shadowNormalBias', '.shadowNormalBias * .25'));
  };
  material.customProgramCacheKey = () => 'duo-fine-shadow-filter-v1';
}

function hash(x, y, seed) {
  let n = Math.imul(x + seed * 53, 374761393) ^ Math.imul(y + seed * 19, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

// Periodic, smoothly interpolated fields keep broad mottling continuous at UV seams.
function field(u, v, columns, rows, seed) {
  const px = u * columns, py = v * rows;
  const ix = Math.floor(px), iy = Math.floor(py), tx = smooth(fract(px)), ty = smooth(fract(py));
  const x = ((ix % columns) + columns) % columns, y = ((iy % rows) + rows) % rows;
  const nextX = (x + 1) % columns, nextY = (y + 1) % rows;
  return mix(mix(hash(x, y, seed), hash(nextX, y, seed), tx), mix(hash(x, nextY, seed), hash(nextX, nextY, seed), tx), ty);
}

function clouds(u, v, seed) {
  return field(u, v, 3, 3, seed) * .56 + field(u, v, 9, 9, seed + 3) * .29 + field(u, v, 23, 23, seed + 7) * .15;
}

function edgeWear(u, v) {
  const border = Math.min(u, 1 - u, v, 1 - v);
  return Math.pow(clamp(1 - border / .075), 2);
}

function surfaceSample(kind, u, v) {
  const broad = clouds(u, v, 37), slow = field(u, v, 5, 5, 71), edges = edgeWear(u, v);
  if (kind === 'walnut' || kind === 'oak' || kind === 'paint') {
    const warp = Math.sin(v * TAU) * .016 + Math.sin(v * TAU * 2 + .8) * .006;
    const grainField = field(u, v, 12, 3, 13);
    const phase = (u + warp + (grainField - .5) * .041) * TAU * 31 + field(u, v, 27, 2, 97) * 1.4;
    const earlywood = Math.sin(phase) * .5 + .5;
    const pores = Math.pow(Math.max(0, Math.sin(phase * 2 + 1.4)), 13) * (.3 + grainField * .7);
    const longStreak = field(u, v, 45, 5, 121);
    const distance = Math.hypot((u - .67) * 2.7, (v - .35) * 1.1);
    const knotEnvelope = Math.exp(-distance * distance * 155);
    const knotRings = Math.sin(distance * 185) * knotEnvelope;
    const scuff = Math.pow(field(u, v, 4, 17, 233), 4) * field(u, v, 24, 2, 149);
    if (kind === 'paint') {
      const worn = edges * (.10 + slow * slow * .50) + scuff * .18;
      const value = 225 + (broad - .5) * 23 - pores * 3 + worn * 13;
      return { rgb: [value + worn * 3, value + 1, value - worn * 5], rough: .59 + broad * .22 - worn * .12, height: .49 + (broad - .5) * .07 - pores * .024 - worn * .04 };
    }
    if (kind === 'oak') {
      // Restrained, open-pored oak: longitudinal growth, broken medullary rays,
      // and no repeated dark knot stamped into every furniture part.
      const rays = Math.pow(Math.max(0, Math.sin(v * TAU * 39 + u * TAU * 2)), 12) * Math.pow(field(u, v, 9, 17, 353), 3);
      const value = 230 + (broad - .5) * 17 + (earlywood - .5) * 10 + (longStreak - .5) * 6 - pores * 14 + rays * 7;
      return { rgb: [value + 3, value, value - 5], rough: .42 + broad * .21 + pores * .11 - rays * .045, height: .5 + (earlywood - .5) * .055 - pores * .075 + rays * .022 };
    }
    const value = 222 + (broad - .5) * 34 + (earlywood - .5) * 16 + (longStreak - .5) * 9 - pores * 22 - knotEnvelope * 19 + knotRings * 10 + edges * 8;
    return { rgb: [value + 5, value - 2, value - 10], rough: .3 + broad * .30 + pores * .12 - scuff * .12 - edges * .045, height: .5 + (earlywood - .5) * .10 - pores * .085 - knotEnvelope * .035 + knotRings * .025 };
  }
  if (kind === 'plaster') {
    // Trowelled mineral clouds and slight aggregate; no pepper-noise overlay.
    const trowel = field(u + Math.sin(v * TAU) * .03, v, 8, 5, 101);
    const aggregate = field(u, v, 67, 67, 293);
    const rubbed = smooth(clamp((slow - .46) * 3));
    const value = 224 + (broad - .5) * 41 + (trowel - .5) * 10;
    return { rgb: [value + 1, value + 2, value], rough: .80 + broad * .18 - rubbed * .055, height: .49 + (trowel - .5) * .18 + (aggregate - .5) * .065 };
  }
  if (kind === 'glaze') {
    const ripple = Math.sin(u * TAU * 4 + Math.sin(v * TAU * 3) * .6) * .5 + .5;
    const pooling = smooth(clamp((broad - .35) * 2.2));
    const crazing = Math.pow(Math.max(0, Math.sin(u * TAU * 7 + Math.sin(v * TAU * 2) * 1.7)), 42) * .035;
    const value = 232 + (broad - .5) * 24 - edges * 10 - pooling * 5;
    return { rgb: [value - 5 - pooling * 3, value + 1, value + 3], rough: .19 + broad * .15 + edges * .12 + crazing, height: .5 + (ripple - .5) * .065 + (broad - .5) * .035 - edges * .04 - crazing * .2 };
  }
  if (kind === 'metal') {
    const tarnish = smooth(clamp((broad - .32) * 2.7));
    const rubbed = Math.pow(field(u, v, 6, 4, 301), 2);
    const brushing = Math.sin(v * TAU * 94 + Math.sin(u * TAU * 3) * .4) * .5 + .5;
    const scratches = Math.pow(brushing, 18) * Math.pow(field(u, v, 4, 37, 241), 3);
    const value = 236 - tarnish * 35 + rubbed * 15 + scratches * 8;
    return { rgb: [value + tarnish * 3, value, value - tarnish * 5], rough: .25 + tarnish * .34 - rubbed * .14 - scratches * .09, height: .50 + (broad - .5) * .018 - scratches * .055 + (brushing - .5) * .007 };
  }
  if (kind === 'stone') {
    const mineral = field(u, v, 37, 37, 431);
    const veinPath = Math.sin((u + v * .5 + Math.sin(v * TAU) * .045) * TAU * 5);
    const vein = Math.pow(Math.max(0, veinPath), 18) * .25 * slow;
    const value = 222 + (broad - .5) * 28 + (mineral - .5) * 7 + vein * 38;
    return { rgb: [value + 1, value, value - 3], rough: .49 + broad * .27 + mineral * .055 - vein * .13, height: .5 + (broad - .5) * .045 + (mineral - .5) * .027 + vein * .01 };
  }
  if (kind === 'foliage') {
    const rib = Math.exp(-Math.pow((u - .5) * 85, 2));
    const veins = Math.pow(Math.max(0, Math.sin((v + Math.abs(u - .5) * .45) * TAU * 19)), 10);
    const value = 229 + (broad - .5) * 17 + rib * 10 + veins * 3;
    return { rgb: [value, value + 3, value - 3], rough: .70 + broad * .16 + veins * .025, height: .5 + rib * .13 + veins * .025 };
  }
  // Each textile tile covers 20 cm. Mipmaps naturally average the weave at room
  // distance; geometry supplies folds, seams, and tufting rather than dark paint.
  const upholstery = kind === 'upholstery', threads = upholstery ? 84 : 112;
  const slub = field(u, v, 43, 4, 547) - .5;
  const warp = Math.sin(u * TAU * threads + slub * .17);
  const weft = Math.sin(v * TAU * threads + field(u, v, 3, 29, 557) * .15);
  const weave = warp * weft;
  const value = 239 + (broad - .5) * 5 + slub * 3 + weave * (upholstery ? 1.2 : .7);
  return { rgb: [value + 1, value, value - 1], rough: .86 + broad * .10 + weave * .012, height: .5 + weave * (upholstery ? .10 : .07) + slub * .025 };
}

function createSurface(kind, textures) {
  const detailedWood = kind === 'walnut' || kind === 'oak';
  const width = detailedWood || ['plaster', 'cloth', 'upholstery'].includes(kind) ? 512 : 256;
  const height = detailedWood ? 1024 : kind === 'paint' ? 512 : width;
  const canvases = ['albedo', 'roughness', 'bump'].map(() => {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    return { canvas, context, image: context.createImageData(width, height) };
  });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sample = surfaceSample(kind, x / width, y / height), offset = (y * width + x) * 4;
      const values = [sample.rgb, Array(3).fill(clamp(sample.rough) * 255), Array(3).fill(clamp(sample.height) * 255)];
      for (let channel = 0; channel < canvases.length; channel++) {
        const data = canvases[channel].image.data;
        for (let component = 0; component < 3; component++) data[offset + component] = Math.round(clamp(values[channel][component], 0, 255));
        data[offset + 3] = 255;
      }
    }
  }
  return Object.fromEntries(canvases.map(({ canvas, context, image }, index) => {
    context.putImageData(image, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.name = `${kind} ${['albedo', 'roughness', 'height'][index]}`;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = 4;
    textures.add(texture);
    return [['map', 'roughnessMap', 'bumpMap'][index], texture];
  }));
}

/** Enrich existing materials in place and register all maps with the room disposer. */
export function enhanceRoomMaterials(materials, textures = new Set()) {
  const surfaces = new Map();
  const getSurface = kind => {
    if (!surfaces.has(kind)) surfaces.set(kind, createSurface(kind, textures));
    return surfaces.get(kind);
  };
  let enhanced = 0;
  for (const material of materials) {
    if (!material?.isMeshStandardMaterial || material.userData.roomSurfaceEnhanced) continue;
    const name = material.name.toLowerCase();
    let kind = null, bumpScale = .0015, roughness = 1;
    if (/painted|cabinet edge|shutter/.test(name)) { kind = 'paint'; bumpScale = .0023; }
    else if (/natural oak|oak tabletop|smoked oak/.test(name)) { kind = 'oak'; bumpScale = .0032; }
    else if (/walnut|oak|wood|bookcase|sideboard/.test(name)) { kind = 'walnut'; bumpScale = .0035; }
    else if (/plaster/.test(name)) { kind = 'plaster'; bumpScale = .010; }
    else if (/glazed|porcelain|enamel/.test(name)) { kind = 'glaze'; bumpScale = .0013; }
    else if (/iron|brass|pewter|metal|radiator/.test(name)) { kind = 'metal'; bumpScale = .0012; }
    else if (/stone|limestone|countertop|slab|earthenware|floor inserts/.test(name)) { kind = 'stone'; bumpScale = .004; }
    else if (/palm leaf/.test(name)) { kind = 'foliage'; bumpScale = .0011; }
    else if (/cushion|upholstery|woven seat/.test(name)) { kind = 'upholstery'; bumpScale = .0008; }
    else if (/linen|flax|cloth|curtain/.test(name)) { kind = 'cloth'; bumpScale = .00055; }
    if (!kind) continue;
    Object.assign(material, getSurface(kind), { roughness, bumpScale });
    if (kind === 'foliage' || /window|curtain/.test(name)) smoothFineShadows(material);
    if (kind === 'walnut') {
      material.roughness = .76;
      if (/dark/.test(name)) { material.color.setHex(0x57402d); material.roughness = .82; }
      else if (/high points|polished/.test(name)) { material.color.setHex(0x967454); material.roughness = .68; }
      else material.color.setHex(0x806045);
    }
    if (kind === 'oak') {
      material.color.setHex(/smoked/.test(name) ? 0x585044 : 0x9b8261);
      material.roughness = /smoked/.test(name) ? .88 : .90;
      material.metalness = 0;
    }
    if (kind === 'foliage') {
      // Broad, matte highlights survive subpixel leaf widths without sparkling.
      material.roughness = 1;
      material.bumpScale = .0002;
      material.envMapIntensity = .45;
    }
    if (kind === 'cloth' || kind === 'upholstery') {
      material.metalness = 0;
      const defaultMeters = /curtain/.test(name) ? [.6, 1.7] : /table linen/.test(name) ? [.72, 1.05] : kind === 'upholstery' ? [.48, .46] : [.30, .40];
      const meters = material.userData.surfaceMeters || defaultMeters;
      // Clones retain their shared image source, but each cloth can set its own
      // world-scale repeat without changing upholstery or another curtain.
      for (const slot of ['map', 'roughnessMap', 'bumpMap']) {
        const texture = material[slot].clone();
        texture.repeat.set(Math.max(.05, meters[0]) / .20, Math.max(.05, meters[1]) / .20);
        texture.needsUpdate = true; textures.add(texture); material[slot] = texture;
      }
      if (/olive/.test(name)) material.color.setHex(/piping/.test(name) ? 0x5a6645 : 0x6b7650);
      if (/natural oatmeal/.test(name)) material.color.setHex(0xc5bcaa);
      if (/piping/.test(name)) material.bumpScale = .0004;
    }
    if (/glazed wall tile/.test(name)) {
      const variant = Number(name.match(/\d+$/)?.[0] || 0) % 3;
      material.color.setHex([0x9baeb0, 0x889ea2, 0xa2b3b3][variant]);
      material.metalness = 0;
    }
    if (/limestone floor|floor inserts/.test(name)) material.roughness = .48;
    if (/countertop/.test(name)) material.roughness = .55;
    if (/porcelain/.test(name)) material.roughness = .76;
    if (/brass/.test(name)) { material.metalness = .83; material.color.setHex(0x9c8356); }
    if (/pewter/.test(name)) { material.metalness = .91; material.color.setHex(0xa3ada8); material.roughness = .76; }
    if (/iron/.test(name) && kind === 'metal') { material.metalness = .76; material.color.setHex(0x484b45); }
    if (/enamel/.test(name)) material.metalness = 0;
    if (/linen|flax/.test(name)) material.metalness = 0;
    material.userData.roomSurfaceEnhanced = true;
    material.needsUpdate = true;
    enhanced++;
  }
  return enhanced;
}
