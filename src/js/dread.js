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
   * @param {import('./feeds.js').Feeds} [deps.feeds] CRT reflection
   * @param {ReturnType<import('./figure.js').createFigure>} [deps.figure] shown in the reflection
   */
  constructor({ audio, os, lights, feeds, figure }) {
    this.audio = audio;
    this.os = os;
    this.lights = lights;
    this.feeds = feeds;
    this.figure = figure;
    this.reflectLeft = 0;
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
    // A glimpse: the dark CRT glass reflects the room, and someone in it.
    if (stage.reflection && this.feeds && !this.figure.userData.pose) {
      this.figure.pose(stage.reflection);
      this.feeds.reflect(stage.blackout || 1);
      this.reflectLeft = stage.blackout || 1;
    }
    if (stage.lightsOut) this.lights.killFor(stage.lightsOut);
    if (stage.glitch) this.glitch = Math.max(this.glitch, stage.glitch);
    const delay = stage.soundDelay || 0;
    switch (stage.sound) {
      case 'typing':
        // Someone typing in the cubicle directly behind the player.
        setTimeout(() => this.audio.distantTyping([0.4, 0.8, 4.0], 5), delay * 1000);
        break;
      case 'knock':
        // The picture drops with a soft thump, then someone taps twice on
        // the partition just to the player's left.
        this.audio.crtThunk();
        this.audio.knock([-1.0, 0.95, -0.3], 2, 0.6 + delay);
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
    if (this.reflectLeft > 0 && (this.reflectLeft -= dt) <= 0) this.figure.pose(null);
  }
}

/**
 * Picks the dread stage a mistake count has reached: an exact match, or the
 * last `repeat` stage once the count passes it.
 * @param {object[]} stages stage list from task data (may be empty)
 * @param {number} errors mistakes so far
 * @returns {object|undefined}
 */
export function stageFor(stages = [], errors) {
  return [...stages].reverse().find((s) => errors === s.errors || (s.repeat && errors > s.errors));
}
