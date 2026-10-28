/**
 * The forwarder state machine. One `tick()` = sync wallet → poll 1Click for open requests → match deliveries to
 * wallet txs → verify on BSC → shield transparent funds → send payouts (with stamp memo) → track confirmations.
 *
 *   registered ──1Click SUCCESS──▶ delivered ──wallet sees mined tx──▶ received ──proof+limits+balance──▶ sending ─▶ sent ─▶ confirmed
 *        │ REFUNDED/FAILED/expired/wrong recipient                         │ over limit / too small / ambiguous
 *        ▼                                                                 ▼
 *   refunded / failed / expired / rejected                            manual_review (funds stay in the wallet)
 *
 * Double-pay protection: a payout's stamp memo is unique (payout id + BSC tx hash). Before every send, and after any
 * crash or send error, the wallet's own tx list (which includes unmined txs it created) is searched for the stamp;
 * if it is there the payout is never sent again.
 */
import type { ProofChecker } from './bsc.js'
import type { Config } from './config.js'
import { checkPayout, fmtZec, windowUsage, type Limits } from './limits.js'
import { errMsg, log } from './log.js'
import { ZEC_ASSET, type OneClickClient } from './oneclick.js'
import { TERMINAL, type PayoutRequest, type Store } from './store.js'
import { HttpError, shieldQuoteRef, stampMemo, type NewRequest } from './validate.js'
import type { WalletAdapter, WalletTx } from './wallet/adapter.js'

export type Mode = 'idle' | 'starting' | 'active' | 'paused'

export interface EngineDeps {
  cfg: Pick<Config, 'maxPayoutZat' | 'maxDailyZat' | 'maxDailyCount' | 'feeReserveZat' | 'minPayoutZat' | 'sendFeeHeadroomZat' | 'expireGraceMs' | 'expectedTaddr'> &
    Partial<Pick<Config, 'requireBoundQuoteRef'>>
  store: Store
  wallet?: WalletAdapter
  oneClick: OneClickClient
  proof?: ProofChecker
  now?: () => number
  pauseSends?: boolean
}

const OPEN_1CLICK = new Set(['registered'])
const HEX32 = /^0x[0-9a-f]{64}$/
const SENDS_PER_TICK = 10
const POLL_EVERY_MS = 45_000
const BSC_HASH_WAIT_MS = 6 * 3600_000

const reverseHex = (h: string) => (h.match(/../g) ?? []).reverse().join('')

export class Engine {
  mode: Mode
  tAddress?: string
  lastError?: string
  lastTickAt?: number
  balance?: { shielded: string; transparent: string; total: string; height: number }
  private polledAt = new Map<string, number>()
  private ticking = false
  private now: () => number

  constructor(private d: EngineDeps) {
    this.mode = d.wallet ? 'starting' : 'idle'
    this.now = d.now ?? Date.now
  }

  private get limits(): Limits {
    return { maxPayoutZat: this.d.cfg.maxPayoutZat, maxDailyZat: this.d.cfg.maxDailyZat, maxDailyCount: this.d.cfg.maxDailyCount }
  }

  private set(r: PayoutRequest, status: PayoutRequest['status'], detail?: string) {
    if (r.status !== status) log.info('payout status', { id: r.id, quoteRef: r.quoteRef, from: r.status, to: status, detail })
    r.status = status
    r.statusDetail = detail
    r.updatedAt = this.now()
  }

  // ------------------------------------------------------------------------------------------- startup

  async start(): Promise<void> {
    const w = this.d.wallet
    if (!w) return
    try {
      await w.init()
      const t = await w.tAddress()
      this.tAddress = t
      if (this.d.cfg.expectedTaddr && this.d.cfg.expectedTaddr !== t) {
        this.mode = 'paused'
        this.lastError = `wallet t-address ${t} != FORWARDER_TADDR ${this.d.cfg.expectedTaddr} (wrong seed?) — paused`
        log.error(this.lastError)
        return
      }
      this.mode = 'active'
      log.info('forwarder wallet ready', { tAddress: t, wallet: w.kind })
    } catch (e) {
      this.lastError = `wallet start failed: ${errMsg(e)}`
      log.error(this.lastError)
    }
  }

