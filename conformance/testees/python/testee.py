# XDRProof conformance testee (protocol 1) for stellar-sdk (py-stellar-base). See conformance/README.md.
# Line-delimited JSON on stdin/stdout; runs in the Docker image built from ./Dockerfile.
import base64, json, sys

import stellar_sdk
from stellar_sdk import xdr, scval
from stellar_sdk.strkey import StrKey

TYPES = {"ScVal": "SCVal"}  # rs-stellar-xdr spelling -> py-stellar-base class name, where they differ
STRKEY = {"G": "decode_ed25519_public_key", "S": "decode_ed25519_secret_seed", "M": "decode_med25519_public_key",
          "T": "decode_pre_auth_tx", "X": "decode_sha256_hash", "P": "decode_ed25519_signed_payload",
          "C": "decode_contract", "W": "decode_muxed_contract", "L": "decode_liquidity_pool", "B": "decode_claimable_balance"}


def err(stage, e):
    return {"status": "error", "error": {"stage": stage, "message": (type(e).__name__ + ": " + str(e))[:300]}}


def canon(v):  # typed, lossless rendering of Python natives
    if isinstance(v, bool) or v is None or isinstance(v, str):
        return v
    if isinstance(v, int):
        return {"$bigint": str(v)}
    if isinstance(v, (bytes, bytearray)):
        return {"$bytes": bytes(v).hex()}
    if isinstance(v, (list, tuple)):
        return [canon(x) for x in v]
    if isinstance(v, dict):
        return {"$object": [[str(k), canon(x)] for k, x in v.items()]}
    return {"$repr": repr(v)}


def cls(name):
    return getattr(xdr, TYPES.get(name, name), None)


def decode(i):
    c = cls(i["type"])
    if c is None:
        return {"status": "unsupported", "reason": "no xdr." + TYPES.get(i["type"], i["type"])}
    try:
        v = c.from_xdr(i["xdr"])
    except Exception as e:  # RecursionError included: a refusal, not a crash
        return err("decode", e)
    try:
        out = v.to_xdr()
    except Exception as e:
        return err("encode", e)
    try:
        return {"xdr": out, "json": json.loads(v.to_json())}
    except Exception as e:
        return {"xdr": out, "json_error": (type(e).__name__ + ": " + str(e))[:300]}


def encode_json(i):
    c = cls(i["type"])
    if c is None or not hasattr(c, "from_json"):
        return {"status": "unsupported", "reason": "no from_json"}
    try:
        return {"xdr": c.from_json(json.dumps(i["json"])).to_xdr()}
    except Exception as e:
        return err("encode", e)


def strkey_decode(i):
    s = i["strkey"]
    f = STRKEY.get(s[:1])
    if f is None or not hasattr(StrKey, f):
        return {"status": "unsupported", "reason": "no StrKey." + str(f)}
    try:
        return {"kind": s[0], "payload": getattr(StrKey, f)(s).hex()}
    except Exception as e:
        return err("decode", e)


def native(i):
    return {"value": canon(scval.to_native(xdr.SCVal.from_xdr(i["xdr"])))}


OPS = {"decode": decode, "encode_json": encode_json, "strkey_decode": strkey_decode, "native": native}


def hello(_):
    return {"protocol": 1, "implementation": {"sdk": "python", "package": "stellar-sdk", "version": stellar_sdk.__version__,
            "runtime": "python " + sys.version.split()[0]}, "ops": sorted(OPS)}


OPS["hello"] = hello
# the default recursion limit stays: deep values are measured as users meet them (RecursionError is a refusal)
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
