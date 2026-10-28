'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { encodeFunctionData, type Address } from 'viem';
import { ZecAmount, useSproutAccount, useZec } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { vaultAbi } from '@/lib/abi/sprout';
import { explorerAddr, explorerToken, explorerTx, flapTokenUrl, pancakeUrl } from '@/lib/config';
import { big, fmtAmt, fmtNum, fmtPct, fmtPrice, shortAddr, timeAgo, weiToNum } from '@/lib/format';
import { errText } from '@/lib/trade';
import type { TokenResponse, Trade, VaultInfo } from '@/lib/types';
import { useTrades, useToken } from '@/lib/useApi';
import { TradesFeed } from './coins';
import { BambooBar, CopyChip, Kicker, NodeRing, StatusLine } from './fx';
import { TradePanel } from './TradePanel';
import { useCopy } from './tradeCopy';
import { CoinImage, CopyButton, Empty, ErrorNote, Ext, FeeDest, Notice, Row, StageBadge } from './ui';

export function PriceZec({ priceWei }: { priceWei: string | undefined }) {
  const { bnbWeiToZec } = useZec();
  const w = big(priceWei);
  const z = bnbWeiToZec(w);
  if (z === null) return <span className="num">{fmtPrice(Number(w) / 1e18)} BNB</span>;
  return (
    <span className="num">
      {fmtPrice(z)} <span className="text-[0.8em] text-gold">ZEC</span>
    </span>
  );
}

