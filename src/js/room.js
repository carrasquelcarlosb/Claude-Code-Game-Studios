import * as THREE from 'three';
import { ps2ify, makeTexture } from './ps2.js';

/**
 * Builds the liminal office: the player's desk and CRT, plus an endless-looking
 * grid of identical empty cubicles fading into fog.
 */

// --- Procedural textures -------------------------------------------------

function speckle(ctx, w, h, base, spread, seed = 1) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w * h * 0.6; i++) {
    const v = Math.floor((rnd() - 0.5) * spread);
    ctx.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    ctx.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 1, 1);
  }
}

const TEX = {
  carpet: () => makeTexture(32, 32, (c, w, h) => speckle(c, w, h, '#4a5250', 70, 7)),
  ceiling: () => makeTexture(32, 32, (c, w, h) => {
    speckle(c, w, h, '#b8b5a4', 30, 3);
    c.fillStyle = '#7d7a6c'; c.fillRect(0, 0, w, 1); c.fillRect(0, 0, 1, h);
  }),
  partition: () => makeTexture(16, 32, (c, w, h) => {
    speckle(c, w, h, '#6f7468', 40, 11);
    c.fillStyle = '#55594f'; c.fillRect(0, 0, w, 2);
  }),
  desk: () => makeTexture(64, 32, (c, w, h) => {
    speckle(c, w, h, '#a69a82', 25, 5);
  }),
  // The player's desk carries 12 carved tally marks: previous rounds.
  playerDesk: () => makeTexture(64, 32, (c, w, h) => {
    speckle(c, w, h, '#a69a82', 25, 5);
    c.fillStyle = '#5d533f';
    for (let i = 0; i < 12; i++) {
      const group = Math.floor(i / 5), k = i % 5, x = 40 + group * 7 + k;
      if (k === 4) c.fillRect(x - 4, 26, 6, 1); else c.fillRect(x, 23, 1, 6);
    }
  }),
  beige: () => makeTexture(16, 16, (c, w, h) => speckle(c, w, h, '#c9c2a8', 18, 9)),
  keys: () => makeTexture(64, 16, (c, w, h) => {
    c.fillStyle = '#b9b29a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#d8d2bb';
    for (let y = 1; y < h - 2; y += 3) for (let x = 1; x < w - 2; x += 3) c.fillRect(x, y, 2, 2);
  }),
};

// --- Geometry helpers ----------------------------------------------------

function lambert(map, snap, extra = {}) {
  return ps2ify(new THREE.MeshLambertMaterial({ map, ...extra }), snap);
}

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/**
 * Adds one instance per cubicle cell for a given part, offset within the cell.
 * @returns {THREE.InstancedMesh}
 */
