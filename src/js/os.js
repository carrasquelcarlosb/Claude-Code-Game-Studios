/**
 * WorkOS 2002: the virtual operating system drawn on the CRT. Owns the
 * desktop, windows, taskbar (with the shift clock and pay), modal dialogs and
 * the in-OS cursor. Apps plug in through a small interface:
 *
 *   { title, icon, draw(ctx, rect, t), mouseDown?(x, y), key?(e), badge?() }
 *
 * where `rect` is the window's client area and mouse coords are client-local.
 */

export const FONT = '9px Tahoma, Verdana, sans-serif';
export const FONT_BOLD = 'bold 9px Tahoma, Verdana, sans-serif';
export const FONT_MONO = '10px "Courier New", monospace';
/** Large, bold digits for codes the player must read accurately. */
export const FONT_DIGITS = 'bold 11px "Lucida Console", "Courier New", monospace';

export const COLORS = {
  face: '#c0c0c0', light: '#ffffff', shadow: '#808080', dark: '#404040',
  title: '#0a246a', titleEnd: '#3a6ea5', titleInactive: '#808080',
  desktop: '#2b4552', text: '#000000', select: '#0a246a', alert: '#a01818',
};

const TASKBAR_H = 16;
const TITLE_H = 12;
const DOUBLE_CLICK_S = 0.4;

/**
 * Draws a Windows-2000 style 3D bevel.
 * @param {CanvasRenderingContext2D} c
 * @param {boolean} sunken true for inset fields, false for raised buttons
 */
export function bevel(c, x, y, w, h, sunken = false, fill = COLORS.face) {
  c.fillStyle = fill; c.fillRect(x, y, w, h);
  c.fillStyle = sunken ? COLORS.shadow : COLORS.light;
  c.fillRect(x, y, w, 1); c.fillRect(x, y, 1, h);
  c.fillStyle = sunken ? COLORS.light : COLORS.dark;
  c.fillRect(x, y + h - 1, w, 1); c.fillRect(x + w - 1, y, 1, h);
}

/**
 * Word-wraps text to a pixel width using the context's current font.
 * Honours explicit newlines; blank lines are preserved.
 * @returns {string[]} lines
 */
