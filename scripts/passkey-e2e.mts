/**
 * Passkey end-to-end cross-check (site -> relayer -> contract).
 *
 * Runs the SITE's real browser module (src/features/zcash/passkey/webauthn.ts + challenge.ts) against a fake
 * `navigator.credentials` backed by WebCrypto P-256 (crypto.subtle), shaped exactly like a browser authenticator:
 *   - create(): SPKI public key via getPublicKey(), alg -7
 *   - get():    Chrome-style clientDataJSON, authenticatorData = sha256(rpId) | flags UP+UV | signCount,
 *               ECDSA signature DER-encoded (WebCrypto gives raw r||s; browsers hand out DER)
 * Then it does what the site's provider.tsx does (computeChallenge -> signChallenge -> webAuthnSigToJson -> JSON body),
 * pushes that body through the RELAYER's own parsing (parseRelay), off-chain verification (verifyWebAuthn) and
 * calldata encoding (FACTORY_ABI.createAccountAndExecute for first use, ACCOUNT_ABI.executeBatch afterwards),
 * and writes the raw calldata to accounts/test/fixtures/browser-e2e.json. accounts/test/BrowserE2E.t.sol sends that
 * calldata to the real contracts — proving the contract accepts exactly what the frontend + relayer produce.
 *
 * Usage (repo root):  relayer\node_modules\.bin\tsx scripts/passkey-e2e.mts
 * The factory address is the one accounts/test/JsFixture.t.sol / BrowserE2E.t.sol deploy (CREATE2, salt 0); it is
 * read from accounts/test/fixtures/js-assertion.json.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RP_ID = 'sproutbnb.cash'
const ORIGIN = `https://${RP_ID}`
const subtle = globalThis.crypto.subtle

// ------------------------------------------------------------------ fake browser + authenticator (WebCrypto)
const creds = new Map<string, CryptoKeyPair>()
let signCount = 0
const ab = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const b64u = (u: Uint8Array) => Buffer.from(u).toString('base64url')
const sha = async (u: Uint8Array) => new Uint8Array(await subtle.digest('SHA-256', u))
const derInt = (b: Uint8Array) => {
  let i = 0
  while (i < b.length - 1 && b[i] === 0) i++
  let v = b.subarray(i)
  if (v[0] & 0x80) v = Uint8Array.from([0, ...v])
  return Uint8Array.from([0x02, v.length, ...v])
}
const toDer = (raw: Uint8Array) => {
  const r = derInt(raw.subarray(0, 32))
  const s = derInt(raw.subarray(32, 64))
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s])
}
const asBytes = (x: BufferSource) =>
  x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array((x as ArrayBufferView).buffer, (x as ArrayBufferView).byteOffset, (x as ArrayBufferView).byteLength)

const fakeCredentials = {
  async create({ publicKey }: { publicKey: PublicKeyCredentialCreationOptions }) {
    if (!publicKey.pubKeyCredParams.some((p) => p.alg === -7)) throw new Error('no ES256')
    const kp = (await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
    const id = globalThis.crypto.getRandomValues(new Uint8Array(16))
    creds.set(b64u(id), kp)
    const spki = new Uint8Array(await subtle.exportKey('spki', kp.publicKey))
    return {
      rawId: ab(id),
      response: { getPublicKey: () => ab(spki), getPublicKeyAlgorithm: () => -7, attestationObject: new ArrayBuffer(0) },
    }
  },
  async get({ publicKey }: { publicKey: PublicKeyCredentialRequestOptions }) {
    if (publicKey.rpId !== RP_ID) throw new Error(`unexpected rpId ${publicKey.rpId}`)
    if (publicKey.userVerification !== 'required') throw new Error('site must require UV')
    const allowed = publicKey.allowCredentials?.[0]
    const id = allowed ? b64u(asBytes(allowed.id)) : [...creds.keys()][0]
    const kp = creds.get(id)
    if (!kp) throw new Error('unknown credential')
    const clientDataJSON = new TextEncoder().encode(
      JSON.stringify({ type: 'webauthn.get', challenge: b64u(asBytes(publicKey.challenge)), origin: ORIGIN, crossOrigin: false }),
    )
    signCount++
    const authenticatorData = Uint8Array.from([
      ...(await sha(new TextEncoder().encode(RP_ID))),
      0x05, // UP | UV
      (signCount >>> 24) & 0xff, (signCount >>> 16) & 0xff, (signCount >>> 8) & 0xff, signCount & 0xff,
    ])
    const msg = Uint8Array.from([...authenticatorData, ...(await sha(clientDataJSON))])
    const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, kp.privateKey, msg))
    return {
      rawId: ab(Buffer.from(id, 'base64url')),
      response: { authenticatorData: ab(authenticatorData), clientDataJSON: ab(clientDataJSON), signature: ab(toDer(raw)), userHandle: null },
    }
  },
}
const g = globalThis as any
g.window = { location: { hostname: RP_ID }, PublicKeyCredential: function PublicKeyCredential() {} }
g.PublicKeyCredential = g.window.PublicKeyCredential
Object.defineProperty(globalThis, 'navigator', { value: { credentials: fakeCredentials }, configurable: true })

// ------------------------------------------------------------------ the real modules
const site = await import('../src/features/zcash/passkey/webauthn.ts')
const siteCh = await import('../src/features/zcash/passkey/challenge.ts')
const relCh = await import('../relayer/src/challenge.ts')
const relAbi = await import('../relayer/src/abi.ts')
const relVal = await import('../relayer/src/validate.ts')
const relWa = await import('../relayer/src/webauthn.ts')

const prior = JSON.parse(readFileSync(resolve(root, 'accounts/test/fixtures/js-assertion.json'), 'utf8'))
const factory = getAddress(prior.factory) as Address
const implementation = getAddress(prior.implementation) as Address
const chainId = 56n
const feeRecipient: Address = '0x00000000000000000000000000000000000fEe02'
const deadline = 4102444800n

const { credentialId, qx, qy, rpId } = await site.createPasskey('e2e')
if (rpId !== RP_ID) throw new Error('rpId')
const account = siteCh.computeAccountAddress({ factory, implementation, qx, qy })
if (account !== relCh.computeAccountAddress({ factory, implementation, qx, qy })) throw new Error('site/relayer address differ')

const limits = { maxCalls: 16, maxCalldataBytes: 64 * 1024 }
type Call = { to: Address; value: bigint; data: Hex }
async function step(nonce: bigint, calls: Call[], gasFee: bigint, deployed: boolean) {
  // == provider.tsx executeBatch (passkey branch)
  const challenge = siteCh.computeChallenge({ chainId, account, nonce, deadline, gasFee, feeRecipient, calls })
  if (challenge !== relCh.computeChallenge({ chainId, account, nonce, deadline, gasFee, feeRecipient, calls })) throw new Error('challenge differs')
  const sig = await site.signChallenge(challenge, credentialId)
  const body = JSON.parse(
    JSON.stringify({
      account,
      qx,
      qy,
      calls: calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data })),
      deadline: deadline.toString(),
      gasFee: gasFee.toString(),
      feeRecipient,
      sig: siteCh.webAuthnSigToJson(sig),
    }),
  )
  // == relayer /relay
  const req = relVal.parseRelay(body, limits)
  const v = relWa.verifyWebAuthn(challenge, req.sig, req.qx!, req.qy!)
  if (!v.ok) throw new Error(`relayer rejects browser signature: ${v.reason}`)
  if (req.sig.s > siteCh.P256_N_DIV_2) throw new Error('high s escaped normalisation')
  const tx = deployed
    ? { to: account, data: encodeFunctionData({ abi: relAbi.ACCOUNT_ABI, functionName: 'executeBatch', args: [req.calls, req.deadline, req.gasFee, req.feeRecipient, req.sig] }) }
    : {
        to: factory,
        data: encodeFunctionData({
          abi: relAbi.FACTORY_ABI,
          functionName: 'createAccountAndExecute',
          args: [req.qx!, req.qy!, req.calls, req.deadline, req.gasFee, req.feeRecipient, req.sig],
        }),
      }
  return { challenge, to: tx.to, data: tx.data, gasFee: gasFee.toString() }
}

const c1: Call[] = [
  { to: '0x000000000000000000000000000000000000bEEF', value: 250000000000000000n, data: '0x' },
  { to: '0x000000000000000000000000000000000000CAFE', value: 0n, data: '0xa9059cbb' },
]
const c2: Call[] = [{ to: '0x000000000000000000000000000000000000bEEF', value: 1000000000000000n, data: '0x' }]
const first = await step(0n, c1, 300000000000000n, false)
const second = await step(1n, c2, 200000000000000n, true)

const out = {
  note: 'generated by scripts/passkey-e2e.mts (site webauthn.ts + WebCrypto authenticator -> relayer parse/verify/encode)',
  factory,
  implementation,
  account,
  qx,
  qy,
  chainId: chainId.toString(),
  feeRecipient,
  firstTo: first.to,
  firstData: first.data,
  firstChallenge: first.challenge,
  firstGasFee: first.gasFee,
  firstValue0: c1[0].value.toString(),
  secondTo: second.to,
  secondData: second.data,
  secondChallenge: second.challenge,
  secondGasFee: second.gasFee,
  secondValue0: c2[0].value.toString(),
}
const target = resolve(root, 'accounts/test/fixtures/browser-e2e.json')
writeFileSync(target, JSON.stringify(out, null, 2) + '\n')
console.log(`ok: site signature accepted by relayer verifyWebAuthn (x2); wrote ${target}\naccount ${account}`)
