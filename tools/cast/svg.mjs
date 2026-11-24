// svg.mjs: draws terminal screens (from emulate.mjs) as SVG, for animated SVGs that GitHub shows as images.
//   - Text is drawn as glyph outlines (JetBrains Mono, tools/cast/fonts), each glyph defined once and reused, so
//     it looks the same everywhere and needs no web font (an SVG shown as an <img> cannot load one).
//   - Box drawing (─ ━ │ ╭ ╮ ╰ ╯), braille spinners, ✓ ✗ and ◦ are drawn as vector shapes that fill their cell, the
//     way terminals draw them, so card borders always join.
//   - Each distinct row is defined once and placed with <use>; a film's frames become a strip of screens moved
//     by one CSS animation (step timing), so nothing but the SVG itself is needed to play it.
import { createRequire } from 'node:module';
import { cellWidth } from './emulate.mjs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const opentype = require('opentype.js');
const HERE = dirname(fileURLToPath(import.meta.url));
export const FONTS = join(HERE, 'fonts');
export const loadFont = (file) => opentype.loadSync(join(FONTS, file));

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Text set in a proportional font (the banner's motto), as one path: font, size, x, baseline y, tracking (em).
export function textPath(font, text, x, y, size, tracking = 0) {
  let cx = x, d = '';
  const glyphs = font.stringToGlyphs(text);
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, y, size).toPathData(1);
    const kern = i + 1 < glyphs.length ? font.getKerningValue(g, glyphs[i + 1]) : 0;
    cx += ((g.advanceWidth + kern) / font.unitsPerEm) * size + tracking * size;
  });
  return { d, width: cx - x - tracking * size };
}
export const textWidth = (font, text, size, tracking = 0) => textPath(font, text, 0, 0, size, tracking).width;

