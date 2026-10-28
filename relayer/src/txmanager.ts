/**
 * Relayer EOA transaction manager:
 *  - local nonce counter (initialised from the chain's `pending` count, serialized by a mutex, resynced on errors)
 *  - legacy (type 0) transactions — BSC prices by gasPrice; gas price is floored, bumped and hard-capped
 *  - background monitor: receipts, stuck-tx replacement (same nonce, bumped price), cancellation of txs whose signed
 *    deadline has passed (a 0-value self-transfer frees the nonce instead of mining a guaranteed revert)
 * State is in memory only (one machine, `min_machines_running = 1`). After a restart the nonce is re-read from the
 * chain; txs sent before the restart are still visible via GET /tx/:hash (status read from the RPC).
 */
import {
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type LocalAccount,
} from 'viem'
import { shortError } from './errors.js'

export type TxStatus = 'pending' | 'success' | 'reverted' | 'cancelled' | 'dropped'

export type TxRecord = {
  id: Hex // first hash
  hashes: Hex[] // all broadcast versions (original + replacements), newest last
  nonce: number
  to: Address
  data: Hex
  gas: bigint
  gasPrice: bigint
  sproutAccount: Address
  clientIp?: string
  /** Highest gas price at which gas × price is still covered by the signed fee (replacements never exceed it). */
  maxPrice?: bigint
  deadline: bigint // the batch's signed deadline (unix seconds)
  createdAt: number
  lastSentAt: number
  status: TxStatus
  minedHash?: Hex
  blockNumber?: bigint
  gasUsed?: bigint
  /** gasUsed × effective gas price of the mined version (what the relayer EOA paid). */
  costWei?: bigint
  cancelling?: boolean
  error?: string
}

export type TxManagerOptions = {
  maxGasPriceWei: bigint
  minGasPriceWei: bigint
  gasPriceBumpBps: number
  stuckAfterMs: number
  replaceBumpBps: number
  monitorIntervalMs: number
  onFinal?: (r: TxRecord) => void
  log?: (msg: string, extra?: Record<string, unknown>) => void
}

class Mutex {
  private p: Promise<void> = Promise.resolve()
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.p.then(fn, fn)
    this.p = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }
}

const bps = (v: bigint, b: number) => (v * BigInt(10_000 + Math.round(b))) / 10_000n
const NONCE_ERR = /nonce too low|already known|replacement transaction underpriced|nonce.*(too|expired)|known transaction/i

export class GasPriceTooHigh extends Error {}

export class TxManager {
  private nextNonce: number | undefined
  private mutex = new Mutex()
  private byHash = new Map<Hex, TxRecord>()
  private pending = new Map<Hex, TxRecord>() // id -> record
  private timer?: NodeJS.Timeout
  private ticking = false

  constructor(
    private pub: PublicClient,
    private signer: LocalAccount,
    private chain: Chain,
    private o: TxManagerOptions,
  ) {}

  get address(): Address {
    return this.signer.address
  }

  get pendingCount(): number {
    return this.pending.size
  }

  get(hash: Hex): TxRecord | undefined {
    return this.byHash.get(hash.toLowerCase() as Hex)
  }

  /** Current network gas price, floored at min, bumped, rejected above the cap. */
  async gasPrice(): Promise<bigint> {
    const net = await this.pub.getGasPrice()
    let p = bps(net, this.o.gasPriceBumpBps)
    if (p < this.o.minGasPriceWei) p = this.o.minGasPriceWei
    if (p > this.o.maxGasPriceWei) {
      throw new GasPriceTooHigh(`network gas price ${net} wei exceeds the relayer cap ${this.o.maxGasPriceWei} wei`)
    }
    return p
  }

  start() {
    if (this.timer) return
    this.timer = setInterval(() => void this.tick(), this.o.monitorIntervalMs)
    this.timer.unref()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = undefined
  }

  private async resyncNonce() {
    this.nextNonce = await this.pub.getTransactionCount({ address: this.signer.address, blockTag: 'pending' })
  }

  private async signAndSend(p: { nonce: number; to: Address; data: Hex; gas: bigint; gasPrice: bigint; value?: bigint }): Promise<Hex> {
    const raw = await this.signer.signTransaction!({
      type: 'legacy',
      chainId: this.chain.id,
      nonce: p.nonce,
      to: p.to,
      data: p.data,
      gas: p.gas,
      gasPrice: p.gasPrice,
      value: p.value ?? 0n,
    })
    return this.pub.sendRawTransaction({ serializedTransaction: raw })
  }

  /** Send a new transaction with the next nonce. Resolves once the RPC accepted it. */
  send(p: {
    to: Address
    data: Hex
    gas: bigint
    gasPrice: bigint
    sproutAccount: Address
    deadline: bigint
    clientIp?: string
    maxPrice?: bigint
  }): Promise<TxRecord> {
    return this.mutex.run(async () => {
      if (this.nextNonce === undefined) await this.resyncNonce()
      let attempt = 0
      for (;;) {
        const nonce = this.nextNonce!
        try {
          const hash = await this.signAndSend({ nonce, to: p.to, data: p.data, gas: p.gas, gasPrice: p.gasPrice })
          this.nextNonce = nonce + 1
          const now = Date.now()
          const rec: TxRecord = {
            id: hash.toLowerCase() as Hex,
            hashes: [hash.toLowerCase() as Hex],
            nonce,
            to: p.to,
            data: p.data,
            gas: p.gas,
            gasPrice: p.gasPrice,
            sproutAccount: p.sproutAccount,
            clientIp: p.clientIp,
            maxPrice: p.maxPrice,
            deadline: p.deadline,
            createdAt: now,
            lastSentAt: now,
            status: 'pending',
          }
          this.byHash.set(rec.id, rec)
          this.pending.set(rec.id, rec)
          this.o.log?.('tx sent', { hash, nonce, gasPrice: p.gasPrice.toString(), account: p.sproutAccount })
          return rec
        } catch (e) {
          const msg = shortError(e)
          // Unknown outcome or nonce clash: re-read the chain's pending nonce and retry once.
          this.nextNonce = undefined
          if (attempt++ === 0 && NONCE_ERR.test(msg)) {
            await this.resyncNonce()
            continue
          }
          throw e
        }
      }
    })
  }

