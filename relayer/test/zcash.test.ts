import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { bech32m } from '@scure/base'
import { hexToBytes, bytesToHex } from 'viem'
import { f4jumble, f4jumbleInv, zcashAddressInfo, encodeUnified } from '../src/zcash.js'
import { tAddr, saplingFromVectors } from './helpers.js'

// Official ZIP 316 vectors from github.com/zcash/zcash-test-vectors (subset copied into test/vectors).
const f4 = JSON.parse(readFileSync(new URL('./vectors/f4jumble.json', import.meta.url), 'utf8')).slice(2) as [string, string][]
const ua = JSON.parse(readFileSync(new URL('./vectors/unified_address.json', import.meta.url), 'utf8')).slice(2) as (string | number | null)[][]

const hx = (h: string) => hexToBytes(`0x${h}`)

test('F4Jumble matches the ZIP 316 test vectors (both directions)', () => {
  assert.ok(f4.length >= 4)
  for (const [normal, jumbled] of f4) {
    assert.equal(bytesToHex(f4jumble(hx(normal))).slice(2), jumbled)
    assert.equal(bytesToHex(f4jumbleInv(hx(jumbled))).slice(2), normal)
  }
})

test('every ZIP 316 unified address vector validates with the right receivers', () => {
  assert.ok(ua.length >= 20)
  for (const v of ua) {
    const [p2pkh, p2sh, sapling, orchard, unknownTc] = v
    const addr = v[6] as string
    const info = zcashAddressInfo(addr)
    assert.ok(info.valid, `${addr}: ${!info.valid && info.reason}`)
    if (!info.valid) continue
    assert.equal(info.kind, 'unified')
    assert.equal(info.network, 'mainnet')
    assert.equal(info.receivers!.includes('p2pkh'), !!p2pkh)
    assert.equal(info.receivers!.includes('p2sh'), !!p2sh)
    assert.equal(info.receivers!.includes('sapling'), !!sapling)
    assert.equal(info.receivers!.includes('orchard'), !!orchard)
    assert.equal(info.receivers!.some((r) => r.startsWith('unknown')), unknownTc !== null)
    assert.equal(info.hasShieldedReceiver, !!(sapling || orchard))
    // one flipped character must fail (checksum), and uppercase is accepted per bech32 rules
    const i = 20
    const flipped = addr.slice(0, i) + (addr[i] === 'q' ? 'p' : 'q') + addr.slice(i + 1)
    assert.equal(zcashAddressInfo(flipped).valid, false)
    assert.equal(zcashAddressInfo(addr.toUpperCase()).valid, true)
  }
})

test('unified: wrong-network padding and transparent-only payloads are rejected', () => {
  const orchard = { typecode: 3, data: new Uint8Array(43).fill(9) }
  const good = encodeUnified([orchard])
  assert.ok(zcashAddressInfo(good).valid)
  // Re-wrap the same jumbled bytes under the testnet HRP -> the padding no longer matches.
  const words = bech32m.decode(good as `${string}1${string}`, false).words
  const wrongNet = bech32m.encode('utest', words, false)
  const w = zcashAddressInfo(wrongNet)
  assert.equal(w.valid, false)
  assert.match(!w.valid ? w.reason : '', /padding/)
  // A single P2PKH receiver is below the 48-byte F4Jumble minimum (cannot even be encoded); P2PKH+P2SH is forbidden.
  assert.throws(() => encodeUnified([{ typecode: 0, data: new Uint8Array(20).fill(1) }]), /length/)
  const both = encodeUnified([{ typecode: 0, data: new Uint8Array(20).fill(1) }, { typecode: 1, data: new Uint8Array(20).fill(2) }])
  const bi = zcashAddressInfo(both)
  assert.equal(bi.valid, false)
  assert.match(!bi.valid ? bi.reason : '', /P2PKH and P2SH/)
  const testnet = encodeUnified([orchard], 'utest')
  const ti = zcashAddressInfo(testnet)
  assert.ok(ti.valid && ti.network === 'testnet')
})

test('transparent t1/t3 (Base58Check) and Sapling zs1 (Bech32)', () => {
  const t1 = tAddr([0x1c, 0xb8])
  const t3 = tAddr([0x1c, 0xbd])
  assert.ok(t1.startsWith('t1') && t3.startsWith('t3'))
  assert.deepEqual(zcashAddressInfo(t1), { valid: true, kind: 'transparent', network: 'mainnet' })
  assert.deepEqual(zcashAddressInfo(t3), { valid: true, kind: 'transparent', network: 'mainnet' })
  const bad = t1.slice(0, -1) + (t1.endsWith('a') ? 'b' : 'a')
  assert.equal(zcashAddressInfo(bad).valid, false)

  const zs = saplingFromVectors()
  assert.equal(zs.length, 78)
  assert.deepEqual(zcashAddressInfo(zs), { valid: true, kind: 'sapling', network: 'mainnet' })
  assert.equal(zcashAddressInfo(zs.slice(0, -1) + (zs.endsWith('q') ? 'p' : 'q')).valid, false)
  // Bech32m checksum on a Sapling HRP is not valid Sapling
  const zsM = bech32m.encode('zs', bech32m.toWords(new Uint8Array(43).fill(5)), 90)
  assert.equal(zcashAddressInfo(zsM).valid, false)

  const tex = bech32m.encode('tex', bech32m.toWords(new Uint8Array(20).fill(5)), 90)
  assert.deepEqual(zcashAddressInfo(tex), { valid: true, kind: 'tex', network: 'mainnet' })

  for (const junk of ['', 'hello', '0x2222222222222222222222222222222222222222', 'zs1abc', 'u1qqqq', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq']) {
    assert.equal(zcashAddressInfo(junk).valid, false, junk)
  }
})
