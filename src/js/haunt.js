import { FONT, FONT_MONO } from './os.js';

/**
 * The haunting: slow, escalating wrongness through the shift, driven by
 * shift progress and by the player looking away. Four systems:
 *
 * - Lights out: ceiling lights die from the far edge of the office towards the
 *   player's desk, a bank at a time, each with a distant breaker clunk.
 * - Chairs: empty chairs in the aisles turn to face the player's cubicle, only
 *   ever while the player is facing the screen.
 * - R12.txt: the previous operator's log appears on the desktop and gains a
 *   line about tonight every time the player looks away.
 * - Echo: someone else's keyboard answers the player's keystrokes, a beat late,
 *   from behind, closer as the shift goes on.
 *
 * Tuning and text live in data/haunt.json.
 */
export class Haunt {
  /**
   * @param {object} data parsed haunt.json
   * @param {object} deps
   * @param {ReturnType<import('./room.js').buildRoom>} deps.room
   * @param {import('./audio.js').Ambience} deps.audio
   * @param {import('./os.js').WorkOS} deps.os
   * @param {number} deps.round current round, for the log lines
   */
  constructor(data, { room, audio, os, round }) {
    Object.assign(this, { data, room, audio, os, round });

    // Lights: remember each panel's distance from the desk.
    this.panels = room.panels;
    this.panelDist = room.panels.userData.cells.map((c) => Math.hypot(c.x, c.z));
    this.panelOn = this.panelDist.map(() => true);
    this.lastBand = Infinity;
    this.darkness = 0;

    // Chairs: every one starts in its right place, facing its own desk.
    const C = data.chairs;
    this.chairs = room.buildChairs(C.homes.length);
    let seed = 13;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const deg = Math.PI / 180;
    const arc = C.gather.arcDeg * deg;
    this.chairState = C.homes.map(([x, z], i) => {
      // Where this chair ends up: a slot in a two-row semicircle behind the
      // player's chair (+Z is behind), facing the player.
      const row = i % C.gather.radii.length;
      const perRow = Math.ceil(C.homes.length / C.gather.radii.length);
      const slot = Math.floor(i / C.gather.radii.length);
      const a = -arc / 2 + arc * ((slot + 0.5 * (row % 2)) / Math.max(1, perRow - 1));
      const R = C.gather.radii[row];
      const gx = Math.sin(a) * R, gz = Math.cos(a) * R;
      const askew = (C.askewDeg[0] + rnd() * (C.askewDeg[1] - C.askewDeg[0])) * deg * (rnd() < 0.5 ? -1 : 1);
      const s = {
        // Each level's pose: [x, z, yaw]. Yaw atan2(x, z) faces the origin.
        poses: [[x, z, 0], [x, z, askew], [x, z, Math.atan2(x, z)], [gx, gz, Math.atan2(gx, gz)]],
        offset: rnd() * C.spread, // when this chair starts misbehaving, relative to the others
        level: 0,
      };
      this.chairs.setPose(i, ...s.poses[0]);
      return s;
    });
    this.chairs.commit();
    /** Set when the finale starts: the chairs come to the player. */
    this.finale = false;

    // R12.txt
    this.log = data.r12.lines.slice();
    this.lapseIndex = 0;
  }

