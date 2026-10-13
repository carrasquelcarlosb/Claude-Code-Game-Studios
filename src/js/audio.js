/**
 * Synthesised ambience: droning room tone, mains hum from the fluorescent
 * tubes, and a faint CRT whine. No audio files needed.
 */
export class Ambience {
  /** @param {object} cfg tuning.json `audio` block */
  constructor(cfg) {
    this.cfg = cfg;
    this.ctx = null;
  }

  /** Starts audio. Must be called from a user gesture. */
  start() {
    if (this.ctx) return;
    const ctx = (this.ctx = new AudioContext());
    this.master = ctx.createGain();
    this.master.gain.value = this.cfg.masterVolume;
    this.master.connect(ctx.destination);

    // Room tone: a low HVAC rumble, quiet. Brown noise kept well below 200 Hz
    // so it reads as air in a building, not hiss.
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 160;
    const toneGain = ctx.createGain(); toneGain.gain.value = this.cfg.roomToneVolume;
    noise.connect(lp).connect(toneGain).connect(this.master);
    noise.start();

    // Fluorescent hum: 60 Hz + 120 Hz buzz.
    this.humGain = ctx.createGain();
    this.humGain.gain.value = this.cfg.humVolume;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass'; humFilter.frequency.value = 900;
    for (const [f, type, g] of [[60, 'sine', 0.6], [120, 'sawtooth', 0.25], [240, 'square', 0.04]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g;
      o.connect(og).connect(humFilter);
      o.start();
    }
    humFilter.connect(this.humGain).connect(this.master);

    // CRT whine near the NTSC line rate.
    const whine = ctx.createOscillator();
    whine.frequency.value = 15734;
    const wg = ctx.createGain(); wg.gain.value = this.cfg.crtWhineVolume;
    whine.connect(wg).connect(this.master);
    whine.start();

    // Shift drone: silent at clock-in, builds with setTension().
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass'; this.droneFilter.frequency.value = 120; this.droneFilter.Q.value = 4;
    this.droneOscs = [[55, 'sine'], [55.3, 'sine'], [110.2, 'sawtooth']].map(([f, type]) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      o.connect(this.droneFilter); o.start();
      return o;
    });
    this.droneFilter.connect(this.droneGain).connect(this.master);
    // Heartbeat-slow pulse on the drone level, off until the last minute.
    const lfo = ctx.createOscillator(); lfo.frequency.value = 1.1;
    this.pulseDepth = ctx.createGain(); this.pulseDepth.gain.value = 0;
    lfo.connect(this.pulseDepth).connect(this.droneGain.gain);
    lfo.start();
  }

