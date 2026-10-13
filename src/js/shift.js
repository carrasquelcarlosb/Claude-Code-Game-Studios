/**
 * The round of work: countdown, the operator's public star rating, and the
 * look-away penalty. Pure logic with no DOM or rendering, so it can be
 * unit-tested.
 */
export class Shift {
  /** @param {object} cfg tuning.json `shift` block */
  constructor(cfg) {
    this.cfg = cfg;
    /** Seconds left on the clock. */
    this.remaining = cfg.durationSec;
    /** Current star rating, clamped to [minRating, maxRating]; can go negative. */
    this.rating = cfg.startingRating;
    /** Number of separate times the player looked away. */
    this.lapses = 0;
    /** Total seconds spent looking away. */
    this.awaySeconds = 0;
    this.tasksDone = 0;
    this.running = false;
    this.away = false;
    this.lapseRatingStart = 0;
    /** Mistakes in a row since the last completed task; each one costs more. */
    this.mistakeStreak = 0;
    this.listeners = {};
  }

  /**
   * Subscribes to an event: 'lapseStart', 'lapseEnd' ({lapse, cost}),
   * 'rated' ({delta, by, stars}), 'task', 'timeout'.
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

  /** Freezes the clock and rating for good (end of round). */
  stop() {
    this.running = false;
  }

  /** Fraction of the shift elapsed, 0..1. */
  get progress() {
    return 1 - this.remaining / this.cfg.durationSec;
  }

  /**
   * Changes the rating. Silent changes (look-away drain) emit no event.
   * @param {number} delta stars to add (negative to remove)
   * @param {string} [by] who rated, for the on-screen notice
   * @param {number} [stars] the 1-5 score they gave, for the notice
   */
  rate(delta, by, stars) {
    const { minRating, maxRating } = this.cfg;
    this.rating = Math.min(maxRating, Math.max(minRating, this.rating + delta));
    if (by) this.emit('rated', { delta, by, stars });
  }

  /**
   * Advances the shift. Looking away drains the clock faster and costs rating.
   * @param {number} dt seconds of real time
   * @param {boolean} away whether the player is looking away from the screen
   */
  update(dt, away) {
    if (!this.running) return;
    if (away && !this.away) {
      this.lapses++;
      this.lapseRatingStart = this.rating;
      this.emit('lapseStart');
    } else if (!away && this.away) {
      this.emit('lapseEnd', { lapse: this.lapses, cost: this.lapseRatingStart - this.rating });
    }
    this.away = away;

    this.remaining -= dt * (away ? this.cfg.awayTimeMultiplier : 1);
    if (away) {
      this.awaySeconds += dt;
      this.rate(-this.cfg.awayPenaltyPerSec * dt);
    }
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.running = false;
      this.emit('timeout');
    }
  }

  /**
   * Credits one completed task.
   * @param {number} [delta] rating change; defaults to `ratingPerTask`
   * @param {string} [by] who rated it
   * @param {number} [stars] their 1-5 score
   */
  completeTask(delta = this.cfg.ratingPerTask, by, stars) {
    this.tasksDone++;
    this.mistakeStreak = 0;
    this.rate(delta, by, stars);
    this.emit('task');
  }

  /**
   * Records a mistake. Consecutive mistakes escalate:
   * cost = base * (1 + (streak - 1) * mistakeStreakGrowth), so with base 0.13
   * and growth 1 the run costs 0.13, 0.26, 0.39, ... A completed task resets it.
   * @param {string} by who rated it
   * @param {number} [base] first-mistake cost; defaults to `mistakePenalty`
   * @returns {number} stars lost
   */
  mistake(by, base = this.cfg.mistakePenalty) {
    this.mistakeStreak++;
    const cost = base * (1 + (this.mistakeStreak - 1) * this.cfg.mistakeStreakGrowth);
    this.rate(-cost, by, 1);
    return cost;
  }

  /** @returns {string} remaining time as MM:SS */
  clockText() {
    const s = Math.ceil(this.remaining);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /** @returns {string} rating as "★ 3.13" */
  ratingText() {
    return `★ ${this.rating.toFixed(2)}`;
  }
}

/** @returns {string} a 1-5 score as stars and dots, e.g. ★★★·· (hollow stars blur at 9px) */
export function starString(stars) {
  const n = Math.max(0, Math.min(5, Math.round(stars)));
  return '★'.repeat(n) + '·'.repeat(5 - n);
}
