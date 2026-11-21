import { createCity } from './world.js';
import { mat4, identity, multiply, lookAt, perspective } from './matrix.js';

const canvas = document.querySelector('#scene');
const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true, preserveDrawingBuffer: true });
if (!gl) throw new Error('WebGL 2 is required.');

const vertexShader = `#version 300 es
in vec3 position;
in vec3 normal;
in vec4 tint;
in float kind;
uniform mat4 viewProjection;
uniform mat4 model;
out vec3 worldNormal;
out vec3 worldPosition;
out vec4 color;
out float surface;
void main() {
  vec4 point = model * vec4(position, 1.0);
  worldPosition = point.xyz;
  worldNormal = mat3(model) * normal;
  color = tint;
  surface = kind;
  gl_Position = viewProjection * point;
}`;

const fragmentShader = `#version 300 es
precision highp float;
in vec3 worldNormal;
in vec3 worldPosition;
in vec4 color;
in float surface;
uniform vec3 sunDirection;
uniform vec3 eye;
uniform vec3 sky;
uniform float night;
uniform float timeOfDay;
uniform float sunset;
out vec4 outColor;
void main() {
  vec3 N = normalize(worldNormal);
  vec3 V = normalize(eye - worldPosition);
  vec3 L = normalize(sunDirection);
  float diffuse = max(dot(N, L), 0.0);
  float hemi = clamp(N.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 dayLight = vec3(0.91, 0.85, 0.72) * (0.57 + diffuse * 0.78);
  vec3 duskLight = vec3(1.0, 0.57, 0.32) * (0.45 + diffuse * 0.78);
  vec3 nightLight = vec3(0.36, 0.47, 0.69) * (0.28 + diffuse * 0.33);
  vec3 lighting = mix(dayLight, nightLight, night);
  lighting = mix(lighting, duskLight, sunset);
  lighting *= mix(0.76, 1.12, hemi);
  vec3 base = color.rgb * lighting;

  if (surface > 1.5 && surface < 2.5) {
    float paneU = fract((worldPosition.x + worldPosition.z * 0.17) * 0.075);
    float paneV = fract(worldPosition.y * 0.075);
    float edge = step(0.105, paneU) * step(0.11, paneV) * (1.0 - step(0.91, paneV));
    float roomSeed = sin(floor(worldPosition.x * 0.031) * 17.17 + floor(worldPosition.y * 0.031) * 41.73);
    float occupied = step(-0.32, roomSeed);
    float roomGlow = edge * occupied * night;
    base = mix(base, vec3(1.0, 0.65, 0.32), roomGlow * 1.38);
    float silhouette = step(0.78, fract(worldPosition.x * 0.041 + worldPosition.y * 0.013 + roomSeed));
    float person = silhouette * edge * night * 0.76;
    base = mix(base, vec3(0.045, 0.075, 0.09), person);
    float desk = step(0.90, fract(worldPosition.x * 0.023 + worldPosition.y * 0.041 + roomSeed));
    base = mix(base, vec3(0.44, 0.28, 0.14), desk * edge * night * 0.72);
    if (surface < 2.1) {
      float litPane = step(0.58, fract(worldPosition.x * 0.117 + worldPosition.y * 0.043));
      base = mix(base, vec3(1.0, 0.69, 0.39), litPane * night * 0.93);
    }
  }

  if (surface > 2.5 && surface < 3.5) {
    float facing = pow(max(dot(reflect(-L, N), V), 0.0), 18.0);
    float sunDisc = pow(max(dot(V, L), 0.0), 120.0);
    float glare = (facing * 0.92 + sunDisc * 1.25) * (1.0 - night) * (1.0 - sunset * 0.22);
    vec3 reflection = mix(vec3(0.31, 0.57, 0.64), vec3(0.78, 0.87, 0.86), facing * 0.75);
    base = mix(base, reflection, 0.35 + night * 0.17);
    base += vec3(1.0, 0.86, 0.61) * glare;
    float roomLine = step(0.965, fract(worldPosition.y * 0.058));
    float litOffice = step(0.38, fract(worldPosition.x * 0.021 + floor(worldPosition.y * 0.03) * 0.43));
    base = mix(base, vec3(1.0, 0.66, 0.34), roomLine * litOffice * night * 1.55);
    float furniture = step(0.935, fract(worldPosition.x * 0.043 + floor(worldPosition.y * 0.025) * 0.23));
    base = mix(base, vec3(0.035, 0.075, 0.085), furniture * night * 0.8);
  }

  if (surface > 3.5 && surface < 4.5) {
    float wave = 0.5 + 0.5 * sin(worldPosition.x * 0.11 + worldPosition.z * 0.075 + timeOfDay * 3.6);
    float glint = pow(max(dot(reflect(-V, N), L), 0.0), 28.0);
    base = mix(vec3(0.035, 0.24, 0.32), vec3(0.12, 0.48, 0.56), wave * 0.55);
    base += glint * (0.36 + (1.0 - night) * 0.45);
  }

  if (surface > 4.5 && surface < 5.5) {
    float star = 0.72 + 0.28 * sin(timeOfDay * 11.0 + worldPosition.x * 0.017);
    base = mix(base, vec3(0.83, 0.88, 0.96) * star, night);
  }

  if (surface > 5.5 && surface < 6.5) {
    base = mix(base, vec3(1.0, 0.68, 0.28), night * 1.7);
  }

  if (surface > 6.5 && surface < 7.5) {
    base = mix(base, vec3(0.78, 0.85, 0.89), night);
  }

  if (surface > 7.5) base = color.rgb;

  float distanceFog = clamp(length(eye - worldPosition) / 6200.0, 0.0, 0.38);
  base = mix(base, sky, distanceFog);
  outColor = vec4(max(base, vec3(0.0)), surface > 7.5 ? color.a : 1.0);
}`;

