import { NextResponse } from 'next/server';
import { clientIp, rateLimited, upstream } from '@/features/zcash/server/oneclick';

export const dynamic = 'force-dynamic';

/** GET ?depositAddress=…[&depositMemo=…] → 1Click execution status (not cached). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const depositAddress = (sp.get('depositAddress') || '').trim();
  const depositMemo = (sp.get('depositMemo') || '').trim();
  if (!/^[A-Za-z0-9]{20,128}$/.test(depositAddress)) {
    return NextResponse.json({ message: 'depositAddress required' }, { status: 400 });
  }
  if (depositMemo && !/^[A-Za-z0-9_-]{1,64}$/.test(depositMemo)) {
    return NextResponse.json({ message: 'invalid depositMemo' }, { status: 400 });
  }
  if (rateLimited(`${clientIp(req)}:status`, 120)) return NextResponse.json({ message: 'slow down' }, { status: 429 });
  const query: Record<string, string> = { depositAddress };
  if (depositMemo) query.depositMemo = depositMemo;
  const r = await upstream('/status', { query, timeoutMs: 10_000 });
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
}
