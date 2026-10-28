/**
 * Persistent state: one JSON file on the fly volume, written atomically (write tmp → fsync → rename).
 * Volumes are small (≤ 2000 payouts/day); terminal records older than RETAIN_DAYS are pruned.
 */
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export type RequestStatus =
  | 'registered' // waiting for 1Click to deliver
  | 'delivered' // 1Click SUCCESS, Zcash txid known, waiting for the wallet to see it mined
  | 'received' // wallet has the funds; waiting for BSC proof / bsc tx hash / limits / shielded balance
  | 'sending' // a send was started (crash-safety marker)
  | 'sent' // forwarded, waiting for the shielded tx to be mined
  | 'confirmed' // forwarded tx mined
  | 'refunded' // 1Click refunded the BSC side; nothing arrived
  | 'failed' // 1Click FAILED
  | 'expired' // never delivered
  | 'rejected' // quote does not pay the forwarder / wrong asset / proof mismatch
  | 'manual_review' // funds are here but something needs a human (over limit, ambiguous send, too small)

export const TERMINAL: RequestStatus[] = ['confirmed', 'refunded', 'failed', 'expired', 'rejected']

export interface PayoutRequest {
  /** Sequential payout id, used in the stamp memo. */
  id: number
  quoteRef: `0x${string}`
  depositAddress: `0x${string}`
  shieldedAddress: string
  addressKind: 'sapling' | 'unified'
  source: string
  vault?: string
  expectedZat?: string
  minZat?: string
  deadline?: string
  status: RequestStatus
  statusDetail?: string
  createdAt: number
  updatedAt: number
  oneClickStatus?: string
  bscTxHash?: `0x${string}`
  bscProof?: { event: 'CashOut' | 'BridgedOut'; emitter: string; block: string }
  zcashInTxid?: string
  receivedZat?: string
  payoutZat?: string
  stamp?: string
  /** Wallet height when the request was registered (lower bound for amount-fallback matching). */
  regHeight?: number
  /** quoteRef is the binding commitment keccak256("sprout-shield:v1:<deposit>:<shieldedAddress>"). */
  bound?: boolean
  sendAttempts: number
  sendStartedAt?: number
  zcashOutTxid?: string
  sentAt?: number
  confirmedAt?: number
  outHeight?: number
}

export interface DailyEntry {
  at: number
  zat: string
  id: number
}

export interface State {
  v: 1
  nextId: number
  requests: Record<string, PayoutRequest>
  /** Rolling 24h ledger of payouts that were sent (or are being sent). */
  daily: DailyEntry[]
  lastShieldAt?: number
  lastSyncAt?: number
  lastSyncError?: string
  walletHeight?: number
}

const empty = (): State => ({ v: 1, nextId: 1, requests: {}, daily: [] })

export class Store {
  state: State
  constructor(private file?: string) {
    this.state = empty()
    if (file && existsSync(file)) {
      const j = JSON.parse(readFileSync(file, 'utf8')) as State
      if (j.v !== 1) throw new Error(`unsupported state version ${j.v}`)
      this.state = { ...empty(), ...j }
    }
  }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    const fd = openSync(tmp, 'w')
    try {
      writeFileSync(fd, JSON.stringify(this.state, null, 1)) // loops until fully written (writeSync may be partial)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(tmp, this.file)
    // POSIX: the rename is only durable once the directory entry is flushed too. (Not supported on Windows; ignore.)
    try {
      const dfd = openSync(dirname(this.file), 'r')
      try {
        fsyncSync(dfd)
      } finally {
        closeSync(dfd)
      }
    } catch {
      /* best effort */
    }
  }

  get(quoteRef: string): PayoutRequest | undefined {
    return this.state.requests[quoteRef.toLowerCase()]
  }

  list(): PayoutRequest[] {
    return Object.values(this.state.requests).sort((a, b) => a.id - b.id)
  }

  put(r: PayoutRequest) {
    this.state.requests[r.quoteRef.toLowerCase()] = r
  }

  prune(now: number, retainMs = 30 * 86400_000) {
    for (const [k, r] of Object.entries(this.state.requests)) {
      if (TERMINAL.includes(r.status) && now - r.updatedAt > retainMs) delete this.state.requests[k]
    }
    this.state.daily = this.state.daily.filter((d) => now - d.at < 86400_000)
  }
}
