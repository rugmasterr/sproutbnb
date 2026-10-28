import { createHash } from "node:crypto";

/**
 * Zcash address handling. NEAR Intents 1Click delivers native ZEC to *transparent* addresses only
 * (t1… P2PKH, t3… P2SH). Shielded (zs1… Sapling) and unified (u1…) recipients go through Sprout's shield
 * forwarder: 1Click pays the forwarder's t-address and the forwarder sends on to the shielded/unified
 * address with a stamp memo.
 *
 * The contracts only check the *format* (ZcashAddress.sol); the keeper verifies the checksum
 * (Base58Check for t-addresses, Bech32 for zs1, Bech32m for u1) before any ZEC is bridged.
 */

export type ZcashKind = "transparent" | "shielded" | "invalid";

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function sha256(b: Buffer): Buffer {
  return createHash("sha256").update(b).digest();
}

function base58Decode(s: string): Buffer | undefined {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) return undefined;
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let lead = 0;
  for (const ch of s) {
    if (ch === "1") lead++;
    else break;
  }
  return Buffer.concat([Buffer.alloc(lead), Buffer.from(n === 0n ? "" : hex, "hex")]);
}

/** t1 (P2PKH, version 0x1CB8) / t3 (P2SH, version 0x1CBD) with a valid Base58Check checksum. */
export function isValidTransparent(a: string): boolean {
  if (!/^t[13][1-9A-HJ-NP-Za-km-z]{33}$/.test(a)) return false;
  const raw = base58Decode(a);
  if (!raw || raw.length !== 26) return false;
  const ver = raw.readUInt16BE(0);
  if (ver !== 0x1cb8 && ver !== 0x1cbd) return false;
  const body = raw.subarray(0, 22);
  const ck = sha256(sha256(body)).subarray(0, 4);
  return ck.equals(raw.subarray(22));
}

function polymod(values: number[]): number {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= G[i]!;
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5);
  out.push(0);
  for (const c of hrp) out.push(c.charCodeAt(0) & 31);
  return out;
}

/** Bech32 (const 1) / Bech32m (const 0x2bc830a3) checksum check without the 90-char limit (ZIP-316). */
export function bech32Valid(a: string, hrp: string, variant: "bech32" | "bech32m"): boolean {
  if (a !== a.toLowerCase()) return false;
  const pos = a.lastIndexOf("1");
  if (pos < 1 || a.slice(0, pos) !== hrp) return false;
  const data: number[] = [];
  for (const ch of a.slice(pos + 1)) {
    const v = BECH32_CHARSET.indexOf(ch);
    if (v < 0) return false;
    data.push(v);
  }
  if (data.length < 6) return false;
  const c = polymod([...hrpExpand(hrp), ...data]);
  return c === (variant === "bech32" ? 1 : 0x2bc830a3);
}

export function classifyZcash(addr: string | undefined | null): ZcashKind {
  if (!addr) return "invalid";
  const a = addr.trim();
  if (a.startsWith("t1") || a.startsWith("t3")) return isValidTransparent(a) ? "transparent" : "invalid";
  if (a.startsWith("zs1")) return a.length === 78 && bech32Valid(a, "zs", "bech32") ? "shielded" : "invalid";
  if (a.startsWith("u1")) return a.length >= 80 && a.length <= 1000 && bech32Valid(a, "u", "bech32m") ? "shielded" : "invalid";
  return "invalid";
}

/** Short, non-identifying form for logs. */
export function shortZ(addr: string): string {
  if (!addr) return "";
  return addr.length > 16 ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : addr;
}

/** ZEC on Zcash has 8 decimals (zatoshi); Binance-Peg ZEC on BSC has 18. */
export const ZAT_PER_ZEC = 100_000_000n;
export function zatToBep20(zat: bigint): bigint {
  return zat * 10_000_000_000n;
}
export function formatZat(zat: bigint): string {
  const neg = zat < 0n;
  const v = neg ? -zat : zat;
  const whole = v / ZAT_PER_ZEC;
  const frac = (v % ZAT_PER_ZEC).toString().padStart(8, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}
