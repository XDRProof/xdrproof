#!/usr/bin/env python3
"""Draws the figures and terminal GIFs used in XDRProof's upstream reports (findings/REPORT.md).

Figures are HTML pages in the site's paper-and-gold drafting style, rendered to PNG by headless Chrome at 2x;
GIFs are the same terminal page rendered frame by frame and joined by ffmpeg. Every number and every line of
terminal output comes from a real run, recorded below with the command that produced it.

Run: python3 findings/figures/build.py   (needs Google Chrome and ffmpeg; fonts load from Google Fonts)
"""
import html, shutil, subprocess, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W = 880  # GitHub's issue column; rendered at 2x

FONTS = '<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=block" rel="stylesheet">'
BASE = """
:root{--bg:#FAF7F2;--ink:#15130F;--sub:#3B3731;--muted:#6E675E;--label:#8A6A00;--gold:#FDDA24;--node:#FFFDF9;
--pass:#E2F0DA;--pass-t:#2F7A1F;--fail:#FBE1DA;--fail-t:#CC2E19;--neu:#F2EDE5;--rule:rgba(21,19,15,.16);--grid:rgba(21,19,15,.045)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:%(w)dpx;background:var(--bg)}
body{font-family:"Instrument Sans",system-ui,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}
.sheet{width:%(w)dpx;height:%(h)dpx;position:relative;padding:26px 30px 0;overflow:hidden;
 background-color:var(--bg);background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);
 background-size:24px 24px;border:1.5px solid var(--ink)}
.eyebrow{font:600 11.5px/1 "JetBrains Mono",monospace;letter-spacing:.09em;text-transform:uppercase;color:var(--label)}
h1{font-weight:650;font-size:24px;line-height:1.2;letter-spacing:-.012em;margin-top:9px;max-width:800px}
.sub{font-size:15px;line-height:1.45;color:var(--sub);margin-top:7px;max-width:790px}
.mono{font-family:"JetBrains Mono",monospace}
.tb{position:absolute;right:-1px;bottom:-1px;display:flex;background:var(--node);border:1.5px solid var(--ink);font:500 11px/1 "JetBrains Mono",monospace;color:var(--sub)}
.tb div{padding:7px 10px;border-left:1px solid var(--rule)} .tb div:first-child{border-left:0;font-weight:700;color:var(--ink)}
.tb b{color:var(--ink);font-weight:700}
.cross{position:absolute;width:13px;height:13px} .cross:before,.cross:after{content:"";position:absolute;background:var(--ink);opacity:.35}
.cross:before{left:6px;top:0;width:1px;height:13px} .cross:after{top:6px;left:0;height:1px;width:13px}
"""

def page(body, h, extra=""):
    return f'<!doctype html><html><head><meta charset="utf-8">{FONTS}<style>{BASE % {"w": W, "h": h}}{extra}</style></head><body>{body}</body></html>'

def crosses():
    return '<div class="cross" style="left:8px;top:8px"></div><div class="cross" style="right:8px;top:8px"></div>'

def titleblock(fig, data):
    return f'<div class="tb"><div>XDRProof</div><div>{fig}</div><div>{data}</div></div>'

