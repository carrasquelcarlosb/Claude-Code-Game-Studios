import { FONT, FONT_BOLD, bevel, inside, wrapText, clipText } from '../os.js';
import { stageFor } from '../dread.js';

/**
 * Outreach Pro 3.1: the marketing-approval task. Campaigns are processed in
 * order. Before deciding, the player must open the Audience tab and tick the
 * compliance box. Correct decisions pay one task; wrong ones cost pay and must
 * be redone. A `forced` campaign has Reject locked by Management.
 * Content comes from data/outreach.json.
 */

const LIST_W = 98;

/**
 * @param {object} data parsed outreach.json
 * @param {object} deps
 * @param {import('../shift.js').Shift} deps.shift pay and task credit
 * @param {import('../os.js').WorkOS} deps.os dialogs
 * @param {() => void} [deps.onComplete] called once when the queue is empty
 * @param {(stage: object, repeats: number) => void} [deps.onError] dread stage reached
 *   by wrong decisions, from outreach.json `errorStages`
 * @returns {object} WorkOS app
 */
export function createOutreach(data, { shift, os, onComplete, onError }) {
  const items = data.campaigns.map((c) => ({ ...c, status: 'pending' }));
  let current = 0;
  let tab = 'content';
  let audienceSeen = false;
  let confirmed = false;
  let complete = false;
  let errors = 0; // wrong decisions, drives the dread escalation
  let L = {};

  const resetReview = () => { tab = 'content'; audienceSeen = false; confirmed = false; };

  const decide = (choice) => {
    const it = items[current];
    if (!audienceSeen || !confirmed) {
      os.dialog({ title: 'Outreach Pro', lines: data.reviewFirst });
      return;
    }
    if (it.forced && choice === 'reject') {
      os.dialog({ title: 'Management Override', alert: true, lines: data.forcedLines });
      return;
    }
    if (choice !== it.decision) {
      shift.mistake('Compliance', shift.cfg.wrongDecisionPenalty);
      errors++;
      const stage = stageFor(data.errorStages, errors);
      if (stage) onError?.(stage, errors - stage.errors);
      confirmed = false;
      os.dialog({ title: data.wrongTitle, alert: true, lines: data.wrongLines });
      return;
    }
    it.status = choice === 'approve' ? 'approved' : 'rejected';
    shift.completeTask();
    if (current + 1 < items.length) {
      current++;
      resetReview();
    } else {
      complete = true;
      os.dialog({ title: data.completeTitle, lines: data.completeLines });
      onComplete?.();
    }
  };

  return {
    title: data.title,
    rect: { x: 2, y: 2, w: 316, h: 220 },
    /** @returns {number} campaigns decided so far */
    progress: () => items.filter((x) => x.status !== 'pending').length,

    mouseDown(x, y) {
      if (complete || !L.tabContent) return; // hit-boxes exist after the first draw
      if (inside(x, y, ...L.tabContent)) tab = 'content';
      else if (inside(x, y, ...L.tabAudience)) { tab = 'audience'; audienceSeen = true; }
      else if (inside(x, y, ...L.check)) confirmed = !confirmed;
      else if (inside(x, y, ...L.approve)) decide('approve');
      else if (inside(x, y, ...L.reject)) decide('reject');
    },

    draw(c, r) {
      c.fillStyle = '#c0c0c0'; c.fillRect(0, 0, r.w, r.h);

      // Campaign queue.
      bevel(c, 2, 2, LIST_W, r.h - 18, true, '#fff');
      c.font = FONT_BOLD; c.fillStyle = '#000';
      c.fillText('Queue', 5, 11);
      items.forEach((it, i) => {
        const y = 15 + i * 12;
        if (i === current && !complete) { c.fillStyle = '#0a246a'; c.fillRect(3, y, LIST_W - 2, 12); }
        c.fillStyle = i === current && !complete ? '#fff' : it.status === 'pending' ? '#000' : '#808080';
        c.font = FONT;
        const mark = it.status === 'approved' ? '✓' : it.status === 'rejected' ? '✗' : '·';
        c.fillText(clipText(c, `${mark} ${it.name}`, LIST_W - 6), 5, y + 9);
      });

      // Detail panel.
      const px = LIST_W + 6, pw = r.w - px - 2;
      const it = items[Math.min(current, items.length - 1)];
      L.tabContent = [px, 2, 52, 13];
      L.tabAudience = [px + 54, 2, 56, 13];
      bevel(c, ...L.tabContent, tab !== 'content');
      bevel(c, ...L.tabAudience, tab !== 'audience');
      c.fillStyle = '#000'; c.font = tab === 'content' ? FONT_BOLD : FONT;
      c.fillText('Content', px + 8, 12);
      c.font = tab === 'audience' ? FONT_BOLD : FONT;
      c.fillText(`Audience${audienceSeen ? '' : ' *'}`, px + 60, 12);

      const by = 16, bh = 108;
      bevel(c, px, by, pw, bh, true, '#fff');
      c.fillStyle = '#000';
      if (complete) {
        c.font = FONT_BOLD; c.fillText('Queue empty.', px + 6, by + 14);
      } else if (tab === 'content') {
        c.font = FONT_BOLD; c.fillText(it.name, px + 6, by + 12);
        c.font = FONT; c.fillText(clipText(c, `Subject: ${it.subject}`, pw - 12), px + 6, by + 24);
        c.fillStyle = '#e8e8e8'; c.fillRect(px + 4, by + 28, pw - 8, 1);
        c.fillStyle = '#000';
        wrapText(c, it.body, pw - 14).slice(0, 7).forEach((l, i) => c.fillText(l, px + 6, by + 40 + i * 10.5));
      } else {
        c.font = FONT_BOLD; c.fillText('Recipients', px + 6, by + 12);
        c.font = FONT;
        it.audience.forEach((a, i) => {
          c.fillStyle = a.includes('@holloway.local') ? '#7a0c0c' : '#000';
          c.fillText(clipText(c, a, pw - 12), px + 6, by + 26 + i * 11);
        });
      }

      // Review checkbox and decision buttons.
      const cy = by + bh + 6;
      L.check = [px, cy, pw, 12];
      bevel(c, px, cy + 1, 10, 10, true, '#fff');
      if (confirmed) { c.fillStyle = '#000'; c.font = FONT_BOLD; c.fillText('✓', px + 2, cy + 10); }
      c.fillStyle = '#000'; c.font = FONT;
      c.fillText('I have reviewed this campaign per policy.', px + 14, cy + 10);

      const ready = audienceSeen && confirmed && !complete;
      const bw = 62, bY = cy + 18;
      L.approve = [px, bY, bw, 15];
      L.reject = [px + bw + 6, bY, bw, 15];
      for (const [rect, label, enabled] of [[L.approve, 'Approve', ready], [L.reject, 'Reject', ready && !it.forced]]) {
        bevel(c, ...rect);
        c.fillStyle = enabled ? '#000' : '#808080'; c.font = FONT_BOLD; c.textAlign = 'center';
        c.fillText(label, rect[0] + bw / 2, rect[1] + 11); c.textAlign = 'left';
      }
      if (it.forced && !complete) {
        c.fillStyle = '#7a0c0c'; c.font = FONT;
        c.fillText('Reject locked by Management.', px, bY + 27);
      }

      // Status bar with the policy reminder.
      bevel(c, 2, r.h - 14, r.w - 4, 12, true);
      c.fillStyle = '#000'; c.font = FONT;
      c.fillText(data.policy, 5, r.h - 5);
    },
  };
}
