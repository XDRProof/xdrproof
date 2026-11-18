// XDRProof conformance testee (prototype) for rs-stellar-xdr. Line-delimited JSON on stdin/stdout.
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::str::FromStr;
use stellar_xdr::{Asset, Limits, ReadXdr, Type, TypeVariant, WriteXdr};

fn limits() -> Limits {
    Limits { depth: 1500, len: 64 * 1024 * 1024 }
}

fn handle(req: &Value) -> Value {
    let op = req["op"].as_str().unwrap_or("");
    match op {
        "hello" => json!({"status":"ok","protocol":0,"implementation":{"sdk":"rust","package":"stellar-xdr","version":"30.0.0"},
            "ops":["decode","asset_compare"],"limits":{"depth":1500}}),
        "decode" => {
            let tv = match TypeVariant::from_str(req["input"]["type"].as_str().unwrap_or("")) {
                Ok(t) => t,
                Err(_) => return json!({"status":"unsupported","reason":"unknown type"}),
            };
            let t = match Type::from_xdr_base64(tv, req["input"]["xdr"].as_str().unwrap_or(""), limits()) {
                Ok(t) => t,
                Err(e) => return json!({"status":"error","error":{"stage":"decode","message":e.to_string()}}),
            };
            let xdr = match t.to_xdr_base64(limits()) {
                Ok(x) => x,
                Err(e) => return json!({"status":"error","error":{"stage":"encode","message":e.to_string()}}),
            };
            json!({"status":"ok","xdr":xdr,"json":serde_json::to_value(&t).unwrap_or(Value::Null)})
        }
        "asset_compare" => {
            let a = Asset::from_xdr_base64(req["input"]["a"].as_str().unwrap_or(""), limits());
            let b = Asset::from_xdr_base64(req["input"]["b"].as_str().unwrap_or(""), limits());
            match (a, b) {
                (Ok(a), Ok(b)) => json!({"status":"ok","value": match a.cmp(&b) {
                    std::cmp::Ordering::Less => -1, std::cmp::Ordering::Equal => 0, std::cmp::Ordering::Greater => 1 }}),
                _ => json!({"status":"error","error":{"stage":"decode","message":"bad asset"}}),
            }
        }
        _ => json!({"status":"unsupported"}),
    }
}

fn main() {
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for line in stdin.lock().lines() {
        let line = line.unwrap();
        if line.trim().is_empty() { continue; }
        let req: Value = serde_json::from_str(&line).unwrap();
        let mut resp = handle(&req);
        resp["id"] = req["id"].clone();
        writeln!(out, "{}", resp).unwrap();
        out.flush().unwrap();
    }
}
