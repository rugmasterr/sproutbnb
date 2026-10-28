import type { Key } from '@/i18n/dict';

export function fmtNum(n: number, opts: { max?: number; compact?: boolean } = {}): string {
  if (!Number.isFinite(n)) return '0';
  const { max = 2, compact = false } = opts;
  if (compact && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n);
}

/** Coin amounts (ZEC / BNB): adaptive precision, never scientific notation. */
export function fmtAmt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0';
  const a = Math.abs(n);
  if (a < 0.0001) return '<0.0001';
  if (a < 1) return fmtNum(n, { max: 4 });
  if (a < 1000) return fmtNum(n, { max: 3 });
  return fmtNum(n, { max: 1, compact: true });
}

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** Tiny prices like 0.0000000123 → "0.0₇123". */
export function fmtPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 0.001) return fmtNum(n, { max: 6 });
  const str = n.toFixed(20);
  const m = str.match(/^0\.(0+)(\d{1,4})/);
  if (!m) return n.toExponential(3);
  const zeros = m[1].length;
  const sub = String(zeros)
    .split('')
    .map((d) => SUB[Number(d)])
    .join('');
  return `0.0${sub}${m[2].replace(/0+$/, '') || '0'}`;
}

export const fmtPct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export const shortAddr = (a?: string | null, n = 4) => (a ? `${a.slice(0, 2 + n)}…${a.slice(-n)}` : '');

/** 18-decimal wei → JS number (display only). */
export const weiToNum = (wei: string | bigint | null | undefined) => {
  if (wei === null || wei === undefined || wei === '') return 0;
  const b = typeof wei === 'bigint' ? wei : BigInt(wei);
  const whole = b / 10n ** 18n;
  const frac = b % 10n ** 18n;
  return Number(whole) + Number(frac) / 1e18;
};

export const big = (v: string | null | undefined): bigint => {
  try {
    return v ? BigInt(v) : 0n;
  } catch {
    return 0n;
  }
};

type T = (k: Key, v?: Record<string, string | number>) => string;

export function timeAgo(ts: number | null | undefined, t: T, now = Date.now() / 1000): string {
  if (!ts) return '—';
  const d = Math.max(0, Math.floor(now - ts));
  if (d < 5) return t('time.just');
  if (d < 60) return t('time.s', { n: d });
  if (d < 3600) return t('time.m', { n: Math.floor(d / 60) });
  if (d < 86400) return t('time.h', { n: Math.floor(d / 3600) });
  return t('time.d', { n: Math.floor(d / 86400) });
}

/** UTF-8 byte length (Flap name limit is in bytes). */
export const byteLen = (s: string) => new TextEncoder().encode(s).length;