  // ------------------------------------------------------------------------------------------- API

  register(n: NewRequest): { created: boolean; request: PayoutRequest } {
    if (this.mode === 'idle') throw new HttpError(503, 'shield forwarder is not configured (idle mode)')
    if (this.mode !== 'active' || !this.tAddress) throw new HttpError(503, `shield forwarder is ${this.mode}${this.lastError ? `: ${this.lastError}` : ''}`)
    const st = this.d.store
    const prev = st.get(n.quoteRef)
    if (prev) {
      if (prev.shieldedAddress !== n.shieldedAddress || prev.depositAddress !== n.depositAddress) {
        throw new HttpError(409, 'quoteRef is already registered with a different address')
      }
      if (n.bscTxHash && !prev.bscTxHash && prev.status === 'registered') prev.bscTxHash = n.bscTxHash
      if (n.expectedZat !== undefined && !prev.expectedZat) prev.expectedZat = n.expectedZat.toString()
      prev.updatedAt = this.now()
      st.save()
      return { created: false, request: prev }
    }
    // One 1Click deposit address = one payout. Without this, a second registration under a fresh quoteRef could
    // point the same delivery at another shielded address (the BSC proof would still stop it, but fail early).
    const dup = st.list().find((r) => r.depositAddress === n.depositAddress)
    if (dup) throw new HttpError(409, 'depositAddress is already registered under a different quoteRef')
    // Fail fast when the daily window (sent + in flight) cannot take this payout.
    if (n.expectedZat !== undefined) {
      const inflight = st
        .list()
        .filter((r) => ['registered', 'delivered', 'received'].includes(r.status))
        .map((r) => ({ at: this.now(), zat: r.payoutZat ?? r.receivedZat ?? r.expectedZat ?? '0', id: r.id }))
      const chk = checkPayout(n.expectedZat, [...st.state.daily, ...inflight], this.limits, this.now())
      if (!chk.ok) throw new HttpError(chk.permanent ? 400 : 429, chk.reason)
    }
    const r: PayoutRequest = {
      id: st.state.nextId++,
      quoteRef: n.quoteRef,
      depositAddress: n.depositAddress,
      shieldedAddress: n.shieldedAddress,
      addressKind: n.addressKind,
      source: n.source,
      vault: n.vault,
      expectedZat: n.expectedZat?.toString(),
      minZat: n.minZat?.toString(),
      deadline: n.deadline,
      bscTxHash: n.bscTxHash,
      regHeight: st.state.walletHeight,
      bound: shieldQuoteRef(n.depositAddress, n.shieldedAddress) === n.quoteRef,
      status: 'registered',
      createdAt: this.now(),
      updatedAt: this.now(),
      sendAttempts: 0,
    }
    st.put(r)
    st.save()
    log.info('payout registered', { id: r.id, quoteRef: r.quoteRef, source: r.source, kind: r.addressKind })
    return { created: true, request: r }
  }

  getRequest(quoteRef: string): PayoutRequest | undefined {
    return this.d.store.get(quoteRef)
  }

  attachTx(quoteRef: string, bscTxHash: string) {
    const r = this.d.store.get(quoteRef)
    if (!r) throw new HttpError(404, 'unknown quoteRef')
    const h = bscTxHash.toLowerCase()
    if (!HEX32.test(h)) throw new HttpError(400, 'bscTxHash must be a 0x… 32-byte hash')
    if (r.bscTxHash && r.bscTxHash !== h) throw new HttpError(409, 'a different BSC tx hash is already attached')
    if (r.bscProof || ['sending', 'sent', 'confirmed'].includes(r.status)) throw new HttpError(409, 'request already verified/forwarded')
    r.bscTxHash = h as `0x${string}`
    r.updatedAt = this.now()
    this.d.store.save()
    return r
  }