// A terminal: cell metrics from the monospace font at size fs, line height lh (em), and a palette that maps the
// tools' colours (tools/ui.mjs) to this rendering's colours.
export function terminal({ fs, lh = 1.28, palette, prefix = 't' }) {
  const reg = loadFont('JetBrainsMono-Regular.ttf'), bold = loadFont('JetBrainsMono-Bold.ttf');
  const W = (reg.charToGlyph('a').advanceWidth / reg.unitsPerEm) * fs, H = lh * fs;
  const asc = (reg.ascender / reg.unitsPerEm) * fs, desc = (-reg.descender / reg.unitsPerEm) * fs;
  const base = (H - (asc + desc)) / 2 + asc; // baseline below the top of a row
  const glyphs = new Map(); // key -> { id, d }
  const glyphId = (ch, isBold) => {
    const key = (isBold ? 'b' : 'r') + ch.codePointAt(0).toString(16);
    if (!glyphs.has(key)) {
      const f = isBold ? bold : reg, g = f.charToGlyph(ch);
      glyphs.set(key, { id: prefix + 'g' + key, d: g.index ? g.getPath(0, 0, fs).toPathData(1) : '' });
    }
    return glyphs.get(key).id;
  };
  const colour = (c) => (c ? palette[c.toLowerCase()] ?? c : null);
  const stroke = r1(fs * 0.075), heavy = r1(fs * 0.16);

  // one row of runs -> SVG (relative to the row's top-left)
  function row(runs) {
    let col = 0, out = '';
    for (const run of runs) {
      let fg = colour(run.fg) ?? (run.dim ? palette.muted : palette.fg), bg = colour(run.bg);
      if (run.inv) { const t = fg; fg = bg ?? palette.bg; bg = t; }
      const op = run.dim && run.fg ? ' opacity=".6"' : '';
      // columns as the emulator counts them: a wide character takes two, a combining mark none (it is drawn where
      // the character before it ends, as its glyph expects)
      const chars = [...run.text], x0 = col * W, cells = chars.reduce((n, ch) => n + cellWidth(ch.codePointAt(0)), 0);
      if (bg) out += `<rect x="${r1(x0)}" y="0" width="${r1(cells * W + 0.5)}" height="${r1(H + 0.5)}" fill="${bg}"/>`;
      let g = '', lines = '', cc = 0;
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i], cp = ch.codePointAt(0), w = cellWidth(cp), cx = (col + cc) * W, mid = H / 2, cxm = cx + W / 2;
        cc += w;
        if (ch === ' ') continue;
        if (ch === '─' || ch === '━') {
          let n = 1; while (chars[i + n] === ch) n++;
          lines += `<path d="M${r1(cx)} ${r1(mid)}h${r1(n * W)}" stroke-width="${ch === '━' ? heavy : stroke}"/>`;
          i += n - 1; cc += n - 1; continue;
        }
        if (ch === '│') { lines += `<path d="M${r1(cxm)} 0v${r1(H)}" stroke-width="${stroke}"/>`; continue; }
        const rr = W / 2;
        if (ch === '╭') { lines += `<path d="M${r1(cx + W)} ${r1(mid)}H${r1(cxm + rr)}A${r1(rr)} ${r1(rr)} 0 0 0 ${r1(cxm)} ${r1(mid + rr)}V${r1(H)}" stroke-width="${stroke}" fill="none"/>`; continue; }
        if (ch === '╮') { lines += `<path d="M${r1(cx)} ${r1(mid)}H${r1(cxm - rr)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(cxm)} ${r1(mid + rr)}V${r1(H)}" stroke-width="${stroke}" fill="none"/>`; continue; }
        if (ch === '╰') { lines += `<path d="M${r1(cxm)} 0V${r1(mid - rr)}A${r1(rr)} ${r1(rr)} 0 0 0 ${r1(cxm + rr)} ${r1(mid)}H${r1(cx + W)}" stroke-width="${stroke}" fill="none"/>`; continue; }
        if (ch === '╯') { lines += `<path d="M${r1(cxm)} 0V${r1(mid - rr)}A${r1(rr)} ${r1(rr)} 0 0 1 ${r1(cxm - rr)} ${r1(mid)}H${r1(cx)}" stroke-width="${stroke}" fill="none"/>`; continue; }
        if (cp >= 0x2800 && cp <= 0x28ff) {
          // braille: dots 1-3 and 7 in the left column, 4-6 and 8 in the right
          const bits = cp - 0x2800, pos = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]];
          pos.forEach(([c, r], k) => { if (bits & (1 << k)) g += `<circle cx="${r1(cx + W * (c ? 0.68 : 0.32))}" cy="${r1(H * (0.2 + 0.2 * r))}" r="${r1(fs * 0.075)}"/>`; });
          continue;
        }
        if (ch === '✓') { lines += `<path d="M${r1(cx + W * 0.18)} ${r1(mid + fs * 0.02)}l${r1(W * 0.24)} ${r1(fs * 0.2)}l${r1(W * 0.42)} ${r1(-fs * 0.42)}" stroke-width="${r1(fs * 0.09)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`; continue; }
        if (ch === '✗') { const a = fs * 0.2; lines += `<path d="M${r1(cxm - a)} ${r1(mid - a)}l${r1(2 * a)} ${r1(2 * a)}M${r1(cxm + a)} ${r1(mid - a)}l${r1(-2 * a)} ${r1(2 * a)}" stroke-width="${r1(fs * 0.09)}" stroke-linecap="round"/>`; continue; }
        if (ch === '◦') { lines += `<circle cx="${r1(cxm)}" cy="${r1(mid)}" r="${r1(fs * 0.16)}" stroke-width="${stroke}" fill="none"/>`; continue; }
        g += `<use href="#${glyphId(ch, run.bold)}" x="${r1(cx)}" y="${r1(base)}"/>`;
      }
      if (g) out += `<g fill="${fg}"${op}>${g}</g>`;
      if (lines) out += `<g stroke="${fg}" fill="none"${op}>${lines}</g>`;
      col += cells;
    }
    return out;
  }

  // Defined rows: each distinct row once (by content), placed with <use>.
  const rowDefs = new Map();
  const rowRef = (runs) => {
    if (!runs.length) return null;
    const key = JSON.stringify(runs);
    if (!rowDefs.has(key)) rowDefs.set(key, { id: prefix + 'r' + rowDefs.size.toString(36), svg: row(runs) });
    return rowDefs.get(key).id;
  };
  // the <defs> for everything placed so far: glyphs, then rows
  const defs = () => [...glyphs.values()].filter((g) => g.d).map((g) => `<path id="${g.id}" d="${g.d}"/>`).join('')
    + [...rowDefs.values()].map((r) => `<g id="${r.id}">${r.svg}</g>`).join('');
  return { W, H, base, rowRef, defs, row, glyphId };
}

// An animated viewport: a list of steps { rows (runs per row), top (first row shown), dur (seconds) } shown in a
// window of `visible` rows. Every step becomes one screen of a vertical strip; one keyframes animation moves the
// strip to the step's screen at the step's time (step-end timing: no in-between frames). Returns { svg, duration }.
export function strip(term, steps, { visible, id = 'v' }) {
  const VH = visible * term.H, total = steps.reduce((n, s) => n + s.dur, 0);
  let t = 0, screens = '', keys = '';
  steps.forEach((s, k) => {
    const uses = [];
    for (let i = 0; i < visible; i++) {
      const ref = term.rowRef(s.rows[s.top + i] ?? []);
      if (ref) uses.push(`<use href="#${ref}" y="${r1(k * VH + i * term.H)}"/>`);
    }
    screens += uses.join('');
    keys += `${(t / total * 100).toFixed(3)}%{transform:translateY(${r1(-k * VH)}px)}`;
    t += s.dur;
  });
  const css = `@keyframes ${id}{${keys}100%{transform:translateY(${r1(-(steps.length - 1) * VH)}px)}}.${id}{animation:${id} ${total.toFixed(2)}s step-end infinite}`;
  return { svg: `<g class="${id}">${screens}</g>`, css, duration: total, VH };
}
export { esc, r1 };
