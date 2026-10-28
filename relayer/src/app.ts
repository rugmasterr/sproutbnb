/**
 * HTTP surface (Hono). Routes:
 *   GET  /healthz                 liveness + config summary (always 200)
 *   GET  /                        service info
 *   POST /quote-gas               {account, qx?, qy?, calls, deployed?} -> {gasFee, feeRecipient, deadline, ...}
 *   GET  /quote-gas?account=&qx=&qy=&calls=<json>   same, for convenience
 *   POST /relay                   {account, qx?, qy?, calls, deadline, gasFee, feeRecipient, sig} -> {txHash, id}
 *   GET  /tx/:hash  (alias GET /relay/:id)          -> {status: pending|success|failed, txHash, ...}
 *   POST /shield-request          {quoteRef, shieldedAddress, depositAddress, ...} -> forwarded to the shield forwarder
 */
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import { type Config, isRelayConfigured, isShieldConfigured } from './config.js'
import { RateLimiter, originMatcher } from './ratelimit.js'
import type { Relayer } from './relayer.js'
import type { ShieldService } from './shield.js'
import { HttpError, parseQuote, parseRelay, parseShield } from './validate.js'
import { shortError } from './errors.js'

export type AppDeps = {
  cfg: Config
  relayer?: Relayer // undefined => idle "not configured" mode
  shield: ShieldService
  version?: string
  getRemoteIp?: (c: Context) => string | undefined
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x)))

export function createApp(d: AppDeps) {
  const { cfg } = d
  const app = new Hono()
  const allowed = originMatcher(cfg.allowedOrigins)
  const rl = new RateLimiter()

  const ipOf = (c: Context): string => {
    // Only trust the header the configured proxy overwrites; the LEFT-most X-Forwarded-For entry is client-controlled.
    if (cfg.trustProxy === 'fly') {
      const fly = c.req.header('fly-client-ip')
      if (fly) return fly.trim().slice(0, 64)
    } else if (cfg.trustProxy === 'xff') {
      const xff = c.req.header('x-forwarded-for')
      if (xff) return (xff.split(',').pop() ?? '').trim().slice(0, 64) || 'unknown'
    }
    return d.getRemoteIp?.(c) ?? 'unknown'
  }

  const limit = (c: Context, key: string, n: number) => {
    const wait = rl.take(key, n)
    if (wait) {
      c.header('retry-after', String(wait))
      throw new HttpError(429, `rate limited; retry in ${wait}s`)
    }
  }

  app.use(
    '*',
    cors({
      origin: (origin) => (allowed(origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  )

  // Browsers always send Origin on cross-site POSTs: refuse state-changing requests from unlisted sites outright.
  app.use('*', async (c, next) => {
    const origin = c.req.header('origin')
    if (c.req.method === 'POST' && origin && !allowed(origin)) return c.json({ error: 'origin not allowed' }, 403)
    c.header('x-content-type-options', 'nosniff')
    c.header('cache-control', 'no-store')
    await next()
  })

  app.use('*', bodyLimit({ maxSize: 128 * 1024, onError: (c) => c.json({ error: 'request body too large' }, 413) }))

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json(json({ error: err.message, ...(err.extra ?? {}) }), err.status as 400)
    d.log?.('unhandled error', { path: c.req.path, err: shortError(err) })
    return c.json({ error: 'internal error' }, 500)
  })
  app.notFound((c) => c.json({ error: 'not found' }, 404))

  const notConfigured = () => {
    throw new HttpError(503, 'relayer not configured', {
      code: 'not-configured',
      missing: [...cfg.missing, ...cfg.invalid],
    })
  }

  const readBody = async (c: Context) => {
    const ct = c.req.header('content-type') ?? ''
    if (!ct.includes('application/json')) throw new HttpError(415, 'content-type must be application/json')
    try {
      return await c.req.json()
    } catch {
      throw new HttpError(400, 'body is not valid JSON')
    }
  }

  app.get('/healthz', (c) =>
    c.json({
      ok: true,
      service: 'sprout-relayer',
      version: d.version ?? 'dev',
      configured: !!d.relayer,
      chainId: cfg.chainId,
      relayer: d.relayer?.relayerAddress ?? null,
      accountFactory: cfg.accountFactory ?? null,
      missing: d.relayer ? [] : [...cfg.missing, ...cfg.invalid],
      shield: {
        configured: isShieldConfigured(cfg),
        verifyQuote: cfg.shieldVerifyQuote,
        forwarderTaddr: cfg.forwarderTaddr ?? null,
        maxZec: Number(cfg.shieldMaxZats) / 1e8,
      },
    }),
  )

  app.get('/', (c) =>
    c.json({
      service: 'sprout-relayer',
      about: 'Sprout (春笋) passkey relayer for BNB Chain — Zcash-native launchpad & terminal. Gas is reimbursed in-tx from the account, no markup.',
      configured: isRelayConfigured(cfg) && !!d.relayer,
      routes: ['GET /healthz', 'POST /quote-gas', 'POST /relay', 'GET /tx/:hash', 'POST /shield-request'],
    }),
  )

  const quoteHandler = async (c: Context, body: unknown) => {
    limit(c, `q:${ipOf(c)}`, cfg.rlQuotePerIp)
    if (!d.relayer) return notConfigured()
    limit(c, 'q:*', cfg.rlQuoteGlobal) // each quote costs several RPC calls incl. eth_estimateGas
    const q = parseQuote(body, cfg)
    return c.json(json(await d.relayer.quote(q)))
  }

  app.post('/quote-gas', async (c) => quoteHandler(c, await readBody(c)))
  app.get('/quote-gas', async (c) => {
    const p = c.req.query()
    let calls: unknown
    try {
      calls = JSON.parse(p.calls ?? '')
    } catch {
      throw new HttpError(400, 'calls must be a JSON array in the `calls` query parameter')
    }
    return quoteHandler(c, { account: p.account, qx: p.qx, qy: p.qy, calls })
  })

  app.post('/relay', async (c) => {
    const ip = ipOf(c)
    limit(c, `r:${ip}`, cfg.rlRelayPerIp)
    if (!d.relayer) return notConfigured()
    limit(c, 'r:*', cfg.rlRelayGlobal)
    const q = parseRelay(await readBody(c), cfg)
    limit(c, `ra:${q.account}`, cfg.rlRelayPerAccount)
    const out = await d.relayer.relay(q, ip)
    d.log?.('relayed', { ip, account: q.account, tx: out.txHash, deployed: out.deployed })
    return c.json(json(out))
  })

  const statusHandler = async (c: Context, h: string) => {
    limit(c, `s:${ipOf(c)}`, cfg.rlReadPerIp)
    if (!d.relayer) return notConfigured()
    if (!/^0x[0-9a-fA-F]{64}$/.test(h)) throw new HttpError(400, 'expected a 0x-prefixed 32-byte transaction hash')
    return c.json(json(await d.relayer.status(h.toLowerCase() as `0x${string}`)))
  }
  app.get('/tx/:hash', (c) => statusHandler(c, c.req.param('hash')))
  app.get('/relay/:id', (c) => statusHandler(c, c.req.param('id')))

  app.post('/shield-request', async (c) => {
    const ip = ipOf(c)
    limit(c, `z:${ip}`, cfg.rlShieldPerIp)
    const req = parseShield(await readBody(c))
    const out = await d.shield.handle(req)
    // Privacy: never log or forward the client IP next to a shielded destination.
    d.log?.('shield request', { quoteRef: req.quoteRef, kind: req.addressKind })
    return c.json(out)
  })

  return app
}