  /** Short burst of filtered noise, shared by key and mouse clicks. */
  burst(freq, q, decay, gain) {
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * decay);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  }

  /** Aggressive mechanical key clack, slightly different every press. */
  keyClack() {
    if (!this.ctx) return;
    const v = this.cfg.keyVolume;
    this.burst(1800 + Math.random() * 1600, 1.2, 0.045, v);
    this.burst(260 + Math.random() * 80, 3, 0.03, v * 0.9); // bottoming-out thunk
  }

  /** Dry mouse button click. */
  mouseClick() {
    if (!this.ctx) return;
    this.burst(4200, 4, 0.012, this.cfg.keyVolume * 0.5);
  }

  /** Two-tone system error chime. */
  errorChime() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [[523, 0], [392, 0.11]].forEach(([f, at]) => {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(this.cfg.uiVolume, t + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.25);
      o.connect(g).connect(this.master);
      o.start(t + at); o.stop(t + at + 0.3);
    });
  }

  /**
   * Fades everything to silence.
   * @param {number} seconds fade length
   */
  fadeOut(seconds) {
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0, t + seconds);
  }

  /**
   * Sets how tense the shift drone is: louder, brighter and beating faster.
   * @param {number} x 0 (clock-in) .. 1 (end of shift)
   * @param {boolean} pulse whether the last-minute pulse is on
   */
  setTension(x, pulse) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = this.cfg.droneVolume;
    this.droneGain.gain.setTargetAtTime(v * (0.15 + 0.85 * x), t, 0.5);
    this.droneFilter.frequency.setTargetAtTime(120 + 520 * x, t, 0.5);
    this.droneOscs[1].frequency.setTargetAtTime(55.3 + 3.2 * x, t, 0.5);
    this.pulseDepth.gain.setTargetAtTime(pulse ? v * 0.6 : 0, t, 0.3);
  }

  // --- Ambient events --------------------------------------------------------
  // Each returns a handle with stop(), so callers can cut a sound early.

  /** Schedules oscillators and returns a handle that stops them all. */
  handle(nodes) {
    return { stop: () => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }) };
  }

  /** An old office phone trilling three times, somewhere in the room. */
  phone(pos) {
    if (!this.ctx) return null;
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.spatial(...pos, 0.5, this.cfg.ambientVolume);
    const gate = ctx.createGain(); gate.gain.value = 0;
    const trill = ctx.createGain(); trill.gain.value = 0.5;
    const nodes = [440, 480].map((f) => {
      const o = ctx.createOscillator(); o.frequency.value = f; o.connect(gate); o.start(t0); o.stop(t0 + 18);
      return o;
    });
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 20;
    lfo.connect(trill).connect(gate.gain); lfo.start(t0); lfo.stop(t0 + 18);
    for (let r = 0; r < 3; r++) {
      const s = t0 + r * 6;
      gate.gain.setValueAtTime(0.5, s); gate.gain.setValueAtTime(0, s + 2);
    }
    gate.connect(out);
    return this.handle([...nodes, lfo]);
  }

  /** A photocopier starting up by itself: motor, two scan sweeps, a clunk. */
  photocopier(pos) {
    if (!this.ctx) return null;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 6), d = new Float32Array(len);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      last = (last + 0.1 * (Math.random() * 2 - 1)) / 1.1;
      const motor = Math.sin(2 * Math.PI * 98 * t) * 0.25 + Math.sin(2 * Math.PI * 196 * t) * 0.1;
      const sweep = last * (0.5 + 0.5 * Math.sin(Math.PI * ((t % 2.4) / 2.4))) * 2.5;
      const env = Math.min(1, t * 2) * Math.min(1, (6 - t) * 2);
      const clunk = t > 5.2 && t < 5.3 ? (Math.random() * 2 - 1) * (5.3 - t) * 10 : 0;
      d[i] = (motor + sweep) * env * 0.6 + clunk;
    }
    this.playBuffer(d, this.spatial(...pos, 0.8, this.cfg.ambientVolume));
    return null;
  }

  /** A two-tone elevator chime. */
  elevatorDing(pos) {
    if (!this.ctx) return null;
    const ctx = this.ctx, t0 = ctx.currentTime, out = this.spatial(...pos, 0.6, this.cfg.ambientVolume);
    [[1318, 0], [1046, 0.45]].forEach(([f, at]) => {
      for (const [mult, amp] of [[1, 0.5], [2.76, 0.12], [5.4, 0.05]]) {
        const o = ctx.createOscillator(); o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0 + at);
        g.gain.linearRampToValueAtTime(amp, t0 + at + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 1.6);
        o.connect(g).connect(out); o.start(t0 + at); o.stop(t0 + at + 1.7);
      }
    });
    return null;
  }

  /** Somebody typing in a far cubicle for a while. */
  distantTyping(pos, seconds = 8) {
    if (!this.ctx) return null;
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * seconds), d = new Float32Array(len);
    let t = 0.1;
    while (t < seconds - 0.1) {
      const start = Math.floor(t * sr), f = 2000 + Math.random() * 1500;
      for (let k = 0; k < sr * 0.03 && start + k < len; k++) {
        d[start + k] += (Math.random() * 2 - 1) * Math.exp(-k / (sr * 0.006)) * 0.6
          + Math.sin(2 * Math.PI * f * k / sr) * Math.exp(-k / (sr * 0.002)) * 0.3;
      }
      // Bursts of words with pauses, like someone actually writing.
      t += Math.random() < 0.12 ? 0.4 + Math.random() * 0.8 : 0.07 + Math.random() * 0.09;
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    lp.connect(this.spatial(...pos, 0.9, this.cfg.ambientVolume));
    const buf = ctx.createBuffer(1, len, sr); buf.getChannelData(0).set(d);
    const src = ctx.createBufferSource(); src.buffer = buf; src.connect(lp); src.start();
    return this.handle([src]);
  }

  // --- Dread stings --------------------------------------------------------

  /**
   * Turns the listener to match the player's head so world-placed sounds stay
   * put when they look around. Yaw follows three.js: 0 faces -Z.
   * @param {number} yaw radians
   */
  setListenerYaw(yaw) {
    if (!this.ctx) return;
    const l = this.ctx.listener, fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    if (l.forwardX) {
      const t = this.ctx.currentTime;
      l.forwardX.setValueAtTime(fx, t); l.forwardY.setValueAtTime(0, t); l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else {
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /**
   * Creates an HRTF panner at a world position (metres from the chair).
   * @param {number} [bus] channel volume; defaults to the dread volume
   */
  spatial(x, y, z, gain = 1, bus = this.cfg.dreadVolume) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.2;
    p.rolloffFactor = 0.8;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    const g = this.ctx.createGain(); g.gain.value = gain * bus;
    p.connect(g).connect(this.master);
    return p;
  }

  /** Plays a generated mono buffer through a node at an optional delay. */
  playBuffer(data, dest, delay = 0) {
    const buf = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    buf.getChannelData(0).set(data);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    src.connect(dest);
    src.start(this.ctx.currentTime + delay);
  }

  /** Cuts every sound to dead silence almost instantly (before the scare). */
  silence() {
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + 0.04);
  }

  /**
   * Brings the mix back after a silence, quieter than before.
   * @param {number} level fraction of the normal master volume
   * @param {number} seconds fade-in time
   */
  restore(level, seconds) {
    if (!this.ctx) return;
    const g = this.master.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(this.cfg.masterVolume * level, t + seconds);
  }

  /**
   * The one scare: a sub drop, a raw scraping roar and a CRT squeal, all
   * noise-based and distorted so nothing reads as a clean tone. Plays on its
   * own path straight to the output, so it ignores silence().
   */
  scareSting() {
    if (!this.ctx) return;
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * 2.2), d = new Float32Array(len);
    let y1 = 0, y2 = 0, phase = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const hit = Math.min(1, t / 0.006);
      phase += 2 * Math.PI * (32 + 40 * Math.exp(-t * 3)) / sr;
      const sub = Math.sin(phase) * Math.exp(-t * 1.6) * 1.1;
      y1 += 0.35 * ((Math.random() * 2 - 1) - y1); // raw roar
      const grit = 0.5 + 0.5 * Math.sin(2 * Math.PI * 31 * t + Math.sin(t * 90)); // rough, uneven
      const roar = y1 * grit * Math.exp(-t * 1.8) * 1.6;
      y2 += 0.9 * ((Math.random() * 2 - 1) - y2);
      const squeal = y2 * Math.exp(-t * 3.5) * 0.35;
      d[i] = Math.tanh((sub + roar + squeal) * hit * 2.2) * 0.9;
    }
    const buf = ctx.createBuffer(1, len, sr); buf.getChannelData(0).set(d);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = this.cfg.scareVolume;
    src.connect(g).connect(ctx.destination);
    src.start();
  }

  /** Routes a node through a lowpass into a positioned panner; returns the filter input. */
  muffled(cutoff, pos, gain, bus) {
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff;
    lp.connect(this.spatial(...pos, gain, bus));
    return lp;
  }

  /** The CRT losing its picture: a soft low thump with a little static. No pitch sweep. */
  crtThunk() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 0.35), d = new Float32Array(len);
    let y = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      y += 0.08 * ((Math.random() * 2 - 1) - y); // one-pole lowpass: soft crackle, not hiss
      d[i] = Math.sin(2 * Math.PI * 55 * t) * Math.exp(-t * 14) * 0.7 + y * 2 * Math.exp(-t * 60);
    }
    this.playBuffer(d, this.muffled(900, [0, 1.05, -0.7], 0.8));
  }

  /**
   * Knuckles rapping on the fabric partition at a position: dull, close taps.
   * @param {number[]} pos [x, y, z]
   * @param {number} [count] number of knocks
   */
  knock(pos, count = 2, delay = 0) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 0.12);
    for (let n = 0; n < count; n++) {
      const d = new Float32Array(len);
      let y = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.002) * Math.exp(-t * 45);
        y += 0.12 * ((Math.random() * 2 - 1) - y);
        d[i] = (Math.sin(2 * Math.PI * 190 * t) * 0.6 + Math.sin(2 * Math.PI * 120 * t) * 0.4 + y * 1.5) * env;
      }
      this.playBuffer(d, this.muffled(1600, pos, 1.0), delay + n * 0.2);
    }
  }

  /**
   * Stick-slip creak of an office chair, placed in the room.
   * @param {number[]} pos [x, y, z] world position; +Z is behind the chair
   */
  chairCreak(pos, delay = 0) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 0.9), d = new Float32Array(len);
    let t = 0.02;
    while (t < 0.8) {
      const f = 520 + 600 * (t / 0.8) + Math.random() * 80; // pitch rises as weight shifts
      const start = Math.floor(t * sr);
      for (let k = 0; k < sr * 0.012 && start + k < len; k++) {
        d[start + k] += Math.sin(2 * Math.PI * f * k / sr) * Math.exp(-k / (sr * 0.003)) * 0.8;
      }
      t += 0.006 + Math.random() * 0.02;
    }
    this.playBuffer(d, this.spatial(...pos, 1.2), delay);
  }

  /**
   * Footsteps on carpet walking in a straight line between two points.
   * @param {number[]} from [x, y, z]
   * @param {number[]} to [x, y, z]
   * @param {number} steps how many footfalls
   * @param {number} interval seconds between footfalls
   */
  footsteps(from, to, steps = 4, interval = 0.55, delay = 0) {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 0.25);
    for (let s = 0; s < steps; s++) {
      const k = steps === 1 ? 1 : s / (steps - 1);
      const pos = from.map((v, i) => v + (to[i] - v) * k);
      const d = new Float32Array(len);
      let y = 0;
      const heel = 75 + Math.random() * 15;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // Soft heel thud plus a dull carpet scuff; slow attack, no click.
        const env = Math.min(1, t / 0.008) * Math.exp(-t * 22);
        y += 0.04 * ((Math.random() * 2 - 1) - y);
        const roll = t > 0.06 ? Math.exp(-(t - 0.06) * 30) * 0.5 : 0; // toe rolling down
        d[i] = Math.sin(2 * Math.PI * heel * t) * env * 0.7 + y * 3 * (env + roll);
      }
      this.playBuffer(d, this.muffled(450, pos, 0.75), delay + s * interval);
    }
  }

  /**
   * Sets how hard the fluorescent hum is buzzing, 1 = normal.
   * @param {number} level
   */
  setBuzz(level) {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(this.cfg.humVolume * level, this.ctx.currentTime, 0.01);
  }
}
