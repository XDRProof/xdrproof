// SEP-0023 strkey encoding, written from the specification (no SDK code), so XDRProof's
// readers can render addresses independently of every SDK under test.
// version byte = type << 3; payload; CRC16-XModem (little-endian); RFC 4648 base32, no padding.
// Decoding is strict, as SEP-0023 requires: the payload length must fit its kind, and the text must
// re-encode to exactly itself (which rejects lengths congruent to 1, 3 or 6 mod 8 and non-zero unused
// bits in the last symbol). tools/strkey.test.mjs runs every valid and invalid vector in SEP-0023.

const VERSION = { G: 6 << 3, S: 18 << 3, T: 19 << 3, X: 23 << 3, M: 12 << 3, P: 15 << 3, C: 2 << 3, L: 11 << 3, B: 1 << 3, W: 22 << 3 };
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
    value = ((value << 8) | b) & 0xffff; bits += 8;
    while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(text) {
  const out = []; let bits = 0, value = 0;
  for (const ch of text) {
    const v = ALPHABET.indexOf(ch); if (v < 0) throw new Error('bad base32 character');
    value = ((value << 5) | v) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// Payload length rules per kind (P: 32-byte key, uint32 length 1..64, payload, zero padding to 4).
function payloadValid(kind, p) {
  switch (kind) {
    case 'G': case 'S': case 'T': case 'X': case 'C': case 'L': return p.length === 32;
    case 'M': case 'W': return p.length === 40;
    case 'B': return p.length === 33 && p[0] === 0; // ClaimableBalanceID type byte (V0 only), then the hash
    case 'P': {
      if (p.length < 36) return false;
      const n = p.readUInt32BE(32); if (n < 1 || n > 64) return false;
      const pad = (4 - (n % 4)) % 4;
      return p.length === 36 + n + pad && p.subarray(36 + n).every((x) => x === 0);
    }
    default: return false;
  }
}

export function encode(kind, payload) {
  if (VERSION[kind] === undefined) throw new Error(`unknown strkey kind ${kind}`);
  const body = Buffer.concat([Buffer.from([VERSION[kind]]), Buffer.from(payload)]);
  const crc = crc16xmodem(body);
  return base32(Buffer.concat([body, Buffer.from([crc & 0xff, crc >> 8])]));
}

// Decode a strkey to its raw payload. Throws unless the text is a canonical SEP-0023 strkey.
export function decode(text) {
  if ([1, 3, 6].includes(text.length % 8)) throw new Error('strkey length congruent to 1, 3 or 6 mod 8');
  const raw = unbase32(text);
  if (raw.length < 3) throw new Error('strkey too short');
  const body = raw.subarray(0, raw.length - 2);
  const crc = crc16xmodem(body);
  if (raw[raw.length - 2] !== (crc & 0xff) || raw[raw.length - 1] !== crc >> 8) throw new Error('bad strkey checksum');
  const kind = Object.keys(VERSION).find((k) => VERSION[k] === body[0]);
  if (!kind) throw new Error('unknown strkey version byte');
  const payload = body.subarray(1);
  if (!payloadValid(kind, payload)) throw new Error(`bad payload length for ${kind}`);
  if (encode(kind, payload) !== text) throw new Error('strkey does not re-encode to itself (non-canonical)');
  return { kind, payload };
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
// W (CAP-0084): 32-byte contract ID, then the 8-byte id, the same layout as M.
export const muxedContract = (hash, id) => encode('W', Buffer.concat([Buffer.from(hash), u64be(id)]));
// P: 32-byte key, payload length (uint32 BE), payload, zero padding to a multiple of 4.
export function signedPayload(ed25519, payload) {
  const p = Buffer.from(payload);
  const len = Buffer.alloc(4); len.writeUInt32BE(p.length);
  const pad = Buffer.alloc((4 - (p.length % 4)) % 4);
  return encode('P', Buffer.concat([Buffer.from(ed25519), len, p, pad]));
}