const skyVertexShader = `#version 300 es
const vec2 triangle[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(triangle[gl_VertexID], 1.0, 1.0); }`;

const skyFragmentShader = `#version 300 es
precision highp float;
uniform vec2 resolution;
uniform float phase;
uniform float elapsed;
out vec4 outColor;
float randomCell(vec2 point) { return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / resolution;
  float height = smoothstep(0.0, 1.0, uv.y);
  vec3 daySky = mix(vec3(0.76, 0.83, 0.81), vec3(0.20, 0.43, 0.68), height);
  vec3 duskSky = mix(vec3(0.92, 0.49, 0.28), vec3(0.23, 0.25, 0.47), height);
  vec3 nightSky = mix(vec3(0.035, 0.075, 0.12), vec3(0.006, 0.017, 0.048), height);
  vec3 sky = phase > 1.5 ? nightSky : phase > 0.5 ? duskSky : daySky;
  vec2 sunCenter = phase > 0.5 && phase < 1.5 ? vec2(0.67, 0.63) : vec2(0.72, 0.75);
  float sunDistance = length((uv - sunCenter) * vec2(resolution.x / resolution.y, 1.0));
  if (phase < 1.5) {
    float corona = exp(-sunDistance * 16.0);
    float disk = 1.0 - smoothstep(0.027, 0.035, sunDistance);
    vec3 sunTint = phase > 0.5 ? vec3(1.0, 0.55, 0.29) : vec3(1.0, 0.88, 0.62);
    sky += sunTint * (corona * 0.43 + disk * 0.84);
    float streak = exp(-abs(uv.y - sunCenter.y) * 120.0) * exp(-abs(uv.x - sunCenter.x) * 6.0);
    sky += sunTint * streak * (phase > 0.5 ? 0.16 : 0.11);
  } else {
    vec2 grid = uv * vec2(115.0, 58.0);
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float seed = randomCell(cell);
    float starShape = 1.0 - smoothstep(0.035, 0.11, length(local));
    float star = step(0.976, seed) * starShape * (0.73 + 0.27 * sin(elapsed * 2.0 + seed * 21.0));
    sky += vec3(0.62, 0.73, 0.92) * star;
    vec2 moonCenter = vec2(0.77, 0.78);
    float moonDistance = length((uv - moonCenter) * vec2(resolution.x / resolution.y, 1.0));
    float moon = 1.0 - smoothstep(0.025, 0.029, moonDistance);
    float crescent = 1.0 - smoothstep(0.021, 0.026, length((uv - moonCenter - vec2(0.009, 0.006)) * vec2(resolution.x / resolution.y, 1.0)));
    float halo = exp(-moonDistance * 34.0) * 0.24;
    sky += vec3(0.69, 0.77, 0.87) * max(moon, halo) - vec3(0.13, 0.17, 0.22) * crescent * (1.0 - moon);
  }
  outColor = vec4(clamp(sky, 0.0, 1.0), 1.0);
}`;

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexShader));
gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentShader));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);

