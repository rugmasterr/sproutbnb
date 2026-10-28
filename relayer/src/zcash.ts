/**
 * Zcash address validation (pure, no network):
 *  - transparent t1 (P2PKH 0x1CB8) / t3 (P2SH 0x1CBD) — Base58Check, 26 bytes (testnet tm 0x1D25 / t2 0x1CBA)
 *  - Sapling zs1… — Bech32 (BIP-173), HRP "zs" (testnet "ztestsapling"), 43-byte payload
 *  - Unified u1… — Bech32m, HRP "u" (testnet "utest"), no 90-char limit; payload is F4Jumble'd (ZIP 316). We invert
 *    F4Jumble, check the 16-byte HRP padding (which authenticates the whole jumble) and parse the receiver list
 *    (typecode/length TLVs, ascending typecodes, Sapling/Orchard receivers 43 bytes, transparent 20 bytes).
 *  - TEX tex1… — Bech32m, HRP "tex", 20 bytes (ZIP 320). Recognised so it can be rejected where it does not fit.
 * Curve-point validity of the receivers is NOT checked (that needs Jubjub / Pallas arithmetic; the wallet that sends
 * the ZEC — the shield forwarder — rejects an invalid receiver before anything is spent).
 */
import { bech32, bech32m, createBase58check } from '@scure/base'
import { blake2b } from '@noble/hashes/blake2.js'
import { sha256 } from '@noble/hashes/sha2.js'

const base58check = createBase58check(sha256)

export type ZcashAddressInfo =
  | { valid: false; reason: string }
  | {
      valid: true
      kind: 'transparent' | 'sapling' | 'unified' | 'tex'
      network: 'mainnet' | 'testnet'
      /** unified only: receiver kinds found, e.g. ['orchard','sapling','p2pkh'] */
      receivers?: string[]
      hasShieldedReceiver?: boolean
    }

const T_PREFIX: Record<number, { network: 'mainnet' | 'testnet' }> = {
  0x1cb8: { network: 'mainnet' },
  0x1cbd: { network: 'mainnet' },
  0x1d25: { network: 'testnet' },
  0x1cba: { network: 'testnet' },
}

const enc = new TextEncoder()

// ------------------------------------------------------------------------------------------------ F4Jumble (ZIP 316)

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

function hRound(i: number, u: Uint8Array, outLen: number): Uint8Array {
  return blake2b(u, { dkLen: outLen, personalization: H_PERS(i) })
}

function gRound(i: number, u: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen)
  const n = Math.ceil(outLen / 64)
  for (let j = 0; j < n; j++) {
    const block = blake2b(u, { dkLen: 64, personalization: G_PERS(i, j) })
    out.set(block.subarray(0, Math.min(64, outLen - j * 64)), j * 64)
  }
  return out
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  const o = new Uint8Array(a.length)
  for (let k = 0; k < a.length; k++) o[k] = a[k] ^ b[k]
  return o
}

const MIN_JUMBLE = 48
const MAX_JUMBLE = 4194368

function splitLens(len: number) {
  const lL = Math.min(64, Math.floor(len / 2))
  return { lL, lR: len - lL }
}

export function f4jumble(m: Uint8Array): Uint8Array {
  if (m.length < MIN_JUMBLE || m.length > MAX_JUMBLE) throw new Error('f4jumble: bad length')
  const { lL, lR } = splitLens(m.length)
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
  if (m.length < MIN_JUMBLE || m.length > MAX_JUMBLE) throw new Error('f4jumble: bad length')
  const { lL, lR } = splitLens(m.length)
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
  if (f === 0xfe) {
    if (p + 5 > b.length) throw new Error('truncated')
    const v = (b[p + 1] | (b[p + 2] << 8) | (b[p + 3] << 16)) + b[p + 4] * 0x1000000
    if (v <= 0xffff) throw new Error('non-canonical compactSize')
    return [v, p + 5]
  }
  throw new Error('compactSize too large')
}

const RECEIVER: Record<number, { name: string; len: number; shielded: boolean }> = {
  0x00: { name: 'p2pkh', len: 20, shielded: false },
  0x01: { name: 'p2sh', len: 20, shielded: false },
  0x02: { name: 'sapling', len: 43, shielded: true },
  0x03: { name: 'orchard', len: 43, shielded: true },
}

