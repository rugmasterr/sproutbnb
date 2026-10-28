/**
 * POST /shield-request — register "send the ZEC that arrives for this 1Click quote to this shielded address".
 *
 * Cash-out with "shielded" works like this (SPEC v2): the site gets a 1Click quote BNB(BSC) -> ZEC(Zcash) whose
 * recipient is Sprout's forwarder t-address, registers {quoteRef, shieldedAddress, depositAddress} here, then the user's
 * batch calls SproutTerminal.sellAndBridge(..., depositAddress, quoteRef). The forwarder sees the ZEC arrive (and the
 * on-chain CashOut event carrying quoteRef) and sends it on to the shielded/unified address with a stamp memo.
 *
 * This route validates everything it can before passing the record to the forwarder (FORWARDER_URL, bearer
 * FORWARDER_TOKEN), so the forwarder only ever sees well-formed requests:
 *  - quoteRef == keccak256("sprout-shield:v1:<lower deposit>:<shieldedAddress>") (binding; what the site sends) or the
 *    legacy keccak256(depositAddress); shieldedAddress is a mainnet Sapling or Unified address with a shielded receiver
 *  - (SHIELD_VERIFY_QUOTE, default on) the deposit address is a live 1Click quote: destination native ZEC, recipient ==
 *    FORWARDER_TADDR (when configured), amountOut <= SHIELD_MAX_ZEC (100 ZEC), not refunded/failed
 *  - a quoteRef can only ever be bound to one shielded address (first registration wins; idempotent re-sends OK)
 */
import type { Config } from './config.js'
import { shortError } from './errors.js'
import { HttpError, type ShieldRequest } from './validate.js'
import { zcashAddressInfo } from './zcash.js'

export const ZEC_ASSET = 'nep141:zec.omft.near'
const BAD_STATES = new Set(['REFUNDED', 'FAILED'])

type FetchLike = typeof fetch

export class ShieldService {
  private bound = new Map<string, string>() // quoteRef -> shieldedAddress
  constructor(
    private cfg: Config,
    private fetchImpl: FetchLike = fetch,
  ) {}

