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

    // Room tone: brown noise, low-passed.
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
    lp.type = 'lowpass'; lp.frequency.value = 380;
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

  /** Creates an HRTF panner at a world position (metres from the chair). */
  spatial(x, y, z, gain = 1) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 0.8;
    p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
    const g = this.ctx.createGain(); g.gain.value = gain * this.cfg.dreadVolume;
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

  /** CRT power-cut thunk followed by a wobbling degauss hum. */
  degauss() {
    if (!this.ctx) return;
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 1.4), d = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const thunk = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.9;
      const hum = Math.sin(2 * Math.PI * (70 - 25 * t) * t) * Math.exp(-t * 2.5) * (0.6 + 0.4 * Math.sin(t * 38));
      d[i] = thunk + hum * 0.7;
    }
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g = this.ctx.createGain(); g.gain.value = this.cfg.dreadVolume;
    lp.connect(g).connect(this.master);
    this.playBuffer(d, lp);
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
    const sr = this.ctx.sampleRate, len = Math.floor(sr * 0.18);
    for (let s = 0; s < steps; s++) {
      const k = steps === 1 ? 1 : s / (steps - 1);
      const pos = from.map((v, i) => v + (to[i] - v) * k);
      const d = new Float32Array(len);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        last = (last + 0.25 * (Math.random() * 2 - 1)) / 1.25; // muffled carpet thud
        d[i] = last * Math.exp(-t * 30) * 2.2 + (t > 0.05 ? (Math.random() * 2 - 1) * Math.exp(-(t - 0.05) * 90) * 0.25 : 0);
      }
      this.playBuffer(d, this.spatial(...pos, 1.4), delay + s * interval);
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
