import { NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { clientIp, rateLimited, submitDepositTx } from '@/features/zcash/server/oneclick';

export const dynamic = 'force-dynamic';

/**
 * POST { txHash, depositAddress } → 1Click /v0/deposit/submit. Used after a BNB Chain cash-out tx so 1Click picks up
 * the deposit promptly (the BNB reaches the deposit address from a contract, not a plain wallet transfer).
 * Only BSC (0x…) deposit addresses and 32-byte tx hashes are accepted; the upstream URL is fixed.
 */
export async function POST(req: Request) {
  let b: { txHash?: unknown; depositAddress?: unknown };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ message: 'invalid JSON' }, { status: 400 });
  }
  const txHash = typeof b?.txHash === 'string' ? b.txHash.trim() : '';
  const depositAddress = typeof b?.depositAddress === 'string' ? b.depositAddress.trim() : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash) || !isAddress(depositAddress)) {
    return NextResponse.json({ message: 'txHash (0x + 64 hex) and a BSC depositAddress are required' }, { status: 400 });
  }
  if (rateLimited(`${clientIp(req)}:submit`, 20)) return NextResponse.json({ message: 'slow down' }, { status: 429 });
  const r = await submitDepositTx(txHash, depositAddress);
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
