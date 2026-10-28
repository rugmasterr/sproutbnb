import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { bech32 } from '@scure/base'
import { encodeAbiParameters, encodeEventTopics, type Hex } from 'viem'
import { createApi } from '../src/api.js'
import { PROOF_ABI, verifyReceipt, type ProofChecker } from '../src/bsc.js'
import { normalizeServer } from '../src/config.js'
import { Engine } from '../src/engine.js'
import { checkPayout, fmtZec } from '../src/limits.js'
import { normalizeStatus, type OneClickClient, type OneClickStatus } from '../src/oneclick.js'
import { Store } from '../src/store.js'
import { HttpError, parseNewRequest, shieldQuoteRef, stampMemo } from '../src/validate.js'
import { DevtoolWallet, parseBalanceJson, parseListTx, parseTaddr, parseZecAmount, type Exec } from '../src/wallet/devtool.js'
import { fakeTaddr, MockWallet } from '../src/wallet/mock.js'
import { checkShieldedDestination, encodeUnified } from '../src/zaddr.js'

const ZEC = 100_000_000n
const sapling = (fill = 1) => bech32.encode('zs', bech32.toWords(new Uint8Array(43).fill(fill)), 120)
const unified = (fill = 2) => encodeUnified([{ typecode: 3, data: new Uint8Array(43).fill(fill) }])
const hex32 = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as `0x${string}`
const addr20 = (n: number) => ('0x' + n.toString(16).padStart(40, '0')) as `0x${string}`
const LIM = { maxPayoutZat: 100n * ZEC, maxDailyZat: 1000n * ZEC, maxDailyCount: 2000 }

describe('addresses + validation', () => {
  it('accepts Sapling and Unified (Orchard receiver), rejects transparent', () => {
    assert.equal(checkShieldedDestination(sapling()).ok, true)
    const u = checkShieldedDestination(unified())
    assert.ok(u.ok && u.kind === 'unified' && u.receivers?.includes('orchard'))
    assert.equal(checkShieldedDestination(fakeTaddr()).ok, false)
    assert.equal(checkShieldedDestination('zs1notvalid').ok, false)
    // a corrupted UA (flip one char, recompute nothing) fails
    const ua = unified()
    const bad = ua.slice(0, 10) + (ua[10] === 'q' ? 'p' : 'q') + ua.slice(11)
    assert.equal(checkShieldedDestination(bad).ok, false)
  })

  it('parses the request body incl. keeper/relayer aliases', () => {
    const r = parseNewRequest({ quoteRef: hex32(1).toUpperCase().replace('0X', '0x'), depositAddress: addr20(5), recipient: sapling(), expectedZat: '150000000', source: 'keeper' }, LIM.maxPayoutZat)
    assert.equal(r.quoteRef, hex32(1))
    assert.equal(r.shieldedAddress, sapling())
    assert.equal(r.expectedZat, 150_000_000n)
    assert.equal(r.source, 'keeper')
    const r2 = parseNewRequest({ quoteRef: hex32(2), depositAddress: addr20(6), shieldedAddress: unified(), expectedZatoshi: 5 }, LIM.maxPayoutZat)
    assert.equal(r2.addressKind, 'unified')
  })

  it('rejects bad bodies', () => {
    const bad = (b: unknown, re: RegExp) => assert.throws(() => parseNewRequest(b, LIM.maxPayoutZat), (e: unknown) => e instanceof HttpError && e.status === 400 && re.test(e.message))
    bad({ quoteRef: '0x12', depositAddress: addr20(1), shieldedAddress: sapling() }, /quoteRef/)
    bad({ quoteRef: hex32(1), depositAddress: 't1abc', shieldedAddress: sapling() }, /depositAddress/)
    bad({ quoteRef: hex32(1), depositAddress: addr20(1), shieldedAddress: fakeTaddr() }, /transparent/)
    bad({ quoteRef: hex32(1), depositAddress: addr20(1), shieldedAddress: sapling(), expectedZatoshi: (101n * ZEC).toString() }, /limited to 100 ZEC/)
    bad({ quoteRef: hex32(1), depositAddress: addr20(1), shieldedAddress: sapling(), expectedZatoshi: '1.5' }, /zatoshis/)
    bad({ quoteRef: hex32(1), depositAddress: addr20(1), shieldedAddress: sapling(), recipient: unified() }, /disagree/)
  })

  it('builds the stamp memo', () => {
    assert.equal(stampMemo(42, hex32(0xabc)), `sprout-stamp:v1:42:${hex32(0xabc)}`)
    assert.throws(() => stampMemo(0, hex32(1)))
    assert.throws(() => stampMemo(1, '0x1234'))
  })

  it('normalizes lightwalletd server specs', () => {
    assert.equal(normalizeServer('https://zec.rocks:443/'), 'zec.rocks:443')
    assert.equal(normalizeServer('na.zec.rocks'), 'na.zec.rocks:443')
    assert.equal(normalizeServer('zecrocks'), 'zecrocks')
  })
})

