import { NextResponse } from 'next/server';
import { ASSET_BNB, ASSET_ZEC } from '@/features/zcash/constants';
import { getTokens } from '@/features/zcash/server/oneclick';

export const dynamic = 'force-dynamic';

/**
 * 1Click tokens relevant to Sprout: native ZEC on Zcash and the BSC assets (`?all=1` returns the full list).
 * Cached 60 s.
 */
export async function GET(req: Request) {
  const t = await getTokens();
  if (!t) return NextResponse.json({ message: '1Click tokens unavailable' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const all = new URL(req.url).searchParams.get('all') === '1';
  const tokens = all ? t : t.filter((x) => x.assetId === ASSET_ZEC || x.blockchain === 'bsc');
  return NextResponse.json(
    { zec: t.find((x) => x.assetId === ASSET_ZEC) ?? null, bnb: t.find((x) => x.assetId === ASSET_BNB) ?? null, tokens },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } },
  );
}
