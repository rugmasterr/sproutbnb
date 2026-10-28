import { errMsg, getLedger, LEDGER_CONFIGURED } from '@/lib/server/data';
import { json } from '@/lib/server/respond';
import type { LedgerResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = { configured: LEDGER_CONFIGURED, updatedAt: Math.floor(Date.now() / 1000) };
  if (!LEDGER_CONFIGURED) {
    return json<LedgerResponse>({ ...base, ok: true, entries: [], fromBlock: null, toBlock: null }, { maxAge: 60 });
  }
  try {
    const r = await getLedger();
    return json<LedgerResponse>({ ...base, ok: true, ...r }, { maxAge: 30 });
  } catch (e) {
    return json<LedgerResponse>({ ...base, ok: false, error: errMsg(e), entries: [], fromBlock: null, toBlock: null }, { maxAge: 5 });
  }
}