describe('limits', () => {
  const now = 10 * 86_400_000
  it('per payout cap is permanent', () => {
    const c = checkPayout(100n * ZEC + 1n, [], LIM, now)
    assert.ok(!c.ok && c.permanent)
    assert.equal(checkPayout(100n * ZEC, [], LIM, now).ok, true)
  })
  it('daily volume uses a rolling 24h window', () => {
    const daily = Array.from({ length: 10 }, (_, i) => ({ at: now - 3600_000 * (i + 1), zat: (100n * ZEC).toString(), id: i }))
    const c = checkPayout(1n, daily, LIM, now)
    assert.ok(!c.ok && !c.permanent && c.retryAt === now - 10 * 3600_000 + 86_400_000)
    // entries older than 24h roll off
    const old = daily.map((d) => ({ ...d, at: d.at - 86_400_000 }))
    assert.equal(checkPayout(1n, old, LIM, now).ok, true)
  })
  it('daily count cap', () => {
    const daily = Array.from({ length: 2000 }, (_, i) => ({ at: now - 1000, zat: '1', id: i }))
    const c = checkPayout(1n, daily, LIM, now)
    assert.ok(!c.ok && /count/.test(c.reason))
  })
  it('formats ZEC', () => {
    assert.equal(fmtZec(123_450_000n), '1.2345')
    assert.equal(fmtZec(100n * ZEC), '100')
  })
})

