/**
 * Off-chain re-implementation of accounts/src/lib/WebAuthn.sol `verify` — the relayer runs it before spending any gas
 * so malformed / stale / forged requests are rejected cheaply. Same checks, same order:
 *   1. 0 < r < n, 0 < s <= n/2 (low-s)
 *   2. clientDataJSON bytes at typeIndex == `"type":"webauthn.get"`
 *   3. clientDataJSON bytes at challengeIndex == `"challenge":"<base64url(challenge)>"` (with closing quote)
 *   4. authenticatorData.length >= 37, flags UP and UV set
 *   5. P-256 ECDSA over sha256(authenticatorData || sha256(clientDataJSON)) with key (qx, qy)
 * The on-chain check is authoritative; this is only an early filter (and is followed by an eth_estimateGas simulation).
 */
import { p256 } from '@noble/curves/nist.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { type Hex, hexToBytes } from 'viem'
import { P256_N, P256_N_DIV_2, FLAG_UP, FLAG_UV, base64url, challengeBytes, type WebAuthnSig } from './challenge.js'

const enc = new TextEncoder()
const TYPE_GET = enc.encode('"type":"webauthn.get"')

function sliceEquals(data: Uint8Array, start: bigint, expected: Uint8Array): boolean {
  if (start > BigInt(data.length)) return false
  const s = Number(start)
  if (expected.length > data.length - s) return false
  for (let i = 0; i < expected.length; i++) if (data[s + i] !== expected[i]) return false
  return true
}

const to32 = (v: bigint) => hexToBytes(`0x${v.toString(16).padStart(64, '0')}`)

export type VerifyResult = { ok: true } | { ok: false; reason: string }

export function verifyWebAuthn(challenge: Hex, sig: WebAuthnSig, qx: Hex, qy: Hex): VerifyResult {
  if (sig.r <= 0n || sig.r >= P256_N) return { ok: false, reason: 'r out of range' }
  if (sig.s <= 0n || sig.s > P256_N_DIV_2) return { ok: false, reason: 's must be low-s (s <= n/2)' }

  const json = enc.encode(sig.clientDataJSON)
  if (!sliceEquals(json, sig.typeIndex, TYPE_GET)) return { ok: false, reason: 'clientDataJSON type is not webauthn.get at typeIndex' }

  const expected = enc.encode(`"challenge":"${base64url(challengeBytes(challenge))}"`)
  if (!sliceEquals(json, sig.challengeIndex, expected)) {
    return { ok: false, reason: 'clientDataJSON challenge does not match (wrong nonce, deadline, fee, recipient or calls?)' }
  }

  const ad = hexToBytes(sig.authenticatorData)
  if (ad.length < 37) return { ok: false, reason: 'authenticatorData too short' }
  if (!(ad[32] & FLAG_UP)) return { ok: false, reason: 'user presence (UP) flag not set' }
  if (!(ad[32] & FLAG_UV)) return { ok: false, reason: 'user verification (UV) flag not set' }

  const msg = new Uint8Array(ad.length + 32)
  msg.set(ad, 0)
  msg.set(sha256(json), ad.length)

  const pub = new Uint8Array(65)
  pub[0] = 0x04
  pub.set(hexToBytes(qx), 1)
  pub.set(hexToBytes(qy), 33)

  const compact = new Uint8Array(64)
  compact.set(to32(sig.r), 0)
  compact.set(to32(sig.s), 32)

  let good = false
  try {
    good = p256.verify(compact, msg, pub, { prehash: true, lowS: true })
  } catch {
    return { ok: false, reason: 'invalid public key' }
  }
  return good ? { ok: true } : { ok: false, reason: 'P-256 signature does not verify for this passkey' }
}

/** Is (qx, qy) a valid point on P-256? (SproutAccount.initialize reverts InvalidPublicKey otherwise.) */
export function isOnCurve(qx: Hex, qy: Hex): boolean {
  try {
    const pub = new Uint8Array(65)
    pub[0] = 0x04
    pub.set(hexToBytes(qx), 1)
    pub.set(hexToBytes(qy), 33)
    p256.Point.fromBytes(pub).assertValidity()
    return true
  } catch {
    return false
  }
}