# ---- Figure: F-3, where the refund lands --------------------------------------------------------------
F3_CSS = """
.lanes{margin-top:22px;display:grid;gap:14px}
.lane{display:grid;grid-template-columns:118px 1fr;align-items:center;gap:12px}
.lname{font-weight:650;font-size:14px;line-height:1.25}.lname span{display:block;font:500 11px/1.4 "JetBrains Mono",monospace;color:var(--muted);margin-top:3px}
.row{display:flex;align-items:stretch;gap:0}
.blk{flex:0 0 auto;border:1.5px solid var(--ink);background:var(--node);padding:8px 9px;font-size:13px;line-height:1.25;position:relative;min-height:62px;display:flex;flex-direction:column;justify-content:center}
.blk small{display:block;font:500 10.5px/1.35 "JetBrains Mono",monospace;color:var(--muted);margin-top:3px}
.arrow{flex:0 0 18px;align-self:center;height:1.5px;background:var(--ink);position:relative}
.arrow:after{content:"";position:absolute;right:-1px;top:-4px;border:4.5px solid transparent;border-left:6px solid var(--ink)}
.read{background:var(--pass)} .miss{background:var(--fail);border-color:var(--fail-t)}
.tag{position:absolute;top:-10px;right:6px;font:700 10px/1 "JetBrains Mono",monospace;padding:3px 5px;border:1.5px solid currentColor;background:var(--bg);letter-spacing:.04em}
.tag.ok{color:var(--pass-t)} .tag.no{color:var(--fail-t)}
.result{margin-top:22px;display:grid;grid-template-columns:1fr 1fr;gap:0;border:1.5px solid var(--ink);background:var(--node)}
.result>div{padding:12px 14px} .result>div+div{border-left:1px solid var(--rule)}
.big{font:700 26px/1 "JetBrains Mono",monospace;letter-spacing:-.02em} .big.red{color:var(--fail-t)}
.cap{font-size:13px;color:var(--sub);margin-top:6px;line-height:1.35}
.legend{display:flex;gap:16px;margin-top:12px;font-size:12.5px;color:var(--sub)} .legend i{display:inline-block;width:12px;height:12px;border:1.5px solid var(--ink);vertical-align:-2px;margin-right:6px}
"""
def f3_figure():
    def blk(t, s, cls="", tag=None, w=None):
        tg = f'<span class="tag {"ok" if tag=="read" else "no"}">{"READ" if tag=="read" else "NOT READ"}</span>' if tag else ""
        st = f' style="width:{w}px"' if w else ""
        return f'<div class="blk {cls}"{st}>{tg}{t}<small>{s}</small></div>'
    a = '<div class="arrow"></div>'
    lane1 = a.join([blk("Fee", "every tx pays", "read", "read", 76), blk("Tx 1", "operations", "read", "read", 80),
                    blk("Tx 1 refund", "txChangesAfter", "miss", "miss", 112), blk("Tx 2", "operations", "read", "read", 80),
                    blk("Tx 2 refund", "txChangesAfter", "miss", "miss", 112), blk("…", "", "", None, 34)])
    lane2 = a.join([blk("Fee", "every tx pays", "read", "read", 76), blk("Tx 1", "operations", "read", "read", 80),
                    blk("Tx 2", "operations", "read", "read", 80), blk("…", "", "", None, 34),
                    blk("All refunds", "postTxApplyFeeProcessing", "read", "read", 200)])
    body = f"""<div class="sheet">{crosses()}
<div class="eyebrow">wallet-backend · native_balances · Soroban fee refunds</div>
<h1>Before protocol 23, a refund is inside its own transaction, where wallet&#8209;backend does not read it</h1>
<p class="sub">Core closes a ledger in this order. Blocks marked READ are what wallet&#8209;backend turns into <span class="mono">native_balances</span>.</p>
<div class="lanes">
 <div class="lane"><div class="lname">Protocol 20–22<span>the bug</span></div><div class="row">{lane1}</div></div>
 <div class="lane"><div class="lname">Protocol 23+<span>works today</span></div><div class="row">{lane2}</div></div>
</div>
<div class="result">
 <div><div class="big red">7 of 7</div><div class="cap">refunded accounts stored short on pubnet ledger 56085459 (protocol 22, 222 transactions)</div></div>
 <div><div class="big red">3,349,302</div><div class="cap">stroops missing in all; the largest is <span class="mono">GBGWQF…TUBE</span>, short 2,985,957</div></div>
</div>
<div class="legend"><span><i style="background:var(--pass)"></i>read into native_balances</span><span><i style="background:var(--fail);border-color:var(--fail-t)"></i>never read: the refund is lost</span></div>
{titleblock("Fig. 1", "pubnet ledger <b>56085459</b> · wallet-backend <b>18db88f4</b>")}</div>"""
    return page(body, 470, F3_CSS)