  /**
   * Operator action (ADMIN_TOKEN): put a manual_review request back in the queue after checking by hand that its
   * ZEC really arrived and that NO payout for it was broadcast. Limits and the BSC proof still apply.
   */
  requeue(quoteRef: string, confirm: { notSent: boolean; note?: string }) {
    const r = this.d.store.get(quoteRef)
    if (!r) throw new HttpError(404, 'unknown quoteRef')
    if (r.status !== 'manual_review') throw new HttpError(409, `only manual_review requests can be re-queued (is ${r.status})`)
    if (!confirm.notSent) throw new HttpError(400, 'confirmNotSent: true is required (you verified no payout tx exists)')
    if (!r.zcashInTxid || !r.receivedZat) throw new HttpError(409, 'request has no verified incoming Zcash tx; nothing to re-queue')
    this.unreserve(r)
    r.sendAttempts = 0
    r.zcashOutTxid = undefined
    r.sendStartedAt = undefined
    log.warn('admin re-queue', { id: r.id, quoteRef: r.quoteRef, note: confirm.note?.slice(0, 200) })
    this.set(r, 'received', 're-queued by operator')
    this.d.store.save()
    return r
  }

  // ------------------------------------------------------------------------------------------- loop

  async tick(): Promise<void> {
    if (this.ticking || !this.d.wallet) return
    if (this.mode === 'starting') await this.start()
    if (this.mode !== 'active' && this.mode !== 'paused') return
    if (this.mode === 'paused' && !this.tAddress) return
    this.ticking = true
    const st = this.d.store
    try {
      const w = this.d.wallet
      try {
        await w.sync()
        st.state.lastSyncAt = this.now()
        st.state.lastSyncError = undefined
      } catch (e) {
        st.state.lastSyncError = errMsg(e)
        log.warn('wallet sync failed', { error: st.state.lastSyncError })
      }
      let txs = await w.listTxs()
      await this.pollOneClick()
      this.matchDeliveries(txs)
      this.recoverSending(txs)
      await this.prepare()
      let bal = await w.balance()
      st.state.walletHeight = bal.height
      const waiting = st.list().some((r) => r.status === 'received')
      if (bal.transparentSpendable > 0n && (waiting || bal.transparentSpendable >= 10_000_000n) && this.now() - (st.state.lastShieldAt ?? 0) > 120_000) {
        try {
          const ids = await w.shield()
          st.state.lastShieldAt = this.now()
          log.info('shielded transparent funds', { zat: bal.transparentSpendable, txids: ids })
        } catch (e) {
          log.warn('shield failed', { error: errMsg(e) })
        }
      }
      if (this.mode === 'active' && !this.d.pauseSends) {
        txs = await w.listTxs()
        await this.sendReady(txs)
      }
      txs = await w.listTxs()
      this.trackSent(txs)
      bal = await w.balance()
      this.balance = { shielded: bal.shieldedSpendable.toString(), transparent: bal.transparentSpendable.toString(), total: bal.total.toString(), height: bal.height }
      st.prune(this.now())
      this.lastError = undefined
    } catch (e) {
      this.lastError = errMsg(e)
      log.error('tick failed', { error: this.lastError })
    } finally {
      this.lastTickAt = this.now()
      this.ticking = false
      try {
        st.save()
      } catch (e) {
        this.lastError = `state save failed: ${errMsg(e)}`
        log.error(this.lastError)
      }
    }
  }

