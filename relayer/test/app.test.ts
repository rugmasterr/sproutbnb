import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keccak256, getAddress } from 'viem'
import { createApp } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { ShieldService, ZEC_ASSET } from '../src/shield.js'
import { RateLimiter, originMatcher } from '../src/ratelimit.js'
import { saplingFromVectors } from './helpers.js'

const idleCfg = (extra: Record<string, string> = {}) => loadConfig({ ...extra } as NodeJS.ProcessEnv)

function idleApp(extra: Record<string, string> = {}, fetchImpl?: typeof fetch) {
  const cfg = idleCfg(extra)
  return createApp({ cfg, shield: new ShieldService(cfg, fetchImpl) })
}

const post = (body: unknown, origin?: string) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) },
  body: JSON.stringify(body),
})

test('config: missing env => idle with the three names reported', () => {
  const c = idleCfg()
  assert.deepEqual(c.missing, ['BSC_RPC_URL', 'RELAYER_PRIVATE_KEY', 'SPROUT_ACCOUNT_FACTORY'])
  assert.deepEqual(c.allowedOrigins, ['https://sproutbnb.cash', 'https://www.sproutbnb.cash', 'http://localhost:3000'])
  assert.equal(c.trustProxy, 'off') // not on Fly => proxy headers are not trusted
  assert.equal(idleCfg({ FLY_APP_NAME: 'sprout-relayer' }).trustProxy, 'fly')
  assert.equal(idleCfg({ TRUST_PROXY: 'xff' }).trustProxy, 'xff')
  assert.equal(c.revertBudgetWei, 10_000_000_000_000_000n)
  assert.equal(c.maxGasPriceWei, 3_000_000_000n)
  assert.equal(c.minGasPriceWei, 50_000_000n)
  const bad = idleCfg({ BSC_RPC_URL: 'https://x', RELAYER_PRIVATE_KEY: '0x1234', SPROUT_ACCOUNT_FACTORY: 'nope' })
  assert.deepEqual(bad.missing, [])
  assert.equal(bad.invalid.length, 2)
})

test('idle mode: /healthz 200, /relay + /quote-gas + /tx 503 not-configured', async () => {
  const app = idleApp()
  const h = await app.request('/healthz')
  assert.equal(h.status, 200)
  const hj: any = await h.json()
  assert.equal(hj.ok, true)
  assert.equal(hj.configured, false)
  assert.ok(hj.missing.includes('RELAYER_PRIVATE_KEY'))

  for (const [path, init] of [
    ['/relay', post({})],
    ['/quote-gas', post({})],
    ['/tx/0x' + '11'.repeat(32), undefined],
  ] as const) {
    const r = await app.request(path, init as RequestInit | undefined)
    assert.equal(r.status, 503, path)
    const j: any = await r.json()
    assert.equal(j.code, 'not-configured')
  }
  assert.equal((await app.request('/nope')).status, 404)
})

test('CORS: allow-list (wildcards only when configured); disallowed origins get no ACAO and POSTs are refused', async () => {
  const app = idleApp({ ALLOWED_ORIGINS: 'https://sproutbnb.cash,https://sprout-*.vercel.app,http://localhost:3000' })
  const pre = (origin: string) =>
    app.request('/relay', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } })
  for (const o of ['https://sproutbnb.cash', 'https://sprout-git-main-team.vercel.app', 'http://localhost:3000']) {
    const r = await pre(o)
    assert.equal(r.headers.get('access-control-allow-origin'), o, o)
  }
  for (const o of ['https://evil.example', 'https://sproutbnb.cash.evil.example', 'https://vercel.app.evil.example', 'https://evil.vercel.app', 'http://localhost:3001']) {
    const r = await pre(o)
    assert.equal(r.headers.get('access-control-allow-origin'), null, o)
    const p = await app.request('/relay', post({}, o))
    assert.equal(p.status, 403, o)
  }
  // custom list
  const app2 = idleApp({ ALLOWED_ORIGINS: 'https://a.example' })
  const r2 = await app2.request('/healthz', { headers: { origin: 'https://a.example' } })
  assert.equal(r2.headers.get('access-control-allow-origin'), 'https://a.example')
  // default list: no vercel wildcard (anyone can host a page on *.vercel.app)
  const def = await idleApp().request('/relay', post({}, 'https://attacker.vercel.app'))
  assert.equal(def.status, 403)
})

test('client IP: spoofed proxy headers are ignored unless that proxy is configured', async () => {
  // TRUST_PROXY off: every request shares the socket key ("unknown" here) no matter what headers say
  const off = idleApp({ RL_RELAY_PER_IP: '1' })
  const h = (ip: string) => ({ ...post({}), headers: { 'content-type': 'application/json', 'fly-client-ip': ip, 'x-forwarded-for': ip } })
  assert.equal((await off.request('/relay', h('198.51.100.1'))).status, 503)
  assert.equal((await off.request('/relay', h('198.51.100.2'))).status, 429)
  // xff mode uses the RIGHT-most entry (appended by the proxy), not the client-supplied left-most one
  const xff = idleApp({ RL_RELAY_PER_IP: '1', TRUST_PROXY: 'xff' })
  const x = (v: string) => ({ ...post({}), headers: { 'content-type': 'application/json', 'x-forwarded-for': v } })
  assert.equal((await xff.request('/relay', x('1.1.1.1, 203.0.113.5'))).status, 503)
  assert.equal((await xff.request('/relay', x('2.2.2.2, 203.0.113.5'))).status, 429)
})

