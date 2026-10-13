/**
 * The round of work: countdown, pay, and the look-away penalty. Pure logic with
 * no DOM or rendering, so it can be unit-tested.
 */
export class Shift {
  /** @param {object} cfg tuning.json `shift` block */
  constructor(cfg) {
    this.cfg = cfg;
    /** Seconds left on the clock. */
    this.remaining = cfg.durationSec;
    /** Current pay in dollars; may go negative. */
    this.pay = cfg.startingPay;
    /** Number of separate times the player looked away. */
    this.lapses = 0;
    /** Total seconds spent looking away. */
    this.awaySeconds = 0;
    this.tasksDone = 0;
    this.running = false;
    this.away = false;
    this.lapsePayStart = 0;
    this.listeners = {};
  }

  /**
   * Subscribes to an event: 'lapseStart', 'lapseEnd' ({lapse, cost}), 'task', 'timeout'.
   * @param {string} name
   * @param {(data?: object) => void} fn
   */
  on(name, fn) {
    (this.listeners[name] ||= []).push(fn);
  }

  emit(name, data) {
    (this.listeners[name] || []).forEach((fn) => fn(data));
  }

  /** Starts the clock. */
  start() {
    this.running = true;
  }

  /** Freezes the clock and pay for good (end of round). */
  stop() {
    this.running = false;
  }

  /**
   * Advances the shift. Looking away drains the clock faster and costs pay.
   * @param {number} dt seconds of real time
   * @param {boolean} away whether the player is looking away from the screen
   */
  update(dt, away) {
    if (!this.running) return;
    if (away && !this.away) {
      this.lapses++;
      this.lapsePayStart = this.pay;
      this.emit('lapseStart');
    } else if (!away && this.away) {
      this.emit('lapseEnd', { lapse: this.lapses, cost: this.lapsePayStart - this.pay });
    }
    this.away = away;

    this.remaining -= dt * (away ? this.cfg.awayTimeMultiplier : 1);
    if (away) {
      this.awaySeconds += dt;
      this.pay -= this.cfg.awayPenaltyPerSec * dt;
    }
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.running = false;
      this.emit('timeout');
    }
  }

  /** Credits one completed task. */
  completeTask() {
    this.tasksDone++;
    this.pay += this.cfg.payPerTask;
    this.emit('task');
  }

  /** @returns {string} remaining time as MM:SS */
  clockText() {
    const s = Math.ceil(this.remaining);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /** @returns {string} pay as $X.XX (negative shown with a minus) */
  payText() {
    return `${this.pay < 0 ? '-' : ''}$${Math.abs(this.pay).toFixed(2)}`;
  }
}