  private async verifyQuote(req: ShieldRequest) {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.cfg.oneClickJwt) headers['X-API-Key'] = this.cfg.oneClickJwt
    const url = `${this.cfg.oneClickBase}/status?depositAddress=${encodeURIComponent(req.depositAddress)}`
    let r: Response
    try {
      r = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(10_000) })
    } catch (e) {
      throw new HttpError(502, `could not reach 1Click to verify the quote: ${shortError(e)}`)
    }
    if (r.status === 404) throw new HttpError(400, 'depositAddress is not a known 1Click quote')
    if (!r.ok) throw new HttpError(502, `1Click status returned ${r.status}`)
    const j = (await r.json().catch(() => null)) as any
    const qr = j?.quoteResponse?.quoteRequest
    const quote = j?.quoteResponse?.quote
    if (!qr || !quote) throw new HttpError(502, '1Click status response missing quote details')
    if (qr.destinationAsset !== ZEC_ASSET) throw new HttpError(400, `quote destination is ${qr.destinationAsset}, not native ZEC`)
    const fwdT = await this.forwarderTaddr()
    if (fwdT && qr.recipient !== fwdT) {
      throw new HttpError(400, "quote recipient is not Sprout's shield forwarder t-address")
    }
    if (BAD_STATES.has(String(j.status))) throw new HttpError(400, `quote is ${j.status}`)
    let zats: bigint
    try {
      zats = BigInt(String(quote.amountOut ?? quote.minAmountOut ?? '0'))
    } catch {
      throw new HttpError(502, '1Click quote amountOut is not an integer')
    }
    if (zats > this.cfg.shieldMaxZats) {
      throw new HttpError(400, `shielded payouts are limited to ${Number(this.cfg.shieldMaxZats) / 1e8} ZEC each`)
    }
    let minZats: string | undefined
    try {
      if (quote.minAmountOut !== undefined) minZats = BigInt(String(quote.minAmountOut)).toString()
    } catch {
      /* optional */
    }
    return { status: String(j.status), amountOutZats: zats.toString(), minAmountOutZats: minZats, quoteDeadline: quote.deadline as string | undefined }
  }

  private fwdTaddrCache?: string
  /** FORWARDER_TADDR env wins; otherwise ask the forwarder (GET /v1/info -> {tAddress}), cached. */
  private async forwarderTaddr(): Promise<string | undefined> {
    if (this.cfg.forwarderTaddr) return this.cfg.forwarderTaddr
    if (this.fwdTaddrCache) return this.fwdTaddrCache
    try {
      const r = await this.fetchImpl(`${this.cfg.forwarderUrl}/v1/info`, {
        headers: { authorization: `Bearer ${this.cfg.forwarderToken}` },
        signal: AbortSignal.timeout(5_000),
      })
      const t = r.ok ? ((await r.json()) as { tAddress?: string }).tAddress : undefined
      const info = t ? zcashAddressInfo(t) : undefined
      if (info?.valid && info.kind === 'transparent') this.fwdTaddrCache = t
    } catch {
      /* fall through: cannot pin the recipient */
    }
    if (!this.fwdTaddrCache) throw new HttpError(503, 'shield forwarder t-address unknown (set FORWARDER_TADDR or expose /v1/info)')
    return this.fwdTaddrCache
  }

  async handle(req: ShieldRequest) {
    if (!this.cfg.forwarderUrl || !this.cfg.forwarderToken) {
      throw new HttpError(503, 'shielded payouts are not configured on this relayer (FORWARDER_URL / FORWARDER_TOKEN)')
    }
    const prev = this.bound.get(req.quoteRef)
    if (prev && prev !== req.shieldedAddress) throw new HttpError(409, 'this quote is already registered to a different shielded address')

    const verified = this.cfg.shieldVerifyQuote ? await this.verifyQuote(req) : undefined

    // Same request shape the keeper uses (keeper/src/forwarder.ts: POST /v1/requests), plus relayer context.
    const payload = {
      v: 1,
      source: 'relayer',
      kind: 'cashout',
      quoteRef: req.quoteRef,
      depositAddress: req.depositAddress,
      recipient: req.shieldedAddress,
      shieldedAddress: req.shieldedAddress,
      expectedZat: verified?.amountOutZats,
      minZat: verified?.minAmountOutZats,
      deadline: verified?.quoteDeadline ?? req.deadline,
      addressKind: req.addressKind,
      receivers: req.receivers,
      account: req.account,
      correlationId: req.correlationId,
      amountOutZec: req.amountOutZec,
      quoteDeadline: req.deadline,
      verified: verified ?? null,
      forwarderTaddr: this.cfg.forwarderTaddr ?? null,
      receivedAt: new Date().toISOString(),
    }
    let r: Response
    try {
      r = await this.fetchImpl(`${this.cfg.forwarderUrl}${this.cfg.forwarderRequestPath}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.forwarderToken}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (e) {
      throw new HttpError(502, `shield forwarder unreachable: ${shortError(e)}`)
    }
    if (r.status === 409) throw new HttpError(409, 'the forwarder already has a different registration for this quote')
    if (r.status === 429) throw new HttpError(429, 'the shield forwarder reached its daily limit; try again later or cash out to a t-address')
    if (r.status === 503) throw new HttpError(503, 'the shield forwarder is not ready; try again later')
    if (!r.ok) {
      const text = (await r.text().catch(() => '')).slice(0, 200)
      throw new HttpError(r.status >= 500 ? 502 : 400, `shield forwarder rejected the request (${r.status})${text ? `: ${text}` : ''}`)
    }
    this.bound.set(req.quoteRef, req.shieldedAddress)
    if (this.bound.size > 100_000) this.bound.clear()
    return {
      ok: true,
      quoteRef: req.quoteRef,
      depositAddress: req.depositAddress,
      addressKind: req.addressKind,
      verified: !!verified,
      maxZec: Number(this.cfg.shieldMaxZats) / 1e8,
    }
  }
}
