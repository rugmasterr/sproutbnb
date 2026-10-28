/**
 * Client helpers for Sprout's 1Click proxy (/api/oneclick/*) plus a small localStorage-backed tracker of the swaps
 * this browser started (so /zec and /account can show their status after a reload).
 */
export type SwapStatus =
  | 'PENDING_DEPOSIT'
  | 'KNOWN_DEPOSIT_TX'
  | 'INCOMPLETE_DEPOSIT'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'REFUNDED'
  | 'FAILED';

export const FINAL: SwapStatus[] = ['SUCCESS', 'REFUNDED', 'FAILED'];

export type Quote = {
  correlationId: string;
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  minAmountIn?: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut?: string;
  deadline?: string;
  timeWhenInactive?: string;
  timeEstimate?: number;
  refundFee?: string;
  withdrawFee?: string;
  signature?: string;
};

export class QuoteError extends Error {
  status: number;
  minUsd?: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    const m = /minimum swap amount is \$([\d,]+)/i.exec(message);
    if (m) this.minUsd = Number(m[1].replace(/,/g, ''));
  }
}

export async function requestQuote(p: {
  direction: 'in' | 'out';
  amount: bigint;
  recipient: string;
  refundTo: string;
  dry: boolean;
  swapType?: 'EXACT_INPUT' | 'FLEX_INPUT';
  signal?: AbortSignal;
}): Promise<Quote> {
  const r = await fetch('/api/oneclick/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ direction: p.direction, amount: p.amount.toString(), recipient: p.recipient, refundTo: p.refundTo, dry: p.dry, swapType: p.swapType }),
    signal: p.signal,
  });
  const j = (await r.json().catch(() => ({}))) as { message?: string; quote?: Quote; correlationId?: string; signature?: string };
  if (!r.ok || !j.quote) throw new QuoteError(j.message || `quote failed (${r.status})`, r.status);
  return { ...j.quote, correlationId: j.correlationId || '', signature: j.signature };
}

export type StatusResult = {
  status: SwapStatus;
  updatedAt?: string;
  originTx?: string[];
  destinationTx?: string[];
  amountOutFormatted?: string;
  refundedAmountFormatted?: string;
  depositedAmountFormatted?: string;
  refundReason?: string;
};

type TxDetail = { hash?: string; explorerUrl?: string };

export async function fetchStatus(depositAddress: string, depositMemo?: string): Promise<StatusResult | null> {
  const q = new URLSearchParams({ depositAddress });
  if (depositMemo) q.set('depositMemo', depositMemo);
  const r = await fetch(`/api/oneclick/status?${q}`, { cache: 'no-store' });
  if (r.status === 404) return { status: 'PENDING_DEPOSIT' };
  if (!r.ok) return null;
  const j = (await r.json().catch(() => null)) as {
    status?: SwapStatus;
    updatedAt?: string;
    swapDetails?: {
      originChainTxHashes?: TxDetail[];
      destinationChainTxHashes?: TxDetail[];
      amountOutFormatted?: string;
      refundedAmountFormatted?: string;
      depositedAmountFormatted?: string;
      refundReason?: string;
    };
  } | null;
  if (!j?.status) return null;
  const d = j.swapDetails || {};
  const hashes = (a?: TxDetail[]) => (a || []).map((x) => x.hash || '').filter(Boolean);
  return {
    status: j.status,
    updatedAt: j.updatedAt,
    originTx: hashes(d.originChainTxHashes),
    destinationTx: hashes(d.destinationChainTxHashes),
    amountOutFormatted: d.amountOutFormatted,
    refundedAmountFormatted: d.refundedAmountFormatted,
    depositedAmountFormatted: d.depositedAmountFormatted,
    refundReason: d.refundReason,
  };
}

export type RouteHealth = { ok: boolean; message?: string; minUsd?: number; timeEstimate?: number; amountIn?: string; amountOut?: string };
export type Routes = { in: RouteHealth; out: RouteHealth; checkedAt: string; authenticated: boolean };

