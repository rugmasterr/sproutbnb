'use client';

import Link from 'next/link';
import { useState } from 'react';
import { encodeFunctionData, type Address } from 'viem';
import { ZecAmount, useSproutAccount, useZec } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { vaultAbi } from '@/lib/abi/sprout';
import { explorerAddr, explorerToken, explorerTx, flapTokenUrl, pancakeUrl } from '@/lib/config';
import { big, fmtNum, fmtPct, fmtPrice, shortAddr, timeAgo } from '@/lib/format';
import { errText } from '@/lib/trade';
import type { TokenResponse, VaultInfo } from '@/lib/types';
import { useTrades, useToken } from '@/lib/useApi';
import { TradesFeed } from './coins';
import { TradePanel } from './TradePanel';
import { CoinImage, CopyButton, Empty, ErrorNote, Ext, FeeDest, Notice, Progress, Row, StageBadge } from './ui';

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
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{t('vault.title')}</h3>
        <Ext href={explorerAddr(vault.address)} className="font-mono text-xs text-muted hover:text-fg">
          {shortAddr(vault.address)}
        </Ext>
      </div>
      <div className="mt-2 divide-y divide-line/50">
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
          <div className="py-1.5 text-sm">
            <div className="text-muted">{t('vault.zcash')}</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="min-w-0 flex-1 break-all font-mono text-xs">{vault.zcashAddress}</span>
              <CopyButton value={vault.zcashAddress} />
            </div>
          </div>
        )}
        {vault.mode === 4 && !vault.zcashAddress && <p className="py-1.5 text-xs text-faint">{t('vault.zfPending')}</p>}
        {vault.controller && vault.mode === 3 && (
          <Row k={t('vault.controller')} v={<span className="font-mono text-xs">{shortAddr(vault.controller)}</span>} />
        )}
        <Row k={t('vault.received')} v={<ZecAmount wei={big(vault.receivedWei)} showBnb />} />
        <Row k={t('vault.paid')} v={<ZecAmount wei={big(vault.toPayeeWei)} />} />
        {vault.payoutsPendingWei !== null && <Row k={t('vault.payoutsPending')} v={<ZecAmount wei={big(vault.payoutsPendingWei)} />} />}
      </div>
      <div className="mt-4">
        <span className="label">{t('vault.pots')}</span>
        <div className="grid grid-cols-2 gap-2 text-sm">
          {(
            [
              ['vault.lp', vault.lpPotWei],
              ['vault.root', vault.rootPotWei],
              ['vault.ops', vault.opsPotWei],
              ['vault.choice', vault.payeePotWei],
            ] as const
          ).map(([k, w]) => (
            <div key={k} className="rounded-lg bg-raised/60 px-2.5 py-2">
              <div className="text-[11px] text-muted">{t(k)}</div>
              <ZecAmount wei={big(w)} className="num font-semibold" />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost" disabled={acct.kind === 'none' || st.k === 'busy' || pots === 0n} onClick={flush}>
          {st.k === 'busy' ? t('trade.working') : t('vault.flush')}
        </button>
        <span className="min-w-0 flex-1 text-[11px] text-faint">{t('vault.flushHint')}</span>
      </div>
      {st.k === 'done' && (
        <div className="mt-2">
          <Notice tone="ok">
            <a className="link" href={explorerTx(st.tx)} target="_blank" rel="noopener noreferrer">
              {t('trade.viewTx')}
            </a>
          </Notice>
        </div>
      )}
      {st.k === 'error' && (
        <div className="mt-2">
          <Notice tone="err">{st.msg}</Notice>
        </div>
      )}
    </div>
  );
}

function Header({ d }: { d: TokenResponse }) {
  const { t } = useI18n();
  const st = d.state;
  const progress = d.stage === 'grove' ? 1 : st?.progress ?? 0;
  return (
    <div className="card p-4 sm:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <CoinImage src={d.meta?.image} symbol={d.symbol ?? '?'} size={80} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-semibold">{d.name ?? '—'}</h1>
            {d.stage && <StageBadge stage={d.stage} />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span>${d.symbol}</span>
            {d.sprout && <FeeDest mode={d.sprout.mode} />}
            {d.sprout?.creator && (
              <span>
                {t('coin.by')} <span className="font-mono text-xs">{shortAddr(d.sprout.creator)}</span>
              </span>
            )}
            {d.sprout?.plantedAt && <span>{t('coin.planted', { t: timeAgo(d.sprout.plantedAt, t) })}</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-faint">{shortAddr(d.address, 6)}</span>
            <CopyButton value={d.address} />
          </div>
        </div>
      </div>
      {d.meta?.description && <p className="mt-4 whitespace-pre-line text-sm text-muted">{d.meta.description}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <div className="text-xs text-muted">{t('coin.price')}</div>
          <div className="font-display text-lg font-semibold">
            <PriceZec priceWei={st?.priceWei} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('coin.mcap')}</div>
          <div className="font-display text-lg font-semibold">
            <ZecAmount wei={big(st?.mcapWei)} />
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('coin.tax')}</div>
          <div className="num font-display text-lg font-semibold">
            {fmtPct((st?.buyTaxBps ?? 0) / 10_000, 2)} / {fmtPct((st?.sellTaxBps ?? 0) / 10_000, 2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted">{t('coin.reserve')}</div>
          <div className="font-display text-lg font-semibold">
            <ZecAmount wei={big(st?.reserveWei)} />
          </div>
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-xs text-muted">
          <span>{t('coin.progress')}</span>
          <span className="num">{fmtNum(progress * 100, { max: 1 })}%</span>
        </div>
        <Progress value={progress} />
        {d.stage === 'grove' && <p className="mt-2 text-xs text-faint">{t('coin.graduatedNote')}</p>}
      </div>
    </div>
  );
}

function Links({ d }: { d: TokenResponse }) {
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
      <span className="label">{t('coin.links')}</span>
      <div className="flex flex-wrap gap-2">
        {items.map(([label, href]) => (
          <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow" className="chip">
            {label} ↗
          </a>
        ))}
      </div>
    </div>
  );
}

export function CoinView({ address }: { address: Address }) {
  const { t } = useI18n();
  const q = useToken(address);
  const d = q.data;
  const trades = useTrades(address, Boolean(d?.valid));

  if (q.isLoading)
    return (
      <div className="space-y-4">
        <div className="skeleton h-56 w-full" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  if (!d || (!d.ok && !d.valid)) return <ErrorNote onRetry={() => q.refetch()} detail={d?.error} />;
  if (!d.valid) return <Empty text={t('coin.notFound')} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="min-w-0 space-y-6">
        <Header d={d} />
        {!d.sprout && (
          <Notice tone="warn">
            {t('coin.notSprout')}{' '}
            <Link className="link" href={`/terminal?ca=${d.address}`}>
              {t('coin.openTerminal')}
            </Link>
          </Notice>
        )}
        <section>
          <h2 className="mb-3 text-xl font-semibold">{t('coin.trades')}</h2>
          <TradesFeed trades={trades.data?.trades ?? []} loading={trades.isLoading} showToken={false} empty={t('coin.noTrades')} />
        </section>
      </div>
      <div className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
        {d.sprout ? (
          <TradePanel token={d.address as Address} symbol={d.symbol ?? ''} venue="portal" />
        ) : null}
        {d.sprout?.vault && <VaultPanel vault={d.sprout.vault} />}
        <Links d={d} />
      </div>
    </div>
  );
}
