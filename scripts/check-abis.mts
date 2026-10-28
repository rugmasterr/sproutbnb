// Cross-component ABI check: every ABI fragment in the site, keeper, relayer and zforward must match the compiled
// ABIs (contracts/abi, accounts/abi, contracts/out, accounts/out). Run after forge build in contracts/ and accounts/.
// Usage (repo root): relayer\node_modules\.bin\tsx scripts/check-abis.mts
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '..')
const J = (p: string) => JSON.parse(readFileSync(p, 'utf8'))

const t = (p: any): string =>
  p.type.startsWith('tuple') ? `(${(p.components ?? []).map(t).join(',')})${p.type.slice(5)}` : p.type
const sigOf = (it: any) => `${it.name}(${(it.inputs ?? []).map(t).join(',')})`
const outOf = (it: any) => (it.outputs ?? []).map(t).join(',')
const idxOf = (it: any) => (it.inputs ?? []).map((i: any) => (i.indexed ? 'i' : '-')).join('')
const compNames = (p: any): string =>
  p.components ? `${p.name ?? ''}{${p.components.map(compNames).join(',')}}` : (p.name ?? '')

// ---- references
const named: Record<string, any[]> = {}
for (const n of ['SproutVaultFactory', 'SproutVault', 'SproutRoots', 'SproutPayouts', 'SproutTerminal'])
  named[n] = J(join(root, 'contracts/abi', n + '.json'))
for (const n of ['SproutAccount', 'SproutAccountFactory']) named[n] = J(join(root, 'accounts/abi', n + '.json'))
const global: { src: string; it: any }[] = []
for (const [n, abi] of Object.entries(named)) for (const it of abi) global.push({ src: n, it })
for (const outDir of ['contracts/out', 'accounts/out']) {
  const d = join(root, outDir)
  if (!existsSync(d)) continue
  for (const sol of readdirSync(d)) {
    if (sol === 'build-info') continue
    const sd = join(d, sol)
    if (!statSync(sd).isDirectory()) continue
    for (const f of readdirSync(sd)) {
      try {
        const a = J(join(sd, f)).abi
        if (Array.isArray(a)) for (const it of a) global.push({ src: `${sol}/${f}`, it })
      } catch {}
    }
  }
}
const sproutErrorSet = new Set(
  Object.entries(named).filter(([n]) => n.startsWith('Sprout')).flatMap(([, a]) => a.filter((x) => x.type === 'error').map(sigOf)),
)

const exportMap: Record<string, string> = {
  factoryAbi: 'SproutVaultFactory',
  vaultAbi: 'SproutVault',
  rootsAbi: 'SproutRoots',
  payoutsAbi: 'SproutPayouts',
  terminalAbi: 'SproutTerminal',
  SPROUT_ACCOUNT_ABI: 'SproutAccount',
  ACCOUNT_ABI: 'SproutAccount',
  SPROUT_ACCOUNT_FACTORY_ABI: 'SproutAccountFactory',
  FACTORY_ABI: 'SproutAccountFactory',
}

const consumers = [
  'src/lib/abi/sprout.ts',
  'src/lib/abi/portal.ts',
  'src/lib/abi/vaultPortal.ts',
  'src/lib/abi/erc20.ts',
  'src/features/zcash/passkey/challenge.ts',
  'accounts/js/challenge.ts',
  'keeper/src/abi.ts',
  'relayer/src/abi.ts',
  'relayer/src/challenge.ts',
  'zforward/src/bsc.ts',
]

let bad = 0,
  ok = 0,
  warn = 0
for (const c of consumers) {
  let mod: any
  try {
    mod = await import(pathToFileURL(join(root, c)).href)
  } catch (e) {
    console.log(`!! ${c}: import failed: ${(e as Error).message}`)
    bad++
    continue
  }
  for (const [ex, val] of Object.entries(mod)) {
    if (!Array.isArray(val) || !val.length || typeof val[0] !== 'object' || !('type' in val[0])) continue
    const target = exportMap[ex]
    // keeper's factoryAbi is the VAULT factory; relayer's FACTORY_ABI is the account factory
    let tgt = target
    if (ex === 'factoryAbi' && c.startsWith('relayer')) tgt = 'SproutAccountFactory'
    for (const it of val as any[]) {
      if (!['function', 'event', 'error'].includes(it.type)) continue
      const sig = sigOf(it)
      const where = `${c}#${ex}.${sig}`
      if (it.type === 'error' && sproutErrorSet.has(sig) && tgt?.startsWith('Sprout') && !tgt.startsWith('SproutAccount')) {
        ok++
        continue
      }
      const pool = tgt ? named[tgt].map((x) => ({ src: tgt, it: x })) : global
      const byName = pool.filter((r) => r.it.type === it.type && r.it.name === it.name)
      if (!byName.length) {
        if (tgt && it.type === 'error' && global.some((r) => r.it.type === 'error' && sigOf(r.it) === sig)) {
          ok++
          continue
        }
        console.log(`?? NOT IN ${tgt ?? 'any compiled ABI'}: ${where}`)
        tgt ? bad++ : warn++
        continue
      }
      const exact = byName.find(
        (r) => sigOf(r.it) === sig && (it.type !== 'function' || outOf(r.it) === outOf(it)) && (it.type !== 'event' || idxOf(r.it) === idxOf(it)),
      )
      if (!exact) {
        bad++
        console.log(`XX MISMATCH ${where}`)
        console.log(`     consumer: ${sig} -> (${outOf(it)}) idx=${idxOf(it)} ${it.stateMutability ?? ''}`)
        for (const r of byName.slice(0, 3))
          console.log(`     real[${r.src}]: ${sigOf(r.it)} -> (${outOf(r.it)}) idx=${idxOf(r.it)} ${r.it.stateMutability ?? ''}`)
        continue
      }
      if (it.type === 'function' && it.stateMutability && exact.it.stateMutability !== it.stateMutability) {
        const fine = it.stateMutability === 'nonpayable' && ['view', 'pure'].includes(exact.it.stateMutability)
        console.log(`~~ mutability ${where}: consumer=${it.stateMutability} real=${exact.it.stateMutability}${fine ? ' (simulation-only, ok)' : ''}`)
        if (!fine && !(['view', 'pure'].includes(it.stateMutability) && ['view', 'pure'].includes(exact.it.stateMutability))) warn++
      }
      // struct field names (matter for viem object encoding)
      const cn = (it.inputs ?? []).map(compNames).join('|') + '>' + (it.outputs ?? []).map(compNames).join('|')
      const rn = (exact.it.inputs ?? []).map(compNames).join('|') + '>' + (exact.it.outputs ?? []).map(compNames).join('|')
      const hasTuple = JSON.stringify(it).includes('tuple')
      if (hasTuple && cn.replace(/[^{},|>]*(?=[{])/g, '') !== rn.replace(/[^{},|>]*(?=[{])/g, '')) {
        // compare only component names
        const strip = (s: string) => (s.match(/\{[^]*\}/g) ?? []).join('')
        if (strip(cn) !== strip(rn)) {
          warn++
          console.log(`~~ struct field names differ ${where}\n     consumer: ${strip(cn)}\n     real:     ${strip(rn)}`)
        }
      }
      ok++
    }
  }
}
console.log(`\nABI check: ok=${ok} mismatches=${bad} warnings=${warn}`)
process.exit(bad ? 1 : 0)
