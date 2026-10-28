/**
 * Zcash address validation with full checksums:
 *  - transparent t1 (P2PKH, version 0x1CB8) / t3 (P2SH, 0x1CBD): Base58Check, 26 bytes
 *  - Sapling zs1…: Bech32 (BIP-173), HRP "zs", 43-byte payload (diversifier 11 + pk_d 32)
 *  - Unified u1…: Bech32m (BIP-350), HRP "u", no 90-char limit (ZIP-316). The payload is un-F4Jumbled (BLAKE2b) and
 *    its 16-byte HRP padding and receiver TLVs are checked; it must contain a Sapling or Orchard receiver.
 *  - TEX (tex1…, ZIP 320) and testnet addresses are rejected. Curve-point validity of receivers is not checked.
 * Pure functions — safe on server and client.
 */
import { sha256 } from 'viem';

export type ZcashAddressKind = 't' | 'shielded' | 'unified';
export const ALL_KINDS: ZcashAddressKind[] = ['t', 'shielded', 'unified'];

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(s: string): Uint8Array | null {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) return null;
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return new Uint8Array(bytes);
}

function hexToU8(h: string): Uint8Array {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function isTransparent(a: string): boolean {
  if (!/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false;
  const b = base58Decode(a);
  if (!b || b.length !== 26) return false;
  const v = (b[0] << 8) | b[1];
  if (v !== 0x1cb8 && v !== 0x1cbd) return false;
  const body = b.subarray(0, 22);
  const chk = hexToU8(sha256(sha256(body)));
  for (let i = 0; i < 4; i++) if (chk[i] !== b[22 + i]) return false;
  return true;
}

const BECH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}

/** Returns the 5-bit data part (without checksum) when the checksum matches `constant`, else null. */
export function bechDecode(a: string, hrp: string, constant: number): number[] | null {
  if (a !== a.toLowerCase()) return null;
  const sep = a.lastIndexOf('1');
  if (sep < 1 || a.slice(0, sep) !== hrp) return null;
  const data: number[] = [];
  for (const ch of a.slice(sep + 1)) {
    const v = BECH.indexOf(ch);
    if (v < 0) return null;
    data.push(v);
  }
  if (data.length < 6) return null;
  const exp = [...hrp].map((c) => c.charCodeAt(0) >> 5);
  const low = [...hrp].map((c) => c.charCodeAt(0) & 31);
  if (polymod([...exp, 0, ...low, ...data]) !== constant) return null;
  return data.slice(0, -6);
}

function fiveToEightLen(words: number[]): number | null {
  const bits = words.length * 5;
  const pad = bits % 8;
  if (pad >= 5) return null;
  // trailing padding bits must be zero
  if (pad && (words[words.length - 1] & ((1 << pad) - 1)) !== 0) return null;
  return Math.floor(bits / 8);
}

function isSapling(a: string): boolean {
  if (a.length !== 78 || !a.startsWith('zs1')) return false;
  const d = bechDecode(a, 'zs', 1);
  return d !== null && fiveToEightLen(d) === 43;
}

function fiveToEight(words: number[]): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const w of words) {
    acc = ((acc << 5) | w) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// ---------------------------------------------------------------- BLAKE2b (RFC 7693) with personalization — for F4Jumble

const M64 = (1n << 64n) - 1n;
const B2_IV = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];
const B2_SIGMA = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
];
const rotr = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & M64;
const le64 = (b: Uint8Array, o: number) => {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[o + i] ?? 0);
  return v;
};

