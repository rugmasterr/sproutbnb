import { IS_LIVE } from '@/lib/config';
import { errMsg, getCoins } from '@/lib/server/data';
import { json } from '@/lib/server/respond';
import type { CoinsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = { configured: IS_LIVE, updatedAt: Math.floor(Date.now() / 1000) };
  if (!IS_LIVE) return json<CoinsResponse>({ ...base, ok: true, coins: [] }, { maxAge: 60 });
  try {
    const coins = await getCoins();
    return json<CoinsResponse>({ ...base, ok: true, coins });
  } catch (e) {
    return json<CoinsResponse>({ ...base, ok: false, error: errMsg(e), coins: [] }, { maxAge: 5 });
  }
}
