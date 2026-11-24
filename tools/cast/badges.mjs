#!/usr/bin/env node
// badges.mjs [out-dir]: the status tags of the "Reported upstream" table (findings/upstream.json), drawn once as
// small SVG images: GitHub removes colour from README text, so a coloured tag has to be an image. The text is set
// as outlines from the fonts here, so a tag looks the same on every machine. Each tag is filled, so it reads on
// GitHub's light and dark themes alike. Default out-dir: findings/badges.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textPath, loadFont, r1, esc } from './svg.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = process.argv[2] ?? join(HERE, '..', '..', 'findings', 'badges');
// name -> [label, fill, text colour, border]: GitHub's own colours for an issue's state, our gold for our fix
export const BADGES = {
  open: ['open', '#1A7F37', '#FFFFFF', null],
  closed: ['closed', '#8250DF', '#FFFFFF', null],
  'not-planned': ['closed, not planned', '#59636E', '#FFFFFF', null],
  replied: ['maintainer replied', '#0969DA', '#FFFFFF', null],
  reply: ['reply received', '#0969DA', '#FFFFFF', null],
  'fix-ready': ['fix ready', '#FDDA24', '#15130F', '#8A6A00'],
};
const font = loadFont('InstrumentSans-Bold.ttf'), SIZE = 11.5, H = 20, PAD = 8;
mkdirSync(OUT, { recursive: true });
for (const [name, [label, fill, ink, border]] of Object.entries(BADGES)) {
  const t = textPath(font, label, 0, 0, SIZE), W = Math.ceil(t.width + 2 * PAD);
  const text = textPath(font, label, PAD, H / 2 + SIZE * 0.36, SIZE);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>`
    + `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${r1((H - 1) / 2)}" fill="${fill}"${border ? ` stroke="${border}"` : ''}/>`
    + `<path d="${text.d}" fill="${ink}"/></svg>\n`;
  writeFileSync(join(OUT, `${name}.svg`), svg);
  console.log(`${name}.svg  ${W}×${H}  "${label}"`);
}
