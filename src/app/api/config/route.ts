import { CAN_LAUNCH, CHAIN_ID, chain, IS_LIVE, sprout, TERMINAL_LIVE, ZEC_TOKEN } from '@/lib/config';
import { getZcashFoundationAddress } from '@/lib/server/data';
import { json } from '@/lib/server/respond';
import type { ConfigResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** Public, non-secret deployment status. The Zcash Foundation address is only ever what SproutPayouts returns. */
export async function GET() {
  const zf = await getZcashFoundationAddress().catch(() => null);
  return json<ConfigResponse>(
    {
      chainId: CHAIN_ID,
      live: IS_LIVE,
      canLaunch: CAN_LAUNCH,
      terminalLive: TERMINAL_LIVE,
      zcashFoundationAddress: zf,
      contracts: {
        factory: sprout.factory ?? null,
        roots: sprout.roots ?? null,
        payouts: sprout.payouts ?? null,
        terminal: sprout.terminal ?? null,
        accountFactory: sprout.accountFactory ?? null,
        sproutToken: sprout.token ?? null,
        zecToken: ZEC_TOKEN ?? null,
        portal: chain.portal,
        vaultPortal: chain.vaultPortal,
        taxTokenV3Impl: chain.taxTokenV3Impl,
      },
      updatedAt: Math.floor(Date.now() / 1000),
    },
    { maxAge: 60 },
  );
}
