/**
 * On-chain proof that a payout request is real: the BSC tx that funded the 1Click deposit must contain a
 * SproutTerminal `CashOut` (user cash-out) or SproutPayouts `BridgedOut` (keeper mode 3/4) event, emitted by the
 * configured contract, with the same depositAddress and quoteRef. For BridgedOut the event's zcashAddress must also
 * equal the registered shielded address (the vault's on-chain payee) — the keeper is not trusted blindly.
 * For CashOut the shielded address is not on-chain; it is bound first-come by the authenticated relayer.
 */
import { createPublicClient, decodeEventLog, http, parseAbi, type Hex } from 'viem'

export const PROOF_ABI = parseAbi([
  'event CashOut(address indexed trader, uint256 bnbOut, address depositAddress, bytes32 quoteRef)',
  'event BridgedOut(address indexed vault, uint8 mode, uint256 bnbIn, address depositAddress, bytes32 quoteRef, string zcashAddress)',
])

export interface ProofLog {
  address: string
  topics: Hex[]
  data: Hex
}
export interface ProofReceipt {
  status: 'success' | 'reverted'
  blockNumber: bigint
  logs: ProofLog[]
}

export interface ProofInput {
  quoteRef: string
  depositAddress: string
  shieldedAddress: string
}

export type ProofResult =
  | { ok: true; event: 'CashOut' | 'BridgedOut'; emitter: string; block: string }
  | { ok: false; permanent: boolean; reason: string }

export function verifyReceipt(rc: ProofReceipt | null, req: ProofInput, emitters: { terminal?: string; payouts?: string }): ProofResult {
  if (!rc) return { ok: false, permanent: false, reason: 'BSC tx receipt not found yet' }
  if (rc.status !== 'success') return { ok: false, permanent: true, reason: 'BSC tx reverted' }
  const term = emitters.terminal?.toLowerCase()
  const pay = emitters.payouts?.toLowerCase()
  for (const lg of rc.logs) {
    const em = lg.address.toLowerCase()
    if (em !== term && em !== pay) continue
    let ev
    try {
      ev = decodeEventLog({ abi: PROOF_ABI, topics: lg.topics as [Hex, ...Hex[]], data: lg.data })
    } catch {
      continue
    }
    const a = ev.args as any
    if (String(a.quoteRef).toLowerCase() !== req.quoteRef.toLowerCase()) continue
    if (String(a.depositAddress).toLowerCase() !== req.depositAddress.toLowerCase()) {
      return { ok: false, permanent: true, reason: 'on-chain event depositAddress does not match the request' }
    }
    if (ev.eventName === 'CashOut' && em === term) return { ok: true, event: 'CashOut', emitter: em, block: rc.blockNumber.toString() }
    if (ev.eventName === 'BridgedOut' && em === pay) {
      if (String(a.zcashAddress).trim() !== req.shieldedAddress) {
        return { ok: false, permanent: true, reason: "BridgedOut zcashAddress differs from the registered shielded address" }
      }
      return { ok: true, event: 'BridgedOut', emitter: em, block: rc.blockNumber.toString() }
    }
  }
  return { ok: false, permanent: true, reason: 'no matching CashOut/BridgedOut event from Sprout contracts in the BSC tx' }
}

export interface ProofChecker {
  check(bscTxHash: `0x${string}`, req: ProofInput): Promise<ProofResult>
}

export class BscProof implements ProofChecker {
  private client
  constructor(
    rpcUrl: string,
    private emitters: { terminal?: string; payouts?: string },
  ) {
    this.client = createPublicClient({ transport: http(rpcUrl, { timeout: 15_000, retryCount: 1 }) })
  }
  async check(hash: `0x${string}`, req: ProofInput): Promise<ProofResult> {
    let rc: ProofReceipt | null = null
    try {
      rc = (await this.client.getTransactionReceipt({ hash })) as unknown as ProofReceipt
    } catch (e) {
      if (/could not be found|not found/i.test(String((e as Error).message))) rc = null
      else throw e
    }
    return verifyReceipt(rc, req, this.emitters)
  }
}

export const NoProof: ProofChecker = {
  async check(_h, _r) {
    return { ok: true, event: 'CashOut', emitter: 'proof-disabled', block: '0' }
  },
}
