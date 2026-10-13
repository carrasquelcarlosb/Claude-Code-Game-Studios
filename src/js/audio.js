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

  /**
   * Sets how hard the fluorescent hum is buzzing, 1 = normal.
   * @param {number} level
   */
  setBuzz(level) {
    if (!this.ctx) return;
    this.humGain.gain.setTargetAtTime(this.cfg.humVolume * level, this.ctx.currentTime, 0.01);
  }
}
