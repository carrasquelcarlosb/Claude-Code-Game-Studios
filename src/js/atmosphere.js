import * as THREE from 'three';

/**
 * Drives the office's mood over the round. The shift opens overlit and
 * sterile; as time passes and the rating falls, the light drains towards the
 * dark liminal state, and the fluorescent starts to flicker more often.
 * Dread lights-out overrides everything for its duration.
 */
export class Atmosphere {
  /**
   * @param {object} cfg tuning.json `atmosphere` block
   * @param {object} lighting tuning.json `lighting` block (flicker base rate)
   * @param {ReturnType<import('./room.js').buildRoom>} room
   */
  constructor(cfg, lighting, room) {
    this.cfg = cfg;
    this.lighting = lighting;
    this.room = room;
    this.bright = { ...cfg.bright, fog: new THREE.Color(cfg.bright.fog) };
    this.dark = { ...cfg.dark, fog: new THREE.Color(cfg.dark.fog) };
    this.panelColor = room.panels.material.color.clone();
    /** 0 = sterile and bright, 1 = fully dark. */
    this.gloom = 0;
    this.flickerLeft = 0;
    this.lightsOutLeft = 0;
    this.exposure = 1;
  }

  /**
   * How gloomy the office should be for a given shift state.
   * @param {number} progress 0..1 of the shift elapsed
   * @param {number} rating current star rating
   * @param {number} startRating the rating the shift began with
   * @returns {number} 0..1
   */
  gloomFor(progress, rating, startRating) {
    const g = progress * this.cfg.progressWeight + Math.max(0, startRating - rating) * this.cfg.ratingWeight;
    return Math.min(1, Math.max(0, g));
  }

  /** Kills every light in the office for a while. */
  killFor(seconds) {
    this.lightsOutLeft = Math.max(this.lightsOutLeft, seconds);
  }

  /**
   * Updates lights and fog.
   * @param {number} dt seconds
   * @param {number} targetGloom from gloomFor()
   * @returns {number} hum level for the audio (0 = silent, 1 = normal)
   */
  update(dt, targetGloom) {
    // Ease so the change is felt, never seen happening.
    this.gloom += (targetGloom - this.gloom) * (1 - Math.exp(-0.5 * dt));
    const out = this.lightsOutLeft > 0;
    if (out) this.lightsOutLeft -= dt;
    const g = out ? 1 : this.gloom;
    const lerp = (a, b) => a + (b - a) * g;
    const { room, bright, dark } = this;

    // Flicker gets more frequent as the office darkens.
    const chance = this.lighting.flickerChancePerSecond * (0.1 + 0.9 * g);
    if (this.flickerLeft <= 0 && Math.random() < chance * dt) this.flickerLeft = 0.15 + Math.random() * 0.6;
    let level = 1;
    if (this.flickerLeft > 0) {
      this.flickerLeft -= dt;
      level = Math.random() < 0.5 ? 0.05 : 0.8 + Math.random() * 0.4;
    }
    if (out) level = 0;

    room.fluorescent.intensity = lerp(bright.fluorescent, dark.fluorescent) * level;
    room.ambient.intensity = lerp(bright.ambient, dark.ambient) * (out ? 0.35 : 1);
    room.scene.fog.color.copy(bright.fog).lerp(dark.fog, g);
    if (out) room.scene.fog.color.multiplyScalar(0.3);
    room.scene.background = room.scene.fog.color;
    room.scene.fog.near = lerp(bright.fogNear, dark.fogNear);
    room.scene.fog.far = lerp(bright.fogFar, dark.fogFar);
    room.panels.material.color.copy(this.panelColor).multiplyScalar(out ? 0.04 : 1);
    room.monitorLight.intensity = this.lighting.monitorIntensity * (0.95 + Math.random() * 0.05);
    /** Post-pass exposure: the whole image sinks as the office darkens. */
    this.exposure = lerp(1, this.cfg.darkExposure);

    return out ? 0 : level < 0.5 ? 0.3 : 1 + (this.flickerLeft > 0 ? 1.5 : 0);
  }
}
