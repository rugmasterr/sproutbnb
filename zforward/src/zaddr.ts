/**
 * Zcash address validation (pure, no network). Same rules as relayer/src/zcash.ts (kept as an own copy so the
 * forwarder has no cross-package imports):
 *  - transparent t1 (P2PKH 0x1CB8) / t3 (P2SH 0x1CBD) — Base58Check (testnet tm 0x1D25 / t2 0x1CBA)
 *  - Sapling zs1… — Bech32, HRP "zs" (testnet "ztestsapling"), 43-byte payload
 *  - Unified u1… — Bech32m, HRP "u" (testnet "utest"), F4Jumble'd payload (ZIP 316): we invert F4Jumble, check the
 *    16-byte HRP padding and parse the receiver TLVs.
 *  - TEX tex1… — recognised so it can be rejected.
 * After NU6.3 (Ironwood, block 3,428,143) unified addresses are unchanged: an Orchard-protocol receiver (typecode 3)
 * is the route into the Ironwood pool; an NU6.3-aware wallet creates an Ironwood output for it.
 * Curve-point validity of receivers is NOT checked here — the wallet rejects an invalid receiver before spending.
 */
import { bech32, bech32m, createBase58check } from '@scure/base'
import { blake2b } from '@noble/hashes/blake2.js'
import { sha256 } from '@noble/hashes/sha2.js'

const base58check = createBase58check(sha256)
const enc = new TextEncoder()

export type AddrKind = 'transparent' | 'sapling' | 'unified' | 'tex'
export type ZcashAddressInfo =
  | { valid: false; reason: string }
  | { valid: true; kind: AddrKind; network: 'mainnet' | 'testnet'; receivers?: string[]; hasShieldedReceiver?: boolean }

const T_PREFIX: Record<number, 'mainnet' | 'testnet'> = { 0x1cb8: 'mainnet', 0x1cbd: 'mainnet', 0x1d25: 'testnet', 0x1cba: 'testnet' }

const H_PERS = (i: number) => {
  const p = new Uint8Array(16)
  p.set(enc.encode('UA_F4Jumble_H'))
  p[13] = i
  return p
}
const G_PERS = (i: number, j: number) => {
  const p = new Uint8Array(16)
  p.set(enc.encode('UA_F4Jumble_G'))
  p[13] = i
  p[14] = j & 0xff
  p[15] = (j >> 8) & 0xff
  return p
}
const hRound = (i: number, u: Uint8Array, n: number) => blake2b(u, { dkLen: n, personalization: H_PERS(i) })
function gRound(i: number, u: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen)
  for (let j = 0; j < Math.ceil(outLen / 64); j++) {
    const block = blake2b(u, { dkLen: 64, personalization: G_PERS(i, j) })
    out.set(block.subarray(0, Math.min(64, outLen - j * 64)), j * 64)
  }
  return out
}
const xor = (a: Uint8Array, b: Uint8Array) => a.map((v, k) => v ^ b[k])
const split = (len: number) => {
  const lL = Math.min(64, Math.floor(len / 2))
  return { lL, lR: len - lL }
}

export function f4jumble(m: Uint8Array): Uint8Array {
  if (m.length < 48 || m.length > 4194368) throw new Error('f4jumble: bad length')
  const { lL, lR } = split(m.length)
  const a = m.subarray(0, lL)
  const b = m.subarray(lL)
  const x = xor(b, gRound(0, a, lR))
  const y = xor(a, hRound(0, x, lL))
  const d = xor(x, gRound(1, y, lR))
  const c = xor(y, hRound(1, d, lL))
  const out = new Uint8Array(m.length)
  out.set(c, 0)
  out.set(d, lL)
  return out
}

export function f4jumbleInv(m: Uint8Array): Uint8Array {
  if (m.length < 48 || m.length > 4194368) throw new Error('f4jumble: bad length')
  const { lL, lR } = split(m.length)
  const c = m.subarray(0, lL)
  const d = m.subarray(lL)
  const y = xor(c, hRound(1, d, lL))
  const x = xor(d, gRound(1, y, lR))
  const a = xor(y, hRound(0, x, lL))
  const b = xor(x, gRound(0, a, lR))
  const out = new Uint8Array(m.length)
  out.set(a, 0)
  out.set(b, lL)
  return out
}

function readCompactSize(b: Uint8Array, p: number): [number, number] {
  const f = b[p]
  if (f === undefined) throw new Error('truncated')
  if (f < 0xfd) return [f, p + 1]
  if (f === 0xfd) {
    if (p + 3 > b.length) throw new Error('truncated')
    const v = b[p + 1] | (b[p + 2] << 8)
    if (v < 0xfd) throw new Error('non-canonical compactSize')
    return [v, p + 3]
  }
  throw new Error('compactSize too large')
}

const RECEIVER: Record<number, { name: string; len: number; shielded: boolean }> = {
  0x00: { name: 'p2pkh', len: 20, shielded: false },
  0x01: { name: 'p2sh', len: 20, shielded: false },
  0x02: { name: 'sapling', len: 43, shielded: true },
  0x03: { name: 'orchard', len: 43, shielded: true },
}

