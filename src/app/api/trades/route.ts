import { isAddress } from 'viem';
import { IS_LIVE } from '@/lib/config';
import { errMsg, getTrades } from '@/lib/server/data';
import { json } from '@/lib/server/respond';
import type { TradesResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const base = { configured: IS_LIVE, updatedAt: Math.floor(Date.now() / 1000) };
  if (token && !isAddress(token)) {
    return json<TradesResponse>(
      { ...base, ok: false, error: 'invalid token', trades: [], fromBlock: null, toBlock: null },
      { status: 400 },
    );
  }
  if (!token && !IS_LIVE) {
    return json<TradesResponse>({ ...base, ok: true, trades: [], fromBlock: null, toBlock: null }, { maxAge: 60 });
  }
  try {
    const r = await getTrades(token ?? undefined);
    return json<TradesResponse>({ ...base, ok: true, ...r });
  } catch (e) {
    return json<TradesResponse>(
      { ...base, ok: false, error: errMsg(e), trades: [], fromBlock: null, toBlock: null },
      { maxAge: 5 },
    );
  }
}