  /** Smoothstep of progress between two points. */
  ramp(p, a, b) {
    const t = Math.min(1, Math.max(0, (p - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  /**
   * How far the chairs have strayed. Rises through the shift up to
   * `shiftMax` (askew, then facing the player), then jumps past every
   * chair's final threshold once the finale starts (gathered).
   * Chair i's level = floor((oddness - offset_i) / stepWidth), clamped to 0..3.
   * @param {number} progress 0..1 of the shift elapsed
   * @returns {number}
   */
  chairOddness(progress) {
    const C = this.data.chairs;
    return this.finale ? C.finaleOddness : this.ramp(progress, C.shiftStart, C.shiftEnd) * C.shiftMax;
  }

  /**
   * Moves chairs on to their next level of wrongness. Only while the player
   * faces the screen, so a chair is never seen to move; levels only rise.
   * Runs during the finale too.
   * @param {number} progress 0..1 of the shift elapsed
   * @param {boolean} lookingAway
   */
  updateChairs(progress, lookingAway) {
    if (lookingAway) return;
    const odd = this.chairOddness(progress), step = this.data.chairs.stepWidth;
    let moved = false;
    this.chairState.forEach((s, i) => {
      const level = Math.min(3, Math.max(0, Math.floor((odd - s.offset) / step)));
      if (level > s.level) {
        s.level = level;
        this.chairs.setPose(i, ...s.poses[level]);
        moved = true;
      }
    });
    if (moved) this.chairs.commit();
  }

  /**
   * Advances the dying lights.
   * @param {number} progress 0..1 of the shift elapsed
   */
  update(progress) {
    // Lights: everything beyond the radius goes dark.
    const L = this.data.lightsOut;
    const k = this.ramp(progress, L.start, L.end);
    const radius = L.fromRadius + (L.toRadius - L.fromRadius) * k;
    /** 0..1 how far the dark has come; feeds the office gloom. */
    this.darkness = k * L.gloomWeight;
    let changed = false;
    this.panelDist.forEach((d, i) => {
      const on = d <= radius;
      if (on !== this.panelOn[i]) {
        this.panelOn[i] = on;
        this.panels.setColorAt(i, this.dim(on));
        changed = true;
      }
    });
    if (changed) {
      this.panels.instanceColor.needsUpdate = true;
      // One clunk per 4 m band, from roughly where the dark now begins.
      const band = Math.floor(radius / 4);
      if (band < this.lastBand) {
        this.lastBand = band;
        const a = Math.random() * Math.PI * 2;
        this.audio.breaker([Math.sin(a) * radius, 2.6, Math.cos(a) * radius]);
      }
    }
  }

  dim(on) {
    this._c ||= this.panels.material.color.clone();
    const c = this._c.clone().setScalar(on ? 1 : 0.035);
    return c;
  }

  /**
   * Echoes a keystroke from someone else's keyboard, once the shift is far
   * enough along. Chance and closeness both grow with progress.
   * @param {number} progress 0..1
   */
  onKey(progress) {
    const E = this.data.echo;
    const k = this.ramp(progress, E.start, E.full);
    if (k <= 0 || Math.random() > k) return;
    const z = E.fromZ + (E.toZ - E.fromZ) * k;
    const x = (Math.random() - 0.5) * 1.2;
    const delay = E.delay[0] + Math.random() * (E.delay[1] - E.delay[0]);
    this.audio.echoClack([x, 0.8, z], delay);
  }

  /** Called when the player turns back to the screen after looking away. */
  onLapseEnd() {
    const list = this.data.r12.onLapse;
    const ev = list[Math.min(this.lapseIndex, list.length - 1)];
    this.lapseIndex++;
    if (!ev) return;
    if (ev.icon || ev.append || ev.open) this.installLog();
    if (ev.append) this.log.push(ev.append.replace('{round}', this.round));
    if (ev.cursor) this.os.cursor = { x: 40 + Math.random() * 240, y: 40 + Math.random() * 150 };
    if (ev.open && !this.os.lockdown) this.os.open('r12');
  }

  /** Puts R12.txt on the desktop (once). */
  installLog() {
    if (this.os.programs.some((p) => p.id === 'r12')) return;
    const log = this.log, title = this.data.r12.title;
    this.os.install({
      id: 'r12', title, icon: 'txt', color: '#f4f4f0',
      create: () => ({
        title: `${title} - Notepad`,
        rect: { x: 14, y: 40, w: 290, h: 150 },
        draw(c, r) {
          c.fillStyle = '#fff'; c.fillRect(0, 0, r.w, r.h);
          c.fillStyle = '#000'; c.font = FONT_MONO;
          const fit = Math.floor((r.h - 6) / 11);
          log.slice(Math.max(0, log.length - fit)).forEach((l, i) => c.fillText(l, 4, 12 + i * 11));
          c.font = FONT;
        },
      }),
    });
  }
}
