import * as THREE from 'duo/vendor/three.module.js';
import { GLTFLoader } from 'duo/vendor/GLTFLoader.js';

// Device asset: https://benitez.jp/models/iphone-duo.glb
// Its extras identify fixed, cover and flexible parts. The original flexible
// display is retained; no DOM screenshot or flat frame replaces its geometry.
const WIDTH = 644, HEIGHT = 887, HINGE_Z = .275454, HALF_FLEX = .35;
const INNER = { minX: -7.899353504180908, maxX: 7.899353504180908, minY: -5.5517754554748535, maxY: 5.551720142364502 };
const OUTER = { minX: -7.9733147621154785, maxX: -.23396073281764984, minY: -5.625670909881592, maxY: 5.625616550445557 };
const clamp = value => Math.max(0, Math.min(1, value));

const hingeShader = /* glsl */`
uniform float deviceFold;
vec2 rotateDeviceHinge(vec2 point) {
  float c = cos(deviceFold), s = sin(deviceFold);
  point.y -= 0.275454;
  return vec2(c * point.x + s * point.y, -s * point.x + c * point.y + 0.275454);
}
vec4 bendDeviceStrip(vec3 point) {
  if (point.x >= 0.35) return vec4(point.x, point.z, 1., 0.);
  if (point.x <= -0.35) return vec4(rotateDeviceHinge(point.xz), cos(deviceFold), -sin(deviceFold));
  float t = (point.x + 0.35) / 0.7, t2 = t * t, t3 = t2 * t;
  vec2 a = rotateDeviceHinge(vec2(-0.35, point.z));
  vec2 b = vec2(0.35, point.z);
  vec2 ta = 0.7 * vec2(cos(deviceFold), -sin(deviceFold));
  vec2 tb = vec2(0.7, 0.);
  vec2 p = (2.*t3-3.*t2+1.)*a + (t3-2.*t2+t)*ta + (-2.*t3+3.*t2)*b + (t3-t2)*tb;
  vec2 tangent = normalize((6.*t2-6.*t)*a + (3.*t2-4.*t+1.)*ta + (-6.*t2+6.*t)*b + (3.*t2-2.*t)*tb);
  return vec4(p, tangent);
}
`;

// This CPU equivalent is only used for pointer picking; animation deforms in
// the vertex shader. Both paths share the same Hermite curve and hinge origin.
function deform(x, y, z, kind, angle, target) {
  if (kind === 'fixed') return target.set(x, y, z);
  const c = Math.cos(angle), s = Math.sin(angle);
  const rotate = (a, b) => [c * a + s * (b - HINGE_Z), -s * a + c * (b - HINGE_Z) + HINGE_Z];
  if (kind !== 'flexible' || x <= -HALF_FLEX) {
    const point = rotate(x, z); return target.set(point[0], y, point[1]);
  }
  if (x >= HALF_FLEX) return target.set(x, y, z);
  const t = (x + HALF_FLEX) / (2 * HALF_FLEX), t2 = t * t, t3 = t2 * t;
  const a = rotate(-HALF_FLEX, z), b = [HALF_FLEX, z];
  const h0 = 2 * t3 - 3 * t2 + 1, h1 = t3 - 2 * t2 + t, h2 = -2 * t3 + 3 * t2, h3 = t3 - t2;
  return target.set(h0 * a[0] + h1 * .7 * c + h2 * b[0] + h3 * .7, y, h0 * a[1] - h1 * .7 * s + h2 * b[1]);
}

function studioEnvironment(renderer) {
  const room = new THREE.Scene(); room.background = new THREE.Color(0x414958);
  const resources = [];
  function panel(width, height, color, p) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...p); mesh.lookAt(0, 0, 0); room.add(mesh);
    resources.push(geometry, material);
  }
  panel(7, 12, 0xc8d2e4, [-7, 5, 8]);
  panel(12, 5, 0xf0f0ed, [1, 10, 5]);
  panel(3, 10, 0x677d9d, [8, 2, 3]);
  panel(12, 12, 0x0b1019, [0, -5, -7]);
  const generator = new THREE.PMREMGenerator(renderer);
  const result = generator.fromScene(room, .04, .1, 100);
  generator.dispose(); resources.forEach(resource => resource.dispose());
  return result;
}

