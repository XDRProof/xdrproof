# XDRProof conformance testee (protocol 1) for stellar-xdr and stellar-strkey, the standalone Python packages that
# replace stellar_sdk.xdr and stellar_sdk.strkey in py-stellar-base's next major release (py-stellar-base#1264, #1268).
# Library defaults are used as they ship (max_depth=500). See conformance/README.md.
import importlib.metadata as md, json, sys

import stellar_xdr as x
import stellar_strkey as k

TYPES = {"ScVal": "SCVal"}


def err(stage, e):
    return {"status": "error", "error": {"stage": stage, "message": (type(e).__name__ + ": " + str(e))[:300]}}


def cls(name):
    return getattr(x, TYPES.get(name, name), None)


def decode(i):
    c = cls(i["type"])
    if c is None:
        return {"status": "unsupported", "reason": "no stellar_xdr." + TYPES.get(i["type"], i["type"])}
    try:
        v = c.from_xdr_base64(i["xdr"])
    except Exception as e:
        return err("decode", e)
    try:
        out = v.to_xdr_base64()
    except Exception as e:
        return err("encode", e)
    try:
        return {"xdr": out, "json": v.to_json_value()}
    except Exception as e:
        return {"xdr": out, "json_error": (type(e).__name__ + ": " + str(e))[:300]}


def encode_json(i):
    c = cls(i["type"])
    if c is None:
        return {"status": "unsupported", "reason": "no class"}
    try:
        return {"xdr": c.from_json_value(i["json"]).to_xdr_base64()}
    except Exception as e:
        return err("encode", e)


def strkey_decode(i):
    s = i["strkey"]
    try:
        p = k.Ed25519PrivateKey.from_string(s) if s[:1] == "S" else k.parse(s)
        return {"kind": s[0], "payload": bytes(p.to_bytes()).hex()}
    except Exception as e:
        return err("decode", e)


OPS = {"decode": decode, "encode_json": encode_json, "strkey_decode": strkey_decode}
OPS["hello"] = lambda _: {"protocol": 1, "implementation": {"sdk": "python-xdr", "package": "stellar-xdr + stellar-strkey",
    "version": md.version("stellar-xdr") + " / " + md.version("stellar-strkey"), "runtime": "python " + sys.version.split()[0]}, "ops": sorted(OPS)}
for line in sys.stdin:
    if not line.strip():
        continue
    req = json.loads(line)
    try:
        resp = OPS[req["op"]](req.get("input") or {}) if req["op"] in OPS else {"status": "unsupported", "reason": "unknown op"}
    except Exception as e:
        resp = err("api", e)
    sys.stdout.write(json.dumps({"id": req["id"], "status": "ok", **resp}) + "\n")
    sys.stdout.flush()
