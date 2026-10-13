import * as THREE from 'three';
import { ps2ify, makeTexture } from './ps2.js';

/**
 * The figure: too tall, too thin, office clothes, a pale mask of a face.
 * Low-poly and PS2-rendered like everything else. It is only drawn into the
 * CRT reflection and the webcam feed, until the very end.
 */

/**
 * Paints the face onto a 2D context: pale oval, black sockets, a thin mouth.
 * Shared by the 3D head texture and the full-screen CRT scare frame.
 * @param {CanvasRenderingContext2D} c
 * @param {number} x left
 * @param {number} y top
 * @param {number} w width
 * @param {number} h height
 */
export function paintFace(c, x, y, w, h) {
  c.fillStyle = '#d9d6cc';
  c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w * 0.42, h * 0.48, 0, 0, Math.PI * 2); c.fill();
  // Subtle shading so it is not a flat disc.
  c.fillStyle = 'rgba(80,80,70,0.25)';
  c.beginPath(); c.ellipse(x + w / 2, y + h * 0.62, w * 0.38, h * 0.3, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#050505';
  for (const ex of [0.33, 0.67]) {
    c.beginPath(); c.ellipse(x + w * ex, y + h * 0.42, w * 0.09, h * 0.08, 0, 0, Math.PI * 2); c.fill();
  }
  // The mouth: a long, thin, almost-smile.
  c.fillRect(x + w * 0.3, y + h * 0.72, w * 0.4, Math.max(1, h * 0.025));
  c.fillRect(x + w * 0.28, y + h * 0.7, w * 0.04, Math.max(1, h * 0.025));
  c.fillRect(x + w * 0.68, y + h * 0.7, w * 0.04, Math.max(1, h * 0.025));
}

/** Named placements used by the script and dread stages. */
export const POSES = {
  // Far down the open aisle behind the player (clear of partitions), facing the desk.
  aisle: { pos: [2.0, 0, 5.4], lean: 0 },
  // Two cubicles back.
  near: { pos: [1.3, 0, 2.4], lean: 0 },
  // Directly behind the chair, bent over where a head would be.
  // Hips 1.4 m back, bent ~75 degrees with the head kept level, so its face
  // sits at eye height about 35 cm behind the player, looking straight at them.
  behind: { pos: [0.1, 0, 1.4], lean: 0.94 },
};

/**
 * Builds the figure.
 * @param {number[]} snap vertex snap grid
 * @returns {THREE.Group & {pose:(name:string|null)=>void}}
 */
export function createFigure(snap) {
  const g = new THREE.Group();
  const suit = ps2ify(new THREE.MeshLambertMaterial({ color: '#2a2b2e' }), snap);
  const shirt = ps2ify(new THREE.MeshLambertMaterial({ color: '#b9b8b0' }), snap);
  const skin = ps2ify(new THREE.MeshLambertMaterial({ color: '#cfcac0' }), snap);
  // The face is unlit so it still reads, faintly, in the dark.
  const faceTex = makeTexture(32, 40, (c, w, h) => { c.fillStyle = '#2a2b2e'; c.fillRect(0, 0, w, h); paintFace(c, 0, 0, w, h); });
  faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
  const face = new THREE.MeshBasicMaterial({ map: faceTex, fog: false });

  const part = (geo, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m;
  };
  // Legs and hips.
  part(new THREE.BoxGeometry(0.11, 0.98, 0.12), suit, -0.08, 0.49, 0);
  part(new THREE.BoxGeometry(0.11, 0.98, 0.12), suit, 0.08, 0.49, 0);
  // Upper body pivots at the hips so it can bend over the chair.
  const upper = new THREE.Group(); upper.position.set(0, 1.0, 0); g.add(upper);
  part(new THREE.BoxGeometry(0.34, 0.62, 0.17), suit, 0, 0.31, 0, upper);
  part(new THREE.BoxGeometry(0.08, 0.5, 0.01), shirt, 0, 0.36, -0.09, upper);
  // Arms: too long, hanging past the knees.
  part(new THREE.BoxGeometry(0.08, 0.86, 0.08), suit, -0.22, 0.2, 0, upper);
  part(new THREE.BoxGeometry(0.08, 0.86, 0.08), suit, 0.22, 0.2, 0, upper);
  part(new THREE.BoxGeometry(0.07, 0.16, 0.05), skin, -0.22, -0.3, 0, upper);
  part(new THREE.BoxGeometry(0.07, 0.16, 0.05), skin, 0.22, -0.3, 0, upper);
  // A long neck and a head slightly too large, face towards -Z.
  part(new THREE.BoxGeometry(0.07, 0.2, 0.07), skin, 0, 0.72, 0, upper);
  const head = part(new THREE.BoxGeometry(0.24, 0.3, 0.22), skin, 0, 0.95, 0, upper);
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), face);
  facePlane.position.set(0, 0, -0.112); facePlane.rotation.y = Math.PI;
  head.add(facePlane);

  g.visible = false;

  /**
   * Places the figure at a named pose, facing the desk, or hides it with null.
   * @param {keyof POSES | null} name
   */
  g.pose = (name) => {
    g.userData.pose = name;
    if (!name) return;
    const p = POSES[name];
    g.position.set(...p.pos);
    // Face the chair (the origin); the face is on the -Z side of the head.
    g.rotation.y = Math.atan2(g.position.x, g.position.z);
    upper.rotation.x = -p.lean * 1.4;
    head.rotation.x = p.lean * 1.4; // keep the face level, eyes on the player
  };
  g.pose(null);
  return g;
}
