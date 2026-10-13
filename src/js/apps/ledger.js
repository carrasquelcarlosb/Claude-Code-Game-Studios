import { FONT, FONT_BOLD, FONT_DIGITS as FONT_MONO, bevel } from '../os.js';

/**
 * Ledger.xls: the data-entry task. The player copies 13-digit source codes
 * into the Entry column one row at a time. Each committed match pays one task.
 * Row content and the uncanny notes come from data/ledger.json.
 */

const ROW_H = 11;
const COLS = { num: 0, src: 16, entry: 112, status: 208 };

/**
 * @param {object} data parsed ledger.json
 * @param {object} deps
 * @param {import('../shift.js').Shift} deps.shift credited per committed row
 * @param {import('../os.js').WorkOS} deps.os used for the completion dialog
 * @param {{error:Function}} deps.sfx error sound on a mismatch
 * @param {() => void} [deps.onComplete] called once when all rows are done
 * @param {(stage: object, repeats: number) => void} [deps.onError] called when a
 *   mistake reaches a dread stage from ledger.json `errorStages`
 * @returns {object} WorkOS app
 */
export function createLedger(data, { shift, os, sfx, onComplete, onError }) {
  const rows = data.rows.map((r) => ({ ...r, entry: '', done: false }));
  let current = 0;
  let typed = '';
  let flashErr = 0; // seconds of red flash remaining
  let lastT = 0;
  let status = data.intro;
  let complete = false;
  let errors = 0; // mistakes this shift, drives the dread escalation

  const length = rows[0].code.length;

  const enterRow = (i) => {
    current = i;
    typed = '';
    const r = rows[i];
    if (r?.prefill) typed = r.code;
    if (r?.note !== undefined) status = r.note || status;
  };

  const commit = () => {
    const r = rows[current];
    const ok = r.acceptAny ? typed.length === length : typed === r.code;
    if (!ok) {
      errors++;
      flashErr = 0.5;
      status = `Row ${current + 1}: entry does not match source. Re-enter.`;
      sfx.error();
      // Escalating dread: the highest stage reached applies; `repeat` stages
      // fire again on every later error.
      const stage = [...(data.errorStages || [])].reverse()
        .find((s) => errors === s.errors || (s.repeat && errors > s.errors));
      if (!stage?.keepEntry) typed = ''; // a kept wrong entry sits there, as if expected
      if (stage?.status) status = stage.status;
      if (stage?.corruptCode && current > 0) rows[current - 1].code = stage.corruptCode;
      if (stage) onError?.(stage, errors - stage.errors);
      return;
    }
    r.entry = typed;
    r.done = true;
    shift.completeTask();
    if (r.doneNote) status = r.doneNote;
    if (current + 1 < rows.length) {
      enterRow(current + 1);
    } else {
      complete = true;
      typed = '';
      os.dialog({ title: data.completeTitle, lines: data.completeLines });
      onComplete?.();
    }
  };

  enterRow(0);

  return {
    title: data.title,
    /** Preferred window: nearly full-screen, like a real spreadsheet. */
    rect: { x: 2, y: 2, w: 316, h: 220 },

    key(e) {
      if (complete) return;
      if (/^[0-9]$/.test(e.key) && typed.length < length) typed += e.key;
      else if (e.key === 'Backspace') typed = typed.slice(0, -1);
      else if (e.key === 'Enter') commit();
    },

    mouseDown(x, y) {
      // Clicking the active row's Entry cell is allowed; nothing else is editable.
      const rowY = 30;
      const i = Math.floor((y - rowY) / ROW_H);
      if (i === current && x >= COLS.entry) status = data.intro;
    },

    draw(c, r, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      flashErr = Math.max(0, flashErr - dt);

      c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, r.w, r.h);

      // Formula bar: cell reference and the current entry.
      bevel(c, 2, 2, 30, 13, true, '#fff');
      bevel(c, 34, 2, r.w - 36, 13, true, '#fff');
      c.fillStyle = '#000'; c.font = FONT;
      c.fillText(complete ? '' : `B${current + 1}`, 6, 12);
      c.font = FONT_MONO;
      c.fillText(complete ? '' : typed, 38, 12);

      // Column headers.
      const hy = 18;
      c.font = FONT_BOLD;
      const headers = [['#', COLS.num, 16], ['Source Code', COLS.src, 96], ['Entry', COLS.entry, 96], ['Status', COLS.status, r.w - COLS.status - 2]];
      for (const [label, x, w] of headers) {
        bevel(c, x + 2, hy, w, 11);
        c.fillStyle = '#000'; c.fillText(label, x + 5, hy + 9);
      }

      // Rows.
      const y0 = 30;
      c.fillStyle = '#fff'; c.fillRect(2, y0, r.w - 4, rows.length * ROW_H);
      rows.forEach((row, i) => {
        const y = y0 + i * ROW_H;
        const active = i === current && !complete;
        if (active) {
          c.fillStyle = flashErr > 0 ? '#f0a0a0' : '#dde6f6';
          c.fillRect(2, y, r.w - 4, ROW_H);
        }
        c.strokeStyle = '#c8c8c8'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(2, y + ROW_H - 0.5); c.lineTo(r.w - 2, y + ROW_H - 0.5); c.stroke();
        for (const x of [COLS.src, COLS.entry, COLS.status]) {
          c.beginPath(); c.moveTo(x + 1.5, y); c.lineTo(x + 1.5, y + ROW_H); c.stroke();
        }

        c.fillStyle = '#606060'; c.font = FONT;
        c.fillText(String(i + 1), 5, y + 9);
        c.fillStyle = '#000'; c.font = FONT_MONO;
        // Rows ahead stay hidden until reached, like a pending feed.
        if (i <= current || complete) c.fillText(row.code, COLS.src + 5, y + 9);

        if (row.done) {
          c.fillText(row.entry, COLS.entry + 5, y + 9);
          c.fillStyle = '#106010'; c.font = FONT_BOLD;
          c.fillText('OK', COLS.status + 6, y + 9);
        } else if (active) {
          c.fillStyle = row.prefill && typed === row.code ? '#808080' : '#000';
          c.fillText(typed, COLS.entry + 5, y + 9);
          if (Math.floor(t * 2.5) % 2 === 0) {
            c.fillStyle = '#000';
            c.fillRect(COLS.entry + 5 + c.measureText(typed).width, y + 2, 1, ROW_H - 3);
          }
          c.fillStyle = '#606060'; c.font = FONT;
          c.fillText('pending', COLS.status + 6, y + 9);
        }
      });

      // Status bar.
      const sy = r.h - 13;
      bevel(c, 2, sy, r.w - 4, 12, true);
      c.fillStyle = '#000'; c.font = FONT;
      const done = rows.filter((x) => x.done).length;
      c.fillText(status, 5, sy + 9);
      c.textAlign = 'right';
      c.fillText(`${done}/13`, r.w - 6, sy + 9);
      c.textAlign = 'left';
    },
  };
}