  /** 1Click: confirm the quote pays our t-address in native ZEC, learn delivery txid/amount and the BSC tx hash. */
  async pollOneClick() {
    const now = this.now()
    for (const r of this.d.store.list()) {
      if (!OPEN_1CLICK.has(r.status)) continue
      if (now - (this.polledAt.get(r.quoteRef) ?? 0) < POLL_EVERY_MS) continue
      this.polledAt.set(r.quoteRef, now)
      let s
      try {
        s = await this.d.oneClick.status(r.depositAddress)
      } catch (e) {
        log.debug('1Click status failed', { id: r.id, error: errMsg(e) })
        continue
      }
      if (!s) {
        if (now - r.createdAt > 2 * 3600_000) this.set(r, 'rejected', 'depositAddress is not a known 1Click quote')
        continue
      }
      r.oneClickStatus = s.status
      if (s.recipient && this.tAddress && s.recipient !== this.tAddress) {
        this.set(r, 'rejected', "1Click quote recipient is not the forwarder's t-address")
        continue
      }
      if (s.destinationAsset && s.destinationAsset !== ZEC_ASSET) {
        this.set(r, 'rejected', `1Click quote destination ${s.destinationAsset} is not native ZEC`)
        continue
      }
      if (!r.deadline && s.deadline) r.deadline = s.deadline
      // 1Click's own record of the funding BSC tx wins over a hash attached through the API (an attached hash
      // that disagrees could only stall the request at the proof step, but 1Click is the better source).
      const h = s.originTxHashes.map((x) => x.toLowerCase()).find((x) => HEX32.test(x))
      if (h && r.bscTxHash !== h) {
        if (r.bscTxHash) log.warn('replacing attached BSC tx hash with 1Click origin hash', { id: r.id, attached: r.bscTxHash, oneClick: h })
        r.bscTxHash = h as `0x${string}`
      }
      if (s.status === 'REFUNDED') this.set(r, 'refunded', '1Click refunded the BSC deposit; nothing to forward')
      else if (s.status === 'FAILED') this.set(r, 'failed', '1Click swap FAILED')
      else if (s.status === 'SUCCESS' && (!s.recipient || s.recipient !== this.tAddress)) {
        this.set(r, 'manual_review', '1Click SUCCESS but the quote recipient is missing / not this wallet')
      } else if (s.status === 'SUCCESS') {
        r.zcashInTxid = s.destinationTxHashes[0]?.toLowerCase().replace(/^0x/, '')
        if (s.amountOut && /^\d+$/.test(s.amountOut)) r.receivedZat = s.amountOut
        this.set(r, 'delivered', r.zcashInTxid ? `1Click delivered in Zcash tx ${r.zcashInTxid}` : '1Click SUCCESS without destination tx hash (amount/time matching)')
      } else if (s.status === 'PENDING_DEPOSIT' && now > (r.deadline ? Date.parse(r.deadline) : r.createdAt + 86400_000) + this.d.cfg.expireGraceMs) {
        this.set(r, 'expired', 'no deposit before the 1Click deadline')
      }
    }
  }

  /** Link 1Click deliveries to mined wallet txs: by txid (either byte order), else by exact amount after creation. */
  matchDeliveries(txs: WalletTx[]) {
    const byId = new Map<string, WalletTx>()
    for (const t of txs) {
      byId.set(t.txid, t)
      byId.set(reverseHex(t.txid), t)
    }
    const all = this.d.store.list()
    const claimed = new Set((all.map((r) => r.zcashInTxid).filter(Boolean) as string[]).flatMap((x) => [x, reverseHex(x)]))
    const delivered = all.filter((r) => r.status === 'delivered')
    // ZEC already credited to earlier requests from the same Zcash tx (they left `delivered` in an earlier tick).
    const creditedBefore = new Map<string, bigint>()
    for (const r of all) {
      if (r.status === 'delivered' || !r.zcashInTxid || !['received', 'sending', 'sent', 'confirmed', 'manual_review'].includes(r.status)) continue
      const t = byId.get(r.zcashInTxid)
      if (!t) continue
      creditedBefore.set(t.txid, (creditedBefore.get(t.txid) ?? 0n) + BigInt(r.receivedZat ?? '0'))
    }
    // txid matching, with a sum check when several swaps share one Zcash tx
    const groups = new Map<string, PayoutRequest[]>()
    for (const r of delivered) {
      if (!r.zcashInTxid) continue
      const t = byId.get(r.zcashInTxid)
      if (!t || t.minedHeight === null) continue
      if (t.ownCreated) {
        this.set(r, 'manual_review', `1Click destination tx ${t.txid} is a tx this wallet created, not an incoming delivery`)
        continue
      }
      const g = groups.get(t.txid) ?? []
      g.push(r)
      groups.set(t.txid, g)
    }
    for (const [txid, g] of groups) {
      const t = byId.get(txid)!
      if (t.deltaZat === undefined || t.deltaZat <= 0n) {
        for (const r of g) this.set(r, 'manual_review', `wallet shows no positive amount for delivery tx ${txid}`)
        continue
      }
      for (const r of g) {
        if (!r.receivedZat && g.length === 1 && !creditedBefore.has(txid)) r.receivedZat = t.deltaZat.toString()
      }
      if (g.some((r) => !r.receivedZat)) {
        for (const r of g) this.set(r, 'manual_review', 'delivery amount unknown (several requests share the Zcash tx)')
        continue
      }
      // Every request must be covered: what earlier requests already took + this group must fit in the tx.
      const sum = g.reduce((a, r) => a + BigInt(r.receivedZat!), 0n) + (creditedBefore.get(txid) ?? 0n)
      if (sum > t.deltaZat) {
        for (const r of g) this.set(r, 'manual_review', `1Click amounts (${fmtZec(sum)}) exceed what tx ${txid} paid the wallet (${fmtZec(t.deltaZat)})`)
        continue
      }
      for (const r of g) {
        r.zcashInTxid = t.txid
        this.set(r, 'received', `received in ${t.txid} at height ${t.minedHeight}`)
      }
    }
    // amount fallback when 1Click gave no destination tx hash: an exact-amount, unclaimed, incoming, memo-less tx
    // mined no earlier than (registration height - 10).
    for (const r of delivered) {
      if (r.status !== 'delivered' || r.zcashInTxid || !r.receivedZat) continue
      const want = BigInt(r.receivedZat)
      const minH = r.regHeight !== undefined ? r.regHeight - 10 : 0
      const cands = txs.filter(
        (t) => t.minedHeight !== null && t.minedHeight >= minH && !t.ownCreated && t.deltaZat === want && !claimed.has(t.txid) && !t.memos.length,
      )
      if (cands.length === 1) {
        r.zcashInTxid = cands[0].txid
        claimed.add(cands[0].txid)
        this.set(r, 'received', `matched by amount to ${cands[0].txid}`)
      } else if (cands.length > 1 && this.now() - r.updatedAt > 3600_000) {
        this.set(r, 'manual_review', `ambiguous amount match (${cands.length} candidate txs)`)
      }
    }
  }

