import { FONT, FONT_BOLD, bevel, inside, wrapText, clipText } from './os.js';
import { paintFace } from './figure.js';

/**
 * The end of the round: an exit interview with Management.
 *
 * The OS locks down and a chat window opens that cannot be closed.
 * Management types to the player one message at a time and asks questions
 * whose answers are rated. Partway through, a webcam feed from behind the
 * chair shows the figure approaching; the interview climaxes in the game's one
 * scare, then the simulation tears down and reboots into the next round.
 *
 * The beat list lives in data/finale.json `script`. Beat kinds:
 *   say, sayByLapses, ask (+ options/stars/answers|answer), wait, waitLook,
 *   webcam, figure (+ sound), scare, reboot.
 *
 * Phases: idle -> shutdown -> script -> reset -> reboot -> done.
 */
export class Finale {
  /**
   * @param {object} data parsed finale.json
   * @param {object} deps
   * @param {import('./os.js').WorkOS} deps.os
   * @param {import('./shift.js').Shift} deps.shift
   * @param {import('./audio.js').Ambience} deps.audio
   * @param {{killFor:(s:number)=>void}} deps.lights
   * @param {import('./camera-rig.js').CameraRig} deps.rig whether the player is looking away
   * @param {import('./feeds.js').Feeds} deps.feeds webcam feed and figure visibility
   * @param {ReturnType<import('./figure.js').createFigure>} deps.figure
   * @param {import('./dread.js').Dread} deps.dread for positional sounds
   * @param {number} deps.round the round being played
   * @param {(summary: object) => void} deps.onEnd called once the reboot is shown
   */
  constructor(data, deps) {
    Object.assign(this, deps);
    this.data = data;
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
    this.log = [];        // chat lines: {who: 'm'|'you', text, shown}
    this.beat = -1;       // index into the script
    this.step = null;     // what the current beat is waiting on
    this.options = null;  // reply choices on offer
    this.setPhase('shutdown');
  }

  setPhase(p) {
    this.phase = p;
    this.t = 0;
  }

  /** Fills {placeholders} in script text from the live round state. */
  fill(text) {
    const s = this.shift;
    const fate = this.data.fates.find((f) => s.rating >= f.min).text;
    const vars = {
      opening: this.data.opening[this.outcome],
      tallies: this.round - 1,
      lapses: s.lapses,
      rating: s.rating.toFixed(2),
      nextRound: this.round + 1,
      localTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      fate,
    };
    // Two passes: a filled value (like the fate line) may contain placeholders.
    const once = (str) => str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
    return once(once(text));
  }

  // --- Frame ---------------------------------------------------------------

