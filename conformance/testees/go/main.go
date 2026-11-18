// XDRProof conformance testee (prototype) for go-stellar-sdk. Line-delimited JSON on stdin/stdout.
package main

import (
	"bufio"
	"encoding/json"
	"os"

	"github.com/stellar/go-stellar-sdk/xdr"
)

type req struct {
	ID    string          `json:"id"`
	Op    string          `json:"op"`
	Input json.RawMessage `json:"input"`
}

func roundtrip(b64 string, v interface{}) map[string]interface{} {
	if err := xdr.SafeUnmarshalBase64(b64, v); err != nil {
		return map[string]interface{}{"status": "error", "error": map[string]string{"stage": "decode", "message": err.Error()}}
	}
	out, err := xdr.MarshalBase64(v)
	if err != nil {
		return map[string]interface{}{"status": "error", "error": map[string]string{"stage": "encode", "message": err.Error()}}
	}
	return map[string]interface{}{"status": "ok", "xdr": out} // no SEP-51 in go-stellar-sdk: json omitted
}

func handle(r req) map[string]interface{} {
	switch r.Op {
	case "hello":
		return map[string]interface{}{"status": "ok", "protocol": 0,
			"implementation": map[string]string{"sdk": "go", "package": "github.com/stellar/go-stellar-sdk", "version": os.Getenv("SDK_VERSION")},
			"ops": []string{"decode", "asset_compare"}, "limits": map[string]int{"depth": 1500}}
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
		case "TransactionMeta":
			return roundtrip(in.Xdr, &xdr.TransactionMeta{})
		case "LedgerCloseMeta":
			return roundtrip(in.Xdr, &xdr.LedgerCloseMeta{})
		}
		return map[string]interface{}{"status": "unsupported", "reason": "type not wired"}
	case "asset_compare":
		var in struct{ A, B string }
		json.Unmarshal(r.Input, &in)
		var a, b xdr.Asset
		if xdr.SafeUnmarshalBase64(in.A, &a) != nil || xdr.SafeUnmarshalBase64(in.B, &b) != nil {
			return map[string]interface{}{"status": "error", "error": map[string]string{"stage": "decode", "message": "bad asset"}}
		}
		v := 0
		if a.LessThan(b) {
			v = -1
		} else if b.LessThan(a) {
			v = 1
		}
		return map[string]interface{}{"status": "ok", "value": v}
	}
	return map[string]interface{}{"status": "unsupported"}
}

func main() {
	sc := bufio.NewScanner(os.Stdin)
	sc.Buffer(make([]byte, 1<<20), 256<<20)
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
