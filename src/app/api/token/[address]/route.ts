import { isAddress } from 'viem';
import { errMsg, getToken } from '@/lib/server/data';
import { json } from '@/lib/server/respond';
import type { TokenResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { address: string } }) {
  const address = params.address;
  const now = Math.floor(Date.now() / 1000);
  const empty: TokenResponse = {
    ok: false,
    address,
    valid: false,
    name: null,
    symbol: null,
    state: null,
    meta: null,
    stage: null,
    sprout: null,
    updatedAt: now,
  };
  if (!isAddress(address)) return json<TokenResponse>({ ...empty, error: 'invalid address' }, { status: 400 });
  try {
    const t = await getToken(address);
    return json<TokenResponse>({ ok: true, ...t, updatedAt: now }, { maxAge: 10 });
  } catch (e) {
    return json<TokenResponse>({ ...empty, error: errMsg(e) }, { maxAge: 5 });
  }
}
