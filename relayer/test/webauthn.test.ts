import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeFunctionData, encodeFunctionData, type Hex, type Address } from 'viem'
import {
  P256_N,
  buildWebAuthnSig,
  computeChallenge,
  parseWebAuthnSigJson,
  webAuthnSigToJson,
  type Call,
} from '../src/challenge.js'
import { ACCOUNT_ABI, FACTORY_ABI } from '../src/abi.js'
import { verifyWebAuthn, isOnCurve } from '../src/webauthn.js'
import { parseRelay } from '../src/validate.js'
import { softPasskey } from './helpers.js'

const LIMITS = { maxCalls: 16, maxCalldataBytes: 48_000 }
const fx = JSON.parse(readFileSync(new URL('./fixtures-js-assertion.json', import.meta.url), 'utf8'))

test('accounts fixture (verified on-chain by accounts/test/JsFixture.t.sol) verifies off-chain', () => {
  const calls: Call[] = [
    { to: fx.call0To, value: BigInt(fx.call0Value), data: fx.call0Data },
    { to: fx.call1To, value: BigInt(fx.call1Value), data: fx.call1Data },
  ]
  const challenge = computeChallenge({
    chainId: BigInt(fx.chainId),
    account: fx.account,
    nonce: BigInt(fx.nonce),
    deadline: BigInt(fx.deadline),
    gasFee: BigInt(fx.gasFee),
    feeRecipient: fx.feeRecipient,
    calls,
  })
  assert.equal(challenge, fx.challenge)
  const sig = parseWebAuthnSigJson(fx)
  assert.deepEqual(verifyWebAuthn(challenge, sig, fx.qx, fx.qy), { ok: true })
  // any change to the signed fields must break it
  const other = computeChallenge({ chainId: 56n, account: fx.account, nonce: 0n, deadline: BigInt(fx.deadline), gasFee: BigInt(fx.gasFee), feeRecipient: fx.feeRecipient, calls })
  assert.equal(verifyWebAuthn(other, sig, fx.qx, fx.qy).ok, false)
})

const account = '0x1111111111111111111111111111111111111111' as Address
const relayer = '0x2222222222222222222222222222222222222222' as Address
const calls: Call[] = [
  { to: '0x90497450f2a706f1951b5bdda52B4E5d16f34C06', value: 10n ** 16n, data: '0xdeadbeef' },
  { to: '0x000000000000000000000000000000000000dEaD', value: 0n, data: '0x' },
]

async function signedRequest(overrides: { flags?: number; type?: string } = {}) {
  const pk = await softPasskey()
  const base = { chainId: 56, account, nonce: 7n, deadline: 2_000_000_000n, gasFee: 123_456_789_000n, feeRecipient: relayer, calls }
  const challenge = computeChallenge(base)
  const assertion = await pk.sign(challenge, overrides)
  const sig = buildWebAuthnSig(assertion, overrides.flags === undefined ? challenge : undefined)
  return { pk, base, challenge, sig, assertion }
}

test('WebCrypto P-256 passkey: sign -> buildWebAuthnSig -> JSON -> parseRelay -> verify round trip', async () => {
  for (let i = 0; i < 8; i++) {
    // several keys/signatures so both high-s (normalised) and low-s DER signatures are exercised
    const { pk, base, challenge, sig } = await signedRequest()
    assert.ok(sig.s <= P256_N / 2n)
    assert.ok(isOnCurve(pk.qx, pk.qy))
    const wire = JSON.parse(
      JSON.stringify({
        account,
        qx: pk.qx,
        qy: pk.qy,
        calls: calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data })),
        deadline: base.deadline.toString(),
        gasFee: base.gasFee.toString(),
        feeRecipient: relayer,
        sig: webAuthnSigToJson(sig),
      }),
    )
    const req = parseRelay(wire, LIMITS)
    assert.deepEqual(req.sig, sig)
    const again = computeChallenge({ chainId: 56, account: req.account, nonce: 7n, deadline: req.deadline, gasFee: req.gasFee, feeRecipient: req.feeRecipient, calls: req.calls })
    assert.equal(again, challenge)
    assert.deepEqual(verifyWebAuthn(again, req.sig, req.qx!, req.qy!), { ok: true })

    // calldata encoding round trip (what the relayer submits)
    const data = encodeFunctionData({ abi: ACCOUNT_ABI, functionName: 'executeBatch', args: [req.calls, req.deadline, req.gasFee, req.feeRecipient, req.sig] })
    const dec = decodeFunctionData({ abi: ACCOUNT_ABI, data })
    assert.equal(dec.functionName, 'executeBatch')
    assert.deepEqual(dec.args?.[4], req.sig)
    const fdata = encodeFunctionData({ abi: FACTORY_ABI, functionName: 'createAccountAndExecute', args: [pk.qx, pk.qy, req.calls, req.deadline, req.gasFee, req.feeRecipient, req.sig] })
    assert.equal(decodeFunctionData({ abi: FACTORY_ABI, data: fdata }).functionName, 'createAccountAndExecute')
  }
})

test('verify rejects tampering: fee, nonce, calls, key, high-s, flags, type', async () => {
  const { pk, base, challenge, sig } = await signedRequest()
  const ch = (o: Partial<typeof base>) => computeChallenge({ ...base, ...o })
  assert.match((verifyWebAuthn(ch({ gasFee: base.gasFee + 1n }), sig, pk.qx, pk.qy) as any).reason, /challenge/)
  assert.equal(verifyWebAuthn(ch({ nonce: 8n }), sig, pk.qx, pk.qy).ok, false)
  assert.equal(verifyWebAuthn(ch({ calls: calls.slice(0, 1) }), sig, pk.qx, pk.qy).ok, false)
  assert.equal(verifyWebAuthn(ch({ feeRecipient: account }), sig, pk.qx, pk.qy).ok, false)

  const other = await softPasskey()
  assert.match((verifyWebAuthn(challenge, sig, other.qx, other.qy) as any).reason, /does not verify/)

  assert.match((verifyWebAuthn(challenge, { ...sig, s: P256_N - sig.s }, pk.qx, pk.qy) as any).reason, /low-s/)
  assert.match((verifyWebAuthn(challenge, { ...sig, typeIndex: sig.typeIndex + 1n }, pk.qx, pk.qy) as any).reason, /type/)
  assert.match((verifyWebAuthn(challenge, { ...sig, challengeIndex: 9999n }, pk.qx, pk.qy) as any).reason, /challenge/)
  assert.equal(verifyWebAuthn(challenge, { ...sig, r: sig.r ^ 1n }, pk.qx, pk.qy).ok, false)

  // UV missing: build without the helper's flag check by patching authenticatorData
  const noUv = { ...sig, authenticatorData: (sig.authenticatorData.slice(0, 2 + 64) + '01' + sig.authenticatorData.slice(2 + 66)) as Hex }
  assert.match((verifyWebAuthn(challenge, noUv, pk.qx, pk.qy) as any).reason, /UV|verification/)

  // webauthn.create assertions must not be accepted
  const created = await pk.sign(challenge, { type: 'webauthn.create' })
  assert.throws(() => buildWebAuthnSig(created), /webauthn.get/)
})

test('isOnCurve rejects junk keys', () => {
  assert.equal(isOnCurve(`0x${'11'.repeat(32)}`, `0x${'22'.repeat(32)}`), false)
  assert.equal(isOnCurve(`0x${'00'.repeat(32)}`, `0x${'00'.repeat(32)}`), false)
})
