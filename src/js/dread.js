/**
 * Turns dread stages (from task data, e.g. ledger.json `errorStages`) into
 * sensory effects: CRT blackouts, the overhead light dying, glitch spikes, and
 * positional sounds behind the player. Nothing here touches gameplay state.
 */
export class Dread {
  /**
   * @param {object} deps
   * @param {import('./audio.js').Ambience} deps.audio
   * @param {import('./os.js').WorkOS} deps.os CRT blackout
   * @param {{killFor:(s:number)=>void}} deps.lights overhead fluorescent
   */
  constructor({ audio, os, lights }) {
    this.audio = audio;
    this.os = os;
    this.lights = lights;
    /** Extra glitch amount for the post pass, decays over time. */
    this.glitch = 0;
  }

  /**
   * Fires a stage's effects.
   * @param {object} stage stage definition
   * @param {number} repeats how many times this stage has fired before (for `repeat` stages)
   */
  trigger(stage, repeats = 0) {
    if (stage.blackout) this.os.blackout(stage.blackout);
    if (stage.lightsOut) this.lights.killFor(stage.lightsOut);
    if (stage.glitch) this.glitch = Math.max(this.glitch, stage.glitch);
    const delay = stage.soundDelay || 0;
    switch (stage.sound) {
      case 'degauss':
        this.audio.degauss();
        break;
      case 'chairCreak':
        // An empty chair in the cubicle behind and to the left.
        this.audio.chairCreak([-0.9, 0.5, 2.6], delay);
        break;
      case 'footsteps': {
        // Each repeat starts and ends closer, stopping right behind the chair.
        const start = Math.max(1.2, 6 - repeats * 1.6);
        const end = Math.max(0.6, start - 2.2);
        this.audio.footsteps([0.6, 0, start], [0.15, 0, end], 4, 0.55, delay);
        break;
      }
      default:
        break;
    }
  }

  /** Decays transient effects. */
  update(dt) {
    this.glitch = Math.max(0, this.glitch - dt * 1.5);
  }
}
