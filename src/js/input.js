/**
 * Routes mouse and keyboard. The pointer is locked for the whole shift: mouse
 * movement drives the in-OS cursor, or the head while the right button is held.
 * Losing the lock (Esc) pauses the game.
 */
export class Input {
  /**
   * @param {HTMLCanvasElement} canvas element to lock the pointer to
   * @param {object} h handlers
   * @param {(dx:number, dy:number) => void} h.cursor movement while working
   * @param {(dx:number, dy:number) => void} h.look movement while looking around
   * @param {(held:boolean) => void} h.lookHold right button pressed/released
   * @param {(down:boolean) => void} h.click left button pressed/released
   * @param {(e:KeyboardEvent) => void} h.key key pressed
   * @param {(locked:boolean) => void} h.lock pointer lock gained/lost
   */
  constructor(canvas, h) {
    this.canvas = canvas;
    this.h = h;
    this.looking = false;
    this.locked = false;
    /** True when running without pointer lock (it was refused). */
    this.fallback = false;

    window.addEventListener('keydown', (e) => {
      if (this.fallback && this.locked && e.key === 'Escape') {
        this.locked = false;
        this.fallback = false;
        h.lock(false);
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.looking) { this.looking = false; h.lookHold(false); }
      h.lock(this.locked);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 2) { this.looking = true; h.lookHold(true); }
      if (e.button === 0) h.click(true);
    });
    window.addEventListener('mouseup', (e) => {
      if (!this.locked) return;
      if (e.button === 2) { this.looking = false; h.lookHold(false); }
      if (e.button === 0) h.click(false);
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (this.looking) h.look(e.movementX, e.movementY);
      else h.cursor(e.movementX, e.movementY);
    });
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (['Backspace', 'Tab', ' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }
      h.key(e);
    });
  }

  /**
   * Requests pointer lock; must be called from a user gesture. If the browser
   * refuses (sandboxed iframes), falls back to unlocked play where Esc pauses.
   */
  lock() {
    const fallback = () => {
      if (this.locked) return;
      this.fallback = true;
      this.locked = true;
      this.h.lock(true);
    };
    try {
      const p = this.canvas.requestPointerLock();
      if (p?.catch) p.catch(fallback);
    } catch {
      fallback();
    }
  }
}