export async function fetchRoutes(): Promise<Routes | null> {
  try {
    const r = await fetch('/api/oneclick/routes');
    return r.ok ? ((await r.json()) as Routes) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------------------------------- tracker

export type TrackedSwap = {
  depositAddress: string;
  depositMemo?: string;
  direction: 'in' | 'out';
  createdAt: number;
  deadline?: string;
  amountInFormatted: string;
  amountOutFormatted: string;
  recipient: string;
  refundTo: string;
  /** Final shielded/unified destination when routed through Sprout's forwarder. */
  shieldedTo?: string;
  correlationId?: string;
  signature?: string;
  status: SwapStatus;
  updatedAt?: number;
  originTx?: string[];
  destinationTx?: string[];
  bscTx?: string;
};

const LS_SWAPS = 'sprout.swaps.v1';
const EVT = 'sprout:swaps';

export function loadSwaps(): TrackedSwap[] {
  try {
    const v = JSON.parse(localStorage.getItem(LS_SWAPS) || '[]');
    return Array.isArray(v) ? (v as TrackedSwap[]) : [];
  } catch {
    return [];
  }
}

function saveSwaps(list: TrackedSwap[]) {
  try {
    localStorage.setItem(LS_SWAPS, JSON.stringify(list.slice(0, 40)));
  } catch {
    /* storage blocked */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVT));
}

export function upsertSwap(s: Partial<TrackedSwap> & { depositAddress: string }) {
  const list = loadSwaps();
  const i = list.findIndex((x) => x.depositAddress === s.depositAddress);
  if (i >= 0) list[i] = { ...list[i], ...s };
  else list.unshift(s as TrackedSwap);
  saveSwaps(list);
}

export function removeSwap(depositAddress: string) {
  saveSwaps(loadSwaps().filter((x) => x.depositAddress !== depositAddress));
}

export function onSwapsChange(fn: () => void): () => void {
  const h = () => fn();
  window.addEventListener(EVT, h);
  window.addEventListener('storage', h);
  return () => {
    window.removeEventListener(EVT, h);
    window.removeEventListener('storage', h);
  };
}

/** Nothing arrived and the quote's deadline has passed: the one-time address is no longer active. */
export function isExpired(s: Pick<TrackedSwap, 'status' | 'deadline'>, now = Date.now()): boolean {
  const d = s.deadline ? Date.parse(s.deadline) : NaN;
  return s.status === 'PENDING_DEPOSIT' && Number.isFinite(d) && now > d;
}

/** Whether the background tracker should still poll this swap (stops 1h after an untouched quote expires, or after 24h). */
export function shouldPoll(s: TrackedSwap, now = Date.now()): boolean {
  if (FINAL.includes(s.status) || now - s.createdAt > 86_400_000) return false;
  const d = s.deadline ? Date.parse(s.deadline) : NaN;
  if (s.status === 'PENDING_DEPOSIT' && Number.isFinite(d) && now > d + 3_600_000) return false;
  return true;
}

/** Tell 1Click about a BNB Chain deposit tx (best effort; detection works without it, this only speeds it up). */
export async function submitDeposit(txHash: string, depositAddress: string): Promise<void> {
  try {
    await fetch('/api/oneclick/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ txHash, depositAddress }),
    });
  } catch {
    /* best effort */
  }
}

/** Poll one tracked swap until it reaches a final state. Returns a stop function. */
export function pollSwap(depositAddress: string, depositMemo?: string, everyMs = 8000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    if (stopped) return;
    try {
      const s = await fetchStatus(depositAddress, depositMemo);
      if (s && !stopped) {
        const prev = loadSwaps().find((x) => x.depositAddress === depositAddress);
        // 1Click may not have seen a deposit we know we sent yet: never downgrade our own KNOWN_DEPOSIT_TX.
        const status = s.status === 'PENDING_DEPOSIT' && prev?.status === 'KNOWN_DEPOSIT_TX' ? prev.status : s.status;
        upsertSwap({ depositAddress, status, updatedAt: Date.now(), originTx: s.originTx, destinationTx: s.destinationTx, ...(s.amountOutFormatted ? { amountOutFormatted: s.amountOutFormatted } : {}) });
        const cur = loadSwaps().find((x) => x.depositAddress === depositAddress);
        if (FINAL.includes(status) || !cur || !shouldPoll(cur)) return;
      }
    } catch {
      /* network blip — keep polling */
    }
    if (!stopped) timer = setTimeout(tick, document.visibilityState === 'hidden' ? everyMs * 3 : everyMs);
  };
  tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

/** Decimal string → base units (no float rounding). */
export function parseUnitsSafe(v: string, decimals: number): bigint | null {
  const s = v.trim().replace(/,/g, '.');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) return null;
  try {
    return BigInt((i || '0') + f.padEnd(decimals, '0'));
  } catch {
    return null;
  }
}

export function formatUnitsTrim(v: bigint, decimals: number, maxFrac = 8): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const i = a / base;
  const f = (a % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  return `${neg ? '-' : ''}${i}${f ? '.' + f : ''}`;
}

/** ZIP-321 payment URI for wallets that scan QR codes. */
export const zcashUri = (address: string, amountZec: string) => `zcash:${address}?amount=${amountZec}`;
