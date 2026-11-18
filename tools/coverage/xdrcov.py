#!/usr/bin/env python3
"""Schema-guided XDR coverage prototype. Driven only by xdr.json (rs-stellar-xdr
generator-definitions-json, format version 1). No SDK decoder involved.
  atoms   <xdr.json> <Root[,Root]>                 list reachable coverage atoms
  churn   <old.json> <new.json> <Root[,Root]>      atoms added/removed between versions
  walk    <xdr.json> <Type> [--framed] files...    decode files, tally atoms hit (JSON to stdout)
"""
import json, sys, struct, collections

def load(p):
    d = json.load(open(p)); assert d["version"] == 1, "unknown xdr.json format"
    return {x["name"]: x for x in d["definitions"]}

def refs(t, out):
    if isinstance(t, dict):
        if t.get("kind") == "ref": out.add(t["name"])
        for v in t.values(): refs(v, out)
    elif isinstance(t, list):
        for v in t: refs(v, out)

def reach(defs, roots):
    seen, st = set(), list(roots)
    while st:
        n = st.pop()
        if n in seen or n not in defs: continue
        seen.add(n); x = defs[n]; o = set()
        refs({k: v for k, v in x.items() if k != "source"}, o); st.extend(o)
    return seen

def atoms(defs, roots):
    arm, enum = set(), set()
    for n in reach(defs, roots):
        x = defs[n]
        if x["kind"] == "union":
            for a in x["arms"]:
                for c in a["cases"]:
                    arm.add(f"{n}.{c.get('name') or c['value']}")
        elif x["kind"] == "enum":
            for m in x["members"]: enum.add(f"{n}.{m['name']}")
    return arm, enum

BASE = {"int32": ">i", "uint32": ">I", "int64": ">q", "uint64": ">Q"}
class Walker:
    def __init__(self, defs, max_depth=1500):
        self.d = defs; self.hit = collections.Counter(); self.maxd = max_depth
        self.consts = {n: x["value"] for n, x in defs.items() if x["kind"] == "const"}
        self.enumv = {n: {m["value"]: m["name"] for m in x["members"]} for n, x in defs.items() if x["kind"] == "enum"}
        self.case = {n: {c["value"]: (c.get("name") or c["value"], a) for a in x["arms"] for c in a["cases"]}
                     for n, x in defs.items() if x["kind"] == "union"}
    def u32(self):
        v = struct.unpack_from(">I", self.b, self.o)[0]; self.o += 4; return v
    def skip(self, n):
        pad = (4 - n % 4) % 4
        if self.o + n + pad > len(self.b): raise ValueError("short read")
        if any(self.b[self.o + n:self.o + n + pad]): raise ValueError("non-zero padding")
        self.o += n + pad
    def lim(self, t, key):
        m = t.get(key)
        return self.consts[m] if isinstance(m, str) else m
    def run(self, buf, typ):
        self.b, self.o = buf, 0; self.ty({"kind": "ref", "name": typ}, 0)
        if self.o != len(buf): raise ValueError(f"trailing bytes {len(buf)-self.o}")
    def ty(self, t, depth):
        if depth > self.maxd: raise ValueError("depth limit")
        k = t["kind"]
        if k == "ref":
            n = t["name"]
            if n in BASE: self.o += struct.calcsize(BASE[n]); return None
            x = self.d[n]; xk = x["kind"]
            if xk == "typedef": return self.ty(x["type"], depth)
            if xk == "enum":
                v = struct.unpack_from(">i", self.b, self.o)[0]; self.o += 4
                if v not in self.enumv[n]: raise ValueError(f"bad enum {n}={v}")
                self.hit[f"E:{n}.{self.enumv[n][v]}"] += 1; return v
            if xk == "struct":
                for f in x["fields"]: self.ty(f["type"], depth + 1)
                return None
            if xk == "union":
                v = self.ty(x["discriminant"]["type"], depth)
                if v not in self.case[n]: raise ValueError(f"bad union case {n}={v}")
                label, a = self.case[n][v]; self.hit[f"U:{n}.{label}"] += 1
                if a.get("type"): self.ty(a["type"], depth + 1)
                return None
            raise ValueError(xk)
        if k in ("int", "unsigned_int"):
            v = struct.unpack_from(">i" if k == "int" else ">I", self.b, self.o)[0]; self.o += 4; return v
        if k in ("hyper", "unsigned_hyper"): self.o += 8; return None
        if k == "bool":
            v = self.u32()
            if v > 1: raise ValueError("bool not 0/1")
            return v
        if k == "opaque_fixed": self.skip(self.lim(t, "size")); return None
        if k in ("opaque_var", "string"):
            n = self.u32(); m = self.lim(t, "max_size") if "max_size" in t else self.lim(t, "max_count")
            if m is not None and n > m: raise ValueError("over max")
            self.skip(n); return None
        if k == "optional":
            p = self.u32()
            if p > 1: raise ValueError("bad optional")
            if p: self.ty(t["element"], depth + 1)
            return None
        if k == "var_array":
            n = self.u32(); m = self.lim(t, "max_count")
            if m is not None and n > m: raise ValueError("over max")
            for _ in range(n): self.ty(t["element"], depth + 1)
            return None
        if k == "array":
            for _ in range(self.lim(t, "count") if "count" in t else self.lim(t, "size")): self.ty(t["element"], depth + 1)
            return None
        raise ValueError(k)

def frames(buf):
    o = 0
    while o < len(buf):
        h = struct.unpack_from(">I", buf, o)[0]; n = h & 0x7fffffff; o += 4
        yield buf[o:o + n]; o += n

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "atoms":
        a, e = atoms(load(sys.argv[2]), sys.argv[3].split(","))
        print(json.dumps({"arms": len(a), "enum_members": len(e)}))
    elif cmd == "churn":
        r = sys.argv[4].split(","); a0, e0 = atoms(load(sys.argv[2]), r); a1, e1 = atoms(load(sys.argv[3]), r)
        print(json.dumps({"arms_before": len(a0), "arms_after": len(a1), "arms_added": sorted(a1 - a0),
                          "arms_removed": sorted(a0 - a1), "enum_added": sorted(e1 - e0), "enum_removed": sorted(e0 - e1)}, indent=1))
    elif cmd == "walk":
        defs = load(sys.argv[2]); typ = sys.argv[3]; args = sys.argv[4:]; framed = "--framed" in args
        files = [a for a in args if a != "--framed"]; w = Walker(defs); per = {}; nrec = 0; errs = []
        for f in files:
            buf = open(f, "rb").read(); before = set(w.hit)
            try:
                for rec in (frames(buf) if framed else [buf]): w.run(rec, typ); nrec += 1
            except Exception as ex: errs.append([f, repr(ex)])
            per[f] = sorted(set(w.hit) - before)
        a, e = atoms(defs, [typ]); hu = {k[2:] for k in w.hit if k[0] == "U"}; he = {k[2:] for k in w.hit if k[0] == "E"}
        print(json.dumps({"files": len(files), "records": nrec, "errors": errs,
            "arms_total": len(a), "arms_hit": len(hu & a), "enum_total": len(e), "enum_hit": len(he & e),
            "arms_missing": sorted(a - hu), "first_seen_in": {k: len(v) for k, v in per.items() if v} and
            sum(1 for v in per.values() if v)}, indent=1))
