// XDRProof conformance testee (protocol 1) for go-stellar-sdk. See conformance/README.md.
// Line-delimited JSON on stdin/stdout. go-stellar-sdk has no SEP-0051 JSON and no native ScVal projection,
// so decode answers bytes only, and those ops answer "unsupported".
package main

import (
	"bufio"
	"encoding/hex"
	"encoding/json"
	"os"
	"runtime/debug"

	"github.com/stellar/go-stellar-sdk/strkey"
	"github.com/stellar/go-stellar-sdk/xdr"
)

type req struct {
	ID    string          `json:"id"`
	Op    string          `json:"op"`
	Input json.RawMessage `json:"input"`
}
type obj = map[string]interface{}

func fail(stage string, err error) obj {
	return obj{"status": "error", "error": map[string]string{"stage": stage, "message": err.Error()}}
}

// decodes into v with go-stellar-sdk's bounded decoder, then re-encodes
func roundtrip(b64 string, v interface{}) obj {
	if err := xdr.SafeUnmarshalBase64(b64, v); err != nil {
		return fail("decode", err)
	}
	out, err := xdr.MarshalBase64(v)
	if err != nil {
		return fail("encode", err)
	}
	return obj{"status": "ok", "xdr": out}
}

const base32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

// the go-stellar-sdk version this binary was actually built with, from its module build info
func sdkVersion() string {
	if bi, ok := debug.ReadBuildInfo(); ok {
		for _, d := range bi.Deps {
			if d.Path == "github.com/stellar/go-stellar-sdk" {
				return d.Version
			}
		}
	}
	return "unknown"
}

func handle(r req) obj {
	switch r.Op {
	case "hello":
		return obj{"status": "ok", "protocol": 1,
			"implementation": map[string]string{"sdk": "go", "package": "github.com/stellar/go-stellar-sdk", "version": sdkVersion(), "runtime": "go"},
			"ops": []string{"hello", "decode", "strkey_decode", "asset_compare"}}
	case "decode":
		var in struct{ Type, Xdr string }
		json.Unmarshal(r.Input, &in)
		switch in.Type {
		case "Operation":
			return roundtrip(in.Xdr, &xdr.Operation{})
		case "ScVal":
			return roundtrip(in.Xdr, &xdr.ScVal{})
		case "Asset":
			return roundtrip(in.Xdr, &xdr.Asset{})
		case "TransactionEnvelope":
			return roundtrip(in.Xdr, &xdr.TransactionEnvelope{})
		case "LedgerCloseMeta":
			return roundtrip(in.Xdr, &xdr.LedgerCloseMeta{})
		}
		return obj{"status": "unsupported", "reason": "type not wired"}
	case "strkey_decode":
		var in struct{ Strkey string }
		json.Unmarshal(r.Input, &in)
		vb, payload, err := strkey.DecodeAny(in.Strkey)
		if err != nil {
			return fail("decode", err)
		}
		return obj{"status": "ok", "kind": string(base32[byte(vb)>>3]), "payload": hex.EncodeToString(payload)}
	case "asset_compare":
		var in struct{ A, B string }
		json.Unmarshal(r.Input, &in)
		var a, b xdr.Asset
		if xdr.SafeUnmarshalBase64(in.A, &a) != nil || xdr.SafeUnmarshalBase64(in.B, &b) != nil {
			return obj{"status": "error", "error": map[string]string{"stage": "decode", "message": "bad asset"}}
		}
		v := 0
		if a.LessThan(b) {
			v = -1
		} else if b.LessThan(a) {
			v = 1
		}
		return obj{"status": "ok", "value": v}
	}
	return obj{"status": "unsupported", "reason": "no such helper in go-stellar-sdk"}
}

func main() {
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 1<<20), 512<<20)
	w := bufio.NewWriter(os.Stdout)
	for sc.Scan() {
		var r req
		if json.Unmarshal(sc.Bytes(), &r) != nil {
			continue
		}
		resp := handle(r)
		resp["id"] = r.ID
		b, _ := json.Marshal(resp)
		w.Write(b)
		w.WriteByte('\n')
		w.Flush()
	}
}
