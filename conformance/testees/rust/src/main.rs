// XDRProof conformance testee (protocol 1) for rs-stellar-xdr =30.0.0 and stellar-strkey 1.0.0.
// See conformance/README.md. Line-delimited JSON on stdin/stdout. rs-stellar-xdr has no default depth limit:
// this testee uses 1500, as the corpus's own native reader does.
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::str::FromStr;
use stellar_strkey::{ed25519, ClaimableBalance, Strkey};
use stellar_xdr::{Asset, Limits, ReadXdr, Type, TypeVariant, WriteXdr};

fn limits() -> Limits {
    Limits { depth: 1500, len: 256 * 1024 * 1024 }
}
fn err(stage: &str, e: impl ToString) -> Value {
    json!({"status":"error","error":{"stage":stage,"message":e.to_string()}})
}
fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
fn variant(req: &Value) -> Result<TypeVariant, Value> {
    TypeVariant::from_str(req["input"]["type"].as_str().unwrap_or(""))
        .map_err(|_| json!({"status":"unsupported","reason":"unknown type"}))
}

// the SEP-0023 payload: the bytes between the version byte and the checksum
fn strkey_payload(s: &str) -> Result<(char, Vec<u8>), String> {
    if s.starts_with('S') {
        return ed25519::PrivateKey::from_string(s).map(|k| ('S', k.0.to_vec())).map_err(|e| format!("{e:?}"));
    }
    let k = Strkey::from_string(s).map_err(|e| format!("{e:?}"))?;
    Ok(match k {
        Strkey::PublicKeyEd25519(p) => ('G', p.0.to_vec()),
        Strkey::PreAuthTx(p) => ('T', p.0.to_vec()),
        Strkey::HashX(p) => ('X', p.0.to_vec()),
        Strkey::MuxedAccountEd25519(m) => ('M', [m.ed25519.to_vec(), m.id.to_be_bytes().to_vec()].concat()),
        Strkey::SignedPayloadEd25519(p) => {
            let n = p.payload().len();
            let mut v = p.ed25519().to_vec();
            v.extend((n as u32).to_be_bytes());
            v.extend(p.payload());
            v.extend(std::iter::repeat(0u8).take((4 - n % 4) % 4));
            ('P', v)
        }
        Strkey::Contract(c) => ('C', c.0.to_vec()),
        Strkey::LiquidityPool(l) => ('L', l.0.to_vec()),
        Strkey::ClaimableBalance(ClaimableBalance::V0(h)) => ('B', [vec![0u8], h.to_vec()].concat()),
        Strkey::MuxedContract(m) => ('W', [m.contract_id.to_vec(), m.id.to_be_bytes().to_vec()].concat()),
    })
}

fn handle(req: &Value) -> Value {
    match req["op"].as_str().unwrap_or("") {
        "hello" => json!({"status":"ok","protocol":1,
            "implementation":{"sdk":"rust","package":"stellar-xdr + stellar-strkey","version":"30.0.0 / 1.0.0","runtime":"rustc"},
            "ops":["hello","decode","encode_json","strkey_decode","asset_compare"]}),
        "decode" => {
            let tv = match variant(req) { Ok(t) => t, Err(e) => return e };
            let t = match Type::from_xdr_base64(tv, req["input"]["xdr"].as_str().unwrap_or(""), limits()) {
                Ok(t) => t,
                Err(e) => return err("decode", e),
            };
            let xdr = match t.to_xdr_base64(limits()) { Ok(x) => x, Err(e) => return err("encode", e) };
            json!({"status":"ok","xdr":xdr,"json":serde_json::to_value(&t).unwrap_or(Value::Null)})
        }
        "encode_json" => {
            let tv = match variant(req) { Ok(t) => t, Err(e) => return e };
            let text = req["input"]["json"].to_string();
            match Type::from_json(tv, text.as_bytes()).and_then(|t| t.to_xdr_base64(limits())) {
                Ok(x) => json!({"status":"ok","xdr":x}),
                Err(e) => err("encode", e),
            }
        }
        "strkey_decode" => match strkey_payload(req["input"]["strkey"].as_str().unwrap_or("")) {
            Ok((k, p)) => json!({"status":"ok","kind":k.to_string(),"payload":hex(&p)}),
            Err(e) => err("decode", e),
        },
        "asset_compare" => {
            let a = Asset::from_xdr_base64(req["input"]["a"].as_str().unwrap_or(""), limits());
            let b = Asset::from_xdr_base64(req["input"]["b"].as_str().unwrap_or(""), limits());
            match (a, b) {
                (Ok(a), Ok(b)) => json!({"status":"ok","value": a.cmp(&b) as i32}),
                _ => err("decode", "bad asset"),
            }
        }
        _ => json!({"status":"unsupported","reason":"no such helper in rs-stellar-xdr"}),
    }
}

fn main() {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = match line { Ok(l) => l, Err(_) => break };
        if line.trim().is_empty() { continue; }
        let req: Value = match serde_json::from_str(&line) { Ok(v) => v, Err(_) => continue };
        let mut resp = handle(&req);
        resp["id"] = req["id"].clone();
        writeln!(out, "{resp}").unwrap();
        out.flush().unwrap();
    }
}
