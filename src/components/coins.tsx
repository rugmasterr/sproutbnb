'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { explorerTx } from '@/lib/config';
import { big, fmtAmt, shortAddr, timeAgo, weiToNum } from '@/lib/format';
import { ABOUT_TO_GRADUATE } from '@/lib/stage';
import type { Coin, Trade } from '@/lib/types';
import { CoinImage, Empty, FeeDest, Progress, StageBadge, Tabs } from './ui';

export function CoinCard({ coin, i = 0 }: { coin: Coin; i?: number }) {
  const { t } = useI18n();
  const progress = coin.stage === 'grove' ? 1 : coin.state?.progress ?? 0;
  return (
    <Link
      href={`/coin/${coin.address}`}
      className="card card-hover group flex min-w-0 flex-col gap-3 p-4 animate-rise"
      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
    >
      <div className="flex items-start gap-3">
        <CoinImage src={coin.meta?.image} symbol={coin.symbol} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight">{coin.name}</div>
              <div className="truncate text-xs text-muted">${coin.symbol}</div>
            </div>
            <StageBadge stage={coin.stage} />
          </div>
          <FeeDest mode={coin.mode} className="mt-1.5" />
        </div>
      </div>
      {coin.meta?.description && <p className="line-clamp-2 text-xs text-muted">{coin.meta.description}</p>}
      <div className="mt-auto space-y-2">
        <Progress value={progress} />
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">
            {t('coin.mcap')}{' '}
            <ZecAmount wei={big(coin.state?.mcapWei)} className="num font-semibold text-fg" />
          </span>
          <span className="num text-muted">{Math.round(progress * 100)}%</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-faint">
          <span>
            {t('coin.fees')} <ZecAmount wei={big(coin.feesWei)} className="num" />
          </span>
          <span>{timeAgo(coin.plantedAt, t)}</span>
        </div>
      </div>
    </Link>
  );
}

export function CoinSkeletons({ n = 4 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <div className="flex gap-3">
            <div className="skeleton h-14 w-14" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          </div>
          <div className="skeleton h-2 w-full" />
          <div className="skeleton h-3 w-1/2" />
        </div>
      ))}
    </>
  );
}

export function CoinRow({ coins, empty, loading }: { coins: Coin[]; empty: string; loading?: boolean }) {
  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CoinSkeletons />
      </div>
    );
  if (!coins.length) return <Empty text={empty} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {coins.slice(0, 8).map((c, i) => (
        <CoinCard key={c.address} coin={c} i={i} />
      ))}
    </div>
  );
}

type Tab = 'all' | 'seeds' | 'graduating' | 'grove' | 'top';
type Sort = 'newest' | 'mcap' | 'progress' | 'fees';
type Filter = 'holders' | 'zcash' | 'zf' | 'deployer';

const FILTER_MODES: Record<Filter, number[]> = { holders: [2], zcash: [3], zf: [4], deployer: [0] };

const cmpBig = (a: string | undefined, b: string | undefined) => {
  const x = big(a);
  const y = big(b);
  return x === y ? 0 : x > y ? -1 : 1;
};

