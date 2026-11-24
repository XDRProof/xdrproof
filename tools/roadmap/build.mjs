#!/usr/bin/env node
// roadmap/build.mjs [--bodies <dir> --sha <commit>]: the roadmap issues' pictures and text, from deliverables.mjs.
//   - .github/assets/roadmap/dNN.svg: "How the parts fit" for each deliverable, in our drawing style (paper, ink,
//     gold), with our mark in the stamp at its foot (every figure carries it, Abu, 24 Nov 2026). Text is drawn as
//     outlines (tools/cast/fonts), so the picture looks the same on GitHub's light and dark themes and needs no font.
//   - with --bodies: dNN.md, the body of issue #NN in the "R1 + R3" format, and titles.json. The pictures are linked
//     at a pinned commit (--sha), so a later change to the repository never changes a posted issue.
// Needs the fonts' reader once: npm ci --ignore-scripts --prefix tools/cast
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textPath, loadFont, esc, r1 } from '../cast/svg.mjs';
import { DELIVERABLES, TRANCHES } from './deliverables.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, '.github', 'assets', 'roadmap');
const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const BODIES = arg('--bodies'), SHA = arg('--sha');
if (BODIES && !/^[0-9a-f]{40}$/.test(SHA ?? '')) { console.error('roadmap: --bodies needs --sha <full 40-character commit>'); process.exit(2); }

const SANS = loadFont('InstrumentSans-Bold.ttf'), MONO = loadFont('JetBrainsMono-Regular.ttf');
const INK = '#15130F', PAPER = '#FAF7F2', SHEET = '#FFFDF9', GOLD = '#FDDA24', GOLD_INK = '#8A6A00', MUTED = '#6B655C';
const mark = readFileSync(join(ROOT, '.github', 'assets', 'mark-light.svg'), 'utf8')
  .replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<title>.*?<\/title>/s, '');

const W = 1000, PAD = 36, TOP = 112, ROW = 96, BOX_H = 68, BOX_W = 272, COLS = [36, 364, 692];
const text = (font, s, x, y, size, fill, tracking = 0) => `<path d="${textPath(font, s, x, y, size, tracking).d}" fill="${fill}"/>`;
const width = (font, s, size, tracking = 0) => textPath(font, s, 0, 0, size, tracking).width;
// the largest size from `from` down to `min` at which the text fits `room`; a label that never fits is a data error
function fit(font, s, from, min, room, what) {
  for (let size = from; size >= min; size -= 0.5) if (width(font, s, size) <= room) return size;
  throw new Error(`roadmap: "${s}" (${what}) is too long for its box`);
}
function arrow(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, L = 11, Hw = 5.5;
  const bx = x2 - ux * L, by = y2 - uy * L;
  return `<path d="M${r1(x1)} ${r1(y1)}L${r1(bx)} ${r1(by)}" stroke="${INK}" stroke-width="2" fill="none"/>`
    + `<path d="M${r1(x2)} ${r1(y2)}L${r1(bx - uy * Hw)} ${r1(by + ux * Hw)}L${r1(bx + uy * Hw)} ${r1(by - ux * Hw)}Z" fill="${INK}"/>`;
}

