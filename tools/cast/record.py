#!/usr/bin/env python3
"""record.py <out.cast> [--cols N] [--rows N] [--title TEXT] [--timeout SECONDS] -- <command...>

Records a real run of a command, as the terminal saw it, in asciicast v2 (the asciinema format): a JSON header,
then one [seconds, "o", text] event per write. The command runs in a pseudo-terminal of the given size, with
colour and terminal links on (TERM=xterm-256color, COLORTERM=truecolor, FORCE_HYPERLINK=1), so the file holds
exactly what XDRProof prints in a terminal: stamps, cards, the live block's redraws and the links. Nothing is
re-typed or staged; tools/cast/banner.mjs and the other renderers draw from the file.

The recording is written however the run ends (finished, stopped, timed out), with "exit" in its header. A first
Ctrl-C is passed to the command as a terminal would; a second stops its process group (SIGTERM), a third kills it.
--timeout stops the process group after that many seconds (SIGTERM, then SIGKILL 5 s later).
Exit status: the command's (128 + the signal when a signal ended it)."""
import codecs, json, os, pty, select, signal, struct, sys, time, fcntl, termios

argv = sys.argv[1:]
if "--" not in argv or not argv:
    sys.exit(__doc__)
opts, cmd = argv[:argv.index("--")], argv[argv.index("--") + 1:]
out = opts[0]
get = lambda k, d: opts[opts.index(k) + 1] if k in opts else d
cols, rows, title = int(get("--cols", 80)), int(get("--rows", 40)), get("--title", " ".join(cmd))
timeout = float(get("--timeout", 0)) or None

env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor", "FORCE_HYPERLINK": "1",
       "TERM_PROGRAM": "xdrproof-cast", "COLUMNS": str(cols), "LINES": str(rows)}
env.pop("NO_COLOR", None); env.pop("CI", None)
pid, fd = pty.fork()
if pid == 0:
    os.execvpe(cmd[0], cmd, env)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))

t0 = time.time(); events = []
# UTF-8 decoded incrementally: a character split across two reads is kept whole, an invalid byte becomes U+FFFD
decoder = codecs.getincrementaldecoder("utf-8")(errors="replace")
stops = 0
def stop(sig):
    try: os.killpg(pid, sig)  # the command leads its own session (pty.fork), so its group is its pid
    except ProcessLookupError: pass
def on_int(*_):
    global stops
    stops += 1
    if stops == 1: os.write(fd, b"\x03")       # as a terminal would
    else: stop(signal.SIGTERM if stops == 2 else signal.SIGKILL)
signal.signal(signal.SIGINT, on_int)

def save(code):
    header = {"version": 2, "width": cols, "height": rows, "timestamp": int(t0), "title": title,
              "env": {"TERM": env["TERM"]}, "command": " ".join(cmd), "exit": code}
    with open(out, "w") as f:
        f.write(json.dumps(header) + "\n")
        for e in events:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    print(f"{out}: {len(events)} writes, {round(time.time() - t0, 1)} s, exit {code}", file=sys.stderr)

code = None
try:
    killed_at = None
    while True:
        if timeout and time.time() - t0 > timeout:
            if killed_at is None: stop(signal.SIGTERM); killed_at = time.time()
            elif time.time() - killed_at > 5: stop(signal.SIGKILL)
        try:
            r, _, _ = select.select([fd], [], [], 0.05)
        except InterruptedError:
            continue
        if fd not in r:
            continue
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        text = decoder.decode(data)
        if text:
            events.append([round(time.time() - t0, 4), "o", text])
    rest = decoder.decode(b"", final=True)
    if rest:
        events.append([round(time.time() - t0, 4), "o", rest])
    _, status = os.waitpid(pid, 0)
    code = os.waitstatus_to_exitcode(status)
    if code < 0: code = 128 - code             # ended by a signal: 128 + its number, as shells report it
finally:
    # whatever ended the run, what was recorded is kept
    save(code if code is not None else 130)
sys.exit(code)
