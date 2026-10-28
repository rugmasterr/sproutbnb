'use client';

import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { CHAIN_ID, TERMINAL_FEE_BPS, TOTAL_SUPPLY } from '@/lib/config';
import { big, shortAddr, timeAgo } from '@/lib/format';
import type { Coin, Trade } from '@/lib/types';
import { StatusDot, Ticker, TickerItem } from '../fx';
import { C, useL } from './copy';

/** Horizontally scrolling band: live trades + new launches, or protocol facts when there are none. */
export function LiveBand({ trades, coins }: { trades: Trade[]; coins: Coin[] }) {
  const { t } = useI18n();
  const L = useL();
  const live = trades.length > 0 || coins.length > 0;

  const items: React.ReactNode[] = [];
  if (live) {
    for (const tr of trades.slice(0, 16))
      items.push(
        <TickerItem
          key={`t-${tr.tx}-${tr.token}-${tr.side}-${tr.amountWei}`}
          k={`${tr.side === 'buy' ? t('trade.buy') : t('trade.sell')} $${tr.symbol ?? shortAddr(tr.token, 3)}`}
          v={
            <>
              <ZecAmount wei={big(tr.bnbWei)} /> <span className="text-faint">· {timeAgo(tr.ts, t)}</span>
            </>
          }
          tone={tr.side === 'buy' ? 'up' : 'down'}
        />,
      );
    const newest = [...coins].sort((a, b) => b.plantedAt - a.plantedAt).slice(0, 8);
    for (const c of newest)
      items.push(
        <TickerItem key={`c-${c.address}`} k={L(C.band.newCoin)} v={<>${c.symbol} <span className="text-faint">· {timeAgo(c.plantedAt, t)}</span></>} tone="accent" />,
      );
  } else {
    const facts: [string, string, 'default' | 'up' | 'accent'][] = [
      [L(C.band.tax), '2.00%', 'accent'],
      [L(C.band.grove), '0.50%', 'up'],
      [L(C.band.root), '0.50%', 'up'],
      [L(C.band.ops), '0.20%', 'default'],
      [L(C.band.deployer), L(C.band.inZec), 'accent'],
      [L(C.band.supply), TOTAL_SUPPLY.toLocaleString('en-US'), 'default'],
      [L(C.band.chain), `BNB · ${CHAIN_ID}`, 'accent'],
      [L(C.band.bridge), 'NEAR Intents', 'default'],
      [L(C.band.cashout), L(C.band.shielded), 'up'],
      [L(C.band.termFee), `${(TERMINAL_FEE_BPS / 100).toFixed(2)}%`, 'default'],
      [L(C.band.stages), `${t('stage.seed')} → ${t('stage.shoot')} → ${t('stage.grove')}`, 'up'],
    ];
    for (const [k, v, tone] of facts) items.push(<TickerItem key={k} k={k} v={v} tone={tone} />);
  }

  return (
    <div className="relative border-b border-line bg-raised/60">
      <div className="flex items-stretch">
        <div className="relative z-[1] hidden shrink-0 items-center gap-2 border-r border-line bg-raised px-5 font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted sm:flex">
          <StatusDot tone={live ? 'green' : 'yellow'} />
          {L(live ? C.band.live : C.band.facts)}
        </div>
        <div className="min-w-0 flex-1 py-4">
          <Ticker label={L(live ? C.band.label : C.band.facts)} speed={live ? 55 : 45} gap="gap-12">
            {items.map((it, i) => (
              <span key={i} className="inline-flex items-center gap-12">
                {it}
                <span aria-hidden className="inline-block h-[5px] w-[5px] rotate-45 bg-accent/70 shadow-[0_0_8px_rgb(var(--accent)/0.7)]" />
              </span>
            ))}
          </Ticker>
        </div>
      </div>
    </div>
  );
}
