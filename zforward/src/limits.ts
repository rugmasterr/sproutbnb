/**
 * Shielded payout limits (SPEC v2): ≤ 100 ZEC per payout, ≤ 1000 ZEC and ≤ 2000 payouts per day across Sprout.
 * "Per day" is a rolling 24-hour window over payouts that were sent or are being sent (stricter than a UTC day:
 * no burst of 2× the limit around midnight).
 */
import type { DailyEntry } from './store.js'

export interface Limits {
  maxPayoutZat: bigint
  maxDailyZat: bigint
  maxDailyCount: number
}

export const DAY_MS = 86_400_000

export function windowUsage(daily: DailyEntry[], now: number) {
  let zat = 0n
  let count = 0
  let oldest: number | undefined
  for (const d of daily) {
    if (now - d.at >= DAY_MS) continue
    zat += BigInt(d.zat)
    count++
    if (oldest === undefined || d.at < oldest) oldest = d.at
  }
  return { zat, count, oldest }
}

export type LimitCheck =
  | { ok: true }
  /** Will never pass automatically (single payout above the cap). */
  | { ok: false; permanent: true; reason: string }
  /** Daily window full; retry once older entries roll out (`retryAt`). */
  | { ok: false; permanent: false; reason: string; retryAt?: number }

export function checkPayout(amountZat: bigint, daily: DailyEntry[], lim: Limits, now: number): LimitCheck {
  if (amountZat > lim.maxPayoutZat) return { ok: false, permanent: true, reason: `payout ${fmtZec(amountZat)} ZEC exceeds the ${fmtZec(lim.maxPayoutZat)} ZEC per-payout limit` }
  if (amountZat > lim.maxDailyZat) return { ok: false, permanent: true, reason: `payout exceeds the daily limit` }
  const u = windowUsage(daily, now)
  const retryAt = u.oldest !== undefined ? u.oldest + DAY_MS : undefined
  if (u.count + 1 > lim.maxDailyCount) return { ok: false, permanent: false, reason: `daily payout count limit (${lim.maxDailyCount}) reached`, retryAt }
  if (u.zat + amountZat > lim.maxDailyZat) return { ok: false, permanent: false, reason: `daily volume limit (${fmtZec(lim.maxDailyZat)} ZEC) reached`, retryAt }
  return { ok: true }
}

export function fmtZec(zat: bigint): string {
  const neg = zat < 0n
  const a = neg ? -zat : zat
  const frac = (a % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '')
  return `${neg ? '-' : ''}${a / 100_000_000n}${frac ? '.' + frac : ''}`
}
