import { type Hex, decodeErrorResult } from 'viem'
import { ACCOUNT_ERRORS_ABI, STD_ERRORS_ABI } from './abi.js'

/** Find the revert data inside a viem error chain (RPCs put it in different places). */
export function extractRevertData(err: unknown): Hex | undefined {
  let e: any = err
  for (let depth = 0; e && depth < 12; depth++) {
    const d = e.data
    if (typeof d === 'string' && /^0x[0-9a-fA-F]*$/.test(d) && d.length >= 10) return d as Hex
    if (d && typeof d === 'object' && typeof d.data === 'string' && /^0x[0-9a-fA-F]+$/.test(d.data)) return d.data as Hex
    e = e.cause
  }
  return undefined
}

/** Human-readable revert reason (decodes SproutAccount errors, nested CallFailed payloads, Error(string), Panic). */
export function describeRevert(data: Hex | undefined, depth = 0): string {
  if (!data || data === '0x') return 'reverted without reason'
  try {
    const d = decodeErrorResult({ abi: [...ACCOUNT_ERRORS_ABI, ...STD_ERRORS_ABI], data })
    if (d.errorName === 'CallFailed' && depth < 3) {
      const [index, ret] = d.args as readonly [bigint, Hex]
      return `call #${index} failed: ${describeRevert(ret, depth + 1)}`
    }
    if (d.errorName === 'Error') return String((d.args as readonly [string])[0])
    if (d.errorName === 'Panic') return `panic 0x${(d.args as readonly [bigint])[0].toString(16)}`
    const args = (d.args ?? []) as readonly unknown[]
    return args.length ? `${d.errorName}(${args.map(String).join(', ')})` : d.errorName
  } catch {
    return `reverted with ${data.slice(0, 10)}`
  }
}

/** Short message from any RPC error (never leaks the whole viem error dump). */
export function shortError(err: unknown): string {
  const e = err as { shortMessage?: string; details?: string; message?: string }
  const m = e?.shortMessage || e?.details || e?.message || String(err)
  // RPC URLs often embed API keys (…/v1/<key>): never echo them to clients or logs.
  return m.split('\n')[0].replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, '<url>').slice(0, 300)
}