describe('zcash-devtool output parsing', () => {
  it('parses list-tx text', () => {
    const a = 'a'.repeat(64)
    const b = 'b'.repeat(64)
    const txt = [
      'Transactions:',
      a,
      '     Mined: 3500001 (2026-10-27 10:00:00 UTC)',
      '    Amount: 1.25000000 ZEC',
      '  Fee paid: Unknown',
      '  Sent 0 notes, received 0 notes, 0 memos',
      '  Output 0 (Transparent)',
      '    Value: 1.25 ZEC',
      '',
      b,
      '   Unmined (expiry height: 3500100)',
      '    Amount: -0.99985000 ZEC',
      '  Output 0 (Orchard)',
      '    Value: 0.9997 ZEC',
      '    To: u1xyz',
      '    Memo: Text("sprout-stamp:v1:7:0xabc")',
    ].join('\n')
    const txs = parseListTx(txt)
    assert.equal(txs.length, 2)
    assert.deepEqual([txs[0].txid, txs[0].minedHeight, txs[0].deltaZat], [a, 3500001, 125_000_000n])
    assert.equal(txs[1].minedHeight, null)
    assert.equal(txs[1].deltaZat, -99_985_000n)
    assert.ok(txs[1].memos[0].includes('sprout-stamp:v1:7:'))
  })
  it('handles the upstream format_zec sign bug (|negative| < 1 ZEC prints without "-")', () => {
    const own = 'd'.repeat(64)
    const inc = 'e'.repeat(64)
    const txt = [
      own,
      '   Unmined (expiry height: 3500100)',
      '    Amount:   0.50015000 ZEC', // really -0.50015 (send 0.5 + fee), sign lost upstream
      '  Fee paid:   0.00015000 ZEC',
      '  Sent 1 notes, received 1 notes, 1 memos',
      inc,
      '     Mined: 3500002 (2026-10-27 10:00:00 UTC)',
      '    Amount:   0.50015000 ZEC',
      '  Fee paid: Unknown',
      'f'.repeat(64),
      '     Mined: 3500003 (2026-10-27 10:01:00 UTC)',
      '    Amount:  -2.00015000 ZEC',
      '  Fee paid:   0.00015000 ZEC',
    ].join('\n')
    const [a, b, c] = parseListTx(txt)
    assert.deepEqual([a.ownCreated, a.deltaZat, a.feeZat], [true, -50_015_000n, 15_000n])
    assert.deepEqual([b.ownCreated, b.deltaZat], [undefined, 50_015_000n])
    assert.deepEqual([c.ownCreated, c.deltaZat], [true, -200_015_000n])
  })
  it('stamp memo stays far below the 512-byte memo limit', () => {
    assert.ok(new TextEncoder().encode(stampMemo(Number.MAX_SAFE_INTEGER, hex32(1))).length < 120)
  })
  it('parses balance --json and t-address', () => {
    const b = parseBalanceJson('some log line\n{"total":300,"sapling_spendable":10,"orchard_spendable":20,"ironwood_spendable":30,"transparent_spendable":240,"chain_tip_height":3500000}\n')
    assert.equal(b.shieldedSpendable, 60n)
    assert.equal(b.transparentSpendable, 240n)
    assert.equal(b.height, 3500000)
    const t = fakeTaddr()
    assert.equal(parseTaddr(`Account x\nReceiver(transparent): ${t}\n`), t)
    assert.equal(parseZecAmount('0.0001 TAZ'), 10_000n)
  })
  it('passes the seed only on stdin, never in argv', async () => {
    const calls: { args: string[]; stdin?: string }[] = []
    const t = fakeTaddr()
    const exec: Exec = async (_bin, args, o) => {
      calls.push({ args, stdin: o.stdin })
      if (args.includes('list-addresses')) return { code: 0, stdout: `Receiver(transparent): ${t}\n`, stderr: '' }
      if (args.includes('send')) return { code: 0, stdout: `${'c'.repeat(64)}\n`, stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    }
    const dir = mkdtempSync(join(tmpdir(), 'zf-'))
    const seed = 'abandon '.repeat(23) + 'art'
    const w = new DevtoolWallet({ bin: 'zcash-devtool', walletDir: join(dir, 'wallet'), server: 'zec.rocks:443', connection: 'direct', network: 'mainnet', seed, birthday: 3_400_000, timeoutMs: 1000 }, exec)
    await w.init()
    await w.init() // idempotent via marker
    assert.equal(calls.filter((c) => c.args.includes('restore-mnemonic')).length, 1)
    const restore = calls[0]
    assert.ok(!restore.args.join(' ').includes('abandon'))
    assert.equal(restore.stdin, seed + '\n')
    assert.deepEqual(restore.args.slice(0, 4), ['wallet', '-w', join(dir, 'wallet'), 'restore-mnemonic'])
    assert.ok(restore.args.includes('--birthday') && restore.args.includes('zec.rocks:443'))
    assert.equal(await w.tAddress(), t)
    const txid = await w.send(sapling(), 12345n, 'sprout-stamp:v1:1:' + hex32(9))
    assert.equal(txid, 'c'.repeat(64))
    const s = calls.at(-1)!.args
    assert.deepEqual(s.slice(s.indexOf('--address'), s.indexOf('--address') + 6), ['--address', sapling(), '--value', '12345', '--memo', 'sprout-stamp:v1:1:' + hex32(9)])
  })
})

describe('BSC proof', () => {
  const terminal = addr20(0x7e)
  const payouts = addr20(0x9a)
  const mkLog = (emitter: string, name: 'CashOut' | 'BridgedOut', dep: string, qr: Hex, z = '') => {
    if (name === 'CashOut') {
      return {
        address: emitter,
        topics: encodeEventTopics({ abi: PROOF_ABI, eventName: 'CashOut', args: { trader: addr20(1) } }) as Hex[],
        data: encodeAbiParameters([{ type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }], [10n, dep as Hex, qr]),
      }
    }
    return {
      address: emitter,
      topics: encodeEventTopics({ abi: PROOF_ABI, eventName: 'BridgedOut', args: { vault: addr20(2) } }) as Hex[],
      data: encodeAbiParameters([{ type: 'uint8' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'string' }], [3, 10n, dep as Hex, qr, z]),
    }
  }
  const req = { quoteRef: hex32(7), depositAddress: addr20(0xd0), shieldedAddress: sapling() }
  it('accepts a CashOut from the terminal', () => {
    const r = verifyReceipt({ status: 'success', blockNumber: 5n, logs: [mkLog(terminal, 'CashOut', req.depositAddress, req.quoteRef)] }, req, { terminal, payouts })
    assert.ok(r.ok && r.event === 'CashOut')
  })
  it('rejects wrong emitter, mismatched deposit, wrong BridgedOut address, revert', () => {
    assert.equal(verifyReceipt({ status: 'success', blockNumber: 5n, logs: [mkLog(addr20(0x66), 'CashOut', req.depositAddress, req.quoteRef)] }, req, { terminal, payouts }).ok, false)
    const mism = verifyReceipt({ status: 'success', blockNumber: 5n, logs: [mkLog(terminal, 'CashOut', addr20(0xd1), req.quoteRef)] }, req, { terminal, payouts })
    assert.ok(!mism.ok && mism.permanent)
    const bo = verifyReceipt({ status: 'success', blockNumber: 5n, logs: [mkLog(payouts, 'BridgedOut', req.depositAddress, req.quoteRef, unified())] }, req, { terminal, payouts })
    assert.ok(!bo.ok && /zcashAddress/.test(bo.reason))
    const ok = verifyReceipt({ status: 'success', blockNumber: 5n, logs: [mkLog(payouts, 'BridgedOut', req.depositAddress, req.quoteRef, sapling())] }, req, { terminal, payouts })
    assert.ok(ok.ok && ok.event === 'BridgedOut')
    assert.equal(verifyReceipt({ status: 'reverted', blockNumber: 5n, logs: [] }, req, { terminal }).ok, false)
    const none = verifyReceipt(null, req, { terminal })
    assert.ok(!none.ok && !none.permanent)
  })
})

// ------------------------------------------------------------------------------------------------ engine

class FakeOneClick implements OneClickClient {
  m = new Map<string, OneClickStatus>()
  set(dep: string, s: Partial<OneClickStatus>) {
    this.m.set(dep, { status: 'PENDING_DEPOSIT', destinationTxHashes: [], originTxHashes: [], destinationAsset: 'nep141:zec.omft.near', ...s })
  }
  async status(dep: string) {
    return this.m.get(dep) ?? null
  }
}
const okProof: ProofChecker = { check: async () => ({ ok: true, event: 'CashOut', emitter: 'x', block: '1' }) }

function setup(over: Partial<{ maxDailyZat: bigint; maxDailyCount: number }> = {}) {
  let t = 1_000_000_000_000
  const wallet = new MockWallet()
  const oc = new FakeOneClick()
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'zfs-')), 'state.json'))
  const engine = new Engine({
    cfg: { ...LIM, ...over, feeReserveZat: 40_000n, sendFeeHeadroomZat: 20_000n, minPayoutZat: 50_000n, expireGraceMs: 86_400_000 },
    store,
    wallet,
    oneClick: oc,
    proof: okProof,
    now: () => t,
  })
  const adv = (ms = 60_000) => (t += ms)
  return { wallet, oc, store, engine, adv }
}

