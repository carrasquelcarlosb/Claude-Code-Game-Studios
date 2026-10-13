import * as THREE from 'three';
import { ps2ify, makeTexture } from './ps2.js';

/**
 * The figure: too tall, too thin, office clothes, and Management's stone mask for a face.
 * Low-poly and PS2-rendered like everything else. It is only drawn into the
 * CRT reflection and the webcam feed, until the very end.
 */


/**
 * Paints Management's face onto a 2D context: a monumental plaster mask in
 * the manner of 1930s propaganda sculpture. It is meant to be calm, not
 * angry: a smooth egg of a skull, broad cheekbones, a blank half-lidded
 * stare, full lips set neutral. All form comes from soft light and shadow
 * (no outlines, no furrows), with a few hairline cracks. A style, not a
 * portrait of anyone.
 * Shared by the 3D head texture and the full-screen CRT scare frame.
 * @param {CanvasRenderingContext2D} c
 * @param {number} x left
 * @param {number} y top
 * @param {number} w width
 * @param {number} h height
 */
export function paintFace(c, x, y, w, h) {
  const X = (u) => x + u * w, Y = (v) => y + v * h;
  // Soft-edged elliptical light or shadow: alpha fades to nothing at the rim.
  const soft = (u, v, ru, rv, rgb, a) => {
    c.save();
    c.translate(X(u), Y(v)); c.scale(ru * w, rv * h);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill();
    c.restore();
  };
  const DARK = '38,35,30', LIGHT = '250,247,238';

  // Silhouette: one smooth curve, high dome, slight narrowing at the temples,
  // broad cheekbones, a heavy rounded jaw.
  const outline = () => {
    c.beginPath();
    c.moveTo(X(0.5), Y(0.01));
    c.bezierCurveTo(X(0.8), Y(0.01), X(0.93), Y(0.2), X(0.91), Y(0.42));
    c.bezierCurveTo(X(0.9), Y(0.5), X(0.93), Y(0.6), X(0.88), Y(0.72));
    c.bezierCurveTo(X(0.87), Y(0.88), X(0.72), Y(0.99), X(0.5), Y(0.99)); // broad jaw
    c.bezierCurveTo(X(0.28), Y(0.99), X(0.13), Y(0.88), X(0.12), Y(0.72));
    c.bezierCurveTo(X(0.07), Y(0.6), X(0.1), Y(0.5), X(0.09), Y(0.42));
    c.bezierCurveTo(X(0.07), Y(0.2), X(0.2), Y(0.01), X(0.5), Y(0.01));
    c.closePath();
  };
  c.save();
  outline();
  c.fillStyle = '#d3cec2'; c.fill();
  c.clip();

  // Form: light falls from above and slightly left, like a lit facade.
  const side = c.createLinearGradient(X(0.05), 0, X(0.95), 0);
  side.addColorStop(0, `rgba(${DARK},0.45)`); side.addColorStop(0.28, `rgba(${DARK},0)`);
  side.addColorStop(0.72, `rgba(${DARK},0)`); side.addColorStop(1, `rgba(${DARK},0.55)`);
  c.fillStyle = side; c.fillRect(x, y, w, h);
  soft(0.46, 0.2, 0.34, 0.2, LIGHT, 0.55);        // dome catches the light
  soft(0.5, 0.97, 0.4, 0.1, DARK, 0.35);          // underside of the jaw
  soft(0.2, 0.44, 0.1, 0.12, DARK, 0.25);         // temples
  soft(0.8, 0.44, 0.1, 0.12, DARK, 0.3);

  // Brow ridge: a smooth band of light over a soft shadowed brow line.
  soft(0.5, 0.385, 0.38, 0.06, LIGHT, 0.7);
  soft(0.5, 0.465, 0.36, 0.055, DARK, 0.55);

  // Deep sockets, then the eyes: almond-shaped, half-lidded, blank.
  for (const u of [0.34, 0.66]) {
    soft(u, 0.51, 0.15, 0.085, DARK, 0.95);
    c.fillStyle = '#0c0b0a';
    c.beginPath();
    c.moveTo(X(u - 0.09), Y(0.515));
    c.quadraticCurveTo(X(u), Y(0.482), X(u + 0.09), Y(0.515));
    c.quadraticCurveTo(X(u), Y(0.545), X(u - 0.09), Y(0.515));
    c.fill();
    // The heavy upper lid: a lit, rounded fold resting low over the eye.
    soft(u, 0.482, 0.1, 0.014, LIGHT, 0.35);
    // Cheekbone beneath: catches light.
    soft(u + (u < 0.5 ? -0.03 : 0.03), 0.6, 0.12, 0.06, LIGHT, 0.4);
  }

  // Nose: a long lit bridge, one shadowed flank, a broad shadowed base.
  soft(0.5, 0.6, 0.035, 0.13, LIGHT, 0.55);
  soft(0.44, 0.63, 0.035, 0.1, DARK, 0.35);
  soft(0.5, 0.735, 0.1, 0.03, DARK, 0.55);
  soft(0.46, 0.728, 0.022, 0.012, DARK, 0.85);
  soft(0.54, 0.728, 0.022, 0.012, DARK, 0.85);

  // Soft folds from the nose to the mouth corners.
  soft(0.36, 0.79, 0.04, 0.08, DARK, 0.25);
  soft(0.64, 0.79, 0.04, 0.08, DARK, 0.25);

  // Mouth: full lips, closed, set level. Only the very corners fall.
  soft(0.5, 0.81, 0.15, 0.028, DARK, 0.45);        // full upper lip
  c.strokeStyle = 'rgba(22,20,17,0.85)'; c.lineWidth = Math.max(1, 0.012 * w); c.lineCap = 'round';
  c.beginPath();
  c.moveTo(X(0.34), Y(0.845));
  c.bezierCurveTo(X(0.42), Y(0.83), X(0.58), Y(0.83), X(0.66), Y(0.845));
  c.stroke();
  soft(0.5, 0.865, 0.13, 0.026, LIGHT, 0.6);       // full lower lip catches light
  soft(0.5, 0.9, 0.11, 0.022, DARK, 0.55);         // shadow under the lip
  soft(0.5, 0.94, 0.12, 0.035, LIGHT, 0.35);       // chin

  // Hairline plaster cracks, faint and fixed.
  c.strokeStyle = 'rgba(70,66,58,0.4)'; c.lineWidth = Math.max(1, 0.004 * w);
  for (const pts of [
    [[0.25, 0.12], [0.29, 0.2], [0.27, 0.27], [0.31, 0.34]],
    [[0.76, 0.6], [0.8, 0.67], [0.78, 0.74]],
    [[0.6, 0.9], [0.63, 0.95]],
  ]) {
    c.beginPath(); pts.forEach(([u, v], i) => (i ? c.lineTo(X(u), Y(v)) : c.moveTo(X(u), Y(v)))); c.stroke();
  }
  c.restore();
}