  private findStamp(txs: WalletTx[], stamp: string): WalletTx | undefined {
    return txs.find((t) => t.memos.some((m) => m.includes(stamp)))
  }

  /**
   * A request still in `sending` at the start of a tick means the process died (or was killed) inside `send`:
   * sends are awaited within one tick, so no live send can be in flight here. If the stamp is in the wallet the
   * payout exists ? `sent`. If it is NOT, we still cannot prove nothing was broadcast (the CLI may have been killed
   * between broadcast and DB update, or list-tx may not show the memo), so it goes to manual review and is never
   * re-sent automatically. Safety over liveness: an operator re-queues it after checking the wallet/explorer.
   */
  recoverSending(txs: WalletTx[]) {
    for (const r of this.d.store.list()) {
      if (r.status !== 'sending' || !r.stamp) continue
      const t = this.findStamp(txs, r.stamp)
      if (t) {
        r.zcashOutTxid = t.txid
        r.sentAt ??= this.now()
        this.set(r, 'sent', `recovered: stamp found in wallet tx ${t.txid}`)
      } else {
        // keep the daily reservation: the money may have left
        this.set(r, 'manual_review', 'interrupted send and no stamped tx in the wallet: verify on-chain, then re-queue (admin); never auto-resent')
      }
    }
  }

  private unreserve(r: PayoutRequest) {
    this.d.store.state.daily = this.d.store.state.daily.filter((x) => x.id !== r.id)
  }