# ---- Figure: F-1, how deep is too deep ----------------------------------------------------------------
F1_CSS = """
.chart{margin-top:26px;position:relative;height:220px}
.axis{position:absolute;left:250px;right:24px;top:0;bottom:30px}
.limit{position:absolute;top:-8px;bottom:-6px;width:0;border-left:2px dashed var(--fail-t)}
.limit span{position:absolute;top:-6px;left:8px;white-space:nowrap;font:700 12px/1 "JetBrains Mono",monospace;color:var(--fail-t)}
.bar{position:absolute;left:0;height:34px;border:1.5px solid var(--ink);display:flex;align-items:center}
.bar .chain{height:100%;background:var(--gold)} .bar .wrap{height:100%;background:var(--neu);border-left:1.5px solid var(--ink)}
.blabel{position:absolute;left:-250px;width:236px;text-align:right;font-size:13.5px;line-height:1.25;font-weight:600}
.blabel small{display:block;font:500 10.5px/1.4 "JetBrains Mono",monospace;color:var(--muted);font-weight:500}
.val{position:absolute;font:700 14px/1 "JetBrains Mono",monospace;white-space:nowrap}
.ok{color:var(--pass-t)} .no{color:var(--fail-t)}
.ticks{position:absolute;left:250px;right:24px;bottom:0;height:24px;border-top:1.5px solid var(--ink)}
.tick{position:absolute;top:0;font:500 10.5px/1 "JetBrains Mono",monospace;color:var(--muted);transform:translateX(-50%);padding-top:7px}
.tick:before{content:"";position:absolute;left:50%;top:0;height:5px;border-left:1.5px solid var(--ink)}
.brk{position:absolute;left:250px;bottom:18px;width:12px;height:12px;background:var(--bg);border-left:1.5px solid var(--ink);border-right:1.5px solid var(--ink);transform:skewX(-20deg)}
.key{display:flex;gap:18px;margin-top:14px;font-size:12.5px;color:var(--sub)} .key i{display:inline-block;width:12px;height:12px;border:1.5px solid var(--ink);vertical-align:-2px;margin-right:6px}
"""
def f1_figure():
    lo, hi = 440, 560
    span = W - 60 - 250 - 24
    x = lambda d: (d - lo) / (hi - lo) * span
    chain_end = 490  # 245 invocations x 2 levels
    def bar(top, total, name, small, verdict, cls):
        return (f'<div class="bar" style="top:{top}px;width:{x(total):.1f}px">'
                f'<div class="chain" style="width:{x(chain_end):.1f}px"></div><div class="wrap" style="flex:1"></div>'
                f'<div class="blabel" style="top:2px">{name}<small>{small}</small></div></div>'
                f'<div class="val {cls}" style="left:{x(total)+10:.1f}px;top:{top+10}px">{total} · {verdict}</div>')
    ticks = "".join(f'<div class="tick" style="left:{x(t):.1f}px">{t}</div>' for t in range(450, 561, 10))
    body = f"""<div class="sheet">{crosses()}
<div class="eyebrow">@stellar/stellar-xdr-json 30.0.0 · XDR depth limit</div>
<h1>The network allows 500 levels per auth entry. The decoder allows 500 for the whole value.</h1>
<p class="sub">One transaction with a 245-deep auth tree, the deepest the network runs. Each bar is the smallest depth limit at which rs&#8209;stellar&#8209;xdr 30.0.0 decodes that part.</p>
<div class="chart"><div class="axis">
 <div class="limit" style="left:{x(500):.1f}px"><span>limit 500</span></div>
 {bar(14, 499, "SorobanAuthorizationEntry", "what the network checks", "fits", "ok")}
 {bar(74, 507, "TransactionEnvelope", "one transaction", "refused", "no")}
 {bar(134, 519, "LedgerCloseMeta", "the ledger it is in", "refused", "no")}
</div><div class="ticks">{ticks}</div><div class="brk"></div></div>
<div class="key"><span><i style="background:var(--gold)"></i>the auth tree: 245 invocations, 2 levels each</span><span><i style="background:var(--neu)"></i>the layers around it</span><span class="mono" style="color:var(--muted)">axis starts at 440</span></div>
{titleblock("Fig. 1", "corpus entry <b>auth.tree-depth-245-max</b> · stellar-core <b>v30.0.0</b>")}</div>"""
    return page(body, 494, F1_CSS)

