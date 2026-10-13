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

    // Chairs: scattered at random angles; each has its own moment to turn.
    this.chairs = room.buildChairs(data.chairs.positions);
    let seed = 13;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    this.chairState = data.chairs.positions.map(([x, z], i) => {
      const yaw = rnd() * Math.PI * 2;
      this.chairs.setYaw(i, yaw);
      return { yaw, facing: Math.atan2(x, z), threshold: rnd(), turned: false };
    });
    this.chairs.commit();

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
   * Advances lights and chairs.
   * @param {number} progress 0..1 of the shift elapsed
   * @param {boolean} lookingAway whether the player is turned from the screen
   */
  update(progress, lookingAway) {
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

    // Chairs turn only while unwatched.
    if (!lookingAway) {
      const due = this.ramp(progress, this.data.chairs.start, this.data.chairs.end);
      let moved = false;
      this.chairState.forEach((s, i) => {
        if (!s.turned && s.threshold < due) {
          s.turned = true;
          this.chairs.setYaw(i, s.facing);
          moved = true;
        }
      });
      if (moved) this.chairs.commit();
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
