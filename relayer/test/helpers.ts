/**
 * Test helpers: a software "authenticator" that produces WebAuthn assertions exactly like a browser does
 * (authenticatorData, clientDataJSON with base64url challenge, DER ECDSA P-256 signature over
 * sha256(authenticatorData || sha256(clientDataJSON))), using WebCrypto.
 */
import { webcrypto, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { bech32, createBase58check } from '@scure/base'
import { sha256 } from '@noble/hashes/sha2.js'
import { type Hex, hexToBytes } from 'viem'
import { base64url, challengeBytes, publicKeyFromSpki } from '../src/challenge.js'

const subtle = webcrypto.subtle

const b58 = createBase58check(sha256)
/** A checksum-valid transparent address with the given 2-byte prefix (0x1CB8 = t1, 0x1CBD = t3). Test data only. */
export function tAddr(prefix: [number, number], seed = 7) {
  return b58.encode(Uint8Array.from([...prefix, ...Array.from({ length: 20 }, (_, i) => (i * seed + 3) & 0xff)]))
}
/** zs1 address built from the Sapling receiver bytes of the first ZIP 316 vector that has one. */
export function saplingFromVectors(): string {
  const ua = JSON.parse(readFileSync(new URL('./vectors/unified_address.json', import.meta.url), 'utf8')).slice(2) as (string | null)[][]
  const raw = ua.find((v) => v[2])![2] as string
  return bech32.encode('zs', bech32.toWords(hexToBytes(`0x${raw}`)), 90)
}

/** IEEE P1363 (r||s, 64 bytes, what WebCrypto returns) -> ASN.1 DER (what WebAuthn returns). */
export function rawToDer(raw: Uint8Array): Uint8Array {
  const int = (b: Uint8Array) => {
    let i = 0
    while (i < b.length - 1 && b[i] === 0) i++
    let v = b.subarray(i)
    if (v[0] & 0x80) v = Uint8Array.from([0, ...v])
    return Uint8Array.from([0x02, v.length, ...v])
  }
  const r = int(raw.subarray(0, 32))
  const s = int(raw.subarray(32, 64))
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s])
}

export type SoftPasskey = {
  qx: Hex
  qy: Hex
  sign(challenge: Hex, opts?: { flags?: number; type?: string; origin?: string }): Promise<{
    authenticatorData: Uint8Array
    clientDataJSON: Uint8Array
    signature: Uint8Array
  }>
}

export async function softPasskey(): Promise<SoftPasskey> {
  const kp = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as webcrypto.CryptoKeyPair
  const spki = new Uint8Array(await subtle.exportKey('spki', kp.publicKey))
  const { qx, qy } = publicKeyFromSpki(spki)
  return {
    qx,
    qy,
    async sign(challenge, opts = {}) {
      const rpIdHash = createHash('sha256').update('sproutbnb.cash').digest()
      const authenticatorData = Uint8Array.from([...rpIdHash, opts.flags ?? 0x05, 0, 0, 0, 0])
      const clientDataJSON = new TextEncoder().encode(
        JSON.stringify({
          type: opts.type ?? 'webauthn.get',
          challenge: base64url(challengeBytes(challenge)),
          origin: opts.origin ?? 'https://sproutbnb.cash',
          crossOrigin: false,
        }),
      )
      const cdjHash = createHash('sha256').update(clientDataJSON).digest()
      const raw = new Uint8Array(
        await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, Uint8Array.from([...authenticatorData, ...cdjHash])),
      )
      return { authenticatorData, clientDataJSON, signature: rawToDer(raw) }
    },
  }
}