  private finish(rec: TxRecord, status: TxStatus, receipt?: TransactionReceipt, error?: string) {
    rec.status = status
    if (receipt) {
      rec.minedHash = receipt.transactionHash.toLowerCase() as Hex
      rec.blockNumber = receipt.blockNumber
      rec.gasUsed = receipt.gasUsed
      rec.costWei = receipt.gasUsed * (receipt.effectiveGasPrice ?? rec.gasPrice)
    }
    if (error) rec.error = error
    this.pending.delete(rec.id)
    this.o.log?.('tx final', { id: rec.id, status, mined: rec.minedHash, error })
    this.o.onFinal?.(rec)
  }

  /** One monitor pass (exported for tests). */
  async tick(): Promise<void> {
    if (this.ticking || this.pending.size === 0) {
      this.prune()
      return
    }
    this.ticking = true
    try {
      const confirmedNonce = await this.pub.getTransactionCount({ address: this.signer.address, blockTag: 'latest' })
      for (const rec of [...this.pending.values()].sort((a, b) => a.nonce - b.nonce)) {
        let receipt: TransactionReceipt | undefined
        for (const h of [...rec.hashes].reverse()) {
          receipt = await this.pub.getTransactionReceipt({ hash: h }).catch(() => undefined)
          if (receipt) break
        }
        if (receipt) {
          const cancelTx = receipt.to?.toLowerCase() === this.signer.address.toLowerCase()
          this.finish(rec, cancelTx ? 'cancelled' : receipt.status === 'success' ? 'success' : 'reverted', receipt)
          continue
        }
        if (rec.nonce < confirmedNonce) {
          // Nonce consumed but none of our hashes has a receipt (RPC lag or an out-of-band tx). Re-check later once.
          if (Date.now() - rec.lastSentAt > 3 * this.o.stuckAfterMs) this.finish(rec, 'dropped', undefined, 'nonce consumed by another transaction')
          continue
        }
        if (Date.now() - rec.lastSentAt >= this.o.stuckAfterMs) await this.replace(rec).catch((e) => this.o.log?.('replace failed', { id: rec.id, err: shortError(e) }))
      }
    } catch (e) {
      this.o.log?.('monitor error', { err: shortError(e) })
    } finally {
      this.ticking = false
      this.prune()
    }
  }

  /** Re-broadcast a stuck tx at the same nonce with a higher gas price (or cancel it once its deadline passed). */
  private async replace(rec: TxRecord) {
    let net: bigint
    try {
      net = bps(await this.pub.getGasPrice(), this.o.gasPriceBumpBps)
    } catch {
      net = 0n
    }
    let price = bps(rec.gasPrice, this.o.replaceBumpBps)
    if (net > price) price = net
    const expired = BigInt(Math.floor(Date.now() / 1000)) > rec.deadline
    let cancel = expired || !!rec.cancelling
    // A replacement of the batch must stay within what the signed fee reimburses (gas × price <= gasFee), otherwise
    // the relayer pays the difference. A cancel is a 21k-gas self-transfer: only the global cap applies.
    let cap = this.o.maxGasPriceWei
    if (!cancel && rec.maxPrice !== undefined && rec.maxPrice < cap) {
      if (net > rec.maxPrice && bps(rec.gasPrice, 1000) > rec.maxPrice) {
        // The network now costs more than this batch's fee covers and we cannot bump within it: the tx would block
        // every later relayer nonce until its deadline. Free the nonce now (nothing executes; the user can re-sign).
        cancel = true
      } else cap = rec.maxPrice
    }
    if (price > cap) price = cap
    if (price < bps(rec.gasPrice, 1000)) {
      // Nodes require >= +10% to replace; if the cap does not allow that, keep waiting.
      this.o.log?.(cancel ? 'stuck tx at gas cap, cannot cancel yet' : 'stuck tx at fee-covered gas price, waiting', { id: rec.id })
      rec.lastSentAt = Date.now()
      return
    }
    await this.mutex.run(async () => {
      const hash = await this.signAndSend(
        cancel
          ? { nonce: rec.nonce, to: this.signer.address, data: '0x', gas: 21_000n, gasPrice: price }
          : { nonce: rec.nonce, to: rec.to, data: rec.data, gas: rec.gas, gasPrice: price },
      )
      const h = hash.toLowerCase() as Hex
      rec.hashes.push(h)
      rec.gasPrice = price
      rec.lastSentAt = Date.now()
      rec.cancelling = cancel
      this.byHash.set(h, rec)
      this.o.log?.(cancel ? 'tx cancel sent' : 'tx replaced', { id: rec.id, hash: h, nonce: rec.nonce, gasPrice: price.toString() })
    })
  }

  private prune() {
    const cutoff = Date.now() - 6 * 3600_000
    if (this.byHash.size < 5000) return
    for (const [h, r] of this.byHash) if (r.status !== 'pending' && r.createdAt < cutoff) this.byHash.delete(h)
  }
}