  /** Advances the sequence. */
  update(dt) {
    if (!this.active || this.phase === 'done') return;
    this.t += dt;
    this.glitch = Math.max(0, this.glitch - dt * 1.2);
    const os = this.os;

    if (this.phase === 'shutdown') {
      // Windows close one at a time, then the desktop empties.
      if (os.windows.length && this.t > 0.6 * (4 - os.windows.length)) os.close(os.windows[os.windows.length - 1]);
      if (this.t > 1.2) os.lockdown = true;
      if (this.t > 3) {
        os.windows = [];
        os.dialogs = [];
        this.chatWin = os.open('__management', this.createChatApp());
        Object.assign(this.chatWin, { x: 6, y: 6, w: 308, h: 212 });
        this.audio.errorChime();
        this.setPhase('script');
        this.next();
      }
    } else if (this.phase === 'script') {
      this.runStep(dt);
    } else if (this.phase === 'reset') {
      this.glitch = Math.min(2.5, this.t * 0.9);
      if (this.t > 3) {
        this.feeds.figureInWorld = false;
        this.figure.pose(null);
        os.overlay = null;
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

  /** Starts the next beat of the script. */
  next() {
    this.beat++;
    const b = this.data.script[this.beat];
    this.t = 0;
    if (!b) { this.step = null; return; }

    if (b.say) return this.say(this.fill(b.say));
    if (b.sayByLapses) return this.say(this.fill(b.sayByLapses.find((x) => this.shift.lapses <= x.max).text));
    if (b.ask) return this.say(this.fill(b.ask), () => { this.options = b; this.step = { kind: 'answer' }; });
    if (b.wait) { this.step = { kind: 'wait', seconds: b.wait }; return; }
    if (b.waitLook) { this.step = { kind: 'look', timeout: b.timeout, sawAway: false }; return; }
    if (b.webcam) { this.openWebcam(); return this.next(); }
    if ('figure' in b) {
      this.figure.pose(b.figure);
      if (b.sound) this.dread.trigger({ sound: b.sound }, 2);
      return this.next();
    }
    if (b.scare) { this.step = { kind: 'scare' }; return; }
    if (b.reboot) {
      this.lights.killFor(9999);
      this.audio.fadeOut(3);
      this.setPhase('reset');
    }
  }

  /**
   * Queues a Management message: a typing indicator, then the text typed out.
   * @param {string} text
   * @param {() => void} [then] runs once the message is fully typed
   */
  say(text, then) {
    this.step = { kind: 'typing', text, then, wait: this.data.typingSeconds };
  }

  runStep(dt) {
    const s = this.step;
    if (!s) return;
    if (s.kind === 'typing') {
      if (s.wait > 0) { s.wait -= dt; return; }
      if (!s.line) { s.line = { who: 'm', text: s.text, shown: 0 }; this.log.push(s.line); }
      const before = s.line.shown;
      s.line.shown = Math.min(s.text.length, before + dt * this.data.charsPerSecond);
      if (Math.floor(s.line.shown / 3) !== Math.floor(before / 3)) this.audio.keyClack();
      if (s.line.shown >= s.text.length) {
        s.kind = 'pause'; s.wait = this.data.pauseAfterMessage;
      }
    } else if (s.kind === 'pause') {
      s.wait -= dt;
      if (s.wait <= 0) { if (s.then) s.then(); else this.next(); }
    } else if (s.kind === 'wait') {
      if (this.t >= s.seconds) this.next();
    } else if (s.kind === 'look') {
      // Done once the player has looked away and come back, or on timeout.
      if (this.rig.lookingAway) s.sawAway = true;
      if ((s.sawAway && !this.rig.lookingAway) || this.t >= s.timeout) this.next();
    } else if (s.kind === 'scare') {
      this.runScare();
    }
  }

  /** Records the player's chosen reply, rates it, and types Management's answer. */
  answer(i) {
    const b = this.options;
    if (!b || this.step?.kind !== 'answer' || !b.options[i]) return;
    this.options = null;
    this.log.push({ who: 'you', text: b.options[i], shown: b.options[i].length });
    const stars = b.stars[i];
    this.shift.rate((stars - 3) * this.shift.cfg.replyStarWeight, this.data.from, stars);
    this.say(this.fill(b.answers ? b.answers[i] : b.answer));
  }

  /**
   * The one scare. Silence, every light dies, then the face fills the CRT
   * with the sting while the figure stands behind the chair in the room.
   */
  runScare() {
    const s = this.step;
    if (!s.started) {
      s.started = true;
      this.audio.silence();
      this.lights.killFor(9999);
    }
    if (this.t >= 0.7 && !s.hit) {
      s.hit = true;
      this.audio.scareSting();
      this.glitch = 2.5;
      this.feeds.figureInWorld = true;
      this.os.overlay = { draw: (c, W, H) => this.drawScareFace(c, W, H) };
    }
    if (this.t >= 2.1) {
      this.os.overlay = null;
      this.closeWebcam();
      this.audio.restore(0.45, 3);
      this.next();
    }
  }

  drawScareFace(c, W, H) {
    c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
    const jx = (Math.random() - 0.5) * 10, jy = (Math.random() - 0.5) * 8;
    const s = 1 + Math.min(0.25, (this.t - 0.7) * 0.4); // pushes towards the glass
    const w = 210 * s, h = 270 * s;
    paintFace(c, (W - w) / 2 + jx, (H - h) / 2 + 10 + jy, w, h);
    c.fillStyle = 'rgba(120,0,0,0.25)';
    for (let y = 0; y < H; y += 3) if (Math.random() < 0.3) c.fillRect(0, y, W, 2);
  }

  // --- Windows ---------------------------------------------------------------

  openWebcam() {
    this.feeds.webcamOn = true;
    // Chat narrows to the left; the feed sits on the right.
    Object.assign(this.chatWin, { x: 2, y: 2, w: 166, h: 220 });
    this.camWin = this.os.open('__webcam', this.createWebcamApp());
    Object.assign(this.camWin, { x: 170, y: 20, w: 148, h: 118 });
    this.os.focus(this.chatWin);
  }

  closeWebcam() {
    this.feeds.webcamOn = false;
    if (this.camWin) this.os.close(this.camWin);
    this.camWin = null;
    Object.assign(this.chatWin, { x: 6, y: 6, w: 308, h: 212 });
  }

  /** Grainy security feed from behind the chair, with a blinking REC. */
  createWebcamApp() {
    const fin = this;
    return {
      title: this.data.webcamTitle,
      closable: false,
      draw(c, r, t) {
        c.imageSmoothingEnabled = false;
        c.drawImage(fin.feeds.webcamCanvas, 0, 0, r.w, r.h);
        c.fillStyle = '#d01818';
        if (Math.floor(t * 2) % 2 === 0) { c.beginPath(); c.arc(8, 8, 3, 0, Math.PI * 2); c.fill(); }
        c.font = FONT_BOLD; c.fillText('REC', 14, 11);
        c.fillStyle = '#e0e0d0'; c.font = FONT;
        c.fillText(`CAM 13  ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`, 4, r.h - 4);
      },
    };
  }

  /** Management's chat window: no close button, rated reply buttons. */
  createChatApp() {
    const fin = this;
    let L = [];
    return {
      title: this.data.title,
      closable: false,
      key(e) {
        if (['1', '2', '3'].includes(e.key)) fin.answer(Number(e.key) - 1);
      },
      mouseDown(x, y) {
        L.forEach((rect, i) => { if (inside(x, y, ...rect)) fin.answer(i); });
      },
      draw(c, r, t) {
        c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, r.w, r.h);
        const opts = fin.options?.options;
        const optH = opts ? opts.length * 14 + 4 : 0;
        const logH = r.h - optH - 14;
        bevel(c, 2, 2, r.w - 4, logH, true, '#fff');

        // Build the visible transcript, newest at the bottom.
        c.font = FONT;
        const lines = [];
        for (const m of fin.log) {
          const text = m.text.slice(0, Math.floor(m.shown));
          lines.push({ text: m.who === 'm' ? fin.data.from : 'You', label: true, who: m.who });
          wrapText(c, text, r.w - 20).forEach((l) => lines.push({ text: l, who: m.who }));
          lines.push({ text: '', who: m.who });
        }
        const lineH = 10.5, fit = Math.floor((logH - 6) / lineH);
        lines.slice(Math.max(0, lines.length - fit)).forEach((l, i) => {
          const y = 2 + 11 + i * lineH;
          c.font = l.label ? FONT_BOLD : FONT;
          c.fillStyle = l.who === 'm' ? (l.label ? '#7a0c0c' : '#000') : '#0a246a';
          c.fillText(l.text, l.who === 'm' ? 7 : 15, y);
        });

        // Status line: who is typing.
        c.font = FONT; c.fillStyle = '#404040';
        const typing = fin.step?.kind === 'typing' && fin.step.wait > 0;
        c.fillText(typing ? `${fin.data.from} is typing${'.'.repeat(1 + (Math.floor(t * 3) % 3))}` : '', 5, logH + 12);

        // Reply buttons.
        L = [];
        (opts || []).forEach((o, i) => {
          const rect = [2, logH + 16 + i * 14, r.w - 4, 13];
          L.push(rect);
          bevel(c, ...rect);
          c.fillStyle = '#000'; c.font = FONT;
          c.fillText(clipText(c, `${i + 1}. ${o}`, r.w - 12), 6, rect[1] + 10);
        });
      },
    };
  }
}