/** BLAKE2b-`outLen` of `msg` with a 16-byte personalization (no key, no salt). */
export function blake2b(msg: Uint8Array, outLen: number, personal: Uint8Array): Uint8Array {
  const h = B2_IV.slice();
  h[0] ^= 0x01010000n | BigInt(outLen);
  h[6] ^= le64(personal, 0);
  h[7] ^= le64(personal, 8);
  const blocks = Math.max(1, Math.ceil(msg.length / 128));
  for (let bi = 0; bi < blocks; bi++) {
    const last = bi === blocks - 1;
    const chunk = new Uint8Array(128);
    chunk.set(msg.subarray(bi * 128, bi * 128 + 128));
    const m = Array.from({ length: 16 }, (_, i) => le64(chunk, i * 8));
    const t = BigInt(Math.min(msg.length, (bi + 1) * 128));
    const v = [...h, ...B2_IV];
    v[12] ^= t & M64;
    if (last) v[14] ^= M64;
    const G = (a: number, b: number, c: number, d: number, x: bigint, y: bigint) => {
      v[a] = (v[a] + v[b] + x) & M64;
      v[d] = rotr(v[d] ^ v[a], 32n);
      v[c] = (v[c] + v[d]) & M64;
      v[b] = rotr(v[b] ^ v[c], 24n);
      v[a] = (v[a] + v[b] + y) & M64;
      v[d] = rotr(v[d] ^ v[a], 16n);
      v[c] = (v[c] + v[d]) & M64;
      v[b] = rotr(v[b] ^ v[c], 63n);
    };
    for (let r = 0; r < 12; r++) {
      const s = B2_SIGMA[r % 10];
      G(0, 4, 8, 12, m[s[0]], m[s[1]]);
      G(1, 5, 9, 13, m[s[2]], m[s[3]]);
      G(2, 6, 10, 14, m[s[4]], m[s[5]]);
      G(3, 7, 11, 15, m[s[6]], m[s[7]]);
      G(0, 5, 10, 15, m[s[8]], m[s[9]]);
      G(1, 6, 11, 12, m[s[10]], m[s[11]]);
      G(2, 7, 8, 13, m[s[12]], m[s[13]]);
      G(3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (let i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
  }
  const out = new Uint8Array(outLen);
  for (let i = 0; i < outLen; i++) out[i] = Number((h[i >> 3] >> BigInt(8 * (i & 7))) & 0xffn);
  return out;
}

// ---------------------------------------------------------------- F4Jumble⁻¹ + receiver parsing (ZIP 316)

const pers = (tag: string, i: number, j = 0) => {
  const p = new Uint8Array(16);
  for (let k = 0; k < tag.length; k++) p[k] = tag.charCodeAt(k);
  p[13] = i;
  p[14] = j & 0xff;
  p[15] = (j >> 8) & 0xff;
  return p;
};
const xorInto = (a: Uint8Array, b: Uint8Array) => a.map((x, k) => x ^ b[k]);
const hR = (i: number, u: Uint8Array, n: number) => blake2b(u, n, pers('UA_F4Jumble_H', i));
function gR(i: number, u: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let j = 0; j * 64 < n; j++) out.set(blake2b(u, 64, pers('UA_F4Jumble_G', i, j)).subarray(0, Math.min(64, n - j * 64)), j * 64);
  return out;
}
function f4jumbleInv(m: Uint8Array): Uint8Array {
  const lL = Math.min(64, Math.floor(m.length / 2));
  const lR = m.length - lL;
  const c = m.subarray(0, lL);
  const d = m.subarray(lL);
  const y = xorInto(c, hR(1, d, lL));
  const x = xorInto(d, gR(1, y, lR));
  const a = xorInto(y, hR(0, x, lL));
  const b = xorInto(x, gR(0, a, lR));
  const out = new Uint8Array(m.length);
  out.set(a, 0);
  out.set(b, lL);
  return out;
}

const UA_RECEIVER_LEN: Record<number, number> = { 0: 20, 1: 20, 2: 43, 3: 43 };

/**
 * Typecodes of a mainnet unified address's receivers (0 p2pkh, 1 p2sh, 2 Sapling, 3 Orchard, others = unknown/metadata),
 * or null when the payload doesn't decode: wrong padding (typo / testnet), malformed TLVs, unsorted or duplicate
 * typecodes, wrong receiver lengths, both P2PKH and P2SH, or transparent-only (ZIP 316 forbids it).
 */
export function unifiedReceivers(addr: string): number[] | null {
  const a = (addr || '').trim();
  if (!a.startsWith('u1') || a.length < 100 || a.length > 1200) return null;
  const d = bechDecode(a, 'u', 0x2bc830a3);
  if (!d || fiveToEightLen(d) === null) return null;
  const raw0 = fiveToEight(d);
  if (raw0.length < 48) return null;
  const raw = f4jumbleInv(raw0);
  const pad = raw.subarray(raw.length - 16);
  if (pad[0] !== 0x75 /* 'u' */ || pad.subarray(1).some((x) => x !== 0)) return null;
  const body = raw.subarray(0, raw.length - 16);
  const readCS = (p: number): [number, number] | null => {
    const f = body[p];
    if (f === undefined) return null;
    if (f < 0xfd) return [f, p + 1];
    if (f === 0xfd && p + 3 <= body.length) {
      const v = body[p + 1] | (body[p + 2] << 8);
      return v >= 0xfd ? [v, p + 3] : null;
    }
    return null; // larger typecodes / lengths are not used by any real address
  };
  const codes: number[] = [];
  let p = 0;
  while (p < body.length) {
    const tc = readCS(p);
    if (!tc) return null;
    const ln = readCS(tc[1]);
    if (!ln) return null;
    if (ln[1] + ln[0] > body.length) return null;
    if (codes.length && tc[0] <= codes[codes.length - 1]) return null;
    const want = UA_RECEIVER_LEN[tc[0]];
    if (want !== undefined && want !== ln[0]) return null;
    codes.push(tc[0]);
    p = ln[1] + ln[0];
  }
  if (!codes.length || (codes.includes(0) && codes.includes(1))) return null;
  if (codes.every((c) => c === 0 || c === 1)) return null;
  return codes;
}

/** True when a valid UA carries a Sapling or Orchard receiver (what a shielded payout needs). */
export const unifiedHasShielded = (addr: string) => {
  const r = unifiedReceivers(addr);
  return r !== null && (r.includes(2) || r.includes(3));
};

/** Sprout only uses UAs as shielded destinations, so a UA must carry a Sapling or Orchard receiver to count. */
function isUnified(a: string): boolean {
  return unifiedHasShielded(a);
}

export function zcashAddressKind(addr: string): ZcashAddressKind | null {
  const a = (addr || '').trim();
  if (!a) return null;
  if (a[0] === 't') return isTransparent(a) ? 't' : null;
  if (a.startsWith('zs1')) return isSapling(a) ? 'shielded' : null;
  if (a.startsWith('u1')) return isUnified(a) ? 'unified' : null;
  return null;
}

export function isValidZcashAddress(addr: string, kinds: ZcashAddressKind[] = ALL_KINDS): boolean {
  const k = zcashAddressKind(addr);
  return k !== null && kinds.includes(k);
}

/** Why an address was rejected (for helpful input hints). */
export function zcashAddressProblem(addr: string, kinds: ZcashAddressKind[] = ALL_KINDS): 'empty' | 'kind' | 'invalid' | null {
  const a = (addr || '').trim();
  if (!a) return 'empty';
  const k = zcashAddressKind(a);
  if (!k) {
    // Valid-looking prefix of another kind? Tell the user it's the wrong kind rather than "invalid".
    return 'invalid';
  }
  return kinds.includes(k) ? null : 'kind';
}

export const shortZ = (a: string, n = 8) => (a.length > n * 2 + 1 ? `${a.slice(0, n)}…${a.slice(-n)}` : a);