async function run(engine: Engine, adv: () => number, n = 1) {
  for (let i = 0; i < n; i++) {
    adv()
    await engine.tick()
  }
}

describe('engine', () => {
  it('happy path: register → 1Click SUCCESS → shield → send with stamp → confirmed', async () => {
    const { wallet, oc, store, engine, adv } = setup()
    await engine.start()
    assert.equal(engine.mode, 'active')
    const dep = addr20(0xd0)
    const { request } = engine.register(parseNewRequest({ quoteRef: hex32(1), depositAddress: dep, shieldedAddress: unified(), expectedZatoshi: '200000000' }, LIM.maxPayoutZat))
    oc.set(dep, { recipient: wallet.taddr })
    await run(engine, adv)
    assert.equal(store.get(hex32(1))!.status, 'registered')
    const ztx = wallet.deliver(200_000_000n)
    oc.set(dep, { status: 'SUCCESS', recipient: wallet.taddr, amountOut: '200000000', destinationTxHashes: [ztx], originTxHashes: [hex32(0xb5c)] })
    await run(engine, adv) // delivered → received → shield (balance shielded in mock immediately) → send
    const r = store.get(hex32(1))!
    assert.equal(r.status, 'sent', r.statusDetail)
    assert.equal(wallet.sent.length, 1)
    assert.equal(wallet.sent[0].to, unified())
    assert.equal(wallet.sent[0].zat, 200_000_000n - 40_000n)
    assert.equal(wallet.sent[0].memo, `sprout-stamp:v1:${request.id}:${hex32(0xb5c)}`)
    assert.ok(wallet.calls.indexOf('shield') < wallet.calls.indexOf('send'))
    // mine it
    wallet.txs.find((x) => x.txid === r.zcashOutTxid)!.minedHeight = wallet.height
    await run(engine, adv, 2)
    assert.equal(store.get(hex32(1))!.status, 'confirmed')
    assert.equal(wallet.sent.length, 1)
    assert.equal(engine.status().limits.usedLast24h.payouts, 1)
  })

  it('idempotent registration, conflict on a different address', async () => {
    const { engine } = setup()
    await engine.start()
    const body = { quoteRef: hex32(3), depositAddress: addr20(3), shieldedAddress: sapling() }
    assert.equal(engine.register(parseNewRequest(body, LIM.maxPayoutZat)).created, true)
    assert.equal(engine.register(parseNewRequest(body, LIM.maxPayoutZat)).created, false)
    assert.throws(() => engine.register(parseNewRequest({ ...body, shieldedAddress: sapling(9) }, LIM.maxPayoutZat)), (e: unknown) => e instanceof HttpError && e.status === 409)
  })

  it('rejects a quote that does not pay the forwarder; marks refunds', async () => {
    const { oc, store, engine, adv } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(4), depositAddress: addr20(4), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    engine.register(parseNewRequest({ quoteRef: hex32(5), depositAddress: addr20(5), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    oc.set(addr20(4), { status: 'SUCCESS', recipient: fakeTaddr(9), amountOut: '100000000' })
    oc.set(addr20(5), { status: 'REFUNDED', recipient: (await (engine as any).d.wallet.tAddress()) as string })
    await run(engine, adv)
    assert.equal(store.get(hex32(4))!.status, 'rejected')
    assert.equal(store.get(hex32(5))!.status, 'refunded')
  })

  it('holds payouts over the daily limit, and >100 ZEC goes to manual review', async () => {
    const { wallet, oc, store, engine, adv } = setup({ maxDailyZat: 3n * ZEC })
    await engine.start()
    const mk = (i: number, zat: bigint) => {
      engine.register(parseNewRequest({ quoteRef: hex32(100 + i), depositAddress: addr20(100 + i), shieldedAddress: sapling() }, LIM.maxPayoutZat))
      const tx = wallet.deliver(zat)
      oc.set(addr20(100 + i), { status: 'SUCCESS', recipient: wallet.taddr, amountOut: zat.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(900 + i)] })
    }
    mk(1, 2n * ZEC)
    mk(2, 2n * ZEC)
    mk(3, 150n * ZEC) // 1Click delivered more than the per-payout cap
    await run(engine, adv, 2)
    assert.equal(store.get(hex32(101))!.status, 'sent')
    const second = store.get(hex32(102))!
    assert.equal(second.status, 'received')
    assert.match(second.statusDetail ?? '', /daily volume limit/)
    assert.equal(store.get(hex32(103))!.status, 'manual_review')
    assert.equal(wallet.sent.length, 1)
    // 24h later the window frees
    adv(86_400_000)
    await run(engine, adv, 2)
    assert.equal(store.get(hex32(102))!.status, 'sent')
  })

  it('never double-pays: crash after send is recovered from the stamp', async () => {
    const { wallet, oc, store, engine, adv } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(6), depositAddress: addr20(6), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    const tx = wallet.deliver(ZEC)
    oc.set(addr20(6), { status: 'SUCCESS', recipient: wallet.taddr, amountOut: ZEC.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(66)] })
    await run(engine, adv)
    const r = store.get(hex32(6))!
    assert.equal(r.status, 'sent')
    // simulate a crash between wallet.send() returning and state being saved
    r.status = 'sending'
    r.zcashOutTxid = undefined
    r.sendStartedAt = Date.now()
    await run(engine, adv)
    assert.equal(store.get(hex32(6))!.status, 'sent')
    assert.equal(wallet.sent.length, 1)
  })

  it('send error without a wallet tx is retried (reservation released)', async () => {
    const { wallet, oc, store, engine, adv } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(7), depositAddress: addr20(7), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    const tx = wallet.deliver(ZEC)
    oc.set(addr20(7), { status: 'SUCCESS', recipient: wallet.taddr, amountOut: ZEC.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(77)] })
    wallet.failNextSend = 'lightwalletd unavailable'
    await run(engine, adv)
    const r = store.get(hex32(7))!
    assert.equal(r.status, 'received')
    assert.equal(engine.status().limits.usedLast24h.payouts, 0) // reservation released
    await run(engine, adv)
    assert.equal(store.get(hex32(7))!.status, 'sent')
    assert.equal(wallet.sent.length, 1)
  })

  it('send error after the wallet created a stamped tx → manual review, never resent', async () => {
    const { wallet, oc, store, engine, adv } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(17), depositAddress: addr20(17), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    const tx = wallet.deliver(ZEC)
    oc.set(addr20(17), { status: 'SUCCESS', recipient: wallet.taddr, amountOut: ZEC.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(177)] })
    wallet.failAfterCreate = true
    await run(engine, adv, 3)
    const r = store.get(hex32(17))!
    assert.equal(r.status, 'manual_review')
    assert.match(r.statusDetail ?? '', /carrying the stamp exists/)
    assert.equal(wallet.sent.length, 1)
  })

  it('falls back to amount matching when 1Click gives no destination tx hash', async () => {
    const { wallet, oc, store, engine, adv } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(8), depositAddress: addr20(8), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    wallet.deliver(123_456_789n)
    oc.set(addr20(8), { status: 'SUCCESS', recipient: wallet.taddr, amountOut: '123456789', originTxHashes: [hex32(88)] })
    await run(engine, adv)
    assert.equal(store.get(hex32(8))!.status, 'sent')
  })

  it('waits for a BSC tx hash, accepts it from the keeper attach call', async () => {
    const { wallet, oc, store, engine, adv } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(9), depositAddress: addr20(9), shieldedAddress: sapling(), source: 'keeper' }, LIM.maxPayoutZat))
    const tx = wallet.deliver(ZEC)
    oc.set(addr20(9), { status: 'SUCCESS', recipient: wallet.taddr, amountOut: ZEC.toString(), destinationTxHashes: [tx] })
    await run(engine, adv)
    assert.equal(store.get(hex32(9))!.status, 'received')
    engine.attachTx(hex32(9), hex32(99))
    await run(engine, adv)
    assert.equal(store.get(hex32(9))!.status, 'sent')
    assert.ok(wallet.sent[0].memo.endsWith(hex32(99)))
  })

  it('pauses when the wallet t-address does not match FORWARDER_TADDR', async () => {
    const wallet = new MockWallet()
    const engine = new Engine({ cfg: { ...LIM, feeReserveZat: 1n, sendFeeHeadroomZat: 1n, minPayoutZat: 1n, expireGraceMs: 1, expectedTaddr: fakeTaddr(3) }, store: new Store(), wallet, oneClick: new FakeOneClick() })
    await engine.start()
    assert.equal(engine.mode, 'paused')
    assert.throws(() => engine.register(parseNewRequest({ quoteRef: hex32(1), depositAddress: addr20(1), shieldedAddress: sapling() }, LIM.maxPayoutZat)), (e: unknown) => e instanceof HttpError && e.status === 503)
  })

  // ------------------------------------------------------------------ adversarial cases (review pass)

  const deliverFor = async (ctx: ReturnType<typeof setup>, i: number, zat: bigint, extra: Partial<OneClickStatus> = {}, addr = sapling()) => {
    ctx.engine.register(parseNewRequest({ quoteRef: hex32(500 + i), depositAddress: addr20(500 + i), shieldedAddress: addr }, LIM.maxPayoutZat))
    const tx = ctx.wallet.deliver(zat)
    ctx.oc.set(addr20(500 + i), { status: 'SUCCESS', recipient: ctx.wallet.taddr, amountOut: zat.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(0x5000 + i)], ...extra })
    return tx
  }

  it('one deposit address cannot be registered twice under different quoteRefs', async () => {
    const { engine } = setup()
    await engine.start()
    engine.register(parseNewRequest({ quoteRef: hex32(31), depositAddress: addr20(31), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    assert.throws(
      () => engine.register(parseNewRequest({ quoteRef: hex32(32), depositAddress: addr20(31), shieldedAddress: sapling(5) }, LIM.maxPayoutZat)),
      (e: unknown) => e instanceof HttpError && e.status === 409,
    )
  })

  it('a Zcash tx already credited to one request cannot be credited again to another', async () => {
    const ctx = setup()
    await ctx.engine.start()
    const tx = await deliverFor(ctx, 1, ZEC)
    await run(ctx.engine, ctx.adv)
    assert.equal(ctx.store.get(hex32(501))!.status, 'sent')
    // a second request whose (bogus) 1Click status points at the same delivery tx
    ctx.engine.register(parseNewRequest({ quoteRef: hex32(502), depositAddress: addr20(502), shieldedAddress: sapling(7) }, LIM.maxPayoutZat))
    ctx.oc.set(addr20(502), { status: 'SUCCESS', recipient: ctx.wallet.taddr, amountOut: ZEC.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(0x5002)] })
    await run(ctx.engine, ctx.adv, 2)
    assert.equal(ctx.store.get(hex32(502))!.status, 'manual_review')
    assert.equal(ctx.wallet.sent.length, 1)
  })

  it('1Click SUCCESS without a recipient is not trusted', async () => {
    const ctx = setup()
    await ctx.engine.start()
    await deliverFor(ctx, 3, ZEC, { recipient: undefined })
    await run(ctx.engine, ctx.adv)
    assert.equal(ctx.store.get(hex32(503))!.status, 'manual_review')
    assert.equal(ctx.wallet.sent.length, 0)
  })

  it('amount fallback never matches a tx this wallet created', async () => {
    const ctx = setup()
    await ctx.engine.start()
    // an own-created tx whose |delta| equals the delivery (as format_zec would print it, sign lost)
    ctx.wallet.txs.push({ txid: '9'.repeat(64), minedHeight: ctx.wallet.height, deltaZat: 77_000_000n, memos: [], feeZat: 15_000n, ownCreated: true })
    ctx.engine.register(parseNewRequest({ quoteRef: hex32(504), depositAddress: addr20(504), shieldedAddress: sapling() }, LIM.maxPayoutZat))
    ctx.oc.set(addr20(504), { status: 'SUCCESS', recipient: ctx.wallet.taddr, amountOut: '77000000', originTxHashes: [hex32(0x5004)] })
    await run(ctx.engine, ctx.adv, 2)
    assert.equal(ctx.store.get(hex32(504))!.status, 'delivered')
    assert.equal(ctx.wallet.sent.length, 0)
  })

  it('crash mid-send with no visible stamp → manual review, never resent; admin re-queue needs confirmation', async () => {
    const ctx = setup()
    await ctx.engine.start()
    await deliverFor(ctx, 5, ZEC)
    ctx.wallet.hideMemos = true // worst case: list-tx does not show sent memos
    ctx.wallet.crashAfterCreate = true
    await run(ctx.engine, ctx.adv, 3)
    const r = ctx.store.get(hex32(505))!
    assert.equal(r.status, 'manual_review')
    assert.match(r.statusDetail ?? '', /new tx/)
    assert.equal(ctx.wallet.sent.length, 1)
    assert.equal(ctx.engine.status().limits.usedLast24h.payouts, 1) // reservation kept
    assert.throws(() => ctx.engine.requeue(hex32(505), { notSent: false }), (e: unknown) => e instanceof HttpError && e.status === 400)
  })

  it('a request left in "sending" by a crash without a stamp goes to manual review', async () => {
    const ctx = setup()
    await ctx.engine.start()
    await deliverFor(ctx, 6, ZEC)
    ;(ctx.engine as any).d.pauseSends = true
    await run(ctx.engine, ctx.adv)
    const r = ctx.store.get(hex32(506))!
    assert.equal(r.status, 'received')
    r.status = 'sending' // as if the process died inside wallet.send before anything was stored
    r.stamp = stampMemo(r.id, r.bscTxHash!)
    ;(ctx.engine as any).d.pauseSends = false
    await run(ctx.engine, ctx.adv, 2)
    assert.equal(ctx.store.get(hex32(506))!.status, 'manual_review')
    assert.equal(ctx.wallet.sent.length, 0)
    // operator verified nothing was broadcast → re-queue → sent once
    ctx.engine.requeue(hex32(506), { notSent: true, note: 'checked explorer' })
    await run(ctx.engine, ctx.adv)
    assert.equal(ctx.store.get(hex32(506))!.status, 'sent')
    assert.equal(ctx.wallet.sent.length, 1)
  })

  it('state that cannot be saved means no send', async () => {
    const ctx = setup()
    await ctx.engine.start()
    await deliverFor(ctx, 7, ZEC)
    ;(ctx.engine as any).d.pauseSends = true
    await run(ctx.engine, ctx.adv)
    ;(ctx.engine as any).d.pauseSends = false
    const orig = ctx.store.save.bind(ctx.store)
    ctx.store.save = () => {
      throw new Error('ENOSPC')
    }
    await ctx.engine.tick()
    ctx.store.save = orig
    assert.equal(ctx.wallet.sent.length, 0)
    assert.equal(ctx.store.get(hex32(507))!.status, 'received')
    assert.equal(ctx.engine.status().limits.usedLast24h.payouts, 0)
  })

  it('REQUIRE_BOUND_QUOTEREF: only CashOuts whose quoteRef commits to the shielded address are forwarded', async () => {
    const ctx = setup()
    ;(ctx.engine as any).d.cfg.requireBoundQuoteRef = true
    await ctx.engine.start()
    await deliverFor(ctx, 8, ZEC) // legacy quoteRef
    const dep = addr20(0xb0)
    const qr = shieldQuoteRef(dep, unified())
    const { request } = ctx.engine.register(parseNewRequest({ quoteRef: qr, depositAddress: dep, shieldedAddress: unified() }, LIM.maxPayoutZat))
    assert.equal(request.bound, true)
    const tx = ctx.wallet.deliver(ZEC)
    ctx.oc.set(dep, { status: 'SUCCESS', recipient: ctx.wallet.taddr, amountOut: ZEC.toString(), destinationTxHashes: [tx], originTxHashes: [hex32(0xb1)] })
    await run(ctx.engine, ctx.adv, 2)
    assert.equal(ctx.store.get(hex32(508))!.status, 'manual_review')
    assert.equal(ctx.store.get(qr)!.status, 'sent')
    assert.equal(ctx.wallet.sent.length, 1)
    assert.equal(ctx.wallet.sent[0].to, unified())
  })

  it('normalizes the 1Click status response', () => {
    const s = normalizeStatus({
      status: 'SUCCESS',
      quoteResponse: { quoteRequest: { recipient: 't1x', destinationAsset: 'nep141:zec.omft.near' }, quote: { amountOut: '5', deadline: '2026-10-27T00:00:00Z' } },
      swapDetails: { amountOut: '4', destinationChainTxHashes: [{ hash: 'ab', explorerUrl: '' }], originChainTxHashes: [{ hash: '0x01', explorerUrl: '' }] },
    })
    assert.deepEqual([s.status, s.recipient, s.amountOut, s.destinationTxHashes[0], s.originTxHashes[0]], ['SUCCESS', 't1x', '4', 'ab', '0x01'])
  })
})

