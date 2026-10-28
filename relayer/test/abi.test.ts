/**
 * Cross-component alignment checks against the accounts agent's artifacts (skipped when ../accounts is absent,
 * e.g. inside the Docker build context).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { toFunctionSelector, toFunctionSignature, type AbiFunction } from 'viem'
import { ACCOUNT_ABI, FACTORY_ABI, ACCOUNT_ERRORS_ABI } from '../src/abi.js'

const ACC = new URL('../../accounts/', import.meta.url)
const has = existsSync(new URL('abi/SproutAccount.json', ACC))

const load = (name: string) => {
  const j = JSON.parse(readFileSync(new URL(`abi/${name}.json`, ACC), 'utf8'))
  return (Array.isArray(j) ? j : j.abi) as any[]
}

test('vendored src/challenge.ts is identical to accounts/js/challenge.ts', { skip: !existsSync(new URL('js/challenge.ts', ACC)) }, () => {
  const norm = (s: string) => s.replace(/\r\n/g, '\n')
  assert.equal(
    norm(readFileSync(new URL('../src/challenge.ts', import.meta.url), 'utf8')),
    norm(readFileSync(new URL('js/challenge.ts', ACC), 'utf8')),
  )
})

test('function fragments match accounts/abi/*.json', { skip: !has }, () => {
  for (const [ours, name] of [
    [ACCOUNT_ABI, 'SproutAccount'],
    [FACTORY_ABI, 'SproutAccountFactory'],
  ] as const) {
    const theirs = load(name).filter((x) => x.type === 'function')
    const sel = new Set(theirs.map((f) => toFunctionSelector(toFunctionSignature(f as AbiFunction))))
    for (const f of ours.filter((x) => x.type === 'function')) {
      const sig = toFunctionSignature(f as AbiFunction)
      assert.ok(sel.has(toFunctionSelector(sig)), `${name} lacks ${sig}`)
    }
  }
})

test('custom errors match accounts/abi/SproutAccount.json', { skip: !has }, () => {
  const theirs = load('SproutAccount').filter((x) => x.type === 'error')
  const sigs = new Set(theirs.map((e) => `${e.name}(${e.inputs.map((i: any) => i.type).join(',')})`))
  for (const e of ACCOUNT_ERRORS_ABI) {
    const s = `${e.name}(${e.inputs.map((i) => i.type).join(',')})`
    assert.ok(sigs.has(s), `missing error ${s}`)
  }
})
