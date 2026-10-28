/**
 * End-to-end: anvil (Osaka EVM) + the real SproutAccountFactory bytecode from ../accounts/out + this relayer in-process.
 * A WebCrypto P-256 "passkey" signs; /quote-gas -> sign -> /relay deploys the account and executes in one tx, then a
 * second batch goes through the deployed path; replay / fee-too-low / stuck-replacement / deadline-cancel are checked.
 *
 * Requires: anvil (ANVIL env or C:\Users\Administrator\tools\foundry\anvil.exe) and `forge build` output in ../accounts/out.
 * Run: npm run test:e2e
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createApp } from '../../src/app.js'
import { loadConfig, type Config } from '../../src/config.js'
import { ShieldService } from '../../src/shield.js'
import { createRelayer, chainFor } from '../../src/wiring.js'
import { FACTORY_ABI } from '../../src/abi.js'
import { buildWebAuthnSig, computeChallenge, webAuthnSigToJson, type Call } from '../../src/challenge.js'
import { softPasskey, type SoftPasskey } from '../helpers.js'

const ANVIL = process.env.ANVIL ?? 'C:\\Users\\Administrator\\tools\\foundry\\anvil.exe'
const PORT = 8000 + Math.floor(Math.random() * 900)
const RPC = `http://127.0.0.1:${PORT}`
const DEPLOYER = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' // anvil #0 (public test key)
const RELAYER_PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' // anvil #1 (public test key)
const ACC_OUT = new URL('../../../accounts/out/', import.meta.url)
const art = (p: string) => JSON.parse(readFileSync(new URL(p, ACC_OUT), 'utf8'))

let anvil: ChildProcess
let pub: PublicClient
let factory: Address
const chain = chainFor(31337, RPC)
const rpc = (method: string, params: unknown[] = []) =>
  fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((r) => r.json() as Promise<any>)

const skip = !existsSync(ANVIL) || !existsSync(new URL('SproutAccountFactory.sol/SproutAccountFactory.json', ACC_OUT))

before(async () => {
  if (skip) return
  anvil = spawn(ANVIL, ['--hardfork', 'osaka', '--port', String(PORT), '--silent', '--chain-id', '31337'], { stdio: 'ignore' })
  for (let i = 0; i < 50; i++) {
    try {
      await rpc('eth_chainId')
      break
    } catch {
      await new Promise((r) => setTimeout(r, 200))
    }
  }
  pub = createPublicClient({ chain, transport: http(RPC) }) as PublicClient
  const wallet = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(DEPLOYER) })
  const hash = await wallet.deployContract({ abi: FACTORY_ABI, bytecode: art('SproutAccountFactory.sol/SproutAccountFactory.json').bytecode.object })
  factory = (await pub.waitForTransactionReceipt({ hash })).contractAddress!
})

after(() => anvil?.kill())

async function ensureP256(_pk: SoftPasskey) {
  // Probe 0x100 with a real signature; if the local EVM lacks P256VERIFY, etch the accounts' test-only Solidity verifier.
  const { createHash } = await import('node:crypto')
  const fx = JSON.parse(readFileSync(new URL('../fixtures-js-assertion.json', import.meta.url), 'utf8'))
  const ad = Buffer.from(fx.authenticatorData.slice(2), 'hex')
  const cdh = createHash('sha256').update(Buffer.from(fx.clientDataJSON)).digest()
  const h = createHash('sha256').update(Buffer.concat([ad, cdh])).digest('hex')
  const word = (v: string | bigint) => BigInt(v).toString(16).padStart(64, '0')
  const input = `0x${h}${word(fx.r)}${word(fx.s)}${fx.qx.slice(2)}${fx.qy.slice(2)}`
  const r = await rpc('eth_call', [{ to: '0x0000000000000000000000000000000000000100', data: input }, 'latest'])
  if (r.result && BigInt(r.result || '0x0') === 1n) return 'native'
  const code = art('P256VerifierSolidity.sol/P256VerifierSolidity.json').deployedBytecode.object
  await rpc('anvil_setCode', ['0x0000000000000000000000000000000000000100', code])
  return 'etched'
}

function makeCfg(extra: Record<string, string> = {}): Config {
  return loadConfig({
    BSC_RPC_URL: RPC,
    RELAYER_PRIVATE_KEY: RELAYER_PK,
    SPROUT_ACCOUNT_FACTORY: factory,
    CHAIN_ID: '31337',
    MAX_GAS_PRICE_GWEI: '200',
    MIN_GAS_PRICE_GWEI: '0',
    MONITOR_INTERVAL_SEC: '3600',
    ...extra,
  } as NodeJS.ProcessEnv)
}

const post = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function signFor(pk: SoftPasskey, account: Address, calls: Call[], q: { gasFee: string; feeRecipient: Address; deadline: string }, nonce: bigint) {
  const challenge = computeChallenge({ chainId: 31337, account, nonce, deadline: BigInt(q.deadline), gasFee: BigInt(q.gasFee), feeRecipient: q.feeRecipient, calls })
  return webAuthnSigToJson(buildWebAuthnSig(await pk.sign(challenge), challenge))
}

const wire = (calls: Call[]) => calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data }))

test('quote -> passkey sign -> relay (deploy+execute) -> relay (deployed) on anvil', { skip }, async () => {
  const pk = await softPasskey()
  const p256 = await ensureP256(pk)
  const cfg = makeCfg()
  const { relayer, tx } = createRelayer(cfg, pub, chain)
  const app = createApp({ cfg, relayer, shield: new ShieldService(cfg) })

  const account = (await pub.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getAddress', args: [pk.qx, pk.qy] })) as Address
  const wallet = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(DEPLOYER) })
  await pub.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: account, value: parseEther('1') }) })

  const beef = '0x000000000000000000000000000000000000bEEF' as Address
  const calls: Call[] = [
    { to: beef, value: parseEther('0.1'), data: '0x' },
    { to: '0x000000000000000000000000000000000000CAFE', value: 0n, data: '0x12345678' },
  ]

  // ---- quote (undeployed)
  const qr = await app.request('/quote-gas', post({ account, qx: pk.qx, qy: pk.qy, calls: wire(calls), deployed: false }))
  const q: any = await qr.json()
  assert.equal(qr.status, 200, JSON.stringify(q))
  assert.equal(q.method, 'simulated')
  assert.equal(q.deployed, false)
  assert.equal(q.feeRecipient, relayer.relayerAddress)

  // ---- relay (factory.createAccountAndExecute)
  const relBalBefore = await pub.getBalance({ address: relayer.relayerAddress })
  const sig = await signFor(pk, account, calls, q, 0n)
  const body = { account, qx: pk.qx, qy: pk.qy, calls: wire(calls), deadline: q.deadline, gasFee: q.gasFee, feeRecipient: q.feeRecipient, sig }
  const rr = await app.request('/relay', post(body))
  const r: any = await rr.json()
  assert.equal(rr.status, 200, JSON.stringify(r))
  const rc = await pub.waitForTransactionReceipt({ hash: r.txHash })
  assert.equal(rc.status, 'success')
  assert.equal(rc.to?.toLowerCase(), factory.toLowerCase())
  await tx.tick()
  const st: any = await (await app.request(`/tx/${r.txHash}`)).json()
  assert.equal(st.status, 'success')
  assert.equal(await pub.getBalance({ address: beef }), parseEther('0.1'))
  const relBalAfter = await pub.getBalance({ address: relayer.relayerAddress })
  const actualCost = rc.gasUsed * rc.effectiveGasPrice
  console.log(`[e2e] P256=${p256} deploy+execute: gasUsed=${rc.gasUsed} quotedGas=${q.gasLimit} fee=${q.gasFee} cost=${actualCost}`)
  assert.ok(relBalAfter >= relBalBefore, `relayer lost money: ${relBalBefore} -> ${relBalAfter}`)
  assert.ok(BigInt(q.gasLimit) >= rc.gasUsed, 'quote underestimated gas (deploy path)')
  // worst case (whole gas limit burnt) is still covered by the signed fee
  const sent = await pub.getTransaction({ hash: r.txHash })
  assert.ok(sent.gas * sent.gasPrice! <= BigInt(q.gasFee), `gas limit ${sent.gas} x ${sent.gasPrice} exceeds fee ${q.gasFee}`)
  assert.ok(tx.get(r.txHash)!.maxPrice! * rc.gasUsed <= BigInt(q.gasFee) * 11n / 10n)

  // ---- replay the same request -> rejected before broadcast (nonce moved on)
  const replay = await app.request('/relay', post(body))
  assert.equal(replay.status, 401, await replay.clone().text())

  // ---- deployed path
  const q2r = await app.request('/quote-gas', post({ account, calls: wire(calls) }))
  const q2: any = await q2r.json()
  assert.equal(q2r.status, 200, JSON.stringify(q2))
  assert.equal(q2.deployed, true)
  assert.equal(q2.nonce, '1')
  const sig2 = await signFor(pk, account, calls, q2, 1n)
  const r2r = await app.request('/relay', post({ account, calls: wire(calls), deadline: q2.deadline, gasFee: q2.gasFee, feeRecipient: q2.feeRecipient, sig: sig2 }))
  const r2: any = await r2r.json()
  assert.equal(r2r.status, 200, JSON.stringify(r2))
  const rc2 = await pub.waitForTransactionReceipt({ hash: r2.txHash })
  assert.equal(rc2.status, 'success')
  assert.equal(rc2.to?.toLowerCase(), account.toLowerCase())
  console.log(`[e2e] deployed execute: gasUsed=${rc2.gasUsed} quotedGas=${q2.gasLimit}`)
  assert.ok(BigInt(q2.gasLimit) >= rc2.gasUsed, 'quote underestimated gas (deployed path)')
  await tx.tick()

  // ---- fee too low -> 400 fee-too-low
  const low = { ...q2, gasFee: '1' }
  const sig3 = await signFor(pk, account, calls, low, 2n)
  const lr = await app.request('/relay', post({ account, calls: wire(calls), deadline: low.deadline, gasFee: '1', feeRecipient: low.feeRecipient, sig: sig3 }))
  const lj: any = await lr.json()
  assert.equal(lr.status, 400)
  assert.equal(lj.code, 'fee-too-low')

  // ---- wrong feeRecipient -> 400
  const wr = await app.request('/relay', post({ account, calls: wire(calls), deadline: q2.deadline, gasFee: q2.gasFee, feeRecipient: beef, sig: sig3 }))
  assert.equal(wr.status, 400)

  // ---- simulation failure surfaces the decoded revert (call value exceeds balance)
  const big: Call[] = [{ to: beef, value: parseEther('100'), data: '0x' }]
  const br = await app.request('/quote-gas', post({ account, calls: wire(big) }))
  assert.equal(br.status, 422)
  assert.match(((await br.json()) as any).error, /call #0 failed/)

  // ---- not a Sprout account -> 400
  const other = await softPasskey()
  const nr = await app.request('/quote-gas', post({ account: beef, qx: other.qx, qy: other.qy, calls: wire(calls) }))
  assert.equal(nr.status, 400)
})

test('front-run revert: strike + loss accounting, revert budget pauses new accounts', { skip }, async () => {
  const pk = await softPasskey()
  await ensureP256(pk)
  const cfg = makeCfg({ REVERT_BUDGET_BNB_PER_HOUR: '0.000000001' }) // 1 gwei of losses trips the breaker
  const { relayer, tx } = createRelayer(cfg, pub, chain)
  const app = createApp({ cfg, relayer, shield: new ShieldService(cfg) })
  const account = (await pub.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getAddress', args: [pk.qx, pk.qy] })) as Address
  const wallet = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(DEPLOYER) })
  await pub.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: account, value: parseEther('1') }) })
  const calls: Call[] = [{ to: '0x000000000000000000000000000000000000bEEF', value: 1n, data: '0x' }]

  await rpc('evm_setAutomine', [false])
  try {
    const q: any = await (await app.request('/quote-gas', post({ account, qx: pk.qx, qy: pk.qy, calls: wire(calls) }))).json()
    const sig = await signFor(pk, account, calls, q, 0n)
    const body = { account, qx: pk.qx, qy: pk.qy, calls: wire(calls), deadline: q.deadline, gasFee: q.gasFee, feeRecipient: q.feeRecipient, sig }
    const rr = await app.request('/relay', post(body))
    const r: any = await rr.json()
    assert.equal(rr.status, 200, JSON.stringify(r))
    // The signer front-runs the relayer with the same signed batch from its own EOA at a higher gas price.
    const relayed = await pub.getTransaction({ hash: r.txHash })
    await wallet.sendTransaction({ to: relayed.to!, data: relayed.input, gas: relayed.gas, gasPrice: relayed.gasPrice! * 3n, type: 'legacy' })
    await rpc('evm_mine')
    await tx.tick()
    const st: any = await (await app.request(`/tx/${r.txHash}`)).json()
    assert.equal(st.detail, 'reverted', JSON.stringify(st))
    assert.ok(relayer.lossLastHour() > 0n)
    // the relayer's loss is bounded by the gas limit it chose, which the fee covers
    assert.ok(relayer.lossLastHour() <= BigInt(q.gasFee))
  } finally {
    await rpc('evm_setAutomine', [true])
  }
  // budget exceeded (> 2x): everything paused with code revert-budget
  const other = await softPasskey()
  const oacc = (await pub.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getAddress', args: [other.qx, other.qy] })) as Address
  const fake = { ...(await signFor(other, oacc, calls, { gasFee: '1', feeRecipient: relayer.relayerAddress, deadline: String(Math.floor(Date.now() / 1000) + 600) }, 0n)) }
  const pr = await app.request('/relay', post({ account: oacc, qx: other.qx, qy: other.qy, calls: wire(calls), deadline: String(Math.floor(Date.now() / 1000) + 600), gasFee: '1', feeRecipient: relayer.relayerAddress, sig: fake }))
  assert.equal(pr.status, 503)
  assert.equal(((await pr.json()) as any).code, 'revert-budget')
})

test('stuck tx is replaced at the same nonce; expired one is cancelled', { skip }, async () => {
  const pk = await softPasskey()
  await ensureP256(pk)
  const cfg = makeCfg({ STUCK_AFTER_SEC: '0', DEADLINE_MIN_SEC: '1' })
  const { relayer, tx } = createRelayer(cfg, pub, chain)
  const app = createApp({ cfg, relayer, shield: new ShieldService(cfg) })
  const account = (await pub.readContract({ address: factory, abi: FACTORY_ABI, functionName: 'getAddress', args: [pk.qx, pk.qy] })) as Address
  const wallet = createWalletClient({ chain, transport: http(RPC), account: privateKeyToAccount(DEPLOYER) })
  await pub.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ to: account, value: parseEther('1') }) })
  const calls: Call[] = [{ to: '0x000000000000000000000000000000000000bEEF', value: 1n, data: '0x' }]

  await rpc('evm_setAutomine', [false])
  try {
    // 1) replacement
    const q: any = await (await app.request('/quote-gas', post({ account, qx: pk.qx, qy: pk.qy, calls: wire(calls) }))).json()
    const sig = await signFor(pk, account, calls, q, 0n)
    const r: any = await (await app.request('/relay', post({ account, qx: pk.qx, qy: pk.qy, calls: wire(calls), deadline: q.deadline, gasFee: q.gasFee, feeRecipient: q.feeRecipient, sig }))).json()
    assert.ok(r.txHash, JSON.stringify(r))
    // second relay for the same account while pending -> 409
    const busy = await app.request('/relay', post({ account, qx: pk.qx, qy: pk.qy, calls: wire(calls), deadline: q.deadline, gasFee: q.gasFee, feeRecipient: q.feeRecipient, sig }))
    assert.equal(busy.status, 409)
    await tx.tick() // stuck (STUCK_AFTER_SEC=0) -> replacement
    const rec = tx.get(r.txHash)!
    assert.equal(rec.hashes.length, 2)
    const t1 = await pub.getTransaction({ hash: rec.hashes[1] })
    assert.equal(t1.nonce, rec.nonce)
    assert.ok(t1.gasPrice! > (await pub.getTransaction({ hash: rec.hashes[0] }).catch(() => ({ gasPrice: 0n }))).gasPrice!)
    assert.ok(t1.gasPrice! <= rec.maxPrice!, 'replacement priced above what the signed fee covers')
    // a second bump would exceed the fee-covered price: the relayer waits instead of overpaying
    await tx.tick()
    assert.equal(rec.hashes.length, 2)
    await rpc('evm_mine')
    await tx.tick()
    const st: any = await (await app.request(`/tx/${r.txHash}`)).json()
    assert.equal(st.status, 'success', JSON.stringify(st))
    assert.equal(st.replaced, true)

    // 2) deadline passes while stuck -> cancelled with a 0-value self-transfer
    const q2: any = await (await app.request('/quote-gas', post({ account, calls: wire(calls) }))).json()
    const deadline = (BigInt(Math.floor(Date.now() / 1000)) + 3n).toString()
    const sig2 = await signFor(pk, account, calls, { ...q2, deadline }, 1n)
    const r2: any = await (await app.request('/relay', post({ account, calls: wire(calls), deadline, gasFee: q2.gasFee, feeRecipient: q2.feeRecipient, sig: sig2 }))).json()
    assert.ok(r2.txHash, JSON.stringify(r2))
    await new Promise((res) => setTimeout(res, 4500))
    await tx.tick()
    await rpc('evm_mine')
    await tx.tick()
    const st2: any = await (await app.request(`/tx/${r2.txHash}`)).json()
    assert.equal(st2.detail, 'cancelled', JSON.stringify(st2))
    assert.equal(st2.status, 'failed')
  } finally {
    await rpc('evm_setAutomine', [true])
  }
})
