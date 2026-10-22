import * as THREE from 'duo/vendor/three.module.js';
import { createRoom } from 'duo/room-model.js';

const WIDTH = 587, HEIGHT = 827, MAX_LIGHTS = 6;
const ISLAND_HEADER = document.body.dataset.headerStyle === 'islands';
const UPPER = { x: 0, y: ISLAND_HEADER ? 0 : 44, width: 587, height: ISLAND_HEADER ? 407 : 363 };
const CLOSED = { x: 0, y: 0, width: 587, height: 400 };
const LOWER = { x: 20, y: 434, width: 547, height: 275 };
const AIM = new THREE.Vector3(.35, .8, .4);
const clamp = THREE.MathUtils.clamp;
const SCENE_CORNER_RADIUS = 48, SCENE_CORNER_SMOOTHING = .5;
const SCENE_CORNER_EXTENT = SCENE_CORNER_RADIUS * (1 + SCENE_CORNER_SMOOTHING);

function createSceneCornerMask() {
  // Figma radius 48, corner smoothing 50%: cubic transitions and a 45-degree arc.
  // https://github.com/phamfoo/figma-squircle/blob/main/src/draw.ts
  // Keep this in the room composite so the folding phone uses the same edge.
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = maskCanvas.height = SCENE_CORNER_EXTENT * 4;
  const context = maskCanvas.getContext('2d', { alpha: false });
  context.scale(4, 4);
  context.fillStyle = '#000';
  context.fillRect(0, 0, SCENE_CORNER_EXTENT, SCENE_CORNER_EXTENT);
  context.fillStyle = '#fff';
  context.fill(new Path2D('M0 72 c0 -22.3651957561 0 -33.5477936342 3.6537824395 -42.3688047535 a48 48 0 0 1 25.9774128070 -25.9774128070 c8.8210111193 -3.6537824395 20.0036089974 -3.6537824395 42.3688047535 -3.6537824395 L72 72 Z'));
  const texture = new THREE.CanvasTexture(maskCanvas);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const fullscreenVertex = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0., 1.);
  }