function diagram(d) {
  const t = TRANCHES[d.tranche], nodes = d.diagram.nodes;
  const cols = [0, 1, 2].map((c) => nodes.filter((n) => n.col === c));
  const rows = Math.max(...cols.map((c) => c.length));
  const at = new Map();
  cols.forEach((list, c) => list.forEach((n, i) => at.set(n.id, { n, c, i, x: COLS[c], y: TOP + (rows * ROW * (i + 0.5)) / list.length })));
  const legendY = TOP + rows * ROW + 10, stampTop = legendY + 34, H = stampTop + 34;
  let svg = '';
  // paper, grid, border
  svg += `<rect width="${W}" height="${H}" fill="${PAPER}"/>`;
  let grid = '';
  for (let y = 40; y < H; y += 40) grid += `M0 ${y}H${W}`;
  for (let x = 40; x < W; x += 40) grid += `M${x} 0V${H}`;
  svg += `<path d="${grid}" stroke="rgba(21,19,15,.06)" stroke-width="1"/>`;
  svg += `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="${INK}" stroke-width="2"/>`;
  // heading
  svg += text(MONO, `DELIVERABLE ${d.n} · ${d.short.toUpperCase()}`, PAD, 48, 14, GOLD_INK, 0.17);
  svg += text(SANS, 'How the parts fit', PAD, 84, 27, INK, -0.01);
  // arrows first, boxes over them
  for (const [a, b] of d.diagram.edges) {
    const A = at.get(a), B = at.get(b);
    if (!A || !B) throw new Error(`roadmap: D${d.n} edge ${a} → ${b} names a missing box`);
    if (A.c === B.c) {
      if (Math.abs(A.i - B.i) !== 1) throw new Error(`roadmap: D${d.n} edge ${a} → ${b} skips a box`);
      const down = B.y > A.y, cx = A.x + BOX_W / 2;
      svg += arrow(cx, A.y + (down ? 1 : -1) * BOX_H / 2, cx, B.y - (down ? 1 : -1) * (BOX_H / 2 + 1));
    } else {
      if (B.c !== A.c + 1) throw new Error(`roadmap: D${d.n} edge ${a} → ${b} must go one column right`);
      svg += arrow(A.x + BOX_W, A.y, B.x - 2, B.y);
    }
  }
  for (const { n, x, y } of at.values()) {
    const top = y - BOX_H / 2, fill = n.kind === 'ships' ? GOLD : SHEET;
    svg += `<rect x="${x}" y="${r1(top)}" width="${BOX_W}" height="${BOX_H}" fill="${fill}" stroke="${INK}" stroke-width="2"${n.kind === 'outside' ? ' stroke-dasharray="6 5"' : ''}/>`;
    const room = BOX_W - 36;
    svg += text(SANS, n.title, x + 18, r1(y - 4), fit(SANS, n.title, 19, 15, room, `D${d.n} ${n.id} title`), INK);
    svg += text(MONO, n.sub, x + 18, r1(y + 20), fit(MONO, n.sub, 13, 11, room, `D${d.n} ${n.id} line`), n.kind === 'ships' ? '#3B3731' : MUTED);
  }
  // legend: only the kinds this picture uses
  const kinds = [['ships', `ships in Deliverable ${d.n}`], ['there', 'in XDRProof by then'], ['outside', 'outside XDRProof']]
    .filter(([k]) => nodes.some((n) => n.kind === k));
  let lx = PAD;
  for (const [k, label] of kinds) {
    svg += `<rect x="${lx}" y="${legendY}" width="14" height="14" fill="${k === 'ships' ? GOLD : SHEET}" stroke="${INK}" stroke-width="1.5"${k === 'outside' ? ' stroke-dasharray="3 2"' : ''}/>`;
    svg += text(MONO, label, lx + 22, legendY + 12, 13, INK);
    lx += 22 + width(MONO, label, 13) + 30;
  }
  // the stamp: our mark and name | the deliverable | its tranche and due date
  const c1 = 14 + 22 + 8 + width(SANS, 'xdrproof', 17) + 14, c2 = 28 + width(MONO, `Deliverable ${d.n}`, 14);
  const third = `Tranche ${d.tranche} · due ${t.short}`, c3 = 28 + width(MONO, third, 14);
  const sx = W - 1 - (c1 + c2 + c3), base = stampTop + 22; // its own row, under the legend
  svg += `<rect x="${r1(sx)}" y="${stampTop}" width="${r1(c1 + c2 + c3)}" height="${H - 1 - stampTop}" fill="${SHEET}" stroke="${INK}" stroke-width="2"/>`;
  svg += `<path d="M${r1(sx + c1)} ${stampTop}V${H - 1}M${r1(sx + c1 + c2)} ${stampTop}V${H - 1}" stroke="${INK}" stroke-width="2"/>`;
  svg += `<g transform="translate(${r1(sx + 14)} ${stampTop + 6}) scale(${r1(22 / 32 * 100) / 100})">${mark}</g>`;
  svg += text(SANS, 'xdrproof', sx + 14 + 22 + 8, base, 17, INK);
  svg += text(MONO, `Deliverable ${d.n}`, sx + c1 + 14, base, 14, INK);
  svg += text(MONO, third, sx + c1 + c2 + 14, base, 14, INK);
  const label = `Deliverable ${d.n}, how the parts fit: ` + nodes.map((n) => `${n.title} (${n.sub})`).join('; ') + `. Stamp: xdrproof, Deliverable ${d.n}, ${third}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${svg}</svg>\n`;
}

