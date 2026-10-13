import { FONT, FONT_BOLD, bevel, inside, wrapText } from '../os.js';

/**
 * Holloway Mail: the email task. Each of the 13 messages must be answered with
 * one of three canned corporate replies; sending pays one task. Message text
 * comes from data/mail.json. `{lastReply}` in a body is replaced with the
 * player's most recent reply when the message is opened.
 */

const ROW_H = 11;
const LIST_Y = 28;
const SEND_SECONDS = 1.3;

/**
 * @param {object} data parsed mail.json
 * @param {object} deps
 * @param {import('../shift.js').Shift} deps.shift credited per sent reply
 * @param {import('../os.js').WorkOS} deps.os used for the completion dialog
 * @param {() => void} [deps.onComplete] called once when every message is answered
 * @returns {object} WorkOS app, plus `unread()` for the desktop icon label
 */
export function createMail(data, { shift, os, onComplete }) {
  const msgs = data.messages.map((m) => ({ ...m, read: false, replied: false }));
  let view = 'inbox';
  let open = null; // index of the message being read
  let choice = -1;
  let sending = 0; // seconds of send progress, 0 = idle
  let lastReply = '...';
  let lastT = 0;
  let complete = false;
  let layout = { replies: [], send: null, back: null };

  const openMessage = (i) => {
    open = i;
    choice = -1;
    view = 'message';
    msgs[i].read = true;
    msgs[i].shownBody = msgs[i].body.replace('{lastReply}', lastReply);
  };

  const finishSend = () => {
    const m = msgs[open];
    m.replied = true;
    lastReply = m.replies[choice];
    shift.completeTask();
    sending = 0;
    view = 'inbox';
    if (!complete && msgs.every((x) => x.replied)) {
      complete = true;
      os.dialog({ title: data.completeTitle, lines: data.completeLines });
      onComplete?.();
    }
  };

  const send = () => {
    if (view === 'message' && choice >= 0 && !sending && !msgs[open].replied) sending = 0.0001;
  };

  return {
    title: data.title,
    rect: { x: 2, y: 2, w: 316, h: 220 },

    /** @returns {number} messages not yet read */
    unread: () => msgs.filter((m) => !m.read).length,

    key(e) {
      if (sending) return;
      if (view === 'message') {
        if (['1', '2', '3'].includes(e.key) && !msgs[open].replied) choice = Number(e.key) - 1;
        else if (e.key === 'Enter') send();
        else if (e.key === 'Escape' || e.key === 'Backspace') view = 'inbox';
      } else if (e.key === 'Enter') {
        const next = msgs.findIndex((m) => !m.replied);
        if (next >= 0) openMessage(next);
      }
    },

    mouseDown(x, y) {
      if (sending) return;
      if (view === 'inbox') {
        const i = Math.floor((y - LIST_Y) / ROW_H);
        if (y >= LIST_Y && i >= 0 && i < msgs.length) openMessage(i);
        return;
      }
      const L = layout;
      if (L.back && inside(x, y, ...L.back)) { view = 'inbox'; return; }
      if (msgs[open].replied) return;
      L.replies.forEach((rr, i) => { if (inside(x, y, ...rr)) choice = i; });
      if (L.send && inside(x, y, ...L.send)) send();
    },

    draw(c, r, t) {
      const dt = Math.max(0, t - lastT); lastT = t;
      if (sending) {
        sending += dt;
        if (sending >= SEND_SECONDS) finishSend();
      }
      c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, r.w, r.h);
      if (view === 'inbox') drawInbox(c, r); else drawMessage(c, r);
    },
  };

  function drawInbox(c, r) {
    const unread = msgs.filter((m) => !m.read).length;
    const todo = msgs.filter((m) => !m.replied).length;
    c.fillStyle = '#000'; c.font = FONT_BOLD;
    c.fillText(`Inbox (${unread} unread)`, 4, 11);
    c.font = FONT;
    c.textAlign = 'right'; c.fillText(`${13 - todo}/13 answered`, r.w - 4, 11); c.textAlign = 'left';

    const cols = [['', 2, 12], ['From', 14, 96], ['Subject', 110, r.w - 162], ['Received', r.w - 52, 50]];
    for (const [label, x, w] of cols) {
      bevel(c, x, 16, w, 11);
      c.fillStyle = '#000'; c.font = FONT_BOLD; c.fillText(label, x + 3, 25);
    }
    c.fillStyle = '#fff'; c.fillRect(2, LIST_Y, r.w - 4, msgs.length * ROW_H);
    msgs.forEach((m, i) => {
      const y = LIST_Y + i * ROW_H;
      c.font = m.read ? FONT : FONT_BOLD;
      c.fillStyle = m.from === 'Management' ? '#7a0c0c' : '#000';
      c.fillText(m.replied ? '↵' : m.read ? '' : '✉', 4, y + 9);
      c.fillText(clip(c, m.from, 92), 17, y + 9);
      c.fillText(clip(c, m.subject, r.w - 166), 113, y + 9);
      c.font = FONT; c.fillStyle = '#505050';
      c.fillText(data.time, r.w - 49, y + 9);
    });
    bevel(c, 2, r.h - 13, r.w - 4, 12, true);
    c.fillStyle = '#000'; c.font = FONT;
    c.fillText(todo ? 'Click a message to read it. Enter opens the next unanswered.' : 'No messages require a reply.', 5, r.h - 4);
  }

  function drawMessage(c, r) {
    const m = msgs[open];
    layout = { replies: [], send: null, back: [2, 2, 46, 13] };
    bevel(c, 2, 2, 46, 13);
    c.fillStyle = '#000'; c.font = FONT; c.fillText('< Inbox', 8, 11);

    c.font = FONT_BOLD; c.fillText('From:', 54, 11); c.fillText('Subject:', 54, 22);
    c.font = FONT;
    c.fillStyle = m.from === 'Management' ? '#7a0c0c' : '#000';
    c.fillText(m.from, 98, 11);
    c.fillStyle = '#000';
    c.fillText(clip(c, m.subject, r.w - 102), 98, 22);

    // Body.
    const by = 27, bh = 88;
    bevel(c, 2, by, r.w - 4, bh, true, '#fff');
    c.fillStyle = '#000'; c.font = FONT;
    wrapText(c, m.shownBody, r.w - 14).slice(0, 8).forEach((l, i) => c.fillText(l, 7, by + 11 + i * 10.5));

    // Reply choices.
    let y = by + bh + 4;
    c.font = FONT_BOLD; c.fillStyle = '#000';
    c.fillText(m.replied ? 'Reply sent.' : 'Quick Reply (1-3):', 4, y + 8);
    y += 11;
    m.replies.forEach((text, i) => {
      const rect = [4, y, r.w - 8, 12];
      layout.replies.push(rect);
      const selected = choice === i;
      bevel(c, rect[0], rect[1], 10, 10, true, '#fff');
      if (selected) { c.fillStyle = '#000'; c.fillRect(rect[0] + 3, rect[1] + 3, 4, 4); }
      c.fillStyle = m.replied ? '#808080' : '#000'; c.font = FONT;
      c.fillText(`${i + 1}. ${text}`, rect[0] + 14, rect[1] + 9);
      y += 13;
    });

    // Send button and progress.
    const sy = r.h - 17;
    const sendRect = [r.w - 54, sy, 50, 14];
    layout.send = sendRect;
    bevel(c, ...sendRect);
    c.fillStyle = choice >= 0 && !m.replied ? '#000' : '#808080';
    c.font = FONT_BOLD; c.textAlign = 'center';
    c.fillText('Send', sendRect[0] + 25, sy + 10); c.textAlign = 'left';
    if (sending) {
      bevel(c, 4, sy + 1, r.w - 64, 12, true, '#fff');
      const blocks = Math.floor((sending / SEND_SECONDS) * 20);
      c.fillStyle = '#0a246a';
      for (let b = 0; b < blocks; b++) c.fillRect(6 + b * ((r.w - 68) / 20), sy + 3, (r.w - 68) / 20 - 2, 8);
    } else {
      c.fillStyle = '#404040'; c.font = FONT;
      c.fillText(m.replied ? 'Backspace returns to the inbox.' : 'Pick a reply, then Send (or Enter).', 6, sy + 10);
    }
  }
}

function clip(c, text, w) {
  if (c.measureText(text).width <= w) return text;
  let s = text;
  while (s.length && c.measureText(s + '…').width > w) s = s.slice(0, -1);
  return s + '…';
}