# ---- Figure: #820, stop the walk, never fail ----------------------------------------------------------
F820_CSS = """
.cols{display:grid;grid-template-columns:300px 1fr;gap:26px;margin-top:20px}
.chainv{position:relative;height:262px;border-left:1.5px solid var(--ink);margin-left:14px}
.n{position:absolute;left:-7px;width:13px;height:13px;border:1.5px solid var(--ink);background:var(--node);border-radius:50%}
.n.gold{background:var(--gold)} .n.dim{opacity:.35}
.nl{position:absolute;left:18px;font-size:12.5px;line-height:1.25;white-space:nowrap} .nl b{font-family:"JetBrains Mono",monospace}
.nl small{display:block;font:500 10.5px/1.35 "JetBrains Mono",monospace;color:var(--muted)}
.cut{position:absolute;left:-14px;width:290px;border-top:2px solid var(--ink)}
.cut span{position:absolute;right:0;top:-18px;font:700 11px/1 "JetBrains Mono",monospace;background:var(--gold);padding:3px 5px;border:1.5px solid var(--ink)}
.fade{position:absolute;left:-1.5px;top:212px;bottom:0;border-left:1.5px dashed var(--muted)}
.cards{display:grid;gap:12px}
.card{border:1.5px solid var(--ink);background:var(--node);padding:12px 14px}
.card.bad{background:var(--fail);border-color:var(--fail-t)} .card.good{background:var(--pass)}
.card h3{font-size:14.5px;font-weight:650;line-height:1.25} .card h3 span{font:700 10.5px/1 "JetBrains Mono",monospace;letter-spacing:.06em;margin-right:8px;padding:3px 5px;border:1.5px solid currentColor;vertical-align:1px}
.card.bad h3 span{color:var(--fail-t)} .card.good h3 span{color:var(--pass-t)}
.steps{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;font-size:12.5px;line-height:1.3}
.steps div{background:var(--bg);border:1px solid var(--rule);padding:5px 7px} .steps div:after{content:" →";color:var(--muted)} .steps div:last-child:after{content:""}
.note{font-size:12.5px;color:var(--sub);line-height:1.4;margin-top:2px}
"""
def f820_figure():
    body = f"""<div class="sheet">{crosses()}
<div class="eyebrow">wallet-backend #820 · contract-deploy auth walk</div>
<h1>Give the walk a limit, and make the limit stop the walk instead of failing the ledger</h1>
<p class="sub">The walk follows every nested invocation a transaction declares. The network already applies trees 245 deep.</p>
<div class="cols">
 <div class="chainv">
  <div class="n gold" style="top:0"></div><div class="nl" style="top:-1px"><b>depth 0</b> · root invocation</div>
  <div class="n" style="top:40px"></div><div class="nl" style="top:39px"><b>depth 1</b></div>
  <div class="n" style="top:80px"></div><div class="nl" style="top:79px"><b>depth 2</b> …</div>
  <div class="n gold" style="top:140px"></div><div class="nl" style="top:136px"><b>depth 244</b> · 245 invocations<small>the deepest the network applies (protocol 30)</small></div>
  <div class="cut" style="top:196px"><span>bound: depth 256</span></div>
  <div class="fade"></div>
  <div class="n dim" style="top:222px"></div><div class="nl" style="top:219px;color:var(--muted)">deeper declarations<small>not walked; counted and logged</small></div>
 </div>
 <div class="cards">
  <div class="card bad"><h3><span>AVOID</span>A limit that returns an error</h3>
   <div class="steps"><div>tree passes the limit</div><div>ProcessOperation errors</div><div>the same ledger fails on every retry</div><div>ingestion halts</div></div></div>
  <div class="card good"><h3><span>PROPOSED</span>A limit that stops descending</h3>
   <div class="steps"><div>tree passes the limit</div><div>stop, keep what was found</div><div>count it, log it</div><div>the ledger ingests</div></div></div>
  <p class="note">Bounds: depth 256 and 4,096 invocations per operation, both above anything a transaction carries today (132,096-byte limit). The walk is skipped when the meta created no contract.</p>
 </div>
</div>
{titleblock("Fig. 1", "corpus entry <b>auth.deploy-with-tree-depth-245</b> · branch <b>b5d4923a</b>")}</div>"""
    return page(body, 514, F820_CSS)