const skyProgram = gl.createProgram();
gl.attachShader(skyProgram, compileShader(gl.VERTEX_SHADER, skyVertexShader));
gl.attachShader(skyProgram, compileShader(gl.FRAGMENT_SHADER, skyFragmentShader));
gl.linkProgram(skyProgram);
if (!gl.getProgramParameter(skyProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(skyProgram));
const skyResolutionLocation = gl.getUniformLocation(skyProgram, 'resolution');
const skyPhaseLocation = gl.getUniformLocation(skyProgram, 'phase');
const skyElapsedLocation = gl.getUniformLocation(skyProgram, 'elapsed');

const city = createCity();
window.__solmar = { ...city.features, districtNames: city.districts.map((district) => district.name) };
const vertices = new Float32Array(city.vertices);
window.__solmar.geometry = { staticVertices: vertices.length / 11, colliders: city.colliders.length, treeShadows: city.shadeTrees.length };
const stride = 11 * Float32Array.BYTES_PER_ELEMENT;

const cityBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cityBuffer);
gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

const actorBuffer = gl.createBuffer();
const actorCapacity = 4096;
gl.bindBuffer(gl.ARRAY_BUFFER, actorBuffer);
gl.bufferData(gl.ARRAY_BUFFER, actorCapacity * 11 * Float32Array.BYTES_PER_ELEMENT, gl.DYNAMIC_DRAW);

for (const [name, size, offset] of [['position', 3, 0], ['normal', 3, 12], ['tint', 4, 24], ['kind', 1, 40]]) {
  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
}

const viewProjection = mat4(), projection = mat4(), view = mat4(), model = mat4();
const viewProjectionLocation = gl.getUniformLocation(program, 'viewProjection');
const modelLocation = gl.getUniformLocation(program, 'model');
const sunLocation = gl.getUniformLocation(program, 'sunDirection');
const eyeLocation = gl.getUniformLocation(program, 'eye');
const skyLocation = gl.getUniformLocation(program, 'sky');
const nightLocation = gl.getUniformLocation(program, 'night');
const sunsetLocation = gl.getUniformLocation(program, 'sunset');
const timeLocation = gl.getUniformLocation(program, 'timeOfDay');

const camera = { yaw: -0.72, pitch: 0.72, distance: 1900, target: [0, 0, 0], drag: false, x: 0, y: 0 };
const actor = { x: 118, z: 75, facing: 0 };
const pedestrians = [
  { x: -90, z: -70, phase: 0.2, color: [0.77, 0.39, 0.27, 1] },
  { x: 180, z: 46, phase: 2.4, color: [0.17, 0.35, 0.39, 1] },
  { x: -180, z: 205, phase: 4.2, color: [0.82, 0.68, 0.43, 1] },
  { x: 295, z: -12, phase: 5.6, color: [0.43, 0.31, 0.23, 1] },
];
const keys = new Set();
let phase = 0;
let elapsed = 0;
let previousTime = performance.now();
let frameNumber = 0;
let lastRenderTime = 0;
let renderingPaused = false;

window.__solmar.pauseRendering = () => { renderingPaused = true; };
window.__solmar.resumeRendering = () => {
  if (!renderingPaused) return;
  renderingPaused = false;
  previousTime = performance.now();
  lastRenderTime = 0;
  requestAnimationFrame(frame);
};

const modeLabels = ['12:18 PM · SCORCHING CLEAR', '6:42 PM · GOLDEN HOUR', '11:46 PM · MOONLIT'];
function setPhase(value) {
  phase = value;
  document.querySelectorAll('.mode button').forEach((button, index) => button.setAttribute('aria-pressed', String(index === value)));
  document.querySelector('#clock').textContent = modeLabels[value];
  document.body.dataset.phase = ['day', 'sunset', 'night'][value];
  window.__solmar.phase = ['day', 'sunset', 'night'][value];
}

function drawSky() {
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.useProgram(skyProgram);
  gl.uniform2f(skyResolutionLocation, canvas.width, canvas.height);
  gl.uniform1f(skyPhaseLocation, phase);
  gl.uniform1f(skyElapsedLocation, elapsed);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.useProgram(program);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
}

