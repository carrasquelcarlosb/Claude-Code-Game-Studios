import { FONT, FONT_BOLD } from '../os.js';

/**
 * A stand-in app window for programs not built yet.
 * @param {string} title window title
 * @param {string[]} lines body text
 * @returns {object} WorkOS app
 */
export function placeholderApp(title, lines) {
  return {
    title,
    draw(c, r) {
      c.fillStyle = '#fff'; c.fillRect(0, 0, r.w, r.h);
      c.fillStyle = '#000'; c.font = FONT_BOLD;
      c.fillText(title, 8, 14);
      c.font = FONT;
      lines.forEach((l, i) => c.fillText(l, 8, 32 + i * 12));
    },
  };
}