# ---- Terminal GIFs ------------------------------------------------------------------------------------
TERM_CSS = """
.term{width:%(w)dpx;height:%(h)dpx;background:var(--bg);padding:14px;position:relative}
.win{height:100%%;border:1.5px solid var(--ink);background:#15130F;display:flex;flex-direction:column;position:relative}
.bar{height:30px;flex:0 0 30px;border-bottom:1.5px solid var(--ink);background:#FAF7F2;display:flex;align-items:center;gap:7px;padding:0 10px;font:600 11px/1 "JetBrains Mono",monospace;color:#3B3731;letter-spacing:.04em}
.bar i{width:10px;height:10px;border:1.5px solid #15130F;border-radius:50%%} .bar i:nth-child(1){background:#FDDA24}
.bar span{margin-left:8px}
.scr{flex:1;padding:12px 14px;font:400 12.5px/1.55 "JetBrains Mono",monospace;color:#EDE8DF;white-space:pre-wrap;overflow-wrap:anywhere;overflow:hidden}
.p{color:#FDDA24;font-weight:700} .c{color:#FAF7F2;font-weight:500} .d{color:#8F877C} .r{color:#FF7A62;font-weight:700} .g{color:#7BD35A;font-weight:700}
.cur{display:inline-block;width:8px;height:15px;background:#FDDA24;vertical-align:-3px}
.cap{position:absolute;right:14px;bottom:12px;font:600 11px/1 "JetBrains Mono",monospace;color:#15130F;background:#FDDA24;padding:5px 7px;border:1.5px solid #15130F}
"""
def term_frames(title, script, h):
    """script: list of steps ("type", cmd) | ("out", [(cls, text)], delay) | ("hold", secs) | ("cap", text)."""
    frames, lines, cap = [], [], ""
    def snap(dur, cursor=False, typing=None):
        body = "".join(lines) + (typing or "") + ('<span class="cur"></span>' if cursor else "")
        capd = f'<div class="cap">{cap}</div>' if cap else ""
        doc = page(f'<div class="term"><div class="win"><div class="bar"><i></i><i></i><i></i><span>{html.escape(title)}</span></div><div class="scr">{body}</div>{capd}</div></div>', h,
                   TERM_CSS % {"w": W, "h": h})
        frames.append((doc, dur))
    for step in script:
        kind = step[0]
        if kind == "type":
            cmd = step[1]
            n = max(6, min(14, len(cmd) // 8))
            for i in range(1, n + 1):
                k = round(len(cmd) * i / n)
                snap(0.07, True, f'<span class="p">$ </span><span class="c">{html.escape(cmd[:k])}</span>')
            snap(0.5, True, f'<span class="p">$ </span><span class="c">{html.escape(cmd)}</span>')
            lines.append(f'<span class="p">$ </span><span class="c">{html.escape(cmd)}</span>\n')
        elif kind == "out":
            for cls, text in step[1]:
                lines.append(f'<span class="{cls}">{html.escape(text)}</span>\n')
                snap(step[2])
        elif kind == "cap":
            cap = html.escape(step[1])
        elif kind == "hold":
            snap(step[1], True)
    return frames

def f1_gif():
    return term_frames("node 25.9 · @stellar/stellar-xdr-json 30.0.0", [
        ("type", "curl -sLO \\\n    https://github.com/XDRProof/xdrproof/raw/main/entries/auth.tree-depth-245-max/p30-mainnet-generated.xdr"),
        ("type", "wc -c p30-mainnet-generated.xdr"),
        ("out", [("d", "   29780 p30-mainnet-generated.xdr")], 0.4),
        ("type", "node repro.mjs"),
        ("out", [("r", "Error: depth limit exceeded")], 0.6),
        ("cap", "a ledger stellar-core closed, refused by the decoder"),
        ("hold", 3.5)], 262)

F3_RUN = [  # replay/harness.mjs on wallet-backend main 18db88f4, 2026-11-19 (local report path shortened)
    ("d", "wallet-backend@main (18db88f4ba48, protocol_max 30): 1 variants, 1 sessions, 0 unsupported"),
    ("d", "  control executable-ref.invoke@p28-mainnet-generated: handled"),
    ("d", "  control failure.path-payment-strict-send.no-destination-mainnet@p29-mainnet-mined-l65517499: handled"),
    ("d", "  control event.classic.payment-transfer@p30-mainnet-generated: handled"),
    ("r", "mishandled 1   (replay/runs/wallet-backend@main/report.json; harness peak RSS 81 MiB)"),
]
F3_JQ = [  # that jq command's output, verbatim
    'GBGWQFSJ…  ledger  654931753913  stored  654928767956  short  2985957',
    'GACPXYT7…  ledger  2162559403    stored  2162492556    short  66847',
    'GDYWDQPV…  ledger  842333831     stored  842282581     short  51250',
    'GDNYETQB…  ledger  541845585     stored  541778738     short  66847',
    'GCTAII57…  ledger  466310847     stored  466250543     short  60304',
    'GAIWHGDR…  ledger  495201479     stored  495150229     short  51250',
    'GC7VM6DP…  ledger  591307293     stored  591240446     short  66847',
]
def f3_gif():
    return term_frames("xdrproof · replay into wallet-backend main", [
        ("type", "node replay/harness.mjs --adapter wallet-backend --target main \\\n    --entries backfill.p22-refunds-in-tx-changes-after"),
        ("out", [(c, t) for c, t in F3_RUN], 0.3),
        ("type", "jq -r '.sessions[0].failures[]\n    | \"\\(.id[15:23])…  ledger \\(.expect)  stored \\(.got)  short \\((.expect|tonumber)-(.got|tonumber))\"' \\\n    replay/runs/wallet-backend@main/report.json | column -t"),
        ("out", [("r", t) for t in F3_JQ], 0.18),
        ("cap", "pubnet ledger 56085459: every refunded account stored short by its refunds"),
        ("hold", 4.0)], 500)

# ---- render ---------------------------------------------------------------------------------------------
def shoot(doc, h, out, scale=2):
    # headless Chrome's viewport is shorter than its window, so render taller and crop to the figure
    with tempfile.TemporaryDirectory() as td:
        p, raw = Path(td) / "f.html", Path(td) / "raw.png"
        p.write_text(doc)
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--force-device-scale-factor={scale}",
                        f"--window-size={W},{h + 240}", "--virtual-time-budget=6000", f"--screenshot={raw}", p.as_uri()],
                       check=True, capture_output=True)
        subprocess.run(["magick", str(raw), "-crop", f"{int(W * scale)}x{int(h * scale)}+0+0", "+repage", out], check=True)

