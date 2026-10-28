import { NextResponse } from 'next/server';
import { routeHealth } from '@/features/zcash/server/oneclick';

export const dynamic = 'force-dynamic';

/** Live availability of ZEC→BNB ("in") and BNB→ZEC ("out") via 1Click dry quotes (~$1,200), cached 2 min. */
export async function GET() {
  const v = await routeHealth();
  return NextResponse.json(v, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } });
}