function parseUnified(jumbled: Uint8Array, hrp: string) {
  const raw = f4jumbleInv(jumbled)
  const pad = new Uint8Array(16)
  pad.set(enc.encode(hrp))
  const tail = raw.subarray(raw.length - 16)
  for (let k = 0; k < 16; k++) if (tail[k] !== pad[k]) throw new Error('padding mismatch (corrupted or wrong network)')
  const body = raw.subarray(0, raw.length - 16)
  const items: { typecode: number; len: number }[] = []
  let p = 0
  let prev = -1
  while (p < body.length) {
    const [tc, p1] = readCompactSize(body, p)
    const [len, p2] = readCompactSize(body, p1)
    if (p2 + len > body.length) throw new Error('item overruns payload')
    if (tc <= prev) throw new Error('typecodes not strictly ascending')
    const known = RECEIVER[tc]
    if (known && known.len !== len) throw new Error(`${known.name} receiver must be ${known.len} bytes`)
    items.push({ typecode: tc, len })
    prev = tc
    p = p2 + len
  }
  if (!items.length) throw new Error('no receivers')
  if (!items.some((i) => i.typecode > 0x01)) throw new Error('transparent-only unified address')
  return items
}

/** Test helper: build a unified address from raw receivers (small items only). */
export function encodeUnified(receivers: { typecode: number; data: Uint8Array }[], hrp = 'u'): string {
  const parts: number[] = []
  for (const r of [...receivers].sort((a, b) => a.typecode - b.typecode)) parts.push(r.typecode, r.data.length, ...r.data)
  const pad = new Uint8Array(16)
  pad.set(enc.encode(hrp))
  return bech32m.encode(hrp, bech32m.toWords(f4jumble(new Uint8Array([...parts, ...pad]))), false)
}

export function zcashAddressInfo(input: string): ZcashAddressInfo {
  const a = (input ?? '').trim()
  if (!a) return { valid: false, reason: 'empty' }
  if (a.length > 2048) return { valid: false, reason: 'too long' }
  if (/^t[0-9A-Za-z]+$/.test(a) && a.length >= 30 && a.length <= 40) {
    try {
      const b = base58check.decode(a)
      if (b.length !== 22) return { valid: false, reason: 'transparent payload must be 22 bytes' }
      const net = T_PREFIX[(b[0] << 8) | b[1]]
      if (!net) return { valid: false, reason: 'unknown transparent prefix' }
      return { valid: true, kind: 'transparent', network: net }
    } catch {
      return { valid: false, reason: 'bad Base58Check checksum' }
    }
  }
  if (a !== a.toLowerCase() && a !== a.toUpperCase()) return { valid: false, reason: 'mixed case' }
  const lower = a.toLowerCase()
  const sep = lower.lastIndexOf('1')
  const hrp = sep > 0 ? lower.slice(0, sep) : ''
  if (hrp === 'zs' || hrp === 'ztestsapling') {
    try {
      const bytes = bech32.fromWords(bech32.decode(lower as `${string}1${string}`, 120).words)
      if (bytes.length !== 43) return { valid: false, reason: 'Sapling payload must be 43 bytes' }
      return { valid: true, kind: 'sapling', network: hrp === 'zs' ? 'mainnet' : 'testnet', hasShieldedReceiver: true }
    } catch {
      return { valid: false, reason: 'bad Bech32 checksum / encoding' }
    }
  }
  if (hrp === 'u' || hrp === 'utest') {
    let jumbled: Uint8Array
    try {
      jumbled = bech32m.fromWords(bech32m.decode(lower as `${string}1${string}`, false).words)
    } catch {
      return { valid: false, reason: 'bad Bech32m checksum / encoding' }
    }
    try {
      const items = parseUnified(jumbled, hrp)
      return {
        valid: true,
        kind: 'unified',
        network: hrp === 'u' ? 'mainnet' : 'testnet',
        receivers: items.map((i) => RECEIVER[i.typecode]?.name ?? `unknown:${i.typecode}`),
        hasShieldedReceiver: items.some((i) => RECEIVER[i.typecode]?.shielded),
      }
    } catch (e) {
      return { valid: false, reason: `unified address: ${(e as Error).message}` }
    }
  }
  if (hrp === 'tex' || hrp === 'textest') return { valid: true, kind: 'tex', network: hrp === 'tex' ? 'mainnet' : 'testnet' }
  return { valid: false, reason: 'not a Zcash address (expected zs1… or u1…)' }
}

/** A payout destination the forwarder accepts: mainnet Sapling, or mainnet Unified with a Sapling/Orchard receiver. */
export function checkShieldedDestination(addr: string, network: 'mainnet' | 'testnet' = 'mainnet'): { ok: true; kind: 'sapling' | 'unified'; receivers?: string[] } | { ok: false; reason: string } {
  const info = zcashAddressInfo(addr)
  if (!info.valid) return { ok: false, reason: info.reason }
  if (info.network !== network) return { ok: false, reason: `address is for ${info.network}, forwarder runs on ${network}` }
  if (info.kind === 'transparent' || info.kind === 'tex') return { ok: false, reason: 'transparent address: cash out to it directly, the forwarder only sends to shielded/unified addresses' }
  if (!info.hasShieldedReceiver) return { ok: false, reason: 'unified address has no Sapling or Orchard receiver' }
  return { ok: true, kind: info.kind as 'sapling' | 'unified', receivers: info.receivers }
}

export function isTransparent(addr: string, network: 'mainnet' | 'testnet' = 'mainnet'): boolean {
  const i = zcashAddressInfo(addr)
  return i.valid && i.kind === 'transparent' && i.network === network
}
