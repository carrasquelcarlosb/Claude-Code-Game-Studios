import { FONT, FONT_BOLD, bevel, inside, wrapText } from './os.js';

/**
 * The end of the round. Locks the OS down, opens Management's un-deletable
 * message and types the reveal out live, then tears the simulation down and
 * reboots it into the next round. Text and timing come from data/finale.json.
 *
 * Phases: shutdown -> typing -> hold -> reset -> reboot -> done.
 */
export class Finale {
  /**
   * @param {object} data parsed finale.json
   * @param {object} deps
   * @param {import('./os.js').WorkOS} deps.os
   * @param {import('./shift.js').Shift} deps.shift
   * @param {import('./audio.js').Ambience} deps.audio
   * @param {{killFor:(s:number)=>void}} deps.lights
   * @param {number} deps.round the round being played
   * @param {(summary: object) => void} deps.onEnd called once the reboot is shown
   */
  constructor(data, { os, shift, audio, lights, round, onEnd }) {
    Object.assign(this, { data, os, shift, audio, lights, round, onEnd });
    this.phase = 'idle';
    this.t = 0;
    /** Extra glitch for the post pass. */
    this.glitch = 0;
  }

  /** True once the finale has begun; gameplay should stop reacting. */
  get active() {
    return this.phase !== 'idle';
  }

  /**
   * Begins the finale. Ignored if already running.
   * @param {'complete'|'timeout'} outcome
   */
  start(outcome) {
    if (this.active) return;
    this.outcome = outcome;
    this.shift.stop();
    this.text = this.compose();
    this.shown = 0;
    this.pauseLeft = 0;
    this.setPhase('shutdown');
  }

  setPhase(p) {
    this.phase = p;
    this.t = 0;
  }

  /** Builds the full message from data, filling in this round's numbers. */
  compose() {
    const d = this.data, s = this.shift;
    const vars = {
      tasks: s.tasksDone,
      lapses: s.lapses,
      rating: s.rating.toFixed(2),
      prevRound: this.round - 1,
      nextRound: this.round + 1,
      localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    };
    const lapse = d.lapses.find((l) => s.lapses <= l.max);
    vars.fate = d.fates.find((f) => s.rating >= f.min).text.replace('{nextRound}', vars.nextRound);
    const paras = [d.opening[this.outcome], ...d.body, lapse.text, ...d.closing];
    return paras.join('\n\n').replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
  }

  /** Advances the sequence. */
  update(dt) {
    if (!this.active || this.phase === 'done') return;
    this.t += dt;
    const os = this.os;

    if (this.phase === 'shutdown') {
      // Windows close one at a time, then the desktop empties.
      if (os.windows.length && this.t > 0.6 * (4 - os.windows.length)) os.close(os.windows[os.windows.length - 1]);
      if (this.t > 1.2) os.lockdown = true;
      if (this.t > 3) {
        os.windows = [];
        os.dialogs = [];
        const win = os.open('__management', this.createWindowApp());
        win.x = 6; win.y = 6;
        this.audio.errorChime();
        this.setPhase('typing');
      }
    } else if (this.phase === 'typing') {
      if (this.pauseLeft > 0) { this.pauseLeft -= dt; return; }
      const before = this.shown;
      this.shown = Math.min(this.text.length, this.shown + dt * this.data.charsPerSecond);
      const typed = this.text.slice(Math.floor(before), Math.floor(this.shown));
      if (typed.includes('\n\n')) this.pauseLeft = this.data.paragraphPause;
      // Someone is typing to you: a clack every few characters.
      if (Math.floor(this.shown / 3) !== Math.floor(before / 3) && /\S/.test(typed)) this.audio.keyClack();
      if (this.shown >= this.text.length) this.setPhase('hold');
    } else if (this.phase === 'hold') {
      if (this.t > this.data.holdAfterSeconds) {
        this.lights.killFor(9999);
        this.audio.fadeOut(3);
        this.setPhase('reset');
      }
    } else if (this.phase === 'reset') {
      this.glitch = Math.min(2.5, this.t * 0.9);
      if (this.t > 3) {
        os.blackout(1.2);
        os.reboot(this.round + 1);
        this.glitch = 0;
        this.setPhase('reboot');
      }
    } else if (this.phase === 'reboot' && this.t > 5) {
      this.setPhase('done');
      this.onEnd?.({
        outcome: this.outcome, round: this.round, tasks: this.shift.tasksDone,
        rating: this.shift.ratingText(), lapses: this.shift.lapses, left: this.shift.clockText(),
      });
    }
  }

  /** The Management window: no close button, Delete and Reply refuse. */
  createWindowApp() {
    const fin = this, d = this.data;
    let status = '';
    let shake = 0;
    let L = {};
    return {
      id: '__management',
      title: `${d.from} - ${d.subject}`,
      closable: false,
      rect: { w: 308, h: 212 },
      mouseDown(x, y) {
        if (L.del && inside(x, y, ...L.del)) { status = d.deleteRefusal; shake = 0.4; fin.audio.errorChime(); }
        if (L.reply && inside(x, y, ...L.reply)) { status = d.replyRefusal; fin.audio.errorChime(); }
      },
      draw(c, r, t) {
        shake = Math.max(0, shake - 1 / 60);
        const ox = shake > 0 ? Math.round(Math.sin(t * 90) * 2) : 0;
        c.save(); c.translate(ox, 0);
        c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, r.w, r.h);
        c.fillStyle = '#000'; c.font = FONT_BOLD;
        c.fillText('From:', 4, 10); c.fillText('Subject:', 4, 21);
        c.fillStyle = '#7a0c0c'; c.fillText(d.from, 46, 10);
        c.fillStyle = '#000'; c.font = FONT; c.fillText(d.subject, 46, 21);

        // Body: typed text, auto-scrolled to keep the newest line in view.
        const by = 26, bh = r.h - by - 34, lineH = 10.5;
        bevel(c, 2, by, r.w - 4, bh, true, '#fff');
        c.fillStyle = '#000'; c.font = FONT;
        const visible = fin.text.slice(0, Math.floor(fin.shown));
        const lines = wrapText(c, visible, r.w - 16);
        const fit = Math.floor((bh - 6) / lineH);
        const start = Math.max(0, lines.length - fit);
        lines.slice(start).forEach((l, i) => c.fillText(l, 7, by + 11 + i * lineH));
        if (fin.phase === 'typing' && Math.floor(t * 3) % 2 === 0) {
          const last = lines[lines.length - 1] || '';
          const ly = by + 11 + (lines.length - 1 - start) * lineH;
          c.fillRect(7 + c.measureText(last).width + 1, ly - 8, 5, 9);
        }

        // Buttons and refusal status.
        const byB = r.h - 20;
        L.reply = [4, byB, 54, 15];
        L.del = [62, byB, 54, 15];
        for (const [rect, label] of [[L.reply, 'Reply'], [L.del, 'Delete']]) {
          bevel(c, ...rect);
          c.fillStyle = '#000'; c.font = FONT; c.textAlign = 'center';
          c.fillText(label, rect[0] + 27, rect[1] + 11); c.textAlign = 'left';
        }
        c.fillStyle = '#7a0c0c'; c.font = FONT_BOLD;
        c.fillText(status, 124, byB + 11);
        c.restore();
      },
    };
  }
}