function VaultPanel({ vault }: { vault: VaultInfo }) {
  const { t } = useI18n();
  const acct = useSproutAccount();
  const [st, setSt] = useState<{ k: 'idle' | 'busy' } | { k: 'done'; tx: string } | { k: 'error'; msg: string }>({ k: 'idle' });
  const pots = big(vault.lpPotWei) + big(vault.rootPotWei) + big(vault.opsPotWei) + big(vault.payeePotWei);
  const flush = async () => {
    setSt({ k: 'busy' });
    try {
      const tx = await acct.executeBatch([
        { to: vault.address as Address, value: 0n, data: encodeFunctionData({ abi: vaultAbi, functionName: 'flush' }) },
      ]);
      setSt({ k: 'done', tx });
    } catch (e) {
      setSt({ k: 'error', msg: errText(e) });
    }
  };
  return (
    <div className="box">
      <div className="box-h">
        <span className="kicker">
          <NodeRing tone="green" />
          {t('vault.title')}
        </span>
        <Ext href={explorerAddr(vault.address)} className="font-mono text-[11px] text-muted transition hover:text-accent-hi">
          {shortAddr(vault.address)} ↗
        </Ext>
      </div>
      <div className="p-4 sm:p-5">
        <div className="divide-y divide-line/50">
          <Row
            k={t('vault.mode')}
            v={
              <span className="inline-flex flex-col items-end">
                <span>{t(`mode.${vault.mode}` as Key)}</span>
                <FeeDest mode={vault.mode} />
              </span>
            }
          />
          {vault.payee && (vault.mode === 0 || vault.mode === 1) && (
            <Row k={t('vault.payee')} v={<Ext href={explorerAddr(vault.payee)} className="font-mono text-xs link">{shortAddr(vault.payee)}</Ext>} />
          )}
          {vault.zcashAddress && (vault.mode === 3 || vault.mode === 4) && (
            <div className="py-2 text-sm">
              <div className="text-muted">{t('vault.zcash')}</div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 break-all font-mono text-xs">{vault.zcashAddress}</span>
                <CopyButton value={vault.zcashAddress} />
              </div>
            </div>
          )}
          {vault.mode === 4 && !vault.zcashAddress && <p className="py-2 text-xs text-faint">{t('vault.zfPending')}</p>}
          {vault.controller && vault.mode === 3 && (
            <Row k={t('vault.controller')} v={<span className="font-mono text-xs">{shortAddr(vault.controller)}</span>} />
          )}
          <Row k={t('vault.received')} v={<ZecAmount wei={big(vault.receivedWei)} showBnb />} />
          <Row k={t('vault.paid')} v={<ZecAmount wei={big(vault.toPayeeWei)} />} />
          {vault.payoutsPendingWei !== null && <Row k={t('vault.payoutsPending')} v={<ZecAmount wei={big(vault.payoutsPendingWei)} />} />}
        </div>
        <div className="mt-4">
          <span className="label">{t('vault.pots')}</span>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line text-sm">
            {(
              [
                ['vault.lp', vault.lpPotWei],
                ['vault.root', vault.rootPotWei],
                ['vault.ops', vault.opsPotWei],
                ['vault.choice', vault.payeePotWei],
              ] as const
            ).map(([k, w]) => (
              <div key={k} className="min-w-0 bg-ink-2 px-3 py-2.5">
                <div className="mono-label truncate">{t(k)}</div>
                <ZecAmount wei={big(w)} className="mt-0.5 block truncate font-semibold" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-ghost btn-sm" disabled={acct.kind === 'none' || st.k === 'busy' || pots === 0n} onClick={flush}>
            {st.k === 'busy' ? t('trade.working') : t('vault.flush')}
          </button>
          <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-faint">{t('vault.flushHint')}</span>
        </div>
        {st.k === 'done' && (
          <div className="mt-3">
            <Notice tone="ok">
              <a className="link" href={explorerTx(st.tx)} target="_blank" rel="noopener noreferrer">
                {t('trade.viewTx')}
              </a>
            </Notice>
          </div>
        )}
        {st.k === 'error' && (
          <div className="mt-3">
            <Notice tone="err">{st.msg}</Notice>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-ink-2 px-4 py-3.5">
      <div className="mono-label truncate">{label}</div>
      <div className="mt-1 truncate font-mono text-[15px] font-semibold tracking-[-0.01em] sm:text-base">{children}</div>
    </div>
  );
}

function Header({ d }: { d: TokenResponse }) {
  const { t } = useI18n();
  const st = d.state;
  const progress = d.stage === 'grove' ? 1 : st?.progress ?? 0;
  const mcap = big(st?.mcapWei);
  return (
    <div className="box relative">
      <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-60" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full glow-yellow" />
      <div className="relative p-4 sm:p-6">
        <div className="flex items-start gap-4">
          <CoinImage src={d.meta?.image} symbol={d.symbol ?? '?'} size={76} className="shadow-glow-sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-[1.9rem] font-semibold leading-tight tracking-[-0.04em] sm:text-[2.4rem]">{d.name ?? '—'}</h1>
              {d.stage && <StageBadge stage={d.stage} />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted">
              <span className="font-mono text-[13px] font-medium uppercase tracking-[0.06em] text-accent-hi">${d.symbol}</span>
              {d.sprout && <FeeDest mode={d.sprout.mode} />}
              {d.sprout?.creator && (
                <span className="text-xs">
                  {t('coin.by')}{' '}
                  <Ext href={explorerAddr(d.sprout.creator)} className="font-mono text-faint transition hover:text-fg">
                    {shortAddr(d.sprout.creator)}
                  </Ext>
                </span>
              )}
              {d.sprout?.plantedAt && <span className="font-mono text-[11px] text-faint">{t('coin.planted', { t: timeAgo(d.sprout.plantedAt, t) })}</span>}
            </div>
          </div>
        </div>
        <div className="mt-4">
          <CopyChip label={t('coin.contract')} value={d.address} href={explorerToken(d.address)} />
        </div>
        {d.meta?.description && <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted">{d.meta.description}</p>}
      </div>
      <div className="relative grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
        <StatCell label={t('coin.price')}>
          <PriceZec priceWei={st?.priceWei} />
        </StatCell>
        <StatCell label={t('coin.mcap')}>
          <ZecAmount wei={mcap} />
          <span className="mt-0.5 block truncate text-[10.5px] font-normal text-faint">≈ {fmtAmt(weiToNum(mcap))} BNB</span>
        </StatCell>
        <StatCell label={t('coin.tax')}>
          <span className="num">
            {fmtPct((st?.buyTaxBps ?? 0) / 10_000, 2)} <span className="text-faint">/</span> {fmtPct((st?.sellTaxBps ?? 0) / 10_000, 2)}
          </span>
        </StatCell>
        <StatCell label={t('coin.reserve')}>
          <ZecAmount wei={big(st?.reserveWei)} />
        </StatCell>
      </div>
      <div className="relative border-t border-line px-4 py-4 sm:px-6">
        <div className="mb-2 flex items-center justify-between font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
          <span>{t('coin.progress')}</span>
          <span className={`num text-xs ${d.stage === 'grove' ? 'text-bamboo-hi' : 'text-accent-hi'}`}>{fmtNum(progress * 100, { max: 1 })}%</span>
        </div>
        <BambooBar value={progress} segments={10} tone={d.stage === 'grove' ? 'green' : 'yellow'} label={t('coin.progress')} />
        {d.stage === 'grove' && <p className="mt-2 text-xs text-faint">{t('coin.graduatedNote')}</p>}
      </div>
    </div>
  );
}

/** Price line drawn from the trades already loaded for this coin (BNB per token per trade). */
function PriceChart({ trades, loading }: { trades: Trade[]; loading?: boolean }) {
  const c = useCopy();
  const gid = useId().replace(/:/g, '');
  const pts = useMemo(() => {
    return trades
      .map((tr) => {
        const amt = weiToNum(tr.amountWei);
        return amt > 0 ? { ts: tr.ts, p: weiToNum(tr.bnbWei) / amt } : null;
      })
      .filter((x): x is { ts: number; p: number } => x !== null && Number.isFinite(x.p))
      .sort((a, b) => a.ts - b.ts);
  }, [trades]);

  const W = 600;
  const H = 200;
  let path = '';
  let area = '';
  let up = true;
  let last: { x: number; y: number } | null = null;
  if (pts.length >= 2) {
    const ps = pts.map((x) => x.p);
    const lo = Math.min(...ps);
    const hi = Math.max(...ps);
    const span = hi - lo || hi || 1;
    const t0 = pts[0].ts;
    const t1 = pts[pts.length - 1].ts;
    const tspan = t1 - t0 || 1;
    const xy = pts.map((x, i) => ({
      x: t1 === t0 ? (i / (pts.length - 1)) * W : ((x.ts - t0) / tspan) * W,
      y: H - 16 - ((x.p - lo) / span) * (H - 40),
    }));
    path = xy.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    area = `${path} L${W},${H} L0,${H} Z`;
    up = pts[pts.length - 1].p >= pts[0].p;
    last = xy[xy.length - 1];
  }
  const stroke = up ? 'rgb(var(--bamboo-hi))' : 'rgb(var(--down))';

  return (
    <div className="box">
      <div className="box-h">
        <Kicker tone="muted" node>
          {c('chart')}
        </Kicker>
        {pts.length > 0 && (
          <StatusLine tone={up ? 'green' : 'red'} pulse={false}>
            <span className="num">{pts.length}</span> {c('trades')}
          </StatusLine>
        )}
      </div>
      <div className="relative h-48 sm:h-60">
        <div aria-hidden className="lines-bg absolute inset-0 opacity-70" />
        {loading ? (
          <div className="skeleton absolute inset-4" />
        ) : pts.length >= 2 ? (
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
            <defs>
              <linearGradient id={`f${gid}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#f${gid})`} />
            <path d={path} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            {last && <circle cx={last.x} cy={last.y} r="4" fill={stroke} vectorEffect="non-scaling-stroke" />}
          </svg>
        ) : (
          <div className="absolute inset-0 grid place-items-center px-6 text-center">
            <div>
              <svg width="120" height="36" viewBox="0 0 120 36" className="mx-auto opacity-60" aria-hidden>
                <path d="M2 30 L24 24 L40 27 L58 16 L76 19 L94 8 L118 4" fill="none" stroke="rgb(var(--line-2))" strokeWidth="2" strokeDasharray="4 5" />
              </svg>
              <p className="mt-3 text-sm text-muted">{c('chartEmpty')}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Links({ d }: { d: TokenResponse }) {
  const c = useCopy();
  const { t } = useI18n();
  const items: [string, string][] = [
    [t('coin.bscscan'), explorerToken(d.address)],
    [t('coin.flap'), flapTokenUrl(d.address)],
    ...(d.stage === 'grove' ? ([[t('coin.pancake'), pancakeUrl(d.address)]] as [string, string][]) : []),
    ...(d.meta?.website ? ([[t('coin.website'), d.meta.website]] as [string, string][]) : []),
    ...(d.meta?.twitter ? ([['X', d.meta.twitter]] as [string, string][]) : []),
    ...(d.meta?.telegram ? ([['Telegram', d.meta.telegram]] as [string, string][]) : []),
  ];
  return (
    <div className="card p-4 sm:p-5">
      <span className="label">
        {t('coin.links')} <span className="text-line-2">·</span> {c('links')}
      </span>
      <div className="mt-1 flex flex-wrap gap-2">
        {items.map(([label, href]) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow" className="chip">
            {label} <span aria-hidden>↗</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export function CoinView({ address }: { address: Address }) {
  const { t } = useI18n();
  const c = useCopy();
  const q = useToken(address);
  const d = q.data;
  const trades = useTrades(address, Boolean(d?.valid));

  if (q.isLoading)
    return (
      <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-6">
          <div className="skeleton h-72 w-full rounded-2xl" />
          <div className="skeleton h-56 w-full rounded-2xl" />
        </div>
        <div className="skeleton h-96 w-full rounded-2xl" />
      </div>
    );
  if (!d || (!d.ok && !d.valid))
    return (
      <div className="mx-auto max-w-xl py-10">
        <Kicker tone="red" node>
          {c('token')}
        </Kicker>
        <p className="mt-3 break-all font-mono text-xs text-faint">{address}</p>
        <div className="mt-5">
          <ErrorNote onRetry={() => q.refetch()} detail={d?.error} />
        </div>
      </div>
    );
  if (!d.valid)
    return (
      <div className="mx-auto max-w-xl py-10">
        <Kicker tone="muted" node>
          {c('token')}
        </Kicker>
        <p className="mb-5 mt-3 break-all font-mono text-xs text-faint">{address}</p>
        <Empty
          text={t('coin.notFound')}
          cta={
            <Link className="btn-ghost btn-sm" href={`/terminal?ca=${address}`}>
              {t('coin.openTerminal')} <span className="arr">→</span>
            </Link>
          }
        />
      </div>
    );

  const tradeList = trades.data?.trades ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
      <div className="min-w-0 space-y-6">
        <Kicker node>
          {c('overview')} <span className="text-faint">· BNB Chain</span>
        </Kicker>
        <Header d={d} />
        {!d.sprout && (
          <Notice tone="warn">
            {t('coin.notSprout')}{' '}
            <Link className="link" href={`/terminal?ca=${d.address}`}>
              {t('coin.openTerminal')}
            </Link>
          </Notice>
        )}
        <PriceChart trades={tradeList} loading={trades.isLoading} />
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <Kicker tone="green" node>
                {c('live')}
              </Kicker>
              <h2 className="mt-1.5 text-xl font-semibold tracking-[-0.03em] sm:text-2xl">{t('coin.trades')}</h2>
            </div>
          </div>
          <TradesFeed trades={tradeList} loading={trades.isLoading} showToken={false} empty={t('coin.noTrades')} />
        </section>
      </div>
      <div className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
        {d.sprout ? <TradePanel token={d.address as Address} symbol={d.symbol ?? ''} venue="portal" /> : null}
        {d.sprout?.vault && <VaultPanel vault={d.sprout.vault} />}
        <Links d={d} />
      </div>
    </div>
  );
}