/** Decode the F4Jumble'd UA payload into receivers. Throws on malformed input. */
export function parseUnifiedPayload(jumbled: Uint8Array, hrp: string): { typecode: number; data: Uint8Array }[] {
  const raw = f4jumbleInv(jumbled)
  const pad = new Uint8Array(16)
  pad.set(enc.encode(hrp))
  const tail = raw.subarray(raw.length - 16)
  for (let k = 0; k < 16; k++) if (tail[k] !== pad[k]) throw new Error('padding mismatch (corrupted or wrong network)')
  const body = raw.subarray(0, raw.length - 16)
  const items: { typecode: number; data: Uint8Array }[] = []
  let p = 0
  let prev = -1
  while (p < body.length) {
    const [tc, p1] = readCompactSize(body, p)
    const [len, p2] = readCompactSize(body, p1)
    if (p2 + len > body.length) throw new Error('item overruns payload')
    if (tc <= prev) throw new Error('typecodes not strictly ascending')
    const known = RECEIVER[tc]
    if (known && known.len !== len) throw new Error(`${known.name} receiver must be ${known.len} bytes`)
    items.push({ typecode: tc, data: body.subarray(p2, p2 + len) })
    prev = tc
    p = p2 + len
  }
  if (!items.length) throw new Error('no receivers')
  const has = (t: number) => items.some((i) => i.typecode === t)
  if (has(0x00) && has(0x01)) throw new Error('both P2PKH and P2SH receivers')
  // Must have at least one receiver that is not transparent (ZIP 316: a UA cannot be transparent-only).
  if (!items.some((i) => i.typecode !== 0x00 && i.typecode !== 0x01)) throw new Error('transparent-only unified address')
  return items
}

/** Build a unified address from raw receivers (used by tests; mirrors the decoder). */
export function encodeUnified(receivers: { typecode: number; data: Uint8Array }[], hrp = 'u'): string {
  const sorted = [...receivers].sort((a, b) => a.typecode - b.typecode)
  const parts: number[] = []
  for (const r of sorted) {
    if (r.typecode >= 0xfd || r.data.length >= 0xfd) throw new Error('test encoder supports small items only')
    parts.push(r.typecode, r.data.length, ...r.data)
  }
  const pad = new Uint8Array(16)
  pad.set(enc.encode(hrp))
  const raw = new Uint8Array([...parts, ...pad])
  return bech32m.encode(hrp, bech32m.toWords(f4jumble(raw)), false)
}

// ------------------------------------------------------------------------------------------------ public API

export function zcashAddressInfo(input: string): ZcashAddressInfo {
  const a = (input ?? '').trim()
  if (!a) return { valid: false, reason: 'empty' }
  if (a.length > 2048) return { valid: false, reason: 'too long' }

  // transparent
  if (/^t[0-9A-Za-z]+$/.test(a) && a.length >= 30 && a.length <= 40) {
    try {
      const b = base58check.decode(a)
      if (b.length !== 22) return { valid: false, reason: 'transparent address payload must be 22 bytes' }
      const pre = T_PREFIX[(b[0] << 8) | b[1]]
      if (!pre) return { valid: false, reason: 'unknown transparent address prefix' }
      return { valid: true, kind: 'transparent', network: pre.network }
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
      const d = bech32.decode(lower as `${string}1${string}`, 120)
      const bytes = bech32.fromWords(d.words)
      if (bytes.length !== 43) return { valid: false, reason: 'Sapling address payload must be 43 bytes' }
      return { valid: true, kind: 'sapling', network: hrp === 'zs' ? 'mainnet' : 'testnet' }
    } catch {
      return { valid: false, reason: 'bad Bech32 checksum / encoding' }
    }
  }

  if (hrp === 'u' || hrp === 'utest') {
    let jumbled: Uint8Array
    try {
      const d = bech32m.decode(lower as `${string}1${string}`, false)
      jumbled = bech32m.fromWords(d.words)
    } catch {
      return { valid: false, reason: 'bad Bech32m checksum / encoding' }
    }
    try {
      const items = parseUnifiedPayload(jumbled, hrp)
      const receivers = items.map((i) => RECEIVER[i.typecode]?.name ?? `unknown:${i.typecode}`)
      return {
        valid: true,
        kind: 'unified',
        network: hrp === 'u' ? 'mainnet' : 'testnet',
        receivers,
        hasShieldedReceiver: items.some((i) => RECEIVER[i.typecode]?.shielded),
      }
    } catch (e) {
      return { valid: false, reason: `unified address: ${(e as Error).message}` }
    }
  }

  if (hrp === 'tex' || hrp === 'textest') {
    try {
      const d = bech32m.decode(lower as `${string}1${string}`, 90)
      if (bech32m.fromWords(d.words).length !== 20) return { valid: false, reason: 'TEX payload must be 20 bytes' }
      return { valid: true, kind: 'tex', network: hrp === 'tex' ? 'mainnet' : 'testnet' }
    } catch {
      return { valid: false, reason: 'bad Bech32m checksum / encoding' }
    }
  }

  return { valid: false, reason: 'not a Zcash address (expected t1/t3, zs1 or u1)' }
}