`;

// The volume uses the actual SpotLight shadow matrices and RGBA-packed depth
// maps (Three r180 WebGLShadowMap). It is clipped by the camera depth buffer and
// the room bounds: walls, window mullions and objects cast shadows into the air.
// Single scattering, homogeneous dust and a short raymarch are approximations;
// no transparent cone mesh or unoccluded light-shaped overlay is used.
const volumeFragment = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D sceneDepth;
  uniform mat4 inverseProjection;
  uniform mat4 cameraWorld;
  uniform vec3 lightPosition[6];
  uniform vec3 lightDirection[6];
  uniform vec3 lightColor[6];
  uniform vec3 lightCone[6];
  uniform mat4 lightShadowMatrix[6];
  uniform float lightPower[6];
  uniform int lightCount;
  uniform float airDensity;
  ${Array.from({ length: MAX_LIGHTS }, (_, i) => `uniform sampler2D shadow${i};`).join('\n')}
  #include <packing>

  vec3 worldPoint(float depth) {
    vec4 v = inverseProjection * vec4(vUv * 2. - 1., depth * 2. - 1., 1.);
    return (cameraWorld * vec4(v.xyz / v.w, 1.)).xyz;
  }

  float shadowVisibility(sampler2D map, mat4 matrix, vec3 p) {
    vec4 clip = matrix * vec4(p, 1.);
    if (clip.w <= 0.) return 0.;
    vec3 uvz = clip.xyz / clip.w;
    if (any(lessThan(uvz, vec3(0.))) || any(greaterThan(uvz, vec3(1.)))) return 0.;
    // Explicit LOD avoids undefined texture gradients inside divergent ray steps.
    float depth = unpackRGBAToDepth(textureLod(map, uvz.xy, 0.));
    return step(uvz.z - .00035, depth);
  }

  vec3 scatter(vec3 p, vec3 towardsCamera, vec3 source, vec3 direction,
      vec3 color, vec3 cone, float power, sampler2D shadowMap, mat4 shadowMatrix) {
    vec3 offset = p - source;
    float distanceSquared = max(dot(offset, offset), .16);
    vec3 propagation = offset * inversesqrt(distanceSquared);
    float cosine = dot(propagation, direction);
    if (cosine <= cone.x || power <= 0.) return vec3(0.);
    float spot = smoothstep(cone.x, cone.y, cosine);
    float range = pow(clamp(1. - pow(sqrt(distanceSquared) / cone.z, 4.), 0., 1.), 2.);
    float visibility = shadowVisibility(shadowMap, shadowMatrix, p);
    // Henyey-Greenstein phase function, g=.38. Backlit airborne dust is brighter.
    float phase = .06809 / pow(max(1.1444 - .76 * dot(propagation, towardsCamera), .05), 1.5);
    return color * (power * spot * range * visibility * phase / distanceSquared);
  }

  void main() {
    if (lightCount == 0) { gl_FragColor = vec4(0.); return; }
    vec3 origin = worldPoint(0.);
    vec3 farPoint = worldPoint(1.);
    vec3 direction = normalize(farPoint - origin);
    vec3 surface = worldPoint(texture2D(sceneDepth, vUv).r);
    float surfaceDistance = distance(origin, surface);
    vec3 inverseDirection = 1. / (direction + vec3(.000001));
    vec3 t0 = (vec3(-2.77, .03, -2.47) - origin) * inverseDirection;
    vec3 t1 = (vec3(2.77, 3.47, 2.47) - origin) * inverseDirection;
    vec3 nearT = min(t0, t1), farT = max(t0, t1);
    float entry = max(max(nearT.x, nearT.y), max(nearT.z, 0.));
    float exitT = min(min(farT.x, farT.y), min(farT.z, surfaceDistance));
    float surfaceViewDistance = distance(cameraWorld[3].xyz, surface);
    if (exitT <= entry) { gl_FragColor = vec4(0., 0., 0., surfaceViewDistance); return; }
    const int STEPS = 32;
    float stepSize = (exitT - entry) / float(STEPS);
    // Stable spatial jitter breaks marching bands without temporal flicker.
    float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    vec3 sum = vec3(0.);
    for (int j = 0; j < STEPS; j++) {
      vec3 point = origin + direction * (entry + (float(j) + jitter) * stepSize);
      vec3 sampleLight = vec3(0.);
      ${Array.from({ length: MAX_LIGHTS }, (_, i) => `
      if (lightCount > ${i}) sampleLight += scatter(point, -direction,
        lightPosition[${i}], lightDirection[${i}], lightColor[${i}], lightCone[${i}],
        lightPower[${i}], shadow${i}, lightShadowMatrix[${i}]);`).join('\n')}
      sum += sampleLight * stepSize * airDensity;
    }
    // Keep the guide at the same sample as the scattering. The composite can
    // then reject background haze when reconstructing a thin foreground leaf.
    gl_FragColor = vec4(sum, surfaceViewDistance);
  }
`;

