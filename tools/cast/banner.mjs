#!/usr/bin/env node
// banner.mjs: the README banner (repository and org profile): the name, the motto and the SDKs on the left, and on
// the right a terminal playing a real recorded run (tools/cast/recordings/verify-60.cast). One banner, on paper,
// for both GitHub themes (on a dark page it reads as a printed sheet); the terminal is dark. --dark also writes the
// ink version (banner-dark.svg), kept for later.
//   node tools/cast/banner.mjs [recording] [out dir] [--dark]   default: recordings/verify-60.cast -> .github/assets/banner.svg
//
// Layout (a 1920 x 600 canvas, 3.2 : 1, shown about 830 px wide on GitHub, so 1 unit is about 0.43 px there):
// the run is 60 columns at 30 units a character, 13 px or more on GitHub. The terminal shows 10 rows and scrolls
// as the run prints, then pans back up through the cards, holds, and loops. Pauses longer than 1.2 s are shortened.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, play, usedRows } from './emulate.mjs';
import { terminal, strip, textPath, textWidth, loadFont, r1, esc } from './svg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..'), ASSETS = join(REPO, '.github', 'assets');
const args = process.argv.slice(2).filter((a) => a !== '--dark' && a !== '--video'), DARK = process.argv.includes('--dark');
// --video: the same banner at 16:9 (1920x1080) for X and Discord, where a video may be at most 2.39:1: the brand
// column centred on the left, the terminal taller on the right (banner-video.svg; tools are run to film it)
const VIDEO = process.argv.includes('--video');
const [recording = join(HERE, 'recordings', 'verify-60.cast'), outDir = ASSETS] = args;
const film = play(load(recording), { maxIdle: 1.2, fps: 15, hold: 0 });
const used = usedRows(film);
const date = new Date(film.recordedAt * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
// The chips say what the run showed, read from its final screen: only from a run that passed, and only from rows
// it marked passed (✓); the third is the run's first known problem with its upstream link (a "!" row).
if (film.exit !== 0) throw new Error(`the recording ended with exit ${film.exit}: the banner shows passing runs only`);
const finalRows = film.frames.at(-1).rows.map((runs) => ({ runs, text: runs.map((x) => x.text).join('') }));
const passedRow = (re) => {
  const r = finalRows.find((x) => re.test(x.text));
  if (!r) throw new Error(`the recording has no row matching ${re}`);
  if (!/^\s*│\s✓\s/.test(r.text)) throw new Error(`the row "${r.text.trim()}" is not marked passed`);
  return r.text.match(/(\d[\d,]*)\s*│\s*$/)?.[1] ?? (() => { throw new Error(`no count on "${r.text.trim()}"`); })();
};
const known = finalRows.find((x) => /^\s*│\s!\s/.test(x.text) && x.runs.some((run) => run.link && /^#\d+$/.test(run.text.trim())));
const chips = [
  { mark: '✓', text: `${passedRow(/round-trip byte for byte|ledgers read back byte for byte/)} ledgers intact` },
  { mark: '✓', text: `${passedRow(/expected values hold/)} values hold` },
  known ? { mark: '!', text: `${known.runs.find((run) => run.link && /^#\d+$/.test(run.text.trim())).text.trim()} found upstream` }
    : { mark: '✓', text: 'every check passed' },
];

// ---- the theme: the banner follows GitHub's; the terminal is dark in both -----------------------------------------
const THEMES = {
  light: { bg: '#FAF7F2', ink: '#15130F', sub: '#3B3731', grid: 'rgba(21,19,15,.05)', cross: 'rgba(21,19,15,.4)', site: '#B08A00', term: '#15130F', border: '#3A3631', mark: 'mark-light.svg', logo: (n, d) => n },
  dark: { bg: '#100F0E', ink: '#FAF7F2', sub: '#C9C2B6', grid: 'rgba(250,247,242,.045)', cross: 'rgba(250,247,242,.38)', site: '#FDDA24', term: '#1C1B18', border: 'rgba(250,247,242,.22)', mark: 'mark-dark.svg', logo: (n, d) => d },
};
const GOLD = '#FDDA24';
// the tools' colours (tools/ui.mjs) on the dark terminal
const termPalette = (bg) => ({ fg: '#FAF7F2', bg, muted: '#9A9387', '#2e7d4f': '#5BC48A', '#c49a00': '#E8C547', '#d65c26': '#F07A45', '#fdda24': GOLD, '#b8410e': '#B8410E', '#15130f': '#15130F', '#faf7f2': '#FAF7F2' });
const LOGOS = [['JavaScript', 'javascript.svg', 'javascript.svg'], ['Rust', 'rust.svg', 'rust_dark.svg'], ['Go', 'golang.svg', 'golang_dark.svg'], ['Python', 'python.svg', 'python.svg'], ['WebAssembly', 'webassembly.svg', 'webassembly.svg']];
// an SVG file placed as a nested <svg> at x, y with height h (its width from its viewBox)
function placeSvg(file, x, y, h) {
  const src = readFileSync(file, 'utf8').replace(/<\?xml[^>]*>/, '').replace(/<title>.*?<\/title>/s, '');
  const vb = src.match(/viewBox="([^"]+)"/)[1].split(/[ ,]+/).map(Number), w = (h * vb[2]) / vb[3];
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return { svg: `<svg x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" viewBox="${vb.join(' ')}">${inner}</svg>`, w };
}

function render(themeName, { H = 600, video = false } = {}) {
  const T = THEMES[themeName], W = 1920, C = W / 100; // C: 1% of the width, the unit the design was drawn in
  const BH = 600, dyL = (H - BH) / 2; // the brand column is drawn for the banner's height and centred in a taller frame
  const bold = loadFont('InstrumentSans-Bold.ttf'), regular = loadFont('InstrumentSans-Regular.ttf'), monoBold = loadFont('JetBrainsMono-Bold.ttf');
  let out = '';
  // background, grid, crosses
  out += `<rect width="${W}" height="${H}" fill="${T.bg}"/>`;
  out += `<defs><pattern id="grid" width="${6.25 * C}" height="${6.25 * C}" patternUnits="userSpaceOnUse"><path d="M${6.25 * C} 0H0V${6.25 * C}" fill="none" stroke="${T.grid}" stroke-width="2"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#grid)"/>`;
  const cross = (x, y) => `<path d="M${r1(x + 12)} ${r1(y)}v24M${r1(x)} ${r1(y + 12)}h24" stroke="${T.cross}" stroke-width="2.3"/>`;
  out += cross(0.9 * C, 0.9 * C) + cross(0.9 * C, H - 0.9 * C - 24);

  // ---- the left: lockup, motto, sub line, SDKs and the site ----
  if (dyL) out += `<g transform="translate(0 ${r1(dyL)})">`;
  const L = 3.4 * C;
  const mk = placeSvg(join(ASSETS, T.mark), L, 2.6 * C, 3.4 * C);
  out += mk.svg;
  out += `<path d="${textPath(bold, 'xdrproof', L + 3.4 * C + 1.1 * C, 2.6 * C + 3.4 * C * 0.72, 2.5 * C, -0.045).d}" fill="${T.ink}"/>`;
  const mSize = 3.25 * C, mLine = mSize * 1.04, mTop = 2.6 * C + 3.4 * C + 2.6 * C, mBase = (i) => mTop + mLine * i + mSize * 0.86;
  const motto = ['If stellar-core can', 'emit it, your code', 'should '];
  motto.forEach((line, i) => { out += `<path d="${textPath(bold, line, L, mBase(i), mSize, -0.05).d}" fill="${T.ink}"/>`; });
  // "survive it." with the gold band under it, as on the site
  const sx = L + textWidth(bold, 'should ', mSize, -0.05), sw = textWidth(bold, 'survive it.', mSize, -0.05);
  out += `<rect x="${r1(sx - 2)}" y="${r1(mTop + mLine * 2 + mLine * 0.7)}" width="${r1(sw + 6)}" height="${r1(mLine * 0.24)}" fill="${GOLD}"/>`;
  out += `<path d="${textPath(bold, 'survive it.', sx, mBase(2), mSize, -0.05).d}" fill="${T.ink}"/>`;
  const subSize = 1.3 * C, subTop = mTop + mLine * 3 + 1.5 * C;
  ['A test kit for every program that reads the Stellar', 'ledger.'].forEach((l, i) => { out += `<path d="${textPath(regular, l, L, subTop + subSize * 1.35 * i + subSize, subSize).d}" fill="${T.sub}"/>`; });
  // the SDKs it checks, and the site
  let lx = L; const ly = BH - 2.4 * C - 1.7 * C;
  for (const [name, light, dark] of LOGOS) { const p = placeSvg(join(ASSETS, 'logos', themeName === 'dark' ? dark : light), lx, ly, 1.7 * C); out += `<g><title>${name}</title>${p.svg}</g>`; lx += p.w + 1 * C; }
  const site = textPath(monoBold, 'XDRPROOF.DEV', 0, 0, 1.15 * C, 0.12);
  out += `<path d="${textPath(monoBold, 'XDRPROOF.DEV', L + 33 * C - site.width, ly + 1.7 * C * 0.78, 1.15 * C, 0.12).d}" fill="${T.site}"/>`;
  if (dyL) out += '</g>';

  // ---- the right: the terminal window ----
  const wx = 38.4 * C, wy = 2.2 * C, ww = W - 2.4 * C - wx, pad = 1.2 * C;
  const big = terminal({ fs: (ww - 2 * pad) / film.cols / 0.6, palette: termPalette(T.term), prefix: 'a' });
  const small = terminal({ fs: 1.25 * C, palette: termPalette(T.term), prefix: 'b' });
  const barH = 2.76 * C, vpTop = wy + barH + 0.12 * C, vpPad = 0.6 * C;
  // the rows the window shows: 10 on the banner; as many as the taller frame holds in the video
  const VR = video ? Math.floor((H - 2 * wy - 0.6 * C - 2 * barH - 0.12 * C - 2 * vpPad) / big.H) : 10;
  const vpH = VR * big.H, chipsTop = vpTop + vpPad * 2 + vpH, wh = chipsTop + barH - wy;
  out += `<rect x="${r1(wx + 0.6 * C)}" y="${r1(wy + 0.6 * C)}" width="${r1(ww)}" height="${r1(wh)}" fill="${GOLD}"/>`;
  out += `<rect x="${r1(wx)}" y="${r1(wy)}" width="${r1(ww)}" height="${r1(wh)}" fill="${T.term}" stroke="${T.border}" stroke-width="2.3"/>`;
  // title bar: three dots (the first gold), the command, REC with the date and the run's clock
  const dotY = wy + barH / 2, rule = 'rgba(250,247,242,.14)';
  [0, 1, 2].forEach((i) => { out += `<circle cx="${r1(wx + pad + 0.475 * C + i * 1.65 * C)}" cy="${r1(dotY)}" r="${r1(0.475 * C - 1)}" fill="${i ? 'none' : GOLD}" stroke="${i ? '#9A9387' : GOLD}" stroke-width="2.3"/>`; });
  const barText = (runs, x) => `<g transform="translate(${r1(x)} ${r1(dotY - small.H / 2)})">${small.row(runs)}</g>`;
  out += barText([{ text: 'xdrproof · ', fg: '#faf7f2' }, { text: film.command, fg: '#fdda24' }], wx + pad + 5.6 * C);
  const recText = `REC ${date} `, clockW = 8 * small.W, recX = wx + ww - pad - clockW - recText.length * small.W;
  out += `<circle cx="${r1(recX - 1 * C)}" cy="${r1(dotY)}" r="${r1(0.4 * C)}" fill="#E5484D"/>` + barText([{ text: recText, fg: null, dim: true }], recX);
  out += `<path d="M${r1(wx)} ${r1(wy + barH)}h${r1(ww)}M${r1(wx)} ${r1(chipsTop)}h${r1(ww)}" stroke="${rule}" stroke-width="2.3"/>`;

  // the run: every frame, the view following the output; then the final screen panned back to the top, held
  const lastRow = (f) => { let n = 0; f.rows.forEach((r, k) => { if (r.length) n = k + 1; }); return n; };
  const steps = film.frames.map((f, k) => ({ rows: f.rows, top: Math.max(0, lastRow(f) - VR), t: f.t, dur: (k + 1 < film.frames.length ? film.frames[k + 1].t : f.t + 1.4) - f.t }));
  const fin = film.frames.at(-1), maxTop = Math.max(0, Math.min(lastRow(fin), used) - VR);
  for (let top = maxTop - 1; top >= 0; top--) steps.push({ rows: fin.rows, top, t: fin.t, dur: 0.32 });
  steps.at(-1).dur = 3.2;
  const view = strip(big, steps, { visible: VR, id: 'run' });
  out += `<clipPath id="vp"><rect x="${r1(wx + pad)}" y="${r1(vpTop + vpPad)}" width="${r1(ww - 2 * pad)}" height="${r1(vpH)}"/></clipPath>`;
  out += `<g clip-path="url(#vp)"><g transform="translate(${r1(wx + pad)} ${r1(vpTop + vpPad)})">${view.svg}</g></g>`;
  // the clock: the run's own time, in step with the run
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(2).padStart(5, '0')}`;
  const clock = strip(small, steps.map((s) => ({ rows: [[{ text: fmt(s.t), fg: '#faf7f2' }]], top: 0, dur: s.dur })), { visible: 1, id: 'clk' });
  const clockX = wx + ww - pad - clockW + small.W;
  out += `<clipPath id="ck"><rect x="${r1(clockX)}" y="${r1(dotY - small.H / 2)}" width="${r1(clockW)}" height="${r1(small.H)}"/></clipPath>`;
  out += `<g clip-path="url(#ck)"><g transform="translate(${r1(clockX)} ${r1(dotY - small.H / 2)})">${clock.svg}</g></g>`;
  // the chips: what the run showed, in three cells
  const cw = ww / 3;
  chips.forEach((c, i) => {
    const cx = wx + cw * i, cy = chipsTop + barH / 2;
    if (i) out += `<path d="M${r1(cx)} ${r1(chipsTop)}v${r1(barH)}" stroke="${rule}" stroke-width="2.3"/>`;
    out += `<circle cx="${r1(cx + pad + 0.7 * C)}" cy="${r1(cy)}" r="${r1(0.7 * C)}" fill="${c.mark === '!' ? GOLD : '#5BC48A'}"/>`;
    out += barText([{ text: c.mark, fg: '#15130f', bold: true }], cx + pad + 0.7 * C - small.W / 2).replace(/translate\(([\d.]+) [\d.]+\)/, `translate($1 ${r1(cy - small.H / 2)})`);
    out += barText([{ text: c.text, fg: '#faf7f2' }], cx + pad + 2 * C).replace(/translate\(([\d.]+) [\d.]+\)/, `translate($1 ${r1(cy - small.H / 2)})`);
  });

  const title = 'XDRProof: if stellar-core can emit it, your code should survive it. A recorded run of make verify.';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>`
    // with reduced motion each strip rests on its last step (the run on its top card, the clock on the run's time)
    + `<style>${view.css}${clock.css}@media (prefers-reduced-motion:reduce){.run{animation:none;transform:translateY(${r1(-(steps.length - 1) * view.VH)}px)}.clk{animation:none;transform:translateY(${r1(-(steps.length - 1) * clock.VH)}px)}}</style>`
    + `<defs>${big.defs()}${small.defs()}</defs>${out}</svg>`;
}

mkdirSync(outDir, { recursive: true });
if (VIDEO) {
  const svg = render('light', { H: 1080, video: true }), file = join(outDir, 'banner-video.svg');
  writeFileSync(file, svg);
  console.log(`${file}: ${(svg.length / 1024).toFixed(0)} KB, 1920×1080`);
  process.exit(0);
}
for (const t of DARK ? ['light', 'dark'] : ['light']) {
  const svg = render(t), file = join(outDir, t === 'light' ? 'banner.svg' : 'banner-dark.svg');
  writeFileSync(file, svg);
  console.log(`${file.replace(REPO + '/', '')}: ${(svg.length / 1024).toFixed(0)} KB`);
}
