/**
 * NEAR Intents 1Click status client: GET {base}/status?depositAddress=… (openapi GetExecutionStatusResponse).
 * Fields the matcher relies on:
 *   status                                  KNOWN_DEPOSIT_TX | PENDING_DEPOSIT | INCOMPLETE_DEPOSIT | PROCESSING | SUCCESS | REFUNDED | FAILED
 *   quoteResponse.quoteRequest.recipient    must be the forwarder's t-address
 *   quoteResponse.quoteRequest.destinationAsset  must be nep141:zec.omft.near (native ZEC)
 *   quoteResponse.quote.amountOut / deadline
 *   swapDetails.amountOut                   exact zatoshis delivered (withdraw fee already deducted)
 *   swapDetails.destinationChainTxHashes[]  {hash, explorerUrl} — the Zcash txid(s) paying the t-address
 *   swapDetails.originChainTxHashes[]       {hash} — the BSC tx that funded the deposit (sellAndBridge / bridgeOut)
 */
export const ZEC_ASSET = 'nep141:zec.omft.near'

export interface OneClickStatus {
  status: string
  recipient?: string
  destinationAsset?: string
  quoteAmountOut?: string
  deadline?: string
  amountOut?: string
  destinationTxHashes: string[]
  originTxHashes: string[]
  refundedAmount?: string
}

export interface OneClickClient {
  status(depositAddress: string): Promise<OneClickStatus | null>
}

export function normalizeStatus(j: any): OneClickStatus {
  const qr = j?.quoteResponse?.quoteRequest ?? {}
  const q = j?.quoteResponse?.quote ?? {}
  const sd = j?.swapDetails ?? {}
  const hashes = (a: unknown) => (Array.isArray(a) ? a.map((x: any) => String(x?.hash ?? '')).filter(Boolean) : [])
  return {
    status: String(j?.status ?? 'UNKNOWN'),
    recipient: qr.recipient,
    destinationAsset: qr.destinationAsset,
    quoteAmountOut: q.amountOut !== undefined ? String(q.amountOut) : undefined,
    deadline: q.deadline ?? qr.deadline,
    amountOut: sd.amountOut !== undefined && sd.amountOut !== null ? String(sd.amountOut) : undefined,
    destinationTxHashes: hashes(sd.destinationChainTxHashes),
    originTxHashes: hashes(sd.originChainTxHashes),
    refundedAmount: sd.refundedAmount,
  }
}

export class HttpOneClick implements OneClickClient {
  constructor(
    private base: string,
    private jwt?: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async status(depositAddress: string): Promise<OneClickStatus | null> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (this.jwt) headers['X-API-Key'] = this.jwt
    const r = await this.fetchImpl(`${this.base}/status?depositAddress=${encodeURIComponent(depositAddress)}`, { headers, signal: AbortSignal.timeout(15_000) })
    if (r.status === 404) return null
    if (!r.ok) throw new Error(`1Click status HTTP ${r.status}`)
    return normalizeStatus(await r.json())
  }
}