  /** received → check BSC proof, compute the net payout, apply limits. Leaves eligible requests in `received`. */
  async prepare() {
    for (const r of this.d.store.list()) {
      if (r.status !== 'received') continue
      if (!r.bscTxHash) {
        if (this.now() - r.updatedAt > BSC_HASH_WAIT_MS) this.set(r, 'manual_review', 'no BSC tx hash for the stamp (1Click gave none, none attached)')
        else r.statusDetail = 'waiting for the BSC tx hash'
        continue
      }
      if (!r.bscProof) {
        if (!this.d.proof) {
          r.statusDetail = 'on-chain proof not configured (BSC_RPC_URL + SPROUT_TERMINAL/SPROUT_PAYOUTS)'
          continue
        }
        try {
          const p = await this.d.proof.check(r.bscTxHash, r)
          if (p.ok && p.event === 'CashOut' && this.d.cfg.requireBoundQuoteRef && !r.bound) {
            this.set(r, 'manual_review', 'REQUIRE_BOUND_QUOTEREF: CashOut quoteRef does not commit to the shielded address')
            continue
          }
          if (p.ok) r.bscProof = { event: p.event, emitter: p.emitter, block: p.block }
          else if (p.permanent) {
            this.set(r, 'manual_review', `on-chain proof failed: ${p.reason}`)
            continue
          } else {
            r.statusDetail = p.reason
            continue
          }
        } catch (e) {
          r.statusDetail = `BSC proof check error: ${errMsg(e)}`
          continue
        }
      }
      const got = BigInt(r.receivedZat ?? '0')
      const net = got - this.d.cfg.feeReserveZat
      if (net < this.d.cfg.minPayoutZat) {
        this.set(r, 'manual_review', `received ${fmtZec(got)} ZEC is below the minimum forwardable amount`)
        continue
      }
      if (r.minZat && got < BigInt(r.minZat)) log.warn('delivery below quote minAmountOut', { id: r.id, got, minZat: r.minZat })
      r.payoutZat = net.toString()
      r.stamp = stampMemo(r.id, r.bscTxHash)
      const chk = checkPayout(net, this.d.store.state.daily, this.limits, this.now())
      if (!chk.ok) {
        if (chk.permanent) this.set(r, 'manual_review', chk.reason)
        else r.statusDetail = `${chk.reason}; retry after ${chk.retryAt ? new Date(chk.retryAt).toISOString() : 'window frees'}`
        continue
      }
      r.statusDetail = 'ready to send'
    }
  }

  async sendReady(txs: WalletTx[]) {
    const w = this.d.wallet!
    let sent = 0
    for (const r of this.d.store.list()) {
      if (sent >= SENDS_PER_TICK) break
      if (r.status !== 'received' || r.statusDetail !== 'ready to send' || !r.payoutZat || !r.stamp) continue
      const amount = BigInt(r.payoutZat)
      const existing = this.findStamp(txs, r.stamp)
      if (existing) {
        r.zcashOutTxid = existing.txid
        this.set(r, 'sent', `stamp already in wallet tx ${existing.txid}`)
        continue
      }
      const chk = checkPayout(amount, this.d.store.state.daily, this.limits, this.now())
      if (!chk.ok) {
        r.statusDetail = chk.reason
        continue
      }
      const bal = await w.balance()
      if (bal.shieldedSpendable < amount + this.d.cfg.sendFeeHeadroomZat) {
        r.statusDetail = 'ready to send' // wait for shielded funds to confirm
        break // FIFO: do not let later (smaller) payouts overtake
      }
      // Every txid the wallet knows right before the send. list-tx reads only the local DB and nothing else runs
      // between here and the post-error listing (wallet calls are serialised), so any NEW txid after a failed
      // send can only have been created by that send. (Read before reserving: a failure here changes nothing.)
      const known = new Set((await w.listTxs()).map((t) => t.txid))
      // Reserve + persist BEFORE the irreversible step. If the state cannot be persisted, do not send at all.
      const prevDetail = r.statusDetail
      r.sendAttempts++
      r.sendStartedAt = this.now()
      this.d.store.state.daily.push({ at: this.now(), zat: r.payoutZat, id: r.id })
      this.set(r, 'sending', `sending ${fmtZec(amount)} ZEC`)
      try {
        this.d.store.save()
      } catch (e) {
        r.sendAttempts--
        this.unreserve(r)
        this.set(r, 'received', prevDetail)
        log.error('state save failed before send; not sending', { id: r.id, error: errMsg(e) })
        throw e
      }
      try {
        const txid = await w.send(r.shieldedAddress, amount, r.stamp)
        r.zcashOutTxid = txid
        r.sentAt = this.now()
        this.set(r, 'sent', `forwarded in ${txid}`)
        sent++
      } catch (e) {
        const msg = errMsg(e)
        let after: WalletTx[] | undefined
        try {
          after = await w.listTxs()
        } catch {
          after = undefined
        }
        const t = after && this.findStamp(after, r.stamp)
        const fresh = after?.filter((x) => !known.has(x.txid)) ?? []
        if (t) {
          r.zcashOutTxid = t.txid
          this.set(r, 'manual_review', `send reported an error but tx ${t.txid} carrying the stamp exists (check broadcast): ${msg}`)
        } else if (!after || fresh.length) {
          // cannot prove nothing was created: keep the reservation, never auto-resend
          if (fresh[0]) r.zcashOutTxid = fresh[0].txid
          this.set(r, 'manual_review', `send failed (${msg}) and ${after ? `the wallet now has new tx ${fresh.map((x) => x.txid).join(',')}` : 'the wallet tx list is unreadable'}: verify before re-queueing`)
        } else {
          this.unreserve(r)
          if (r.sendAttempts >= 3) this.set(r, 'manual_review', `send failed 3 times: ${msg}`)
          else {
            this.set(r, 'received', 'ready to send')
            r.statusDetail = 'ready to send'
            log.warn('send failed, will retry', { id: r.id, error: msg })
          }
        }
        this.d.store.save()
        break
      }
      this.d.store.save()
    }
  }