def gif(frames, h, out):
    with tempfile.TemporaryDirectory() as td:
        lst = []
        for i, (doc, dur) in enumerate(frames):
            png = Path(td) / f"{i:04d}.png"
            shoot(doc, h, str(png), scale=1.5)
            lst.append(f"file '{png}'\nduration {dur}")
        lst.append(f"file '{Path(td) / f'{len(frames)-1:04d}.png'}'")
        (Path(td) / "list.txt").write_text("\n".join(lst) + "\n")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(Path(td) / "list.txt"),
                        "-vf", "split[a][b];[a]palettegen=max_colors=64:stats_mode=full[p];[b][p]paletteuse=dither=none",
                        "-loop", "0", out], check=True)

if __name__ == "__main__":
    which = sys.argv[1:] or ["figs", "gifs"]
    if "figs" in which:
        for name, (fn, h) in {"f3-refunds.png": (f3_figure, 470), "f1-depth.png": (f1_figure, 494), "820-bounded-walk.png": (f820_figure, 514)}.items():
            shoot(fn(), h, str(HERE / name)); print("wrote", name)
    if "gifs" in which:
        for name, (fn, h) in {"f1-repro.gif": (f1_gif, 262), "f3-repro.gif": (f3_gif, 500)}.items():
            gif(fn(), h, str(HERE / name)); print("wrote", name)
