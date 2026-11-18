// SEP-0023 strkey encoding, written from the specification (no SDK code), so XDRProof's
// readers can render addresses independently of every SDK under test.
// version byte = type << 3; payload; CRC16-XModem (little-endian); RFC 4648 base32, no padding.

const VERSION = { G: 6 << 3, S: 18 << 3, T: 19 << 3, X: 23 << 3, M: 12 << 3, P: 15 << 3, C: 2 << 3, L: 11 << 3, B: 1 << 3 };
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function crc16xmodem(bytes) {
  let crc = 0x0000;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function base32(bytes) {
  let out = '', bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text) {
  const out = []; let bits = 0, value = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch); if (v < 0) throw new Error('bad base32 character');
    value = (value << 5) | v; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function encode(kind, payload) {
  const body = Buffer.concat([Buffer.from([VERSION[kind]]), Buffer.from(payload)]);
  const crc = crc16xmodem(body);
  return base32(Buffer.concat([body, Buffer.from([crc & 0xff, crc >> 8])]));
}

// Decode a strkey to its raw payload (checks version and checksum).
export function decode(text) {
  const raw = unbase32(text);
  const body = raw.subarray(0, raw.length - 2);
  const crc = crc16xmodem(body);
  if (raw[raw.length - 2] !== (crc & 0xff) || raw[raw.length - 1] !== crc >> 8) throw new Error('bad strkey checksum');
  const kind = Object.keys(VERSION).find((k) => VERSION[k] === body[0]);
  if (!kind) throw new Error('unknown strkey version byte');
  return { kind, payload: body.subarray(1) };
}

const u64be = (id) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(id)); return b; };

export const account = (ed25519) => encode('G', ed25519);
export const contract = (hash) => encode('C', hash);
export const pool = (hash) => encode('L', hash);
export const claimableBalance = (hash) => encode('B', Buffer.concat([Buffer.from([0]), Buffer.from(hash)])); // V0
export const preAuthTx = (hash) => encode('T', hash);
export const hashX = (hash) => encode('X', hash);
// M: 32-byte key, then the 8-byte id (SEP-0023).
export const muxed = (ed25519, id) => encode('M', Buffer.concat([Buffer.from(ed25519), u64be(id)]));
// P: 32-byte key, payload length (uint32 BE), payload, zero padding to a multiple of 4.
export function signedPayload(ed25519, payload) {
  const p = Buffer.from(payload);
  const len = Buffer.alloc(4); len.writeUInt32BE(p.length);
  const pad = Buffer.alloc((4 - (p.length % 4)) % 4);
  return encode('P', Buffer.concat([Buffer.from(ed25519), len, p, pad]));
}