/**
 * Paints a wall of YES behind everything Management shows: rows of block
 * letters on dark, like a propaganda facade.
 * @param {CanvasRenderingContext2D} c
 * @param {number} W width
 * @param {number} H height
 * @param {string} [fg] letter colour
 */
export function paintYesWall(c, W, H, fg = '#bdbab2') {
  c.fillStyle = '#1b1b1a'; c.fillRect(0, 0, W, H);
  c.fillStyle = fg;
  c.font = 'bold 20px Arial, Helvetica, sans-serif';
  c.textBaseline = 'top';
  for (let row = 0, y = 4; y < H; row++, y += 22) {
    for (let x = 4; x < W; x += 46) c.fillText('YES', x, y);
  }
  c.textBaseline = 'alphabetic';
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
  // Transparent around the silhouette so the mask sits on a rounded head, not a slab.
  const faceTex = makeTexture(128, 160, (c, w, h) => { c.clearRect(0, 0, w, h); paintFace(c, 0, 0, w, h); });
  faceTex.wrapS = faceTex.wrapT = THREE.ClampToEdgeWrapping;
  const face = new THREE.MeshBasicMaterial({ map: faceTex, fog: false, transparent: true, alphaTest: 0.5 });

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
  // A low-poly egg of a head: the bald dome from the mask, in the same stone.
  const head = part(new THREE.SphereGeometry(0.5, 8, 6), skin, 0, 0.97, 0, upper);
  head.scale.set(0.27, 0.36, 0.25);
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.34), face);
  // Child of the scaled head, so position in unit-sphere space: just proud of the front.
  facePlane.scale.set(1 / 0.27, 1 / 0.36, 1); facePlane.position.set(0, 0, -0.52); facePlane.rotation.y = Math.PI;
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