// a week range never breaks in a narrow table column (a no-break space, and word joiners around the dash)
const keep = (w) => w.replace(/ /g, '\u00a0').replace(/–/g, '\u2060–\u2060');
const md = (d) => {
  const t = TRANCHES[d.tranche], nn = String(d.n).padStart(2, '0');
  const img = `https://raw.githubusercontent.com/XDRProof/xdrproof/${SHA}/.github/assets/roadmap/d${nn}.svg`;
  const blob = (f) => `https://github.com/XDRProof/xdrproof/blob/main/${f}`;
  return [
    `> [!NOTE]\n> This issue tracks Deliverable ${d.n}. Updates are posted here as comments. Questions and ideas are welcome below.`,
    `| | |\n|---|---|\n| **Tranche** | ${t.name}, weeks ${t.weeks} |\n| **Planned** | ${d.weeks.includes('–') ? 'weeks' : 'week'} ${keep(d.weeks)} |\n| **Due** | ${t.due}, if the award lands around 15 December |\n| **Status** | Planned. Starts when the SCF #46 award is confirmed (decision expected mid-December). |\n| **Owner** | @Blockchain-Oracle |\n| **Plan** | [STATUS.md](${blob('STATUS.md')}) · [ARCHITECTURE.md](${blob('ARCHITECTURE.md')}) |`,
    d.summary,
    `### How the parts fit\n\n![Deliverable ${d.n}, how the parts fit](${img})`,
    `### What ships\n\n${d.ships.map((s) => `- ${s}`).join('\n')}`,
    `### Sub-issues\n\n| Sub-issue | What it covers | Target |\n|---|---|---|\n${d.parts.map(([a, b, c]) => `| ${a} | ${b} | ${keep(c)} |`).join('\n')}\n\n<sub>Each row becomes a GitHub sub-issue when its work starts, and then links to its pull requests.</sub>`,
    `### Done when\n\n${d.done} *(the proposal's words)*`,
    `### Not in this deliverable\n\n${d.notIn.map((s) => `- ${s}`).join('\n')}`,
    `### What exists today\n\n${d.today}`,
  ].join('\n\n') + '\n';
};

mkdirSync(OUT, { recursive: true });
for (const d of DELIVERABLES) {
  const nn = String(d.n).padStart(2, '0'), svg = diagram(d);
  writeFileSync(join(OUT, `d${nn}.svg`), svg);
  console.log(`d${nn}.svg  ${(svg.length / 1024).toFixed(0)} KB  ${d.short}`);
}
if (BODIES) {
  // the pinned commit must hold every picture exactly as drawn now, or the posted issues show broken or stale images
  for (const d of DELIVERABLES) {
    const path = `.github/assets/roadmap/d${String(d.n).padStart(2, '0')}.svg`;
    let pinned = null;
    try { pinned = execFileSync('git', ['-C', ROOT, 'show', `${SHA}:${path}`], { maxBuffer: 1 << 26 }).toString(); } catch { /* missing */ }
    if (pinned !== diagram(d)) { console.error(`roadmap: ${path} at ${SHA.slice(0, 8)} is missing or differs from the drawing; commit and push it, then pass that commit`); process.exit(1); }
  }
  mkdirSync(BODIES, { recursive: true });
  const titles = {};
  for (const d of DELIVERABLES) {
    const nn = String(d.n).padStart(2, '0');
    writeFileSync(join(BODIES, `d${nn}.md`), md(d));
    titles[d.n] = `Deliverable ${d.n}: ${d.name}`;
  }
  writeFileSync(join(BODIES, 'titles.json'), JSON.stringify(titles, null, 1) + '\n');
  console.log(`bodies and titles in ${BODIES}, pictures pinned at ${SHA.slice(0, 8)}`);
}