// Two separable Gaussian levels in linear light. The medium level is half
// resolution (~3.3 source px sigma); the broad level is one eighth (~13.5 px).
// Dense bilinear Gaussian taps blur an already filtered image, so broad glass
// softness does not turn into repeated, disconnected copies of bright details.
function createDisplayPyramid(renderer, sourceTexture, sourceCanvas) {
  const options = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };
  const mediumPing = new THREE.WebGLRenderTarget(1, 1, options), medium = mediumPing.clone();
  const broadPing = mediumPing.clone(), broad = mediumPing.clone();
  const targets = [mediumPing, medium, broadPing, broad];
  for (const target of targets) { target.texture.colorSpace = THREE.LinearSRGBColorSpace; target.texture.generateMipmaps = false; }
  // The broad pass samples this at its own lower-resolution mip grid. This
  // keeps the Gaussian lobes overlapping instead of skipping sharp texels.
  medium.texture.generateMipmaps = true; medium.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const uniforms = { source: { value: sourceTexture }, blurStep: { value: new THREE.Vector2() } };
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vBlurUv; void main() { vBlurUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `
      uniform sampler2D source; uniform vec2 blurStep; varying vec2 vBlurUv;
      void main() {
        vec3 color = texture2D(source, vBlurUv).rgb * .2270270270;
        color += texture2D(source, vBlurUv + blurStep * 1.3846153846).rgb * .3162162162;
        color += texture2D(source, vBlurUv - blurStep * 1.3846153846).rgb * .3162162162;
        color += texture2D(source, vBlurUv + blurStep * 3.2307692308).rgb * .0702702703;
        color += texture2D(source, vBlurUv - blurStep * 3.2307692308).rgb * .0702702703;
        gl_FragColor = vec4(color, 1.);
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(2, 2), mesh = new THREE.Mesh(geometry, material);
  const scene = new THREE.Scene(), camera = new THREE.Camera(); scene.add(mesh); mesh.frustumCulled = false;
  let width = 0, height = 0;
  function update() {
    if (width !== sourceCanvas.width || height !== sourceCanvas.height) {
      width = Math.max(1, sourceCanvas.width); height = Math.max(1, sourceCanvas.height);
      for (const target of [mediumPing, medium]) target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
      for (const target of [broadPing, broad]) target.setSize(Math.max(1, Math.ceil(width / 8)), Math.max(1, Math.ceil(height / 8)));
    }
    const previous = renderer.getRenderTarget();
    function pass(source, target, x, y) { uniforms.source.value = source; uniforms.blurStep.value.set(x, y); renderer.setRenderTarget(target); renderer.render(scene, camera); }
    // Equal physical footprints in X and Y, including odd canvas dimensions.
    pass(sourceTexture, mediumPing, 2 / width, 0);
    pass(mediumPing.texture, medium, 0, 2 / height);
    pass(medium.texture, broadPing, 8 / width, 0);
    pass(broadPing.texture, broad, 0, 8 / height);
    renderer.setRenderTarget(previous);
  }
  return { medium: medium.texture, broad: broad.texture, update, dispose() { targets.forEach(target => target.dispose()); geometry.dispose(); material.dispose(); } };
}

/** Progress is the opening amount: zero is the landscape cover, one the full
 * portrait display. Rendering and timing are owned by the host application. */
export async function createPhoneDevice({ canvas, innerCanvas, coverCanvas, onError = () => {} }) {
  let renderer, environment, destroyed = false, progress = 0, pickProgress = NaN;
  const displayPyramids = new Map();
  const geometries = new Set(), materials = new Set(), textures = new Set();
  const scene = new THREE.Scene(), device = new THREE.Group(), pickRoot = new THREE.Group();
  scene.add(device);
  const camera = new THREE.OrthographicCamera(0, WIDTH, HEIGHT, 0, .1, 4000);
  camera.position.set(0, 0, 1800); camera.lookAt(0, 0, 0);
  const fold = { value: Math.PI }, softness = { value: 0 };
  const innerTexture = new THREE.CanvasTexture(innerCanvas), outerTexture = new THREE.CanvasTexture(coverCanvas);
  for (const texture of [innerTexture, outerTexture]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4; textures.add(texture);
  }
  const screenMaterials = new Map(), picks = [], raycaster = new THREE.Raycaster(), scratch = new THREE.Vector3();
  const screenScaleY = 827 / (INNER.maxX - INNER.minX), screenScaleX = 587 / (INNER.maxY - INNER.minY);

  function attachDeformation(material, kind, screen) {
    material.onBeforeCompile = shader => {
      shader.uniforms.deviceFold = fold;
      shader.vertexShader = hingeShader + '\n' + shader.vertexShader;
      if (kind !== 'fixed') {
        const flexible = kind === 'flexible';
        shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', flexible
          ? 'vec4 deviceBent = bendDeviceStrip(position); vec3 transformed = vec3(deviceBent.x, position.y, deviceBent.y);'
          : 'vec2 deviceBent = rotateDeviceHinge(position.xz); vec3 transformed = vec3(deviceBent.x, position.y, deviceBent.y);');
        shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
          vec3 objectNormal = vec3(normal);
          ${flexible ? 'vec4 deviceBasis = bendDeviceStrip(position); float deviceC = deviceBasis.z, deviceS = -deviceBasis.w;' : 'float deviceC = cos(deviceFold), deviceS = sin(deviceFold);'}
          objectNormal.xz = vec2(deviceC * normal.x + deviceS * normal.z, -deviceS * normal.x + deviceC * normal.z);
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
            objectTangent.xz = vec2(deviceC * tangent.x + deviceS * tangent.z, -deviceS * tangent.x + deviceC * tangent.z);
          #endif
        `);
      }
      if (screen) {
        shader.uniforms.deviceSoftness = softness;
        shader.uniforms.deviceBlurMedium = { value: displayPyramids.get(screen).medium };
        shader.uniforms.deviceBlurBroad = { value: displayPyramids.get(screen).broad };
        shader.vertexShader = 'varying float vDeviceTurning;\n' + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvDeviceTurning = clamp(-position.x / 7.8993535, 0., 1.);');
        shader.fragmentShader = 'uniform float deviceSoftness; uniform sampler2D deviceBlurMedium; uniform sampler2D deviceBlurBroad; varying float vDeviceTurning;\n' + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `
          #ifdef USE_EMISSIVEMAP
            vec3 displayColor = texture2D(emissiveMap, vEmissiveMapUv).rgb;
            float frost = deviceSoftness * pow(vDeviceTurning, .8);
            if (frost > .00001) {
              vec3 mediumColor = texture2D(deviceBlurMedium, vEmissiveMapUv).rgb;
              vec3 broadColor = texture2D(deviceBlurBroad, vEmissiveMapUv).rgb;
              displayColor = mix(displayColor, mediumColor, smoothstep(0., .32, frost));
              displayColor = mix(displayColor, broadColor, smoothstep(.18, 1., frost));
            }
            totalEmissiveRadiance *= displayColor;
          #endif
        `);
        // The room canvas is already graded. Keep its emissive image exact at
        // both flat endpoints; only angle-driven neutral reflections are added.
        // In particular, studio blue must never tint the handoff to the DOM UI.
        shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
          float neutralGlass = dot(totalSpecular, vec3(.2126, .7152, .0722));
          #ifdef USE_CLEARCOAT
            neutralGlass += dot(clearcoatSpecularDirect + clearcoatSpecularIndirect, vec3(.2126, .7152, .0722)) * material.clearcoat;
          #endif
          outgoingLight = totalEmissiveRadiance + vec3(min(.18, neutralGlass) * deviceSoftness * .22 * (.3 + .7 * vDeviceTurning));
          #include <opaque_fragment>
        `);
      }
    };
    material.customProgramCacheKey = () => `phone-duo-${kind}-${screen || 'shell'}-2`;
  }

  function destroy() {
    if (destroyed) return; destroyed = true;
    geometries.forEach(resource => resource.dispose());
    materials.forEach(resource => resource.dispose());
    textures.forEach(texture => { texture.dispose(); if (texture.image?.close) texture.image.close(); });
    displayPyramids.forEach(pyramid => pyramid.dispose());
    environment?.dispose(); renderer?.dispose(); scene.clear(); pickRoot.clear();
  }

  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0); renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    displayPyramids.set('inner', createDisplayPyramid(renderer, innerTexture, innerCanvas));
    displayPyramids.set('outer', createDisplayPyramid(renderer, outerTexture, coverCanvas));
    environment = studioEnvironment(renderer); scene.environment = environment.texture; scene.environmentIntensity = .85;
    scene.add(new THREE.HemisphereLight(0xc4cede, 0x273140, 1.1));
    const key = new THREE.DirectionalLight(0xf1f4ff, 2.6); key.position.set(-550, 900, 1400); scene.add(key);
    const fill = new THREE.DirectionalLight(0x889fc7, .75); fill.position.set(700, -300, 900); scene.add(fill);
    const gltf = await new GLTFLoader().loadAsync(globalThis.__duoAssets["assets/iphone-duo.glb"]);
    gltf.scene.updateMatrixWorld(true);
    const clones = new Map(), originalMaterials = new Set(), originalGeometries = new Set();
    const pickMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); materials.add(pickMaterial);
    gltf.scene.traverse(object => {
      if (!object.isMesh) return;
      const kind = object.userData.deformation || 'fixed', screen = object.userData.screen;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld); geometries.add(geometry); originalGeometries.add(object.geometry);
      let material;
      if (screen) {
        const box = screen === 'inner' ? INNER : OUTER, position = geometry.attributes.position, uv = new Float32Array(position.count * 2);
        for (let i = 0; i < position.count; i++) {
          uv[i * 2] = (box.maxY - position.getY(i)) / (box.maxY - box.minY);
          uv[i * 2 + 1] = screen === 'inner' ? (position.getX(i) - box.minX) / (box.maxX - box.minX) : (box.maxX - position.getX(i)) / (box.maxX - box.minX);
        }
        geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        material = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: screen === 'inner' ? innerTexture : outerTexture, roughness: .20, metalness: 0, clearcoat: .3, clearcoatRoughness: .14, envMapIntensity: .30, side: THREE.FrontSide, toneMapped: false });
        material.name = `${screen} live display`; screenMaterials.set(screen, material); materials.add(material); attachDeformation(material, kind, screen);
      } else {
        const original = object.material, key = `${original.uuid}/${kind}`;
        if (!clones.has(key)) {
          const mat = original.clone();
          if (mat.color && mat.color.r + mat.color.g + mat.color.b > 1) { mat.color.multiplyScalar(.17); mat.color.b *= 1.18; }
          if (mat.isMeshStandardMaterial) {
            mat.roughness = Math.max(.23, Math.min(.65, mat.roughness)); mat.envMapIntensity = 1.05;
            if (mat.metalness > .5) mat.roughness = Math.max(.26, Math.min(.40, mat.roughness));
            if (mat.isMeshPhysicalMaterial && mat.transmission > 0) { mat.roughness = Math.max(.10, mat.roughness); mat.envMapIntensity = .45; }
          }
          for (const texture of Object.values(mat)) if (texture?.isTexture) { texture.anisotropy = 4; textures.add(texture); }
          attachDeformation(mat, kind); materials.add(mat); clones.set(key, mat);
        }
        material = clones.get(key);
      }
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(mat => originalMaterials.add(mat));
      const mesh = new THREE.Mesh(geometry, material); mesh.name = object.name; mesh.userData = { ...object.userData }; mesh.frustumCulled = false; device.add(mesh);
      // Picking uses the same deformed positions, refreshed lazily only after
      // progress changes and a user actually presses inside the canvas.
      const proxyGeometry = new THREE.BufferGeometry(); proxyGeometry.setAttribute('position', geometry.attributes.position.clone());
      if (geometry.index) proxyGeometry.setIndex(geometry.index.clone()); geometries.add(proxyGeometry);
      const proxy = new THREE.Mesh(proxyGeometry, pickMaterial); pickRoot.add(proxy);
      picks.push({ proxy, original: geometry.attributes.position, kind });
    });
    originalMaterials.forEach(mat => mat.dispose()); originalGeometries.forEach(geometry => geometry.dispose());

    function setProgress(value) {
      if (destroyed) return;
      progress = clamp(Number.isFinite(value) ? value : 0); fold.value = (1 - progress) * Math.PI;
      const angleAmount = progress === 0 || progress === 1 ? 0 : Math.sin(progress * Math.PI);
      softness.value = angleAmount * angleAmount * (3 - 2 * angleAmount);
      const center = deform(-4.1225, 0, 0, 'cover', fold.value, scratch);
      const centerX = (center.x + 4.1225) / 2, centerZ = center.z / 2;
      device.rotation.set(0, 0, Math.PI / 2);
      device.scale.set(screenScaleY, screenScaleX, (screenScaleY + screenScaleX) / 2);
      device.position.set(322.5 + (INNER.minY + INNER.maxY) / 2 * screenScaleX, 443.5 - centerX * screenScaleY, -centerZ * screenScaleY);
      for (const mat of screenMaterials.values()) { mat.roughness = .13 + softness.value * .22; mat.clearcoatRoughness = .10 + softness.value * .21; }
      device.updateMatrixWorld(true); camera.updateMatrixWorld(true);
      canvas.dataset.progress = progress.toFixed(4); canvas.dataset.angle = (progress * 180).toFixed(2);
      canvas.dataset.frost = softness.value.toFixed(4);
      canvas.dataset.blurSigma = (softness.value * 13.5).toFixed(2);
    }
    function resize() {
      if (destroyed) return;
      const scale = Math.max(.25, canvas.getBoundingClientRect().width / WIDTH || 1);
      renderer.setPixelRatio(Math.min(2, Math.max(1, (window.devicePixelRatio || 1) * scale)));
      renderer.setSize(WIDTH, HEIGHT, false);
    }
    function render() {
      if (destroyed) return;
      innerTexture.needsUpdate = true; outerTexture.needsUpdate = true;
      let blurPasses = 0;
      if (softness.value > .00001) {
        // Only one turning face can face the camera at once. The hidden display
        // is not prefiltered, and stable endpoints cost no postprocess passes.
        displayPyramids.get(progress < .5 ? 'outer' : 'inner').update(); blurPasses = 4;
      }
      renderer.render(scene, camera); canvas.dataset.drawCalls = String(renderer.info.render.calls);
      canvas.dataset.triangles = String(renderer.info.render.triangles);
      canvas.dataset.blurPasses = String(blurPasses);
    }
    function hitTest(clientX, clientY) {
      if (destroyed) return false;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height || clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return false;
      if (pickProgress !== progress) {
        for (const { proxy, original, kind } of picks) {
          const position = proxy.geometry.attributes.position;
          for (let i = 0; i < position.count; i++) { deform(original.getX(i), original.getY(i), original.getZ(i), kind, fold.value, scratch); position.setXYZ(i, scratch.x, scratch.y, scratch.z); }
          proxy.geometry.computeBoundingBox(); proxy.geometry.computeBoundingSphere();
        }
        pickProgress = progress;
      }
      pickRoot.matrix.copy(device.matrixWorld); pickRoot.matrixAutoUpdate = false; pickRoot.updateMatrixWorld(true);
      raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), camera);
      return raycaster.intersectObjects(pickRoot.children, false).length > 0;
    }
    resize(); setProgress(0);
    await renderer.compileAsync(scene, camera);
    // Compile and allocate the small blur passes before the first user gesture.
    displayPyramids.forEach(pyramid => pyramid.update());
    render();
    return { setProgress, render, resize, hitTest, destroy };
  } catch (error) {
    destroy(); onError(error); throw error;
  }
}