for (const [id, value] of [['day', 0], ['sunset', 1], ['night', 2]]) {
  document.querySelector(`#${id}`).addEventListener('click', () => setPhase(value));
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);
  if (key === 'd') setPhase(0);
  if (key === 's') setPhase(1);
  if (key === 'n') setPhase(2);
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());

canvas.addEventListener('pointerdown', (event) => {
  camera.drag = true;
  camera.x = event.clientX;
  camera.y = event.clientY;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointerup', () => { camera.drag = false; });
canvas.addEventListener('pointercancel', () => { camera.drag = false; });
canvas.addEventListener('pointermove', (event) => {
  if (!camera.drag) return;
  camera.yaw -= (event.clientX - camera.x) * 0.004;
  camera.pitch = Math.max(0.35, Math.min(1.27, camera.pitch + (event.clientY - camera.y) * 0.003));
  camera.x = event.clientX;
  camera.y = event.clientY;
});
canvas.addEventListener('wheel', (event) => {
  camera.distance = Math.max(900, Math.min(2900, camera.distance + event.deltaY));
}, { passive: true });

function buildActors(time) {
  const list = [];
  const pushTriangle = (a, b, c, normal, color, kind = 1) => {
    for (const point of [a, b, c]) list.push(...point, ...normal, ...color, kind);
  };
  const pushQuad = (a, b, c, d, normal, color, kind = 1) => {
    pushTriangle(a, b, c, normal, color, kind);
    pushTriangle(a, c, d, normal, color, kind);
  };
  const pushBox = (x, y, z, width, height, depth, color, kind = 1) => {
    const X = x + width, Y = y + height, Z = z + depth;
    pushQuad([x, y, Z], [X, y, Z], [X, Y, Z], [x, Y, Z], [0, 0, 1], color, kind);
    pushQuad([X, y, z], [x, y, z], [x, Y, z], [X, Y, z], [0, 0, -1], color, kind);
    pushQuad([x, y, z], [x, y, Z], [x, Y, Z], [x, Y, z], [-1, 0, 0], color, kind);
    pushQuad([X, y, Z], [X, y, z], [X, Y, z], [X, Y, Z], [1, 0, 0], color, kind);
    pushQuad([x, Y, Z], [X, Y, Z], [X, Y, z], [x, Y, z], [0, 1, 0], color, kind);
    pushQuad([x, y, z], [X, y, z], [X, y, Z], [x, y, Z], [0, -1, 0], color, kind);
  };
  const pushSphere = (cx, cy, cz, radius, color) => {
    const segments = 10, rings = 6;
    for (let row = 0; row < rings; row++) for (let col = 0; col < segments; col++) {
      const phi0 = Math.PI * row / rings, phi1 = Math.PI * (row + 1) / rings;
      const theta0 = col * Math.PI * 2 / segments, theta1 = (col + 1) * Math.PI * 2 / segments;
      const point = (phi, theta) => [cx + radius * Math.sin(phi) * Math.cos(theta), cy + radius * Math.cos(phi), cz + radius * Math.sin(phi) * Math.sin(theta)];
      const normal = (p) => [(p[0] - cx) / radius, (p[1] - cy) / radius, (p[2] - cz) / radius];
      const a = point(phi0, theta0), b = point(phi1, theta0), d = point(phi0, theta1), e = point(phi1, theta1);
      pushTriangle(a, d, b, normal(a), color);
      pushTriangle(d, e, b, normal(e), color);
    }
  };

  function groundHeight(x, z) {
    if (x > -365 && x < 395 && z > -280 && z < 280) {
      if (x > -132 && x < 132 && z > -252 && z < -106) return 8;
      if (Math.abs(x - 0) < 39 || Math.abs(z + 2) < 33) return 6;
      return 4;
    }
    for (let grid = -1800; grid <= 1800; grid += 300) {
      if (Math.abs(x - grid) < 46) return 5;
      if (Math.abs(x - grid) < 56) return 7;
    }
    for (let grid = -1650; grid <= 1650; grid += 300) {
      if (Math.abs(z - grid) < 44) return 5;
      if (Math.abs(z - grid) < 54) return 7;
    }
    return -2;
  }

  function person(x, z, facing, color, walking, isPlayer = false) {
    const gait = walking ? Math.sin(time * 7.2 + x * 0.04) * 5.5 : 0;
    const armSwing = walking ? Math.sin(time * 7.2 + x * 0.04 + Math.PI) * 5 : 0;
    const floor = groundHeight(x, z);
    pushBox(x - 6, floor + 1, z - 6, 31, 1, 17, [0.07, 0.09, 0.09, 1]);
    pushBox(x - 9 + gait, floor, z - 5, 7, 8, 7, [0.09, 0.13, 0.15, 1]);
    pushBox(x + 2 - gait, floor, z - 5, 7, 8, 7, [0.09, 0.13, 0.15, 1]);
    pushBox(x - 9, floor + 8, z - 5, 18, 26, 11, color);
    pushBox(x - 7 - armSwing, floor + 9, z + 1, 6, 23, 6, color);
    pushBox(x + 2 + armSwing, floor + 9, z + 1, 6, 23, 6, color);
    pushSphere(x, floor + 40, z, 9, [0.68, 0.42, 0.30, 1]);
    if (isPlayer) {
      pushBox(x - 9, floor + 18, z + 4, 18, 3, 2, [0.90, 0.53, 0.34, 1]);
      pushBox(x - 5, floor + 45, z - 7, 10, 3, 3, [0.11, 0.19, 0.19, 1]);
    }
    return { x, z, facing, floor };
  }

  const people = [person(actor.x, actor.z, actor.facing, [0.14, 0.27, 0.28, 1], keys.size > 0, true)];
  pedestrians.forEach((pedestrian) => {
    const path = pedestrian.phase + time * 0.25;
    const x = pedestrian.x + Math.sin(path) * 30;
    const z = pedestrian.z + Math.cos(path) * 18;
    people.push(person(x, z, path, pedestrian.color, true));
  });

  gl.bindBuffer(gl.ARRAY_BUFFER, actorBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(list));
  gl.enable(gl.POLYGON_OFFSET_FILL);
  gl.polygonOffset(1, 1);
  gl.uniformMatrix4fv(modelLocation, false, model);
  gl.drawArrays(gl.TRIANGLES, 0, list.length / 11);
  gl.disable(gl.POLYGON_OFFSET_FILL);
  return people;
}

function drawShadows(people, sunDirection) {
  const directionLength = Math.hypot(sunDirection[0], sunDirection[2]) || 1;
  const shiftX = -sunDirection[0] / directionLength;
  const shiftZ = -sunDirection[2] / directionLength;
  const shadowVertices = [];
  const addShadow = (x, z, length, width, opacity, floor = 5) => {
    const dx = shiftX * length, dz = shiftZ * length;
    const px = -shiftZ * width, pz = shiftX * width;
    const center = [x + dx * 0.48, floor + 0.65, z + dz * 0.48];
    const shade = [0.035, 0.055, 0.058, opacity];
    for (let segment = 0; segment < 18; segment++) {
      const angle0 = segment * Math.PI * 2 / 18, angle1 = (segment + 1) * Math.PI * 2 / 18;
      const point = (angle) => [
        center[0] + Math.cos(angle) * px * 0.9 + Math.sin(angle) * dx * 0.45,
        center[1],
        center[2] + Math.cos(angle) * pz * 0.9 + Math.sin(angle) * dz * 0.45,
      ];
      for (const vertex of [center, point(angle0), point(angle1)]) shadowVertices.push(...vertex, 0, 1, 0, ...shade, 8);
    }
  };

  for (const person of people) {
    const treeShade = city.shadeTrees.find((tree) => Math.hypot(tree.x - person.x, tree.z - person.z) < tree.radius + 26);
    addShadow(person.x, person.z, treeShade ? 28 : 46, 8, treeShade ? 0.28 : 0.74, person.floor);
  }
  for (const tree of city.shadeTrees) addShadow(tree.x, tree.z, 72, tree.radius * 0.52, 0.35);

  gl.bindBuffer(gl.ARRAY_BUFFER, actorBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(shadowVertices));
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.uniformMatrix4fv(modelLocation, false, model);
  gl.drawArrays(gl.TRIANGLES, 0, shadowVertices.length / 11);
  gl.enable(gl.CULL_FACE);
  gl.depthMask(true);
  gl.disable(gl.BLEND);
}

function buildingAt(x, z) {
  return city.colliders.some((obstacle) =>
    x > obstacle.minX - 22 && x < obstacle.maxX + 22 && z > obstacle.minZ - 22 && z < obstacle.maxZ + 22);
}

function nearestOpenPosition(x, z) {
  const directions = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let radius = 0; radius <= 260; radius += 24) {
    for (const [dx, dz] of directions) {
      const testX = Math.max(-1770, Math.min(1085, x + dx * radius));
      const testZ = Math.max(-1640, Math.min(1640, z + dz * radius));
      if (!buildingAt(testX, testZ)) return [testX, testZ];
    }
  }
  return [actor.x, actor.z];
}

function moveActor(delta) {
  const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
  const sideways = Number(keys.has('d')) - Number(keys.has('a'));
  if (forward === 0 && sideways === 0) return;
  const stride = (keys.has('shift') ? 180 : 112) * delta;
  const dx = (Math.sin(camera.yaw) * forward + Math.cos(camera.yaw) * sideways) * stride;
  const dz = (Math.cos(camera.yaw) * forward - Math.sin(camera.yaw) * sideways) * stride;
  const nextX = Math.max(-1770, Math.min(1085, actor.x + dx));
  const nextZ = Math.max(-1640, Math.min(1640, actor.z + dz));
  if (!buildingAt(nextX, actor.z)) actor.x = nextX;
  if (!buildingAt(actor.x, nextZ)) actor.z = nextZ;
  actor.facing = Math.atan2(dx, dz);
  window.__solmar.player = { x: Math.round(actor.x), z: Math.round(actor.z) };
}

function frame(now) {
  if (renderingPaused) return;
  requestAnimationFrame(frame);
  if (now - lastRenderTime < 34) return;
  const delta = Math.min(0.05, (now - previousTime) / 1000);
  previousTime = now;
  lastRenderTime = now;
  elapsed += delta;
  moveActor(delta);

  const width = canvas.clientWidth, height = canvas.clientHeight;
  const pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  if (canvas.width !== Math.round(width * pixelRatio) || canvas.height !== Math.round(height * pixelRatio)) {
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  const isNight = phase === 2, isSunset = phase === 1;
  const sunAngle = isNight ? -0.72 : isSunset ? 0.53 : 0.93;
  const sunDirection = [Math.cos(sunAngle), Math.sin(sunAngle), 0.43];
  const night = isNight ? 1 : isSunset ? 0.2 : 0;
  const dusk = isSunset ? 1 : 0;
  const sky = isNight ? [0.018, 0.038, 0.075] : isSunset ? [0.74, 0.39, 0.25] : [0.48, 0.72, 0.83];

  gl.clearColor(...sky, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawSky();
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.disable(gl.BLEND);

  const target = [actor.x, 160, actor.z];
  let cameraPosition = [
    target[0] + Math.sin(camera.yaw) * Math.cos(camera.pitch) * camera.distance,
    Math.sin(camera.pitch) * camera.distance + 210,
    target[2] + Math.cos(camera.yaw) * Math.cos(camera.pitch) * camera.distance,
  ];
  const rayDistance = (origin, end, bounds) => {
    const delta = [end[0] - origin[0], end[1] - origin[1], end[2] - origin[2]];
    let enter = 0, exit = 1;
    for (const [axis, low, high] of [[0, bounds.minX, bounds.maxX], [1, 0, bounds.top], [2, bounds.minZ, bounds.maxZ]]) {
      if (Math.abs(delta[axis]) < 0.0001) {
        if (origin[axis] < low || origin[axis] > high) return Infinity;
      } else {
        let near = (low - origin[axis]) / delta[axis], far = (high - origin[axis]) / delta[axis];
        if (near > far) [near, far] = [far, near];
        enter = Math.max(enter, near);
        exit = Math.min(exit, far);
        if (enter > exit) return Infinity;
      }
    }
    return enter >= 0 && enter <= 1 && exit >= 0 ? enter : Infinity;
  };
  let wallFraction = 1;
  for (const obstacle of city.colliders) wallFraction = Math.min(wallFraction, rayDistance(target, cameraPosition, obstacle));
  const collisionAdjusted = wallFraction < 1;
  if (collisionAdjusted) {
    const scale = Math.max(0.015, wallFraction - 0.025);
    cameraPosition = target.map((point, axis) => point + (cameraPosition[axis] - point) * scale);
  }
  const clippedByBuilding = city.colliders.some((obstacle) =>
    cameraPosition[0] >= obstacle.minX && cameraPosition[0] <= obstacle.maxX
    && cameraPosition[1] >= 0 && cameraPosition[1] <= obstacle.top
    && cameraPosition[2] >= obstacle.minZ && cameraPosition[2] <= obstacle.maxZ);
  window.__solmar.camera = {
    clearOfBuildings: !clippedByBuilding,
    clippedByBuilding,
    collisionAdjusted,
    wallFraction: Number(wallFraction.toFixed(4)),
  };
  window.__solmar.camera.position = cameraPosition.map((value) => Math.round(value));
  window.__solmar.camera.target = target.map((value) => Math.round(value));
  lookAt(view, cameraPosition, target, [0, 1, 0]);
  perspective(projection, Math.PI / 3, canvas.width / canvas.height, 1, 10000);
  multiply(viewProjection, projection, view);
  identity(model);
  gl.uniformMatrix4fv(viewProjectionLocation, false, viewProjection);
  gl.uniform3fv(sunLocation, sunDirection);
  gl.uniform3fv(eyeLocation, cameraPosition);
  gl.uniform3fv(skyLocation, sky);
  gl.uniform1f(nightLocation, night);
  gl.uniform1f(sunsetLocation, dusk);
  gl.uniform1f(timeLocation, elapsed);

  gl.bindBuffer(gl.ARRAY_BUFFER, cityBuffer);
  for (const [name, size, offset] of [['position', 3, 0], ['normal', 3, 12], ['tint', 4, 24], ['kind', 1, 40]]) {
    gl.vertexAttribPointer(gl.getAttribLocation(program, name), size, gl.FLOAT, false, stride, offset);
  }
  gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 11);

  gl.bindBuffer(gl.ARRAY_BUFFER, actorBuffer);
  for (const [name, size, offset] of [['position', 3, 0], ['normal', 3, 12], ['tint', 4, 24], ['kind', 1, 40]]) {
    gl.vertexAttribPointer(gl.getAttribLocation(program, name), size, gl.FLOAT, false, stride, offset);
  }
  const people = buildActors(elapsed);
  drawShadows(people, sunDirection);
  window.__solmar.actors = { playerAndPedestrians: people.length, movingShadows: people.length, sunDirection };
  if (frameNumber++ % 20 === 0) updateDistrict(actor.x, actor.z);
}

function updateDistrict(x = actor.x, z = actor.z) {
  const selected = city.districts.reduce((best, district) => {
    const distance = (district.x - x) ** 2 + (district.z - z) ** 2;
    return distance < best.distance ? { name: district.name, distance } : best;
  }, { name: 'Glasspoint', distance: Infinity });
  document.querySelector('#district').textContent = selected.name;
  window.__solmar.player = { x: Math.round(actor.x), z: Math.round(actor.z) };
  document.querySelectorAll('.districts button').forEach((button) => {
    if (button.textContent === selected.name) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
}

const query = new URLSearchParams(location.search);
function setCameraPreset(preset) {
if (preset === 'park') {
    actor.x = 0;
    actor.z = 0;
    camera.yaw = -0.92;
    camera.pitch = 0.66;
    camera.distance = 740;
  } else {
    if (preset === 'city' || preset === 'solmar') {
      actor.x = 118;
      actor.z = 75;
    }
    camera.yaw = -0.84;
    camera.pitch = 0.40;
    camera.distance = 2300;
  }
  updateDistrict();
}
window.__solmar.setCameraPreset = setCameraPreset;
setPhase(0);
if (query.get('mode') === 'night') setPhase(2);
if (query.get('mode') === 'sunset') setPhase(1);
if (query.get('mode') === 'day') setPhase(0);
if (query.has('shot')) setCameraPreset(query.get('shot'));
if (query.has('district')) document.querySelector('#district').textContent = query.get('district');
document.querySelectorAll('.districts button').forEach((button) => {
  button.addEventListener('click', () => {
    [actor.x, actor.z] = nearestOpenPosition(Number(button.dataset.x), Number(button.dataset.z));
    updateDistrict(actor.x, actor.z);
  });
});
frame(previousTime);
