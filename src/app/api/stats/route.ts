import { IS_LIVE } from '@/lib/config';
import { emptyStats, errMsg, getStats } from '@/lib/server/data';
import { json } from '@/lib/server/respond';
import type { StatsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = { configured: IS_LIVE, updatedAt: Math.floor(Date.now() / 1000) };
  if (!IS_LIVE) return json<StatsResponse>({ ...base, ok: true, ...emptyStats() }, { maxAge: 60 });
  try {
    const s = await getStats();
    return json<StatsResponse>({ ...base, ok: true, ...s }, { maxAge: 20 });
  } catch (e) {
    return json<StatsResponse>({ ...base, ok: false, error: errMsg(e), ...emptyStats() }, { maxAge: 5 });
  }
}