export function wrapText(c, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Point-in-rectangle test. */
export function inside(px, py, x, y, w, h) {
  return px >= x && py >= y && px < x + w && py < y + h;
}

export class WorkOS {
  /**
   * @param {object} cfg tuning.json `os` block
   * @param {import('./screen.js').CrtScreen} screen draw target
   * @param {import('./shift.js').Shift} shift clock and pay shown in the tray
   * @param {{click:Function, error:Function}} sfx sound hooks
   */
  constructor(cfg, screen, shift, sfx) {
    this.cfg = cfg;
    this.screen = screen;
    this.shift = shift;
    this.sfx = sfx;
    this.W = screen.width;
    this.H = screen.height;
    this.state = 'boot';
    this.bootTime = 0;
    this.time = 0;
    this.cursor = { x: this.W / 2, y: this.H / 2 };
    /** Registered desktop programs: {id, title, icon, create()}. */
    this.programs = [];
    /** Open windows, last = topmost. */
    this.windows = [];
    /** Modal dialog stack, last = active. */
    this.dialogs = [];
    this.drag = null;
    this.selectedIcon = null;
    this.lastIconClick = { id: null, t: -1 };
    /** Round number shown by the BIOS. */
    this.round = 13;
    /** When true only open windows respond; desktop and taskbar are dead. */
    this.lockdown = false;
    /** Called once when boot finishes and the desktop appears. */
    this.onReady = null;
  }

  /**
   * Adds a program to the desktop.
   * @param {{id:string, title:string, icon:string, create:() => object}} program
   */
  install(program) {
    this.programs.push(program);
  }

  /**
   * Opens a program's window, or focuses it if already open.
   * @param {string} id program id
   * @param {object} [app] an app to show directly instead of an installed program
   */
  open(id, app = null) {
    const existing = this.windows.find((w) => w.id === id);
    if (existing) return this.focus(existing);
    const n = this.windows.length;
    app ||= this.programs.find((q) => q.id === id).create();
    const win = { id, app, x: 20 + n * 10, y: 6 + n * 8, w: 284, h: 200, ...app.rect };
    this.windows.push(win);
    return win;
  }

  /** Brings a window to the front. */
  focus(win) {
    this.windows = this.windows.filter((w) => w !== win).concat(win);
    return win;
  }

  /** Closes a window. */
  close(win) {
    this.windows = this.windows.filter((w) => w !== win);
  }

  /**
   * Cuts the picture to black for a moment. Input still works underneath.
   * @param {number} seconds
   */
  blackout(seconds) {
    this.blackoutLeft = Math.max(this.blackoutLeft || 0, seconds);
  }

  /**
   * Restarts the machine into the boot screen for a new round. Clears all
   * windows and dialogs; does not restart the shift.
   * @param {number} round round number shown by the BIOS
   */
  reboot(round) {
    this.round = round;
    this.state = 'boot';
    this.bootTime = 0;
    this.windows = [];
    this.dialogs = [];
    this.lockdown = false;
    this.onReady = null;
  }

  /**
   * Shows a modal dialog. Blocks other input until dismissed.
   * @param {{title:string, lines:string[], button?:string, alert?:boolean, onClose?:Function}} d
   */
  dialog(d) {
    this.dialogs.push({ button: 'OK', ...d });
    this.sfx.error();
  }

  // --- Input ---------------------------------------------------------------

  /** Moves the cursor by a screen-pixel delta, clamped to the display. */
  moveCursor(dx, dy) {
    this.cursor.x = Math.min(this.W - 1, Math.max(0, this.cursor.x + dx));
    this.cursor.y = Math.min(this.H - 1, Math.max(0, this.cursor.y + dy));
    if (this.drag) {
      const win = this.drag.win;
      win.x = Math.round(Math.min(this.W - 20, Math.max(-win.w + 30, this.cursor.x - this.drag.ox)));
      win.y = Math.round(Math.min(this.H - TASKBAR_H - TITLE_H, Math.max(0, this.cursor.y - this.drag.oy)));
    }
  }

  /** Handles the left button being pressed or released. */
  click(down) {
    if (!down) { this.drag = null; return; }
    if (this.state !== 'desktop') return;
    this.sfx.click();
    const { x, y } = this.cursor;

    const dlg = this.dialogs[this.dialogs.length - 1];
    if (dlg) {
      const r = this.dialogRect(dlg);
      if (inside(x, y, r.bx, r.by, r.bw, r.bh)) {
        this.dialogs.pop();
        dlg.onClose?.();
      }
      return;
    }

    for (let i = this.windows.length - 1; i >= 0; i--) {
      const win = this.windows[i];
      if (!inside(x, y, win.x, win.y, win.w, win.h)) continue;
      this.focus(win);
      const closable = win.app.closable !== false && !this.lockdown;
      if (closable && inside(x, y, win.x + win.w - 14, win.y + 3, 11, 10)) return this.close(win);
      if (y < win.y + 3 + TITLE_H) {
        if (!this.lockdown) this.drag = { win, ox: x - win.x, oy: y - win.y };
        return;
      }
      const r = this.clientRect(win);
      if (inside(x, y, r.x, r.y, r.w, r.h)) win.app.mouseDown?.(x - r.x, y - r.y);
      return;
    }

    // Locked down: the desktop and taskbar no longer respond.
    if (this.lockdown) return;
    if (y >= this.H - TASKBAR_H) return this.clickTaskbar(x);

    const icon = this.iconAt(x, y);
    this.selectedIcon = icon?.id ?? null;
    if (icon) {
      if (this.lastIconClick.id === icon.id && this.time - this.lastIconClick.t < DOUBLE_CLICK_S) {
        this.open(icon.id);
        this.lastIconClick = { id: null, t: -1 };
      } else {
        this.lastIconClick = { id: icon.id, t: this.time };
      }
    }
  }

  /** Forwards a key to the focused window. */
  key(e) {
    if (this.state !== 'desktop') return;
    const dlg = this.dialogs[this.dialogs.length - 1];
    if (dlg) {
      if (e.key === 'Enter' || e.key === ' ') { this.dialogs.pop(); dlg.onClose?.(); }
      return;
    }
    this.windows[this.windows.length - 1]?.app.key?.(e);
  }

  clickTaskbar(x) {
    if (x < 44) {
      this.dialog({
        title: 'WorkOS',
        lines: ['Shut Down is unavailable during a shift.', '', 'Please return to work.'],
      });
      return;
    }
    const btn = this.taskButtons().find((b) => x >= b.x && x < b.x + b.w);
    if (btn) this.focus(btn.win);
  }

  // --- Layout --------------------------------------------------------------

  clientRect(win) {
    return { x: win.x + 3, y: win.y + 4 + TITLE_H, w: win.w - 6, h: win.h - 7 - TITLE_H };
  }

  iconLayout() {
    return this.programs.map((p, i) => ({ ...p, x: 8, y: 8 + i * 40, w: 48, h: 36 }));
  }

  iconAt(x, y) {
    return this.iconLayout().find((ic) => inside(x, y, ic.x, ic.y, ic.w, ic.h));
  }

  taskButtons() {
    return this.windows
      .slice()
      .sort((a, b) => this.programs.findIndex((p) => p.id === a.id) - this.programs.findIndex((p) => p.id === b.id))
      .map((win, i) => ({ win, x: 46 + i * 62, w: 60 }));
  }

  dialogRect(d) {
    const w = 236, h = 50 + d.lines.length * 11;
    const x = (this.W - w) / 2, y = (this.H - TASKBAR_H - h) / 2;
    return { x, y, w, h, bx: x + w / 2 - 25, by: y + h - 20, bw: 50, bh: 15 };
  }

  // --- Frame ---------------------------------------------------------------

  /** Advances boot and timers. */
  update(dt) {
    this.time += dt;
    this.blackoutLeft = Math.max(0, (this.blackoutLeft || 0) - dt);
    if (this.state === 'boot') {
      this.bootTime += dt;
      if (this.bootTime >= this.cfg.bootSeconds) {
        this.state = 'desktop';
        this.onReady?.();
      }
    }
  }

  /** Renders the whole OS into the screen canvas. */
  draw() {
    const c = this.screen.ctx;
    c.textBaseline = 'alphabetic';
    if (this.blackoutLeft > 0) {
      c.fillStyle = '#000'; c.fillRect(0, 0, this.W, this.H);
      // A thin collapsed raster line, like a CRT losing its picture.
      c.fillStyle = 'rgba(200,230,255,0.5)'; c.fillRect(0, this.H / 2, this.W, 1);
    } else if (this.state === 'boot') this.drawBoot(c);
    else this.drawDesktop(c);
    this.screen.present();
  }

  drawBoot(c) {
    c.fillStyle = '#000'; c.fillRect(0, 0, this.W, this.H);
    c.fillStyle = '#b8b8b8'; c.font = FONT_MONO;
    const lines = [
      'WORKSTATION 13   BIOS v1.13',
      '',
      `Memory test ..... ${Math.min(131072, Math.floor(this.bootTime * 90000))}K`,
      this.bootTime > 1.5 ? 'Detecting operator ......... 1 found' : '',
      this.bootTime > 2.2 ? 'Loading WorkOS 2002 ...' : '',
      this.bootTime > 3.0 ? `Round: ${this.round}    Shift length: 13:00` : '',
    ];
    lines.forEach((l, i) => c.fillText(l, 10, 20 + i * 13));
    if (Math.floor(this.time * 3) % 2 === 0) c.fillRect(10, 20 + lines.length * 13 - 9, 6, 10);
  }

  drawDesktop(c) {
    c.fillStyle = COLORS.desktop; c.fillRect(0, 0, this.W, this.H);
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.font = 'bold 13px Tahoma, Verdana, sans-serif';
    c.textAlign = 'center';
    c.fillText('HOLLOWAY DATA SOLUTIONS', this.W / 2 + 24, 104);
    c.font = FONT;
    c.fillText('Productivity is Presence.', this.W / 2 + 24, 118);
    c.textAlign = 'left';

    if (!this.lockdown) for (const ic of this.iconLayout()) this.drawIcon(c, ic);
    for (const win of this.windows) this.drawWindow(c, win, win === this.windows[this.windows.length - 1]);
    this.drawTaskbar(c);
    for (const d of this.dialogs) this.drawDialog(c, d);
    this.drawCursor(c);
  }

  drawIcon(c, ic) {
    const sel = this.selectedIcon === ic.id;
    const cx = ic.x + ic.w / 2;
    c.fillStyle = ic.color || '#e0d890';
    c.fillRect(cx - 9, ic.y + 2, 18, 16);
    c.fillStyle = '#000'; c.fillRect(cx - 9, ic.y + 17, 18, 1); c.fillRect(cx + 8, ic.y + 2, 1, 16);
    c.fillStyle = '#000'; c.font = FONT_BOLD; c.textAlign = 'center';
    c.fillText(ic.icon, cx, ic.y + 13);
    c.font = FONT;
    const tw = c.measureText(ic.title).width + 4;
    if (sel) { c.fillStyle = COLORS.select; c.fillRect(cx - tw / 2, ic.y + 22, tw, 11); }
    c.fillStyle = '#fff';
    c.fillText(ic.title, cx, ic.y + 30);
    c.textAlign = 'left';
  }

  drawWindow(c, win, active) {
    bevel(c, win.x, win.y, win.w, win.h);
    const g = c.createLinearGradient(win.x, 0, win.x + win.w, 0);
    g.addColorStop(0, active ? COLORS.title : COLORS.titleInactive);
    g.addColorStop(1, active ? COLORS.titleEnd : '#b0b0b0');
    c.fillStyle = g; c.fillRect(win.x + 3, win.y + 3, win.w - 6, TITLE_H);
    c.fillStyle = '#fff'; c.font = FONT_BOLD;
    c.fillText(win.app.title, win.x + 6, win.y + 12);
    if (win.app.closable !== false) {
      bevel(c, win.x + win.w - 14, win.y + 4, 10, 9);
      c.fillStyle = '#000'; c.font = FONT_BOLD; c.fillText('x', win.x + win.w - 11, win.y + 11);
    }

    const r = this.clientRect(win);
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.translate(r.x, r.y);
    win.app.draw(c, { x: 0, y: 0, w: r.w, h: r.h }, this.time);
    c.restore();
  }

  drawTaskbar(c) {
    const y = this.H - TASKBAR_H;
    bevel(c, 0, y, this.W, TASKBAR_H);
    bevel(c, 2, y + 2, 40, TASKBAR_H - 4);
    c.fillStyle = '#000'; c.font = FONT_BOLD; c.fillText('WorkOS', 6, y + 11);

    const top = this.windows[this.windows.length - 1];
    for (const b of this.taskButtons()) {
      bevel(c, b.x, y + 2, b.w, TASKBAR_H - 4, b.win === top);
      c.font = FONT; c.fillStyle = '#000';
      const label = b.win.app.title.length > 11 ? b.win.app.title.slice(0, 10) + '…' : b.win.app.title;
      c.fillText(label, b.x + 3, y + 11);
    }

    // Tray: pay and the shift clock. The clock turns red in the last minute.
    const tw = 92;
    bevel(c, this.W - tw - 2, y + 2, tw, TASKBAR_H - 4, true);
    c.font = FONT;
    c.fillStyle = this.shift.pay < 0 ? COLORS.alert : '#000';
    c.fillText(this.shift.payText(), this.W - tw + 2, y + 11);
    c.fillStyle = this.shift.remaining < 60 ? COLORS.alert : '#000';
    c.font = FONT_BOLD;
    c.fillText(this.shift.clockText(), this.W - 34, y + 11);
  }

  drawDialog(c, d) {
    const r = this.dialogRect(d);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, 0, this.W, this.H - TASKBAR_H);
    bevel(c, r.x, r.y, r.w, r.h);
    c.fillStyle = d.alert ? '#7a0c0c' : COLORS.title;
    c.fillRect(r.x + 3, r.y + 3, r.w - 6, TITLE_H);
    c.fillStyle = '#fff'; c.font = FONT_BOLD; c.fillText(d.title, r.x + 6, r.y + 12);
    c.fillStyle = '#000'; c.font = FONT;
    d.lines.forEach((l, i) => c.fillText(l, r.x + 10, r.y + 30 + i * 11));
    bevel(c, r.bx, r.by, r.bw, r.bh);
    c.textAlign = 'center'; c.fillText(d.button, r.bx + r.bw / 2, r.by + 11); c.textAlign = 'left';
  }

  drawCursor(c) {
    const { x, y } = this.cursor;
    const shape = [[0, 0], [0, 11], [3, 8], [5, 12], [7, 11], [5, 7], [8, 7]];
    c.beginPath();
    shape.forEach(([px, py], i) => (i ? c.lineTo(x + px, y + py) : c.moveTo(x + px, y + py)));
    c.closePath();
    c.fillStyle = '#fff'; c.fill();
    c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke();
  }
}

/**
 * Truncates text with an ellipsis to fit a pixel width in the current font.
 * @returns {string}
 */
export function clipText(c, text, w) {
  if (c.measureText(text).width <= w) return text;
  let s = text;
  while (s.length && c.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
