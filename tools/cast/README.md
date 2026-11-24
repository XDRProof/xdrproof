# tools/cast: recordings of real runs

Every moving picture of XDRProof (the README banner, and the docs and issue recordings that follow) is a
recording of a real run, not a mock-up. The terminal output is recorded once and every format is drawn from it,
so they all show the same thing.

| File | What it does |
|---|---|
| `record.py` | Runs a command in a pseudo-terminal of a fixed size, colour and terminal links on, and saves every write with its time as [asciicast v2](https://docs.asciinema.org/manual/asciicast/v2/) (the asciinema format). |
| `emulate.mjs` | Plays a recording through a small terminal (text, colour, the live block's redraws, links) and returns its screens over time. |
| `svg.mjs` | Draws screens as SVG: glyph outlines from the fonts here (no web font, so it renders the same as an image), box lines and spinners as vector shapes, each distinct row defined once, frames moved by one CSS animation. |
| `banner.mjs` | The README banner: the name, the motto and the SDKs, with the recorded run playing in a terminal. One SVG on paper for both GitHub themes (`--dark` also writes an ink version). |
| `issue.mjs` | The recording for an upstream issue or comment: the run as an animated SVG terminal window with the XDRProof mark and the issue's name in its title bar, a long run time-lapsed to about 12 seconds, the last screen held (`--from` starts at the lines that show the bug). |
| `badges.mjs` | The status tags of the "Reported upstream" table (`findings/badges/`): open, closed, maintainer replied, fix ready. Drawn once as filled SVGs, since GitHub removes colour from README text. |
| `recordings/` | The recorded runs the pictures are drawn from. |
| `fonts/` | JetBrains Mono and Instrument Sans, under the SIL Open Font License (`fonts/OFL.txt`). |

```bash
make banner              # .github/assets/banner.svg from recordings/verify-60.cast
make banner RECORD=1     # record make verify again first (60 columns, so the text is 13 px at GitHub's width)
python3 -I tools/cast/record.py out.cast --cols 72 --rows 30 -- make lint    # any other run
node tools/cast/issue.mjs tools/cast/recordings/harness-834-72.cast findings/figures/f3-repro.svg \
  --title "replay · wallet-backend #834"                                     # an issue's recording
```

The recording tools have one dependency, `opentype.js` (pinned in `package.json`, installed with its install
scripts off), to read the fonts; it is installed only for these targets, not for `make verify` or CI.
