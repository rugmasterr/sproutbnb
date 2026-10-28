/**
 * Generates test/fixtures/js-assertion.json: a WebAuthn assertion produced the way a browser/authenticator does it
 * (Node's WebCrypto-compatible ECDSA P-256 with a DER signature + SPKI public key), turned into the on-chain struct
 * by challenge.ts. test/JsFixture.t.sol then verifies it end-to-end against the real contracts, which proves that
 * challenge.ts (challenge formula, DER parsing, low-s, index discovery, CREATE2 address) matches Solidity.
 *
 * Usage (from accounts/js):  node gen-fixture.ts <factoryAddress>
 * The factory address is the one JsFixture.t.sol deploys with CREATE2 (salt 0) from the forge test contract.
 */
import { createECDH, createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAddress, getContractAddress, type Address, type Hex } from 'viem'
import {
  P256_N_DIV_2,
  base64url,
  buildWebAuthnSig,
  challengeBytes,
  computeAccountAddress,
  computeChallenge,
  encodeWebAuthnSig,
  erc1271Challenge,
  parseDerSignature,
  publicKeyFromSpki,
  type Call,
} from './challenge.ts'

const factory = getAddress(process.argv[2] ?? '')
const implementation = getContractAddress({ from: factory, nonce: 1n }) // `new SproutAccount()` in the constructor

// Fixed test key (NOT a real user key).
const d = Buffer.from('7370726f75742d6a732d666978747572652d6b65792d30303030303030303031', 'hex')
const ecdh = createECDH('prime256v1')
ecdh.setPrivateKey(d)
const pub = ecdh.getPublicKey() // 04 | x | y
const b64 = (b: Uint8Array) => Buffer.from(b).toString('base64url')
const privateKey = createPrivateKey({
  key: { kty: 'EC', crv: 'P-256', d: b64(d), x: b64(pub.subarray(1, 33)), y: b64(pub.subarray(33, 65)) },
  format: 'jwk',
})
const spki = createPublicKey(privateKey).export({ type: 'spki', format: 'der' })
const { qx, qy } = publicKeyFromSpki(spki)

const account = computeAccountAddress({ factory, implementation, qx, qy })
const chainId = 31337n
const calls: Call[] = [
  { to: '0x000000000000000000000000000000000000bEEF', value: 100000000000000000n, data: '0x' },
  { to: '0x000000000000000000000000000000000000CAFE', value: 0n, data: '0x12345678deadbeef' },
]
const deadline = 4102444800n // 2100-01-01
const gasFee = 123456789n
const feeRecipient: Address = '0x00000000000000000000000000000000000fee01'
const nonce = 0n

const challenge = computeChallenge({ chainId, account, nonce, deadline, gasFee, feeRecipient, calls })

/** Simulate an authenticator + browser. Re-sign until we get a HIGH-s DER signature, to exercise normalisation. */
function assertFor(ch: Hex, wantHighS: boolean) {
  const rpIdHash = createHash('sha256').update('sproutbnb.cash').digest()
  const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([0x05]), Buffer.from([0, 0, 0, 0])]) // UP|UV, signCount 0
  // Chrome-style clientDataJSON, including the extra key Chrome sometimes injects
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: base64url(challengeBytes(ch)),
      origin: 'https://sproutbnb.cash',
      crossOrigin: false,
      other_keys_can_be_added_here: 'do not compare clientDataJSON against a template. See https://goo.gl/yabPex',
    }),
  )
  const cdjHash = createHash('sha256').update(clientDataJSON).digest()
  for (let i = 0; i < 64; i++) {
    const signature = sign('sha256', Buffer.concat([authenticatorData, cdjHash]), { key: privateKey, dsaEncoding: 'der' })
    const { s } = parseDerSignature(signature)
    if ((s > P256_N_DIV_2) === wantHighS) return { authenticatorData, clientDataJSON, signature, rawS: s }
  }
  throw new Error('could not get desired s parity')
}

const a = assertFor(challenge, true)
const sig = buildWebAuthnSig(a, challenge)
if (sig.s === a.rawS) throw new Error('expected normalisation')

const hash1271 = '0x' + createHash('sha256').update('sprout 1271 fixture').digest('hex')
const a1271 = assertFor(erc1271Challenge({ chainId, account, hash: hash1271 as Hex }), false)
const sig1271 = buildWebAuthnSig(a1271)

const out = {
  factory,
  implementation,
  account,
  qx,
  qy,
  chainId: chainId.toString(),
  nonce: nonce.toString(),
  deadline: deadline.toString(),
  gasFee: gasFee.toString(),
  feeRecipient,
  call0To: calls[0].to,
  call0Value: calls[0].value.toString(),
  call0Data: calls[0].data,
  call1To: calls[1].to,
  call1Value: calls[1].value.toString(),
  call1Data: calls[1].data,
  challenge,
  authenticatorData: sig.authenticatorData,
  clientDataJSON: sig.clientDataJSON,
  challengeIndex: sig.challengeIndex.toString(),
  typeIndex: sig.typeIndex.toString(),
  r: sig.r.toString(),
  s: sig.s.toString(),
  derSignature: '0x' + Buffer.from(a.signature).toString('hex'),
  hash1271,
  sig1271Encoded: encodeWebAuthnSig(sig1271),
}

const here = dirname(fileURLToPath(import.meta.url))
const target = resolve(here, '../test/fixtures/js-assertion.json')
mkdirSync(dirname(target), { recursive: true })
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`wrote ${target}\naccount ${account}\nchallenge ${challenge}`)
