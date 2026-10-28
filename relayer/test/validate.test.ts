import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { keccak256, getAddress, toBytes } from 'viem'
import { parseQuote, parseRelay, parseShield, quoteRefOf, shieldQuoteRefOf, HttpError } from '../src/validate.js'
import { tAddr, saplingFromVectors } from './helpers.js'

const L = { maxCalls: 4, maxCalldataBytes: 1000 }
const fx = JSON.parse(readFileSync(new URL('./fixtures-js-assertion.json', import.meta.url), 'utf8'))
const ua = JSON.parse(readFileSync(new URL('./vectors/unified_address.json', import.meta.url), 'utf8')).slice(2)

const good = () => ({
  account: '0xf015769cab2056916575fA520CE9fCdBE662BeEe',
  qx: fx.qx,
  qy: fx.qy,
  calls: [{ to: fx.call0To, value: fx.call0Value, data: fx.call0Data }],
  deadline: fx.deadline,
  gasFee: fx.gasFee,
  feeRecipient: fx.feeRecipient,
  sig: {
    authenticatorData: fx.authenticatorData,
    clientDataJSON: fx.clientDataJSON,
    challengeIndex: fx.challengeIndex,
    typeIndex: Number(fx.typeIndex),
    r: fx.r,
    s: fx.s,
  },
})

const status = (fn: () => unknown): number => {
  try {
    fn()
  } catch (e) {
    if (e instanceof HttpError) return e.status
    throw e
  }
  return 200
}

test('relay: accepts a well-formed request and normalises types', () => {
  const r = parseRelay(good(), L)
  assert.equal(r.account, getAddress('0xf015769cab2056916575fA520CE9fCdBE662BeEe'))
  assert.equal(typeof r.deadline, 'bigint')
  assert.equal(r.calls[0].value, BigInt(fx.call0Value))
  assert.equal(r.sig.typeIndex, 1n)
  assert.equal(r.feeRecipient, getAddress(fx.feeRecipient))
  // value/data default
  const g = good()
  g.calls = [{ to: fx.call0To } as any]
  const r2 = parseRelay(g, L)
  assert.equal(r2.calls[0].value, 0n)
  assert.equal(r2.calls[0].data, '0x')
})

test('relay: rejects malformed shapes with 400 / 413', () => {
  const mut = (f: (g: any) => void) => {
    const g: any = good()
    f(g)
    return status(() => parseRelay(g, L))
  }
  assert.equal(mut((g) => delete g.sig), 400)
  assert.equal(mut((g) => (g.account = '0x123')), 400)
  assert.equal(mut((g) => (g.calls = [])), 400)
  assert.equal(mut((g) => (g.calls = Array(5).fill(g.calls[0]))), 400)
  assert.equal(mut((g) => (g.calls[0].data = '0xabc')), 400)
  assert.equal(mut((g) => (g.calls[0].value = '-1')), 400)
  assert.equal(mut((g) => (g.calls[0].value = 1e30)), 400) // unsafe JS number
  assert.equal(mut((g) => (g.calls[0].value = '1.5')), 400)
  assert.equal(mut((g) => (g.deadline = (1n << 64n).toString())), 400)
  assert.equal(mut((g) => delete g.qy), 400) // qx without qy
  assert.equal(mut((g) => (g.qx = '0x1234')), 400)
  assert.equal(mut((g) => (g.sig.authenticatorData = '0x' + '00'.repeat(36))), 400)
  assert.equal(mut((g) => (g.sig.s = '0')), 400)
  assert.equal(mut((g) => (g.sig.r = '115792089210356248762697446949407573529996955224135760342422259061068512044369')), 400) // = n
  assert.equal(mut((g) => (g.sig.clientDataJSON = 'x'.repeat(5000))), 400)
  assert.equal(mut((g) => (g.calls = [{ to: fx.call0To, data: '0x' + 'aa'.repeat(600) }, { to: fx.call0To, data: '0x' + 'aa'.repeat(600) }])), 413)
  assert.equal(status(() => parseRelay(null, L)), 400)
  assert.equal(status(() => parseRelay('[]', L)), 400)
})

test('quote: qx/qy optional (deployed accounts), calls required', () => {
  const q = parseQuote({ account: fx.account, calls: [{ to: fx.call0To, value: '1', data: '0x' }] }, L)
  assert.equal(q.qx, undefined)
  assert.equal(status(() => parseQuote({ account: fx.account, calls: [] }, L)), 400)
  assert.equal(status(() => parseQuote({ account: fx.account, qx: fx.qx, calls: [{ to: fx.call0To }] }, L)), 400)
})

test('shield-request: quoteRef binding and Zcash address checks', () => {
  const depositAddress = '0x76b4c56085ED136a8744D52bE956396624a730E8'
  const quoteRef = keccak256(getAddress(depositAddress))
  assert.equal(quoteRefOf(depositAddress), quoteRef)
  const zs = saplingFromVectors()
  const r = parseShield({ quoteRef, shieldedAddress: zs, depositAddress })
  assert.equal(r.addressKind, 'sapling')
  const u = ua.find((v: any[]) => v[3])[6] // a UA with an Orchard receiver
  assert.equal(parseShield({ quoteRef, shieldedAddress: u, depositAddress, correlationId: 'abc', amountOutZec: '1.5' }).addressKind, 'unified')
  const uNoShield = ua.find((v: any[]) => !v[2] && !v[3])
  if (uNoShield) assert.equal(status(() => parseShield({ quoteRef, shieldedAddress: uNoShield[6], depositAddress })), 400)

  assert.equal(status(() => parseShield({ quoteRef: keccak256('0x01'), shieldedAddress: zs, depositAddress })), 400)
  assert.equal(status(() => parseShield({ quoteRef, shieldedAddress: tAddr([0x1c, 0xb8]), depositAddress })), 400)
  assert.equal(status(() => parseShield({ quoteRef, shieldedAddress: zs.slice(0, -1) + 'x', depositAddress })), 400)
  assert.equal(status(() => parseShield({ quoteRef, shieldedAddress: zs, depositAddress: 'not-an-address' })), 400)
  assert.equal(status(() => parseShield({ quoteRef, depositAddress })), 400)

  // binding quoteRef (what the site sends for shielded cash-outs); must match zforward's shieldQuoteRef formula
  const bound = shieldQuoteRefOf(depositAddress, zs)
  assert.equal(bound, keccak256(toBytes(`sprout-shield:v1:${depositAddress.toLowerCase()}:${zs}`)))
  assert.equal(parseShield({ quoteRef: bound, shieldedAddress: zs, depositAddress }).addressKind, 'sapling')
  // a binding quoteRef for a different shielded address is rejected
  assert.equal(status(() => parseShield({ quoteRef: shieldQuoteRefOf(depositAddress, u), shieldedAddress: zs, depositAddress })), 400)
})