export function Explore({ coins, loading }: { coins: Coin[]; loading?: boolean }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [filters, setFilters] = useState<Filter[]>([]);
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    let cs = coins;
    if (tab === 'seeds') cs = cs.filter((c) => c.stage === 'seed');
    if (tab === 'graduating') cs = cs.filter((c) => c.stage !== 'grove' && (c.state?.progress ?? 0) >= ABOUT_TO_GRADUATE);
    if (tab === 'grove') cs = cs.filter((c) => c.stage === 'grove');
    if (filters.length) {
      const modes = new Set(filters.flatMap((f) => FILTER_MODES[f]));
      cs = cs.filter((c) => modes.has(c.mode));
    }
    const needle = q.trim().toLowerCase();
    if (needle)
      cs = cs.filter(
        (c) => c.name.toLowerCase().includes(needle) || c.symbol.toLowerCase().includes(needle) || c.address.toLowerCase() === needle,
      );
    const effSort: Sort = tab === 'top' ? 'fees' : sort;
    const sorted = [...cs];
    if (effSort === 'newest') sorted.sort((a, b) => b.plantedAt - a.plantedAt);
    if (effSort === 'mcap') sorted.sort((a, b) => cmpBig(a.state?.mcapWei, b.state?.mcapWei));
    if (effSort === 'progress')
      sorted.sort((a, b) => (b.stage === 'grove' ? 1 : b.state?.progress ?? 0) - (a.stage === 'grove' ? 1 : a.state?.progress ?? 0));
    if (effSort === 'fees') sorted.sort((a, b) => cmpBig(a.feesWei, b.feesWei));
    return sorted;
  }, [coins, tab, sort, filters, q]);

  const toggle = (f: Filter) => setFilters((fs) => (fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f]));

  return (
    <div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          items={[
            { id: 'all', label: t('ex.all') },
            { id: 'seeds', label: t('ex.seeds') },
            { id: 'graduating', label: t('ex.graduating') },
            { id: 'grove', label: t('ex.grove') },
            { id: 'top', label: t('ex.topFees') },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-full py-1.5 sm:w-64"
            placeholder={t('ex.searchPh')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={t('ui.search')}
          />
          <label className="flex items-center gap-2 text-xs text-muted">
            {t('ex.sort')}
            <select
              className="input w-auto py-1.5"
              value={tab === 'top' ? 'fees' : sort}
              disabled={tab === 'top'}
              onChange={(e) => setSort(e.target.value as Sort)}
            >
              <option value="newest">{t('ex.newest')}</option>
              <option value="mcap">{t('ex.mcap')}</option>
              <option value="progress">{t('ex.progress')}</option>
              <option value="fees">{t('ex.fees')}</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ['holders', 'ex.fHolders'],
            ['zcash', 'ex.fZcash'],
            ['zf', 'ex.fZf'],
            ['deployer', 'ex.fDeployer'],
          ] as const
        ).map(([f, k]) => (
          <button key={f} type="button" className={`chip ${filters.includes(f) ? 'chip-on' : ''}`} onClick={() => toggle(f)} aria-pressed={filters.includes(f)}>
            {t(k)}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? <CoinSkeletons n={8} /> : list.map((c, i) => <CoinCard key={c.address} coin={c} i={i} />)}
      </div>
      {!loading && list.length === 0 && (
        <div className="mt-2">
          <Empty text={coins.length ? t('home.exploreEmpty') : t('home.plantedEmpty')} />
        </div>
      )}
    </div>
  );
}

export function TradesFeed({ trades, loading, showToken = true, empty }: { trades: Trade[]; loading?: boolean; showToken?: boolean; empty: string }) {
  const { t } = useI18n();
  if (loading)
    return (
      <div className="card divide-y divide-line/50">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-3">
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  if (!trades.length) return <Empty text={empty} />;
  return (
    <div className="card divide-y divide-line/50 overflow-hidden">
      {trades.slice(0, 20).map((tr) => (
        <a
          key={`${tr.tx}-${tr.token}-${tr.side}-${tr.amountWei}`}
          href={explorerTx(tr.tx)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-raised/60"
        >
          <span
            className={`w-12 shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-semibold ${
              tr.side === 'buy' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
            }`}
          >
            {tr.side === 'buy' ? t('trade.buy') : t('trade.sell')}
          </span>
          {showToken && <span className="w-20 shrink-0 truncate font-medium">${tr.symbol ?? shortAddr(tr.token, 3)}</span>}
          <span className="num min-w-0 flex-1 truncate">
            <ZecAmount wei={big(tr.bnbWei)} className="font-semibold" />
            <span className="ml-2 hidden text-xs text-faint sm:inline">{fmtAmt(weiToNum(tr.amountWei))}</span>
          </span>
          <span className="hidden font-mono text-xs text-faint md:inline">{shortAddr(tr.trader)}</span>
          <span className="w-16 shrink-0 text-right text-xs text-faint">{timeAgo(tr.ts, t)}</span>
        </a>
      ))}
    </div>
  );
}