function instancedPart(geometry, material, cells, offset, rotY = 0) {
  const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  cells.forEach((c, i) => {
    m.compose(new THREE.Vector3(c.x + offset.x, offset.y, c.z + offset.z), q, s);
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

// --- Public API -----------------------------------------------------------

/**
 * Creates the full office scene.
 * @param {object} cfg tuning.json contents
 * @param {THREE.Texture} screenTexture live texture for the player's CRT
 * @returns {{scene: THREE.Scene, screenMesh: THREE.Mesh, screenCenter: THREE.Vector3,
 *            fluorescent: THREE.PointLight, monitorLight: THREE.PointLight,
 *            overheadPanel: THREE.Mesh}}
 */
export function buildRoom(cfg, screenTexture) {
  const snap = cfg.render.vertexSnap;
  const { gridRadius: R, cubicleSpacing: S, ceilingHeight: H } = cfg.room;

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color('#141a16');
  scene.background = fogColor;
  scene.fog = new THREE.Fog(fogColor, cfg.room.fogNear, cfg.room.fogFar);

  scene.add(new THREE.AmbientLight('#9aa58c', cfg.lighting.ambientIntensity));

  // Floor and ceiling span the whole grid.
  const span = (R * 2 + 3) * S;
  const carpet = TEX.carpet(); carpet.repeat.set(span / 1.2, span / 1.2);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(span, span, 24, 24), lambert(carpet, snap));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const tiles = TEX.ceiling(); tiles.repeat.set(span / 0.6, span / 0.6);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(span, span, 24, 24), lambert(tiles, snap));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H;
  scene.add(ceiling);

  // Cubicle grid. Cell (0,0) is the player's and is built by hand below.
  const cells = [];
  for (let gx = -R; gx <= R; gx++) for (let gz = -R; gz <= R; gz++) {
    if (gx === 0 && gz === 0) continue;
    cells.push({ x: gx * S, z: gz * S });
  }
  const partMat = lambert(TEX.partition(), snap);
  const deskMat = lambert(TEX.desk(), snap);
  const beigeMat = lambert(TEX.beige(), snap);
  const deadScreen = ps2ify(new THREE.MeshLambertMaterial({ color: '#0d110f' }), snap);

  const wallFront = new THREE.BoxGeometry(2.0, 1.45, 0.06);
  const wallSide = new THREE.BoxGeometry(0.06, 1.45, 1.6);
  const deskTop = new THREE.BoxGeometry(1.6, 0.04, 0.8);
  const crtBody = new THREE.BoxGeometry(0.42, 0.38, 0.42);
  const crtFace = new THREE.PlaneGeometry(0.32, 0.24);

  scene.add(instancedPart(wallFront, partMat, cells, { x: 0, y: 0.725, z: -1.2 }));
  scene.add(instancedPart(wallSide, partMat, cells, { x: -1.0, y: 0.725, z: -0.4 }));
  scene.add(instancedPart(wallSide, partMat, cells, { x: 1.0, y: 0.725, z: -0.4 }));
  scene.add(instancedPart(deskTop, deskMat, cells, { x: 0, y: 0.74, z: -0.75 }));
  scene.add(instancedPart(crtBody, beigeMat, cells, { x: 0, y: 0.97, z: -0.92 }));
  scene.add(instancedPart(crtFace, deadScreen, cells, { x: 0, y: 0.98, z: -0.705 }));

  // Ceiling light panels on every cell; all emissive, only one real light.
  const panelGeo = new THREE.BoxGeometry(1.2, 0.03, 0.6);
  const panelMat = new THREE.MeshBasicMaterial({ color: '#e9f2dc' });
  const panels = instancedPart(panelGeo, panelMat, [...cells, { x: 0, z: 0 }], { x: 0, y: H - 0.02, z: -0.4 });
  scene.add(panels);

  // Occasional structural columns break up the repetition.
  const colGeo = new THREE.BoxGeometry(0.5, H, 0.5);
  const colCells = cells.filter((c) => (Math.round(c.x / S) % 3 === 0) && (Math.round(c.z / S) % 3 === 0));
  scene.add(instancedPart(colGeo, partMat, colCells, { x: S / 2, y: H / 2, z: S / 2 }));

  // --- The player's cubicle -------------------------------------------------
  const desk = new THREE.Group();
  scene.add(desk);
  box(2.0, 1.45, 0.06, partMat, 0, 0.725, -1.2, desk);
  box(0.06, 1.45, 1.6, partMat, -1.0, 0.725, -0.4, desk);
  box(0.06, 1.45, 1.6, partMat, 1.0, 0.725, -0.4, desk);
  box(1.6, 0.04, 0.8, lambert(TEX.playerDesk(), snap), 0, 0.74, -0.75, desk);
  for (const [x, z] of [[-0.75, -0.4], [0.75, -0.4], [-0.75, -1.1], [0.75, -1.1]]) {
    box(0.04, 0.72, 0.04, beigeMat, x, 0.36, z, desk);
  }

  // Chunky CRT: front bezel, tapered back, stand.
  const crt = new THREE.Group();
  crt.position.set(0, 0.76, -0.9);
  desk.add(crt);
  box(0.46, 0.4, 0.12, beigeMat, 0, 0.32, 0.18, crt);
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 0.34, 4, 1), beigeMat);
  back.rotation.set(Math.PI / 2, Math.PI / 4, 0);
  back.position.set(0, 0.31, -0.05);
  crt.add(back);
  box(0.24, 0.05, 0.22, beigeMat, 0, 0.025, 0.05, crt);
  box(0.08, 0.08, 0.08, beigeMat, 0, 0.09, 0.05, crt);

  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.27),
    new THREE.MeshBasicMaterial({ map: screenTexture, fog: false }),
  );
  screenMesh.position.set(0, 0.32, 0.241);
  crt.add(screenMesh);

  // Keyboard, mouse, mug, and 13 sticky notes on the bezel and partition.
  box(0.46, 0.03, 0.16, lambert(TEX.keys(), snap), 0, 0.775, -0.5, desk);
  box(0.06, 0.03, 0.1, beigeMat, 0.36, 0.775, -0.5, desk);
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.1, 6), lambert(null, snap, { color: '#e5e0d0' }));
  mug.position.set(-0.5, 0.81, -0.6);
  desk.add(mug);
  const noteColors = ['#e8e27a', '#e8e27a', '#f0b8c8', '#e8e27a'];
  for (let i = 0; i < 13; i++) {
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.075),
      lambert(null, snap, { color: noteColors[i % 4], side: THREE.DoubleSide }));
    const col = i % 5, row = Math.floor(i / 5);
    note.position.set(-0.75 + col * 0.1, 1.25 - row * 0.1, -1.165);
    note.rotation.z = ((i * 37) % 7 - 3) * 0.03;
    desk.add(note);
  }

  // Lights: one flickering tube overhead, one harsh monitor glow.
  const fluorescent = new THREE.PointLight('#e2f0d4', cfg.lighting.fluorescentIntensity, 9, 1.2);
  fluorescent.position.set(0, H - 0.1, -0.4);
  scene.add(fluorescent);
  const monitorLight = new THREE.PointLight('#8fd8e8', cfg.lighting.monitorIntensity, 2.6, 1.5);
  monitorLight.position.set(0, 1.0, -0.2);
  scene.add(monitorLight);

  const screenCenter = new THREE.Vector3();
  screenMesh.getWorldPosition(screenCenter);
  scene.updateMatrixWorld(true);
  screenMesh.getWorldPosition(screenCenter);

  return { scene, screenMesh, screenCenter, fluorescent, monitorLight, panels };
}