const compositeFragment = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D sceneColor;
  uniform sampler2D volumeColor;
  uniform sampler2D bloomColor;
  uniform sampler2D sceneDepth;
  uniform mat4 inverseProjection;
  uniform float cinematicFinish;
  uniform float viewOpacity;
  uniform sampler2D cornerMask;
  uniform vec2 viewSize;
  uniform float cornerExtent;
  uniform vec2 volumeSize;
  vec3 filteredVolume(float surfaceDistance) {
    vec2 grid = vUv * volumeSize - .5;
    vec2 base = floor(grid + .5);
    vec3 sum = vec3(0.);
    float weights = 0.;
    // Depth-guided reconstruction keeps low-resolution atmosphere off the
    // window frame, cloth and foliage instead of blending across silhouettes.
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 cell = base + vec2(float(x), float(y));
        vec2 offset = cell - grid;
        vec4 sampleVolume = texture2D(volumeColor, (cell + .5) / volumeSize);
        float spatial = exp(-dot(offset, offset) * 1.35);
        float depthWeight = exp(-abs(sampleVolume.a - surfaceDistance) * 28.);
        float weight = spatial * depthWeight;
        sum += sampleVolume.rgb * weight;
        weights += weight;
      }
    }
    return sum / max(weights, .0001);
  }
  void main() {
    float depth = texture2D(sceneDepth, vUv).r;
    vec4 position = inverseProjection * vec4(vUv * 2. - 1., depth * 2. - 1., 1.);
    float distanceToSurface = length(position.xyz / position.w);
    vec3 color = texture2D(sceneColor, vUv).rgb + filteredVolume(distanceToSurface);
    if (cinematicFinish > .5) {
      // Low-density depth haze only on photographed surfaces, never the black
      // canvas. Nearby furniture keeps contrast while distant plaster recedes.
      float haze = (1. - exp(-max(distanceToSurface - 2.1, 0.) * .013)) * step(depth, .99995);
      color = mix(color, vec3(.006, .010, .016), haze);
      color += texture2D(bloomColor, vUv).rgb * .13;
      vec2 frame = vUv * 2. - 1.;
      color *= 1. - .10 * pow(clamp(dot(frame * vec2(.72, .9), frame * vec2(.72, .9)), 0., 1.), 1.5);
    }
    gl_FragColor = vec4(color, 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    gl_FragColor.rgb *= viewOpacity;
    if (cornerExtent > 0.) {
      vec2 pixel = vec2(vUv.x, 1. - vUv.y) * viewSize;
      float side = min(pixel.x, viewSize.x - pixel.x);
      if (side < cornerExtent && pixel.y < cornerExtent) {
        vec2 maskUV = vec2(side / cornerExtent, 1. - pixel.y / cornerExtent);
        gl_FragColor.rgb *= texture2D(cornerMask, maskUV).r;
      }
    }
  }
`;

const bloomFragment = /* glsl */`
  varying vec2 vUv;
  uniform sampler2D source;
  uniform vec2 stepDirection;
  uniform float extractHighlights;
  vec3 sampleHighlight(vec2 uv) {
    vec3 color = texture2D(source, uv).rgb;
    if (extractHighlights > .5) {
      float peak = max(max(color.r, color.g), color.b);
      float knee = clamp((peak - .45) / .4, 0., 1.);
      color *= max(peak - .65, 0.) / max(peak, .0001) + knee * knee * .055;
    }
    return color;
  }
  void main() {
    vec3 sum = sampleHighlight(vUv) * .227027;
    sum += (sampleHighlight(vUv + stepDirection) + sampleHighlight(vUv - stepDirection)) * .194595;
    sum += (sampleHighlight(vUv + stepDirection * 2.) + sampleHighlight(vUv - stepDirection * 2.)) * .121622;
    sum += (sampleHighlight(vUv + stepDirection * 3.) + sampleHighlight(vUv - stepDirection * 3.)) * .054054;
    sum += (sampleHighlight(vUv + stepDirection * 4.) + sampleHighlight(vUv - stepDirection * 4.)) * .016216;
    gl_FragColor = vec4(sum, 1.);
  }
`;

function createRoomReflection(renderer) {
  // A small procedural room capture provides broad physically filtered
  // reflections. It is intentionally faint, not a visible scene background.
  const environment = new THREE.Scene();
  environment.background = new THREE.Color().setRGB(.012, .018, .029);
  const captureObjects = [];
  function panel(width, height, position, color, rotation = [0, 0, 0]) {
    const geometry = new THREE.PlaneGeometry(width, height);
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...color), side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.rotation.set(...rotation);
    environment.add(mesh);
    captureObjects.push(mesh);
  }
  panel(2.1, 2.7, [1.1, 1.0, -4.0], [.72, 1.18, 1.65]);
  panel(6, 4, [-4, 0, 0], [.085, .092, .087], [0, Math.PI / 2, 0]);
  panel(7, 7, [0, -2, 0], [.055, .044, .032], [-Math.PI / 2, 0, 0]);
  panel(3.5, 2.1, [1.8, 2, 4], [.14, .13, .105]);
  const generator = new THREE.PMREMGenerator(renderer);
  const result = generator.fromScene(environment, .025, .1, 20);
  generator.dispose();
  for (const mesh of captureObjects) { mesh.geometry.dispose(); mesh.material.dispose(); }
  return result;
}

export function createRoomRenderer({ canvas, onError = () => {}, onReady = () => {}, onFrame = () => {} }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (error) {
    onError(error);
    throw error;
  }
  renderer.setClearColor(0x000000, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  // The small smoked oven pane does not need a full-resolution refraction pass.
  renderer.transmissionResolutionScale = .5;
  renderer.shadowMap.enabled = true;
  // Preserve the source-dependent softness of the room shadows.
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
    const details = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join('\n');
    console.error('Room shader compilation failed:', details);
    onError(new Error(`Room shader compilation failed: ${details}`));
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const room = createRoom();
  scene.add(room.group);
  // A faint cool night baseline makes the room legible before adding a source.
  const night = new THREE.HemisphereLight(0x9aaec9, 0x343936, .525);
  scene.add(night);
  // Additional source-driven diffuse bounce remains an explicit approximation.
  const bounce = new THREE.HemisphereLight(0xa0b9d0, 0x24251f, 0);
  scene.add(bounce);
  const coolBounce = new THREE.Color(0xabc6de);
  const bounceColor = new THREE.Color();
  const reflection = createRoomReflection(renderer);
  scene.environment = reflection.texture;
  scene.environmentIntensity = .07;
  // A dim exterior haze card makes the open aperture readable at night; added
  // luminance follows an exterior source admitted through the real opening.
  // It is a view of distant atmosphere, not glass, and never casts a shadow.
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: { skyColor: { value: new THREE.Color(0x6f8ead) }, skyPower: { value: .008 } },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform vec3 skyColor;
      uniform float skyPower;
      void main() { gl_FragColor = vec4(skyColor * skyPower * (.36 + .64 * vUv.y), 1.); }
    `,
    toneMapped: false
  });
  // Extend behind the jambs so perspective cannot reveal the edge of the sky card.
  const skyGeometry = new THREE.PlaneGeometry(2.2, 2.45);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.position.set(1, 2.2, -2.69);
  sky.visible = true;
  scene.add(sky);
  const skyColor = new THREE.Color();
  const windowCenter = new THREE.Vector3(1, 2.2, -2.5);

  const cinematic = new THREE.PerspectiveCamera(34, UPPER.width / UPPER.height, .08, 45);
  cinematic.position.set(2.30, 1.15, 4.28);
  cinematic.lookAt(-.44, 1.02, -.4);
  cinematic.layers.enable(1);
  const openCameraPosition = cinematic.position.clone();
  const closedCameraPosition = openCameraPosition.clone().lerp(new THREE.Vector3(-.44, 1.02, -.4), .02);
  const openCameraFov = cinematic.fov;
  const cinematicRect = { ...UPPER };
  let presentationProgress = 1;
  function updateCinematicProjection() {
    if (ISLAND_HEADER) {
      // Reveal 44 more pixels above the existing composition, without cropping
      // the table or stretching the room to fill the former header strip.
      const extension = 44 * presentationProgress;
      cinematic.setViewOffset(WIDTH, cinematicRect.height - extension,
        0, -extension, WIDTH, cinematicRect.height);
    } else {
      cinematic.aspect = cinematicRect.width / cinematicRect.height;
      cinematic.updateProjectionMatrix();
    }
  }
  updateCinematicProjection();
  // Reused synchronously by the frame consumer; coordinates are design pixels,
  // not physical canvas pixels. The drawing buffer always remains 587 x 827.
  const frameInfo = { canvas, cinematicRect, progress: presentationProgress };
  const isoHeight = 10.5, isoWidth = isoHeight * LOWER.width / LOWER.height;
  const isometric = new THREE.OrthographicCamera(-isoWidth / 2, isoWidth / 2, isoHeight / 2, -isoHeight / 2, .1, 45);
  isometric.position.set(8, 8, 10);
  isometric.lookAt(0, 1.05, -.25);
  cinematic.updateMatrixWorld();
  isometric.updateMatrixWorld();

  const dummyShadow = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  dummyShadow.needsUpdate = true;
  const vecArray = () => Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector3());
  const volumeUniforms = {
    sceneDepth: { value: null }, inverseProjection: { value: new THREE.Matrix4() },
    cameraWorld: { value: new THREE.Matrix4() }, lightPosition: { value: vecArray() },
    lightDirection: { value: vecArray() }, lightColor: { value: vecArray() },
    lightCone: { value: vecArray() }, lightPower: { value: Array(MAX_LIGHTS).fill(0) },
    lightShadowMatrix: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Matrix4()) },
    lightCount: { value: 0 },
    airDensity: { value: .016 },
    ...Object.fromEntries(Array.from({ length: MAX_LIGHTS }, (_, i) => [`shadow${i}`, { value: dummyShadow }]))
  };
  const volumeMaterial = new THREE.ShaderMaterial({
    uniforms: volumeUniforms, vertexShader: fullscreenVertex, fragmentShader: volumeFragment,
    depthTest: false, depthWrite: false, toneMapped: false
  });
  const cornerMask = createSceneCornerMask();
  const compositeMaterial = new THREE.ShaderMaterial({
    uniforms: {
      sceneColor: { value: null }, volumeColor: { value: null }, bloomColor: { value: null },
      sceneDepth: { value: null }, inverseProjection: { value: new THREE.Matrix4() },
      cinematicFinish: { value: 0 }, viewOpacity: { value: 1 },
      cornerMask: { value: cornerMask }, viewSize: { value: new THREE.Vector2() },
      cornerExtent: { value: 0 }, volumeSize: { value: new THREE.Vector2() }
    },
    vertexShader: fullscreenVertex, fragmentShader: compositeFragment,
    depthTest: false, depthWrite: false, toneMapped: true
  });
  const bloomMaterial = new THREE.ShaderMaterial({
    uniforms: { source: { value: null }, stepDirection: { value: new THREE.Vector2() }, extractHighlights: { value: 1 } },
    vertexShader: fullscreenVertex, fragmentShader: bloomFragment,
    depthTest: false, depthWrite: false, toneMapped: false
  });
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(quadGeometry, volumeMaterial);
  const postScene = new THREE.Scene();
  postScene.add(quad);
  const postCamera = new THREE.Camera();
  const targets = [UPPER, LOWER].map(() => {
    const color = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: true, samples: 4, resolveDepthBuffer: true
    });
    color.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    const volume = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
    });
    return { color, volume, dirty: true };
  });
  const bloomTargets = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false }));
  const sources = new Map();
  let activeLights = [], frame = 0, destroyed = false, ready = false;
  let lightSignature = null, lastPixelRatio = 0;

  function requestRender() {
    if (!destroyed && !document.hidden && !frame) frame = requestAnimationFrame(render);
  }

  function setPresentation(progress) {
    if (destroyed || !Number.isFinite(progress)) return;
    const next = clamp(progress, 0, 1);
    if (next !== presentationProgress) {
      presentationProgress = next;
      frameInfo.progress = next;
      cinematicRect.y = THREE.MathUtils.lerp(CLOSED.y, UPPER.y, next);
      cinematicRect.height = THREE.MathUtils.lerp(CLOSED.height, UPPER.height, next);
      cinematic.position.lerpVectors(closedCameraPosition, openCameraPosition, next);
      // Compensate for the taller closed viewport before adding the subtle
      // dolly. Keeping FOV 34 here would unexpectedly crop horizontal content.
      cinematic.fov = THREE.MathUtils.lerp(36.5, openCameraFov, next);
      updateCinematicProjection();
      cinematic.updateMatrixWorld();
      targets[0].dirty = true;
    }
    // Calling the endpoint again also requests a fresh synchronous onFrame
    // copy, without updating lights or restarting animation.
    requestRender();
  }

  function makeSource(index) {
    const light = new THREE.SpotLight(0xffffff, 0, 24, Math.PI / 6, .28, 2);
    light.castShadow = true;
    light.shadow.autoUpdate = false;
    light.shadow.needsUpdate = true;
    const resolution = index < 2 ? 2048 : 1024;
    light.shadow.mapSize.set(resolution, resolution);
    light.shadow.camera.near = .35;
    light.shadow.camera.far = 24;
    light.shadow.bias = -.00035;
    light.shadow.normalBias = .038;
    light.shadow.radius = 2;
    light.target.position.copy(AIM);
    scene.add(light, light.target);
    return light;
  }

  function update(lights = []) {
    const nextLights = lights.slice(0, MAX_LIGHTS);
    const nextSignature = JSON.stringify(nextLights);
    // Selection, Save and other UI-only changes do not alter the 3D scene.
    if (nextSignature === lightSignature) return;
    lightSignature = nextSignature;
    activeLights = nextLights;
    let shadowsChanged = false;
    const ids = new Set(activeLights.map(light => light.id));
    for (const [id, light] of sources) {
      if (!ids.has(id)) {
        scene.remove(light, light.target);
        light.dispose();
        sources.delete(id);
      }
    }
    activeLights.forEach((state, index) => {
      let light = sources.get(state.id);
      if (!light) { light = makeSource(index); sources.set(state.id, light); }
      const shadowSize = index < 2 ? 2048 : 1024;
      if (light.shadow.mapSize.x !== shadowSize) {
        light.shadow.map?.dispose();
        light.shadow.map = null;
        light.shadow.mapSize.set(shadowSize, shadowSize);
      }
      const fallback = defaultLight(state.kind, index);
      const position = Array.isArray(state.position) && state.position.length === 3 ? state.position : fallback.position;
      const nextPosition = position.map((n, axis) => Number.isFinite(n) ? n : fallback.position[axis]);
      light.position.fromArray(nextPosition);
      light.color.set(state.color || fallback.color);
      const level = clamp(Number.isFinite(state.intensity) ? state.intensity : fallback.intensity, 0, 100) / 100;
      const beam = clamp(Number.isFinite(state.beamWidth) ? state.beamWidth : fallback.beamWidth, 0, 100) / 100;
      const shadowKey = `${nextPosition.join(',')}:${beam}:${shadowSize}`;
      if (shadowKey !== light.userData.shadowKey) {
        light.userData.shadowKey = shadowKey;
        light.shadow.needsUpdate = true;
        shadowsChanged = true;
      }
      // UI width adjusts the actual cone's half angle for every source kind.
      light.angle = THREE.MathUtils.degToRad(7 + beam * 57);
      light.penumbra = state.kind === 'softbox' ? .8 : state.kind === 'sun' ? .19 : .36;
      light.intensity = (state.kind === 'sun' ? 370 : state.kind === 'softbox' ? 145 : 115) * Math.pow(level, 1.35);
      light.shadow.radius = (state.kind === 'softbox' ? 4 : 1.8) * (shadowSize / 1024);
      light.target.position.copy(AIM);
      light.updateMatrixWorld();
      light.target.updateMatrixWorld();
    });
    let bouncePower = 0;
    let skyPower = 0;
    bounceColor.setRGB(0, 0, 0);
    skyColor.setRGB(0, 0, 0);
    for (const light of sources.values()) {
      // Prevent a source aimed into an opaque exterior wall from producing a
      // room-wide fill. This only estimates first-bounce energy, not full GI.
      let admission = 1;
      if (light.position.z < -2.5) {
        const t = (-2.5 - light.position.z) / (AIM.z - light.position.z);
        const x = THREE.MathUtils.lerp(light.position.x, AIM.x, t);
        const y = THREE.MathUtils.lerp(light.position.y, AIM.y, t);
        if (y < 3.5 && (x < .35 || x > 1.65 || y < 1.425 || y > 2.975)) admission = 0;
      }
      if (light.position.x < -2.8) {
        const t = (-2.8 - light.position.x) / (AIM.x - light.position.x);
        const y = THREE.MathUtils.lerp(light.position.y, AIM.y, t);
        const z = THREE.MathUtils.lerp(light.position.z, AIM.z, t);
        if (y < 3.5 && z >= -2.5 && z <= 2.5) admission = 0;
      }
      const power = light.intensity * admission;
      bouncePower += power;
      bounceColor.r += light.color.r * power;
      bounceColor.g += light.color.g * power;
      bounceColor.b += light.color.b * power;
      if (light.position.z < -2.69 && power > 0) {
        const distanceSquared = light.position.distanceToSquared(windowCenter);
        const coverage = Math.min(1, Math.PI * distanceSquared * Math.tan(light.angle) ** 2 / (1.3 * 1.55));
        const exteriorFade = clamp((-2.69 - light.position.z) / .55, 0, 1);
        const energy = power * coverage * exteriorFade / Math.max(1, distanceSquared);
        skyPower += energy;
        skyColor.r += light.color.r * energy;
        skyColor.g += light.color.g * energy;
        skyColor.b += light.color.b * energy;
      }
    }
    bounce.intensity = .30 * (1 - Math.exp(-bouncePower / 180));
    scene.environmentIntensity = .07 + .32 * (1 - Math.exp(-bouncePower / 180));
    if (bouncePower > 0) {
      bounceColor.multiplyScalar(1 / bouncePower).lerp(coolBounce, .22);
      bounce.color.copy(bounceColor);
      bounce.groundColor.copy(bounceColor).multiplyScalar(.19);
    }
    skyMaterial.uniforms.skyPower.value = .008 + .22 * (1 - Math.exp(-skyPower / 40));
    if (skyPower > 0) skyMaterial.uniforms.skyColor.value.copy(skyColor).multiplyScalar(1 / skyPower);
    else skyMaterial.uniforms.skyColor.value.set(0x6f8ead);
    // Shadow geometry depends on position and cone, not brightness or tint.
    // Each unchanged source keeps its map when another light is moved.
    renderer.shadowMap.needsUpdate ||= shadowsChanged;
    for (const target of targets) target.dirty = true;
    requestRender();
  }

  function updateVolumeUniforms(camera, depth) {
    volumeUniforms.airDensity.value = camera === cinematic ? .018 : .009;
    volumeUniforms.sceneDepth.value = depth;
    volumeUniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    volumeUniforms.cameraWorld.value.copy(camera.matrixWorld);
    volumeUniforms.lightCount.value = activeLights.length;
    activeLights.forEach((state, i) => {
      const light = sources.get(state.id);
      volumeUniforms.lightPosition.value[i].copy(light.position);
      volumeUniforms.lightDirection.value[i].subVectors(light.target.position, light.position).normalize();
      volumeUniforms.lightColor.value[i].set(light.color.r, light.color.g, light.color.b);
      volumeUniforms.lightPower.value[i] = light.intensity;
      volumeUniforms.lightCone.value[i].set(Math.cos(light.angle), Math.cos(light.angle * (1 - light.penumbra)), light.distance);
      volumeUniforms.lightShadowMatrix.value[i].copy(light.shadow.matrix);
      volumeUniforms[`shadow${i}`].value = light.shadow.map?.texture || dummyShadow;
    });
    for (let i = activeLights.length; i < MAX_LIGHTS; i++) {
      volumeUniforms.lightPower.value[i] = 0;
      volumeUniforms[`shadow${i}`].value = dummyShadow;
    }
  }

  function renderView(camera, rect, target, opacity = 1) {
    const isCinematic = camera === cinematic;
    if (target.dirty) {
      renderer.setScissorTest(false);
      renderer.setRenderTarget(target.color);
      renderer.clear();
      renderer.render(scene, camera);
      updateVolumeUniforms(camera, target.color.depthTexture);
      renderer.setRenderTarget(target.volume);
      renderer.clear();
      quad.material = volumeMaterial;
      renderer.render(postScene, postCamera);
      if (isCinematic) {
        quad.material = bloomMaterial;
        bloomMaterial.uniforms.source.value = target.color.texture;
        bloomMaterial.uniforms.extractHighlights.value = 1;
        bloomMaterial.uniforms.stepDirection.value.set(2.6 / target.color.width, 0);
        renderer.setRenderTarget(bloomTargets[0]);
        renderer.clear();
        renderer.render(postScene, postCamera);
        bloomMaterial.uniforms.source.value = bloomTargets[0].texture;
        bloomMaterial.uniforms.extractHighlights.value = 0;
        bloomMaterial.uniforms.stepDirection.value.set(0, 1.15 / bloomTargets[0].height);
        renderer.setRenderTarget(bloomTargets[1]);
        renderer.clear();
        renderer.render(postScene, postCamera);
      }
      target.dirty = false;
    }
    renderer.setRenderTarget(null);
    renderer.setViewport(rect.x, HEIGHT - rect.y - rect.height, rect.width, rect.height);
    renderer.setScissor(rect.x, HEIGHT - rect.y - rect.height, rect.width, rect.height);
    renderer.setScissorTest(true);
    compositeMaterial.uniforms.sceneColor.value = target.color.texture;
    compositeMaterial.uniforms.volumeColor.value = target.volume.texture;
    compositeMaterial.uniforms.volumeSize.value.set(target.volume.width, target.volume.height);
    compositeMaterial.uniforms.sceneDepth.value = target.color.depthTexture;
    compositeMaterial.uniforms.bloomColor.value = bloomTargets[1].texture;
    compositeMaterial.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);
    compositeMaterial.uniforms.cinematicFinish.value = isCinematic ? 1 : 0;
    compositeMaterial.uniforms.viewOpacity.value = opacity;
    compositeMaterial.uniforms.viewSize.value.set(rect.width, rect.height);
    compositeMaterial.uniforms.cornerExtent.value = isCinematic && !ISLAND_HEADER ? SCENE_CORNER_EXTENT * presentationProgress : 0;
    quad.material = compositeMaterial;
    renderer.render(postScene, postCamera);
  }

  function render() {
    frame = 0;
    if (destroyed) return;
    if (document.hidden) return;
    try {
      renderer.setRenderTarget(null);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, WIDTH, HEIGHT);
      renderer.clear();
      // The shared faint night baseline remains visible with zero user sources.
      renderView(cinematic, cinematicRect, targets[0]);
      if (presentationProgress > 0) renderView(isometric, LOWER, targets[1], presentationProgress);
      renderer.setScissorTest(false);
      // Copy to a phone surface now, before the default framebuffer can be
      // discarded. A consumer failure must not stop room rendering.
      try { onFrame(frameInfo); }
      catch (error) { console.error('Room frame consumer failed:', error); }
      if (!ready) { ready = true; onReady(); }
    } catch (error) { onError(error); }
  }

  function resize() {
    if (destroyed) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (ratio === lastPixelRatio) return;
    lastPixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(WIDTH, HEIGHT, false);
    // Allocate the maximum cinematic size only on resize, never on a fold
    // frame. Its texture is sampled into the interpolated output viewport.
    [{ ...CLOSED, height: Math.max(CLOSED.height, UPPER.height) }, LOWER].forEach((rect, i) => {
      const detailRatio = i === 0 ? Math.max(1.5, ratio) : Math.min(ratio, 1.25);
      targets[i].color.setSize(Math.round(rect.width * detailRatio), Math.round(rect.height * detailRatio));
      const volumeRatio = i === 0 ? .8 : .5;
      targets[i].volume.setSize(Math.round(rect.width * volumeRatio), Math.round(rect.height * volumeRatio));
      targets[i].dirty = true;
    });
    for (const target of bloomTargets) target.setSize(Math.round(CLOSED.width * .4), Math.round(CLOSED.height * .4));
    requestRender();
  }

  function projectLight(light) {
    const p = new THREE.Vector3().fromArray(light.position).project(isometric);
    return { x: LOWER.x + (p.x + 1) * LOWER.width / 2, y: LOWER.y + (1 - p.y) * LOWER.height / 2 };
  }

  const raycaster = new THREE.Raycaster();
  function lightFromScreen(light, x, y) {
    const pointer = new THREE.Vector2((x - LOWER.x) / LOWER.width * 2 - 1, 1 - (y - LOWER.y) / LOWER.height * 2);
    const height = clamp(light.position[1], .6, 5.5);
    raycaster.setFromCamera(pointer, isometric);
    const point = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -height), point);
    return hit ? [clamp(point.x, -8, 8), height, clamp(point.z, -8, 8)] : [...light.position];
  }

  function contextLost(event) { event.preventDefault(); onError(new Error('WebGL context lost. Reload the page to restore the room.')); }
  function visibilityChanged() {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else requestRender();
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  canvas.addEventListener('webglcontextlost', contextLost);
  resize();
  return {
    update, resize, setPresentation, defaultLight, projectLight, lightFromScreen,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibilityChanged);
      canvas.removeEventListener('webglcontextlost', contextLost);
      for (const light of sources.values()) light.dispose();
      for (const target of targets) { target.color.dispose(); target.volume.dispose(); }
      for (const target of bloomTargets) target.dispose();
      volumeMaterial.dispose(); compositeMaterial.dispose(); bloomMaterial.dispose(); quadGeometry.dispose(); dummyShadow.dispose();
      cornerMask.dispose();
      skyGeometry.dispose(); skyMaterial.dispose();
      reflection.dispose();
      room.dispose(); renderer.dispose();
    }
  };
}

export function defaultLight(kind = 'regular', index = 0) {
  const offset = (index % 3) * .48;
  if (kind === 'sun') return { kind, position: [1.5 + offset, 3.25, -4.7], intensity: 72, beamWidth: 33, color: '#b9dfff' };
  if (kind === 'softbox') return { kind, position: [-.4 + offset, 3.25, 3.7], intensity: 65, beamWidth: 76, color: '#d9e9ff' };
  return { kind, position: [3.65, 2.6, 2.25 - offset], intensity: 68, beamWidth: 45, color: '#ffe2ba' };
}