test('shortError never echoes URLs (RPC API keys)', async () => {
  const { shortError } = await import('../src/errors.js')
  const m = shortError({ message: 'HTTP request failed. URL: https://bsc.example/v1/SECRETKEY123 status 500' })
  assert.ok(!m.includes('SECRETKEY123'), m)
  assert.match(m, /<url>/)
})

test('rate limiting returns 429 with retry-after', async () => {
  const app = idleApp({ RL_RELAY_PER_IP: '2', TRUST_PROXY: 'fly' })
  const send = () => app.request('/relay', { ...post({}), headers: { 'content-type': 'application/json', 'fly-client-ip': '203.0.113.9' } })
  assert.equal((await send()).status, 503)
  assert.equal((await send()).status, 503)
  const r = await send()
  assert.equal(r.status, 429)
  assert.ok(Number(r.headers.get('retry-after')) >= 1)
  // other IPs unaffected
  const other = await app.request('/relay', { ...post({}), headers: { 'content-type': 'application/json', 'fly-client-ip': '203.0.113.10' } })
  assert.equal(other.status, 503)

  const rl = new RateLimiter(1000)
  assert.equal(rl.take('k', 1, 0), 0)
  assert.ok(rl.take('k', 1, 10) > 0)
  assert.equal(rl.take('k', 1, 1001), 0)
  const m = originMatcher(['https://*.vercel.app'])
  assert.equal(m('https://vercel.app'), false)
  assert.equal(m(undefined), false)
})

const depositAddress = getAddress('0x76b4c56085ED136a8744D52bE956396624a730E8')
const quoteRef = keccak256(depositAddress)
const FWD_T = 't1forwarderPlaceholderNotARealAddr'

test('shield-request: 503 when forwarder not configured, 400 on bad input', async () => {
  const app = idleApp()
  const zs = saplingFromVectors()
  assert.equal((await app.request('/shield-request', post({ quoteRef, shieldedAddress: zs, depositAddress }))).status, 503)
  assert.equal((await app.request('/shield-request', post({ quoteRef, shieldedAddress: 'zs1nope', depositAddress }))).status, 400)
  assert.equal((await app.request('/shield-request', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status, 415)
})

test('shield-request: verifies the 1Click quote and forwards with the bearer token', async () => {
  const calls: { url: string; init?: RequestInit }[] = []
  let quoteRecipient = FWD_T
  let amountOut = '150000000' // 1.5 ZEC
  let fwdStatus = 200
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('/status?')) {
      return new Response(
        JSON.stringify({
          status: 'PENDING_DEPOSIT',
          quoteResponse: {
            quoteRequest: { destinationAsset: ZEC_ASSET, recipient: quoteRecipient },
            quote: { amountOut, deadline: '2026-10-27T12:00:00Z' },
          },
        }),
        { status: 200 },
      )
    }
    return new Response(JSON.stringify({ ok: true }), { status: fwdStatus })
  }) as typeof fetch

  const app = idleApp({ FORWARDER_URL: 'https://zf.internal/', FORWARDER_TOKEN: 'sekret', FORWARDER_TADDR: FWD_T }, fakeFetch)
  const zs = saplingFromVectors()
  const ok = await app.request('/shield-request', post({ quoteRef, shieldedAddress: zs, depositAddress, correlationId: 'c1' }, 'https://sproutbnb.cash'))
  assert.equal(ok.status, 200, await ok.clone().text())
  const j: any = await ok.json()
  assert.equal(j.ok, true)
  assert.equal(j.verified, true)
  const fwd = calls.find((c) => c.url === 'https://zf.internal/v1/requests')!
  assert.ok(fwd)
  assert.equal((fwd.init!.headers as Record<string, string>).authorization, 'Bearer sekret')
  const body = JSON.parse(String(fwd.init!.body))
  assert.equal(body.quoteRef, quoteRef)
  assert.equal(body.shieldedAddress, zs)
  assert.equal(body.verified.amountOutZats, '150000000')
  // keeper-compatible forwarder request shape (keeper/src/forwarder.ts)
  assert.equal(body.source, 'relayer')
  assert.equal(body.recipient, zs)
  assert.equal(body.expectedZat, '150000000')
  assert.equal(body.clientIp, undefined, 'client IP must not be linked to a shielded destination')

  // same quoteRef, different shielded address -> 409
  const u = 'u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf'
  assert.equal((await app.request('/shield-request', post({ quoteRef, shieldedAddress: u, depositAddress }))).status, 409)

  // quote to someone else's t-address -> 400; over 100 ZEC -> 400; forwarder down -> 502
  const dep2 = getAddress('0x00000000000000000000000000000000000000a1')
  const req2 = { quoteRef: keccak256(dep2), shieldedAddress: zs, depositAddress: dep2 }
  quoteRecipient = 't1someoneElse'
  assert.equal((await app.request('/shield-request', post(req2))).status, 400)
  quoteRecipient = FWD_T
  amountOut = (101n * 10n ** 8n).toString()
  assert.equal((await app.request('/shield-request', post(req2))).status, 400)
  amountOut = '1000'
  fwdStatus = 500
  assert.equal((await app.request('/shield-request', post(req2))).status, 502)
  fwdStatus = 200
  assert.equal((await app.request('/shield-request', post(req2))).status, 200)
})
