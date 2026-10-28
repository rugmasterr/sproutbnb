/** Request-body validation for POST /requests (relayer cash-outs and keeper mode-3/4 bridges share one shape). */
import { keccak256, toBytes } from 'viem'
import { checkShieldedDestination } from './zaddr.js'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface NewRequest {
  quoteRef: `0x${string}`
  depositAddress: `0x${string}`
  shieldedAddress: string
  addressKind: 'sapling' | 'unified'
  expectedZat?: bigint
  minZat?: bigint
  deadline?: string
  source: string
  vault?: `0x${string}`
  bscTxHash?: `0x${string}`
}

const HEX32 = /^0x[0-9a-fA-F]{64}$/
const ADDR = /^0x[0-9a-fA-F]{40}$/

function zat(v: unknown, field: string): bigint | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const s = String(v)
  if (!/^\d{1,16}$/.test(s)) throw new HttpError(400, `${field} must be an integer number of zatoshis`)
  return BigInt(s)
}

/**
 * Accepted body (aliases in brackets, for the keeper's/relayer's existing clients):
 *   quoteRef (bytes32 hex), depositAddress (1Click BSC deposit address), shieldedAddress [recipient],
 *   expectedZatoshi [expectedZat]?, minZat?, deadline?, source?, vault?, bscTxHash?
 */
export function parseNewRequest(body: unknown, maxPayoutZat: bigint, network: 'mainnet' | 'testnet' = 'mainnet'): NewRequest {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON object body required')
  const b = body as Record<string, unknown>
  const quoteRef = String(b.quoteRef ?? '')
  if (!HEX32.test(quoteRef)) throw new HttpError(400, 'quoteRef must be a 0x-prefixed 32-byte hex string')
  const depositAddress = String(b.depositAddress ?? '')
  if (!ADDR.test(depositAddress)) throw new HttpError(400, 'depositAddress must be the 1Click deposit address on BSC (0x…)')
  const shieldedAddress = String(b.shieldedAddress ?? b.recipient ?? '').trim()
  if (b.shieldedAddress && b.recipient && String(b.recipient).trim() !== shieldedAddress) throw new HttpError(400, 'shieldedAddress and recipient disagree')
  const dest = checkShieldedDestination(shieldedAddress, network)
  if (!dest.ok) throw new HttpError(400, `shieldedAddress: ${dest.reason}`)
  const expectedZat = zat(b.expectedZatoshi ?? b.expectedZat, 'expectedZatoshi')
  const minZat = zat(b.minZat, 'minZat')
  if (expectedZat !== undefined && expectedZat > maxPayoutZat) throw new HttpError(400, `shielded payouts are limited to ${Number(maxPayoutZat) / 1e8} ZEC each`)
  if (expectedZat !== undefined && expectedZat === 0n) throw new HttpError(400, 'expectedZatoshi must be positive')
  let deadline: string | undefined
  if (b.deadline !== undefined && b.deadline !== null && b.deadline !== '') {
    const d = new Date(String(b.deadline))
    if (Number.isNaN(d.getTime())) throw new HttpError(400, 'deadline must be an ISO timestamp')
    deadline = d.toISOString()
  }
  const vault = b.vault ? String(b.vault) : undefined
  if (vault && !ADDR.test(vault)) throw new HttpError(400, 'vault must be a 0x… address')
  const bscTxHash = b.bscTxHash ? String(b.bscTxHash) : undefined
  if (bscTxHash && !HEX32.test(bscTxHash)) throw new HttpError(400, 'bscTxHash must be a 0x… 32-byte hash')
  const source = typeof b.source === 'string' && /^[a-z0-9_-]{1,32}$/.test(b.source) ? b.source : 'api'
  return {
    quoteRef: quoteRef.toLowerCase() as `0x${string}`,
    depositAddress: depositAddress.toLowerCase() as `0x${string}`,
    shieldedAddress,
    addressKind: dest.kind,
    expectedZat,
    minZat,
    deadline,
    source,
    vault: vault?.toLowerCase() as `0x${string}` | undefined,
    bscTxHash: bscTxHash?.toLowerCase() as `0x${string}` | undefined,
  }
}

/**
 * Binding quoteRef: keccak256(utf8("sprout-shield:v1:" + lower(depositAddress) + ":" + shieldedAddress)).
 * When the site passes THIS value as `quoteRef` to SproutTerminal.sellAndBridge, the user's own signed BSC tx commits
 * to the shielded destination, so no later (or racing) registration can redirect the ZEC. With the legacy
 * quoteRef = keccak256(depositAddress) the destination is bound only first-come by whoever registers first.
 */
export function shieldQuoteRef(depositAddress: string, shieldedAddress: string): `0x${string}` {
  return keccak256(toBytes(`sprout-shield:v1:${depositAddress.toLowerCase()}:${shieldedAddress.trim()}`))
}

/** The memo stamp — "sprout-stamp:v1:<payoutId>:<bsc tx hash>" (≤ 512-byte Zcash memo). */
export function stampMemo(payoutId: number, bscTxHash: string): string {
  if (!Number.isSafeInteger(payoutId) || payoutId <= 0) throw new Error('bad payout id')
  if (!HEX32.test(bscTxHash)) throw new Error('bad bsc tx hash')
  const m = `sprout-stamp:v1:${payoutId}:${bscTxHash.toLowerCase()}`
  // ZIP-302 text memo: UTF-8, at most 512 bytes (zcash_protocol Memo::from_str enforces the same). Ours is ~100 bytes.
  if (new TextEncoder().encode(m).length > 512) throw new Error('memo too long')
  return m
}