describe('HTTP API', () => {
  async function serve(engine: Engine, token?: string) {
    const srv = createApi(engine, { token, network: 'mainnet', maxPayoutZat: LIM.maxPayoutZat })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
    return { base, close: () => new Promise<void>((r) => srv.close(() => r())) }
  }

  it('idle mode: healthz ok, registration 503', async () => {
    const engine = new Engine({ cfg: { ...LIM, feeReserveZat: 1n, sendFeeHeadroomZat: 1n, minPayoutZat: 1n, expireGraceMs: 1 }, store: new Store(), oneClick: new FakeOneClick() })
    const { base, close } = await serve(engine)
    try {
      const h = await fetch(`${base}/healthz`)
      assert.equal(h.status, 200)
      assert.deepEqual(await h.json(), { ok: true, mode: 'idle' })
      const s = (await (await fetch(`${base}/status`)).json()) as any
      assert.equal(s.mode, 'idle')
      assert.equal(s.limits.maxPayoutZec, '100')
      const p = await fetch(`${base}/requests`, { method: 'POST', body: '{}' })
      assert.equal(p.status, 503)
    } finally {
      await close()
    }
  })

  it('auth + register + get', async () => {
    const { engine } = setup()
    await engine.start()
    const token = 'x'.repeat(32)
    const { base, close } = await serve(engine, token)
    try {
      const body = JSON.stringify({ quoteRef: hex32(11), depositAddress: addr20(11), shieldedAddress: sapling(), expectedZatoshi: '1000000' })
      assert.equal((await fetch(`${base}/requests`, { method: 'POST', body })).status, 401)
      assert.equal((await fetch(`${base}/requests`, { method: 'POST', body, headers: { authorization: 'Bearer wrong' } })).status, 401)
      const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      const c = await fetch(`${base}/requests`, { method: 'POST', body, headers: auth })
      assert.equal(c.status, 201)
      const cj = (await c.json()) as any
      assert.equal(cj.request.status, 'registered')
      assert.equal((await fetch(`${base}/v1/requests`, { method: 'POST', body, headers: auth })).status, 200)
      const g = await fetch(`${base}/requests/${hex32(11)}`, { headers: auth })
      assert.equal(((await g.json()) as any).id, cj.id)
      const info = (await (await fetch(`${base}/v1/info`, { headers: auth })).json()) as any
      assert.match(info.tAddress, /^t1/)
      const bad = await fetch(`${base}/requests`, { method: 'POST', body: JSON.stringify({ quoteRef: hex32(12), depositAddress: addr20(12), shieldedAddress: fakeTaddr() }), headers: auth })
      assert.equal(bad.status, 400)
      assert.equal((await fetch(`${base}/v1/requests/${hex32(11)}/tx`, { method: 'POST', body: JSON.stringify({ bscTxHash: hex32(5) }), headers: auth })).status, 200)
      // admin route is off without ADMIN_TOKEN, and FORWARDER_TOKEN never works there
      assert.equal((await fetch(`${base}/v1/admin/requests/${hex32(11)}/requeue`, { method: 'POST', body: '{}', headers: auth })).status, 404)
    } finally {
      await close()
    }
  })

  it('admin re-queue route uses its own token', async () => {
    const { engine } = setup()
    await engine.start()
    const token = 'x'.repeat(32)
    const adminToken = 'a'.repeat(32)
    const srv = createApi(engine, { token, adminToken, network: 'mainnet', maxPayoutZat: LIM.maxPayoutZat })
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
    try {
      engine.register(parseNewRequest({ quoteRef: hex32(12), depositAddress: addr20(12), shieldedAddress: sapling() }, LIM.maxPayoutZat))
      const url = `${base}/v1/admin/requests/${hex32(12)}/requeue`
      assert.equal((await fetch(url, { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token}` } })).status, 401)
      // registered (not manual_review) → 409
      assert.equal((await fetch(url, { method: 'POST', body: '{"confirmNotSent":true}', headers: { authorization: `Bearer ${adminToken}` } })).status, 409)
    } finally {
      await new Promise<void>((r) => srv.close(() => r()))
    }
  })
})
