/**
 * HTTP API (node:http, no framework). Binds to "::" so it is reachable over fly's private 6PN network as
 * http://sprout-zforward.internal:8080 — fly.toml exposes no public service.
 *
 *   GET  /healthz                         → 200 {ok, mode}                   (no auth; fly health check)
 *   GET  /status                          → aggregate status, no addresses    (no auth)
 *   GET  /v1/info                         → {tAddress, network, mode, limits} (Bearer FORWARDER_TOKEN)
 *   POST /requests | /v1/requests         ← {quoteRef, shieldedAddress|recipient, depositAddress, expectedZatoshi|expectedZat?, …}
 *                                         → 201 created / 200 idempotent / 409 conflict / 429 daily limit / 503 idle
 *   GET  /requests/:quoteRef | /v1/requests/:quoteRef   → the request record
 *   POST /v1/requests/:quoteRef/tx        ← {bscTxHash}
 *   POST /v1/admin/requests/:quoteRef/requeue ← {confirmNotSent: true, note?}   (Bearer ADMIN_TOKEN; 404 when unset)
 */
import { timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { Engine } from './engine.js'
import { errMsg, log } from './log.js'
import { HttpError, parseNewRequest } from './validate.js'

export interface ApiOptions {
  token?: string
  /** Separate operator token for /v1/admin/* (never given to the relayer/keeper). */
  adminToken?: string
  network: 'mainnet' | 'testnet'
  maxPayoutZat: bigint
}

function send(res: ServerResponse, code: number, body: unknown) {
  const s = JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(s)
}

async function readJson(req: IncomingMessage, limit = 16 * 1024): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const c of req) {
    size += (c as Buffer).length
    if (size > limit) throw new HttpError(413, 'body too large')
    chunks.push(c as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new HttpError(400, 'invalid JSON')
  }
}

export function authorized(header: string | undefined, token?: string): boolean {
  if (!token) return false
  const m = /^Bearer\s+(.+)$/i.exec(header ?? '')
  if (!m) return false
  const a = Buffer.from(m[1].trim())
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createApi(engine: Engine, o: ApiOptions): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const path = url.pathname.replace(/\/+$/, '') || '/'
    const method = req.method ?? 'GET'
    try {
      if (method === 'GET' && path === '/healthz') return send(res, 200, { ok: true, mode: engine.mode })
      if (method === 'GET' && path === '/status') {
        const s = engine.status()
        return send(res, 200, { service: 'sprout-zforward', ...s })
      }
      const adm = /^\/v1\/admin\/requests\/(0x[0-9a-fA-F]{64})\/requeue$/.exec(path)
      if (adm) {
        if (!o.adminToken) throw new HttpError(404, 'not found')
        if (!authorized(req.headers.authorization, o.adminToken)) throw new HttpError(401, 'unauthorized')
        if (method !== 'POST') throw new HttpError(405, 'POST only')
        const b = (await readJson(req)) as { confirmNotSent?: unknown; note?: unknown }
        const r = engine.requeue(adm[1], { notSent: b?.confirmNotSent === true, note: typeof b?.note === 'string' ? b.note : undefined })
        return send(res, 200, { ok: true, request: engine.publicRequest(r) })
      }
      if (!o.token) throw new HttpError(503, 'shield forwarder is not configured (FORWARDER_TOKEN missing) — idle mode')
      if (!authorized(req.headers.authorization, o.token)) throw new HttpError(401, 'unauthorized')

      if (method === 'GET' && path === '/v1/info') {
        const s = engine.status()
        if (!engine.tAddress) throw new HttpError(503, `forwarder wallet not ready (${engine.mode})`)
        return send(res, 200, { tAddress: engine.tAddress, network: o.network, mode: engine.mode, limits: s.limits })
      }
      if (method === 'POST' && (path === '/requests' || path === '/v1/requests')) {
        const n = parseNewRequest(await readJson(req), o.maxPayoutZat, o.network)
        const { created, request } = engine.register(n)
        return send(res, created ? 201 : 200, { ok: true, id: request.id, tAddress: engine.tAddress, request: engine.publicRequest(request) })
      }
      const m = /^(?:\/v1)?\/requests\/(0x[0-9a-fA-F]{64})(\/tx)?$/.exec(path)
      if (m) {
        if (method === 'GET' && !m[2]) {
          const r = engine.getRequest(m[1])
          if (!r) throw new HttpError(404, 'unknown quoteRef')
          return send(res, 200, engine.publicRequest(r))
        }
        if (method === 'POST' && m[2]) {
          const b = (await readJson(req)) as { bscTxHash?: string }
          const r = engine.attachTx(m[1], String(b?.bscTxHash ?? ''))
          return send(res, 200, { ok: true, request: engine.publicRequest(r) })
        }
      }
      throw new HttpError(404, 'not found')
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { ok: false, error: e.message })
      log.error('api error', { path, error: errMsg(e) })
      return send(res, 500, { ok: false, error: 'internal error' })
    }
  })
}