  trackSent(txs: WalletTx[]) {
    const byId = new Map(txs.map((t) => [t.txid, t]))
    for (const r of this.d.store.list()) {
      if (r.status !== 'sent' || !r.zcashOutTxid) continue
      const t = byId.get(r.zcashOutTxid)
      if (!t) continue
      if (t.minedHeight !== null) {
        r.outHeight = t.minedHeight
        r.confirmedAt = this.now()
        this.set(r, 'confirmed', `mined at height ${t.minedHeight}`)
      } else if (t.expired) {
        this.set(r, 'manual_review', `forward tx ${t.txid} expired unmined — do NOT resend blindly; verify then re-queue`)
      }
    }
  }

  // ------------------------------------------------------------------------------------------- views

  publicRequest(r: PayoutRequest) {
    return {
      id: r.id,
      quoteRef: r.quoteRef,
      status: r.status,
      statusDetail: r.statusDetail,
      addressKind: r.addressKind,
      shieldedAddress: r.shieldedAddress,
      depositAddress: r.depositAddress,
      source: r.source,
      bound: !!r.bound,
      expectedZat: r.expectedZat,
      receivedZat: r.receivedZat,
      payoutZat: r.payoutZat,
      oneClickStatus: r.oneClickStatus,
      bscTxHash: r.bscTxHash,
      bscProof: r.bscProof,
      zcashInTxid: r.zcashInTxid,
      zcashOutTxid: r.zcashOutTxid,
      stamp: r.stamp,
      createdAt: new Date(r.createdAt).toISOString(),
      updatedAt: new Date(r.updatedAt).toISOString(),
    }
  }

  status() {
    const counts: Record<string, number> = {}
    let owed = 0n
    for (const r of this.d.store.list()) {
      counts[r.status] = (counts[r.status] ?? 0) + 1
      if (['received', 'sending', 'manual_review'].includes(r.status) && r.payoutZat) owed += BigInt(r.payoutZat)
      else if (['received', 'manual_review'].includes(r.status) && r.receivedZat) owed += BigInt(r.receivedZat)
    }
    const u = windowUsage(this.d.store.state.daily, this.now())
    return {
      mode: this.mode,
      wallet: this.d.wallet?.kind ?? null,
      tAddress: this.tAddress ?? null,
      sendsPaused: !!this.d.pauseSends,
      lastTickAt: this.lastTickAt ? new Date(this.lastTickAt).toISOString() : null,
      lastSyncAt: this.d.store.state.lastSyncAt ? new Date(this.d.store.state.lastSyncAt).toISOString() : null,
      lastSyncError: this.d.store.state.lastSyncError ?? null,
      lastError: this.lastError ?? null,
      walletHeight: this.d.store.state.walletHeight ?? null,
      balanceZat: this.balance ?? null,
      owedZat: owed.toString(),
      requests: counts,
      openRequests: this.d.store.list().filter((r) => !TERMINAL.includes(r.status)).length,
      limits: {
        maxPayoutZec: fmtZec(this.d.cfg.maxPayoutZat),
        maxDailyZec: fmtZec(this.d.cfg.maxDailyZat),
        maxDailyPayouts: this.d.cfg.maxDailyCount,
        usedLast24h: { zec: fmtZec(u.zat), payouts: u.count },
        feeReserveZec: fmtZec(this.d.cfg.feeReserveZat),
      },
    }
  }
}
