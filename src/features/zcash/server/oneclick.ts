/**
 * Server-only 1Click client. Fixed upstream base URL (clients can never choose it), optional partner JWT,
 * hard timeouts, tiny in-memory caches and a per-IP rate limit for quote creation.
 */
import { isAddress } from 'viem';
import { isValidZcashAddress } from '../address';
import {
  ASSET_BNB,
  ASSET_ZEC,
  CASHOUT_DEADLINE_MIN,
  DEPOSIT_DEADLINE_MIN,
  ONECLICK_BASE,
  SLIPPAGE_BPS,
} from '../constants';

export type Upstream = { status: number; body: unknown };

function headers(): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' };
  const jwt = (process.env.ONECLICK_JWT || '').trim();
  if (jwt) h['X-API-Key'] = jwt;
  return h;
}

export const authenticated = () => Boolean((process.env.ONECLICK_JWT || '').trim());

export async function upstream(path: '/tokens' | '/quote' | '/status' | '/deposit/submit', init?: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string>; timeoutMs?: number }): Promise<Upstream> {
  const url = new URL(ONECLICK_BASE + path);
  for (const [k, v] of Object.entries(init?.query || {})) url.searchParams.set(k, v);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 12_000);
  try {
    const r = await fetch(url, {
      method: init?.method || 'GET',
      headers: headers(),
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    const text = await r.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text.slice(0, 300) };
    }
    return { status: r.status, body };
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError';
    return { status: aborted ? 504 : 502, body: { message: aborted ? 'upstream timeout' : 'upstream unreachable' } };
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------------------------------- tokens / prices

export type OneClickToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  price?: number;
  priceUpdatedAt?: string;
  contractAddress?: string;
};

let tokenCache: { at: number; tokens: OneClickToken[] } | null = null;
let tokenInflight: Promise<OneClickToken[] | null> | null = null;

/** All 1Click tokens, cached for 60 s (prices refresh about once a minute upstream). */
export async function getTokens(): Promise<OneClickToken[] | null> {
  if (tokenCache && Date.now() - tokenCache.at < 60_000) return tokenCache.tokens;
  if (tokenInflight) return tokenInflight;
  tokenInflight = (async () => {
    const r = await upstream('/tokens', { timeoutMs: 10_000 });
    if (r.status === 200 && Array.isArray(r.body)) {
      tokenCache = { at: Date.now(), tokens: r.body as OneClickToken[] };
      return tokenCache.tokens;
    }
    return tokenCache?.tokens ?? null; // serve stale on failure
  })().finally(() => {
    tokenInflight = null;
  });
  return tokenInflight;
}

export async function getPrices(): Promise<{ zecUsd: number | null; bnbUsd: number | null; updatedAt: string | null }> {
  const t = await getTokens();
  const zec = t?.find((x) => x.assetId === ASSET_ZEC);
  const bnb = t?.find((x) => x.assetId === ASSET_BNB);
  const ok = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
  return {
    zecUsd: ok(zec?.price),
    bnbUsd: ok(bnb?.price),
    updatedAt: zec?.priceUpdatedAt || bnb?.priceUpdatedAt || null,
  };
}

// ------------------------------------------------------------------------------------------- quotes

export type Direction = 'in' | 'out';
export type QuoteInput = {
  direction: Direction;
  amount: string;
  recipient: string;
  refundTo: string;
  dry: boolean;
  swapType: 'EXACT_INPUT' | 'FLEX_INPUT';
};

/** Validate an untrusted client body. Returns an error string or the normalised input. */
export function parseQuoteInput(raw: unknown): QuoteInput | string {
  if (!raw || typeof raw !== 'object') return 'invalid body';
  const b = raw as Record<string, unknown>;
  const direction = b.direction;
  if (direction !== 'in' && direction !== 'out') return 'direction must be "in" (ZEC→BNB) or "out" (BNB→ZEC)';
  const amount = typeof b.amount === 'string' ? b.amount.trim() : '';
  if (!/^[1-9]\d{0,29}$/.test(amount)) return 'amount must be a positive integer string in base units';
  const recipient = typeof b.recipient === 'string' ? b.recipient.trim() : '';
  const refundTo = typeof b.refundTo === 'string' ? b.refundTo.trim() : '';
  if (direction === 'in') {
    if (!isAddress(recipient)) return 'recipient must be a BSC address';
    if (!isValidZcashAddress(refundTo, ['t'])) return 'refundTo must be a transparent Zcash address (t1… / t3…)';
  } else {
    if (!isValidZcashAddress(recipient, ['t'])) return 'recipient must be a transparent Zcash address (t1… / t3…)';
    if (!isAddress(refundTo)) return 'refundTo must be a BSC address';
  }
  const swapType = b.swapType === 'FLEX_INPUT' ? 'FLEX_INPUT' : 'EXACT_INPUT';
  return { direction, amount, recipient, refundTo, dry: b.dry !== false, swapType };
}

