/**
 * Scripted background sounds through the shift (phones, a photocopier, an
 * elevator, someone typing), placed in the room. Events marked `stopOnLook`
 * cut out the moment the player turns to find them.
 * The timeline comes from data/ambience.json.
 */
export class AmbientEvents {
  /**
   * @param {{events: object[]}} data parsed ambience.json
   * @param {import('./audio.js').Ambience} audio
   */
  constructor(data, audio) {
    this.events = data.events.map((e) => ({ ...e, fired: false }));
    this.audio = audio;
    /** Sounds still playing that can be cut short. */
    this.live = [];
  }

  /**
   * Fires due events and cuts look-sensitive ones.
   * @param {number} elapsed seconds of shift elapsed
   * @param {boolean} lookingAway whether the player is turned away from the screen
   */
  update(elapsed, lookingAway) {
    for (const e of this.events) {
      if (e.fired || elapsed < e.at) continue;
      e.fired = true;
      const h = this.play(e);
      if (h && e.stopOnLook) this.live.push(h);
    }
    if (lookingAway && this.live.length) {
      this.live.forEach((h) => h.stop());
      this.live = [];
    }
  }

  play(e) {
    const a = this.audio;
    switch (e.sound) {
      case 'phone': return a.phone(e.pos);
      case 'photocopier': return a.photocopier(e.pos);
      case 'elevator': return a.elevatorDing(e.pos);
      case 'typing': return a.distantTyping(e.pos, e.seconds);
      default: return null;
    }
  }

  /** Stops everything still playing (end of round). */
  stopAll() {
    this.live.forEach((h) => h.stop());
    this.live = [];
  }
}
