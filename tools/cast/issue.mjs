#!/usr/bin/env node
// issue.mjs <recording.cast> <out.svg> --title "<what and which issue>" [--from <regex>] [--fps N]
// The recording for an upstream issue or comment: the real run as an animated SVG terminal window, in the upstream
// post format chosen on 24 Nov 2026 (format B): the XDRProof mark and the issue's name in the title bar, the run as
// the tool printed it, nothing re-typed. It plays once through and holds its last screen for a few seconds, then
// loops. GitHub serves SVG from the repository as an image, and the animation runs inside it; nothing is clickable
// in an image, so the post says the links in its text.
//   --from   start at the first row of the final screen that matches (cut to the lines that show the bug)
//   --fps    frames a second of the animation (default 8; a long run is time-lapsed to about 12 seconds first)
// Example:
//   node tools/cast/issue.mjs tools/cast/recordings/harness-834-72.cast findings/figures/f3-repro.svg \
//     --title "replay · wallet-backend #834"
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, play, usedRows } from './emulate.mjs';
import { terminal, strip, textPath, textWidth, loadFont, r1, esc } from './svg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ASSETS = join(HERE, '..', '..', '.github', 'assets');
const argv = process.argv.slice(2), opt = (k, d = null) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const [recording, out] = argv.filter((a, i) => !a.startsWith('--') && !['--title', '--from', '--fps'].includes(argv[i - 1]));
const TITLE = opt('--title'), FROM = opt('--from'), FPS = Number(opt('--fps', '8'));
const usage = (why) => { console.error(`issue.mjs: ${why}\nusage: issue.mjs <recording.cast> <out.svg> --title "<what · issue>" [--from <regex>] [--fps N]`); process.exit(2); };
if (!recording || !out) usage('a recording and an output file are needed');
for (const k of ['--title', '--from', '--fps']) if (argv.includes(k) && (opt(k) === undefined || opt(k).startsWith('--'))) usage(`${k} needs a value`);
if (!TITLE) usage('--title is needed');
if (!Number.isFinite(FPS) || FPS <= 0 || FPS > 30) usage('--fps must be a number above 0, at most 30');

const film = play(load(recording), { maxIdle: 1.2, fps: 15, hold: 0 });
if (!film.frames.length) throw new Error(`${recording} has no output`);
const used = usedRows(film), finalRows = film.frames.at(-1).rows;
const rowText = (runs) => (runs ?? []).map((x) => x.text).join('');
let top = 0;
if (FROM) {
  top = finalRows.findIndex((r) => new RegExp(FROM).test(rowText(r)));
  if (top < 0) throw new Error(`no row of the final screen matches ${FROM}`);
}
const visible = used - top;

// time: a long run is time-lapsed to about FIT seconds (as on the docs site), then sampled at FPS; consecutive
// identical screens become one step, and the last screen holds HOLD seconds before the loop
const FIT = 12, HOLD = 6, last = film.frames.at(-1).t, k = last > FIT * 1.25 ? FIT / last : 1;
// first the frames kept (the last of each 1/FPS slot, and always the final one), then each one's time on screen
// runs to the next kept frame, so no stretch of the run is lost when frames are skipped
const slotOf = (fr) => Math.floor(fr.t * k * FPS + 1e-6);
const kept = film.frames.filter((fr, i) => i + 1 === film.frames.length || slotOf(film.frames[i + 1]) !== slotOf(fr));
const steps = [];
for (const [j, fr] of kept.entries()) {
  const rows = fr.rows.slice(top, top + visible), key = JSON.stringify(rows);
  const dur = j + 1 < kept.length ? (kept[j + 1].t - fr.t) * k : HOLD;
  if (steps.length && steps.at(-1).key === key) steps.at(-1).dur += dur;
  else steps.push({ rows, top: 0, dur, key });
}
steps.at(-1).dur = Math.max(steps.at(-1).dur, HOLD);
if (steps.some((st) => !(st.dur > 0))) for (const st of steps) st.dur = Math.max(st.dur, 1 / FPS); // never a zero-length step

