import { NextResponse } from 'next/server';
import { clientIp, globalLiveQuoteLimited, parseQuoteInput, rateLimited, requestQuote } from '@/features/zcash/server/oneclick';

export const dynamic = 'force-dynamic';

/**
 * POST { direction: 'in' | 'out', amount, recipient, refundTo, dry?, swapType? }
 *   in : ZEC (Zcash) → BNB (BSC); recipient = BSC address, refundTo = t-address
 *   out: BNB (BSC) → ZEC (Zcash); recipient = t-address, refundTo = BSC address
 * Assets, slippage, deposit/refund/recipient types and deadlines are fixed server-side; the upstream URL is fixed.
 * Returns the 1Click QuoteResponse (status passthrough) — save it: its signature resolves disputes.
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ message: 'invalid JSON' }, { status: 400 });
  }
  const q = parseQuoteInput(raw);
  if (typeof q === 'string') return NextResponse.json({ message: q }, { status: 400 });
  // Real (non-dry) quotes create deposit addresses: keep them scarcer than previews.
  if (rateLimited(`${clientIp(req)}:${q.dry ? 'dry' : 'live'}`, q.dry ? 60 : 12)) {
    return NextResponse.json({ message: 'too many quote requests, wait a minute' }, { status: 429 });
  }
  if (!q.dry && globalLiveQuoteLimited()) {
    return NextResponse.json({ message: 'Sprout is busy creating deposit addresses — try again in a minute' }, { status: 429 });
  }
  const r = await requestQuote(q);
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
