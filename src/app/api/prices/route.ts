import { NextResponse } from 'next/server';
import { getPrices } from '@/features/zcash/server/oneclick';

export const dynamic = 'force-dynamic';

/** ZEC and BNB in USD, from 1Click /v0/tokens (cached 60 s server-side). */
export async function GET() {
  const p = await getPrices();
  const ok = p.zecUsd !== null && p.bnbUsd !== null;
  return NextResponse.json(
    { ...p, source: '1click', zecPerBnb: ok ? p.bnbUsd! / p.zecUsd! : null },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': ok ? 'public, s-maxage=60, stale-while-revalidate=120' : 'no-store' } },
  );
}