export function buildQuoteRequest(q: QuoteInput) {
  const minutes = q.direction === 'in' ? DEPOSIT_DEADLINE_MIN : CASHOUT_DEADLINE_MIN;
  return {
    dry: q.dry,
    swapType: q.swapType,
    slippageTolerance: SLIPPAGE_BPS,
    originAsset: q.direction === 'in' ? ASSET_ZEC : ASSET_BNB,
    depositType: 'ORIGIN_CHAIN',
    destinationAsset: q.direction === 'in' ? ASSET_BNB : ASSET_ZEC,
    amount: q.amount,
    refundTo: q.refundTo,
    refundType: 'ORIGIN_CHAIN',
    recipient: q.recipient,
    recipientType: 'DESTINATION_CHAIN',
    deadline: new Date(Date.now() + minutes * 60_000).toISOString(),
    referral: 'sprout',
    quoteWaitingTimeMs: 3000,
  };
}

export async function requestQuote(q: QuoteInput): Promise<Upstream> {
  return upstream('/quote', { method: 'POST', body: buildQuoteRequest(q), timeoutMs: 15_000 });
}

// ------------------------------------------------------------------------------------------- route health

/** Placeholder addresses for DRY quotes only (dry quotes never create a deposit address; nothing is sent). */
const DRY_EVM = '0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf';
/** Valid-checksum t1 address over the constant hash 0x11×20; used only as a dry-quote placeholder. */
const DRY_T = 't1KRqwQhktLV4BjbNLiuH6pb3AMoszZKcQB';

export type RouteHealth = {
  ok: boolean;
  message?: string;
  minUsd?: number;
  amountIn?: string;
  amountOut?: string;
  amountInUsd?: string;
  amountOutUsd?: string;
  timeEstimate?: number;
};

let routeCache: { at: number; v: { in: RouteHealth; out: RouteHealth; checkedAt: string; authenticated: boolean } } | null = null;

function toHealth(r: Upstream): RouteHealth {
  const b = (r.body || {}) as { message?: string; quote?: Record<string, unknown> };
  if ((r.status === 200 || r.status === 201) && b.quote) {
    const q = b.quote as Record<string, string | number>;
    return {
      ok: true,
      amountIn: String(q.amountInFormatted ?? ''),
      amountOut: String(q.amountOutFormatted ?? ''),
      amountInUsd: String(q.amountInUsd ?? ''),
      amountOutUsd: String(q.amountOutUsd ?? ''),
      timeEstimate: Number(q.timeEstimate) || undefined,
    };
  }
  const message = typeof b.message === 'string' ? b.message : `HTTP ${r.status}`;
  const m = /minimum swap amount is \$([\d,]+)/i.exec(message);
  return { ok: false, message, minUsd: m ? Number(m[1].replace(/,/g, '')) : undefined };
}

/**
 * Live availability of both Sprout routes via dry quotes sized at ~$1,200 (1Click currently enforces a temporary
 * minimum). Cached for 2 minutes.
 */
export async function routeHealth() {
  if (routeCache && Date.now() - routeCache.at < 120_000) return routeCache.v;
  const p = await getPrices();
  const usd = 1200;
  const zecUnits = p.zecUsd ? BigInt(Math.round((usd / p.zecUsd) * 1e8)) : 100_000_000n;
  const bnbUnits = p.bnbUsd ? BigInt(Math.round((usd / p.bnbUsd) * 1e6)) * 10n ** 12n : 2n * 10n ** 18n;
  const [rin, rout] = await Promise.all([
    requestQuote({ direction: 'in', amount: zecUnits.toString(), recipient: DRY_EVM, refundTo: DRY_T, dry: true, swapType: 'EXACT_INPUT' }),
    requestQuote({ direction: 'out', amount: bnbUnits.toString(), recipient: DRY_T, refundTo: DRY_EVM, dry: true, swapType: 'EXACT_INPUT' }),
  ]);
  const v = { in: toHealth(rin), out: toHealth(rout), checkedAt: new Date().toISOString(), authenticated: authenticated() };
  routeCache = { at: Date.now(), v };
  return v;
}

// ------------------------------------------------------------------------------------------- rate limit

const buckets = new Map<string, { n: number; reset: number }>();
export function rateLimited(ip: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.reset < now) {
    buckets.set(ip, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return false;
  }
  b.n += 1;
  return b.n > limit;
}

/**
 * Best-effort client IP for rate limiting. Platform-set headers first (Vercel / Fly overwrite these); for a generic
 * proxy chain the RIGHTMOST x-forwarded-for hop is the one our proxy appended (the leftmost is client-controlled).
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  const xff = (h.get('x-forwarded-for') || '').split(',').map((s) => s.trim()).filter(Boolean);
  return (
    h.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
    h.get('fly-client-ip')?.trim() ||
    h.get('x-real-ip')?.trim() ||
    xff[xff.length - 1] ||
    'local'
  ).slice(0, 64);
}

/** Process-wide cap on LIVE quotes (each creates a 1Click deposit address under Sprout's referral / partner key). */
export const globalLiveQuoteLimited = () => rateLimited('*:live', 240);

// ------------------------------------------------------------------------------------------- deposit submit

/** POST /v0/deposit/submit — optional hint that a deposit tx was sent (speeds up detection; harmless if redundant). */
export async function submitDepositTx(txHash: string, depositAddress: string): Promise<Upstream> {
  return upstream('/deposit/submit', { method: 'POST', body: { txHash, depositAddress }, timeoutMs: 10_000 });
}