// ---- the window ------------------------------------------------------------------------------------------------
const GOLD = '#FDDA24', BG = '#15130F', FG = '#FAF7F2', MUTED = '#9A9387', BORDER = '#3A3631';
const palette = { fg: FG, bg: BG, muted: MUTED, '#2e7d4f': '#5BC48A', '#c49a00': '#E8C547', '#d65c26': '#F07A45', '#fdda24': GOLD, '#b8410e': '#B8410E', '#15130f': '#15130F', '#faf7f2': '#FAF7F2' };
const FS = 14, term = terminal({ fs: FS, palette, prefix: 'i' });
const PAD = 16, BAR = 34, W = Math.ceil(film.cols * term.W + 2 * PAD), H = Math.ceil(BAR + visible * term.H + 2 * PAD - 4);
const view = strip(term, steps, { visible, id: 'run' });

const sans = loadFont('InstrumentSans-Bold.ttf'), mono = loadFont('JetBrainsMono-Regular.ttf');
// the mark, as on the banner
const markSrc = readFileSync(join(ASSETS, 'mark-dark.svg'), 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<title>.*?<\/title>/s, '');
const vb = markSrc.match(/viewBox="([^"]+)"/)[1].split(/[ ,]+/).map(Number), MH = 16, MW = (MH * vb[2]) / vb[3];
const markInner = markSrc.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
let x = PAD;
const dots = [0, 1, 2].map((i) => `<circle cx="${r1(x + 5 + i * 15)}" cy="${BAR / 2}" r="4.5" ${i ? `fill="none" stroke="${MUTED}" stroke-width="1.1"` : `fill="${GOLD}"`}/>`).join('');
x += 52;
const mark = `<svg x="${r1(x)}" y="${r1((BAR - MH) / 2)}" width="${r1(MW)}" height="${MH}" viewBox="${vb.join(' ')}">${markInner}</svg>`;
x += MW + 8;
const name = textPath(sans, 'xdrproof', x, BAR / 2 + 4.6, 13);
x += name.width + 10;
const date = new Date(film.recordedAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const REC = `REC ${date}`, recW = textWidth(mono, REC, 11), recX = W - PAD - recW;
// the title gets the room left of REC (or of the edge, when REC would leave it too little), cut with an ellipsis
const cellW = textWidth(mono, 'a', 12), sepW = textWidth(mono, '·', 12) + 8;
const withRec = recX - 26 - x >= 24 * cellW, room = (withRec ? recX - 26 : W - PAD) - x;
let titleSvg = '', used0 = 0;
for (const [i, p0] of TITLE.split(' · ').entries()) {
  const left = room - used0 - sepW;
  if (left < 2 * cellW) break;
  const fit = Math.floor((left - 8) / cellW), p = p0.length > fit ? p0.slice(0, Math.max(1, fit - 1)) + '…' : p0;
  const s0 = textPath(mono, '·', x + used0, BAR / 2 + 4.3, 12); titleSvg += `<path d="${s0.d}" fill="${MUTED}"/>`; used0 += sepW;
  const t = textPath(mono, p, x + used0, BAR / 2 + 4.3, 12); titleSvg += `<path d="${t.d}" fill="${i === 0 ? GOLD : FG}"/>`; used0 += t.width + 8;
  if (p !== p0) break;
}
const recSvg = withRec ? `<circle cx="${r1(recX - 9)}" cy="${BAR / 2}" r="3.5" fill="#E5484D"/><path d="${textPath(mono, REC, recX, BAR / 2 + 4, 11).d}" fill="${MUTED}"/>` : '';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(`A recorded run: ${film.command}. ${TITLE}.`)}">
<title>${esc(`${TITLE} · a recorded run of ${film.command}`)}</title>
<style>${view.css}@media (prefers-reduced-motion: reduce){.run{animation:none;transform:translateY(${r1(-(steps.length - 1) * view.VH)}px)}}</style>
<defs>${term.defs()}<clipPath id="iv"><rect x="${PAD}" y="${BAR + PAD - 4}" width="${W - 2 * PAD}" height="${r1(visible * term.H)}"/></clipPath></defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="7" fill="${BG}" stroke="${BORDER}"/>
<path d="M1 ${BAR}H${W - 1}" stroke="rgba(250,247,242,.14)"/>
${dots}${mark}<path d="${name.d}" fill="${FG}"/>${titleSvg}${recSvg}
<g clip-path="url(#iv)"><g transform="translate(${PAD} ${BAR + PAD - 4})">${view.svg}</g></g>
</svg>
`;
writeFileSync(out, svg);
console.log(`${out}: ${(svg.length / 1024).toFixed(0)} KB · ${steps.length} screens · ${view.duration.toFixed(1)} s loop · ${film.cols}×${visible}`);
