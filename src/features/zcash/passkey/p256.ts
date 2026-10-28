/**
 * Minimal P-256 public-key recovery from an ECDSA signature (used only to sign back in with a synced passkey on a
 * device that has no local record of the public key — WebAuthn `get()` never returns the public key).
 * Affine BigInt arithmetic; slow-ish (tens of ms) but called at most twice per login.
 */
import { concatBytes, hexToBytes, sha256, type Hex } from 'viem';

const P = 0xffffffff00000001000000000000000000000000ffffffffffffffffffffffffn;
const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const A = P - 3n;
const B = 0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604bn;
const G: Pt = {
  x: 0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296n,
  y: 0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5n,
};

type Pt = { x: bigint; y: bigint } | null;

const mod = (a: bigint, m: bigint) => ((a % m) + m) % m;
function pow(b: bigint, e: bigint, m: bigint): bigint {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
const inv = (a: bigint, m: bigint) => pow(a, m - 2n, m);

function add(p1: Pt, p2: Pt): Pt {
  if (!p1) return p2;
  if (!p2) return p1;
  if (p1.x === p2.x) {
    if (mod(p1.y + p2.y, P) === 0n) return null;
    const l = mod((3n * p1.x * p1.x + A) * inv(2n * p1.y, P), P);
    const x = mod(l * l - 2n * p1.x, P);
    return { x, y: mod(l * (p1.x - x) - p1.y, P) };
  }
  const l = mod((p2.y - p1.y) * inv(p2.x - p1.x, P), P);
  const x = mod(l * l - p1.x - p2.x, P);
  return { x, y: mod(l * (p1.x - x) - p1.y, P) };
}

function mul(k: bigint, pt: Pt): Pt {
  let r: Pt = null;
  let q = pt;
  k = mod(k, N);
  while (k > 0n) {
    if (k & 1n) r = add(r, q);
    q = add(q, q);
    k >>= 1n;
  }
  return r;
}

const toHex32 = (v: bigint): Hex => `0x${v.toString(16).padStart(64, '0')}` as Hex;

/** The 32-byte message hash WebAuthn signs: sha256(authenticatorData || sha256(clientDataJSON)). */
export function webauthnDigest(authenticatorData: Uint8Array, clientDataJSON: Uint8Array): bigint {
  const h = sha256(concatBytes([authenticatorData, hexToBytes(sha256(clientDataJSON))]));
  return BigInt(h);
}

/** Up to two candidate public keys (qx, qy) for signature (r, s) over digest e. */
export function recoverCandidates(e: bigint, r: bigint, s: bigint): { qx: Hex; qy: Hex }[] {
  if (r <= 0n || r >= N || s <= 0n || s >= N) return [];
  const x = r; // r + n >= p for P-256 in practice; ignore the overflow case
  const rhs = mod(x * x * x + A * x + B, P);
  const y0 = pow(rhs, (P + 1n) / 4n, P);
  if ((y0 * y0) % P !== rhs) return [];
  const rInv = inv(r, N);
  const u1 = mod(-e * rInv, N);
  const u2 = mod(s * rInv, N);
  const out: { qx: Hex; qy: Hex }[] = [];
  for (const y of [y0, P - y0]) {
    const Q = add(mul(u1, G), mul(u2, { x, y }));
    if (Q) out.push({ qx: toHex32(Q.x), qy: toHex32(Q.y) });
  }
  return out;
}

export const samePoint = (a: { qx: Hex; qy: Hex }, b: { qx: Hex; qy: Hex }) =>
  a.qx.toLowerCase() === b.qx.toLowerCase() && a.qy.toLowerCase() === b.qy.toLowerCase();
