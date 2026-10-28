'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { explorerTx } from '@/lib/config';
import { big, fmtAmt, shortAddr, timeAgo, weiToNum } from '@/lib/format';
import { ABOUT_TO_GRADUATE } from '@/lib/stage';
import type { Coin, Trade } from '@/lib/types';
import { BambooBar } from './fx';
import { useCopy } from './tradeCopy';
import { CoinImage, Empty, FeeDest, StageBadge, Tabs } from './ui';

export function CoinCard({ coin, i = 0 }: { coin: Coin; i?: number }) {
  const { t } = useI18n();
  const progress = coin.stage === 'grove' ? 1 : coin.state?.progress ?? 0;
  const mcap = big(coin.state?.mcapWei);
  return (
    <Link
      href={`/coin/${coin.address}`}
      className="card card-hover group relative flex min-w-0 flex-col gap-3.5 overflow-hidden p-4 animate-rise"
      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
    >
      {/* hover glow + top hairline */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 transition-opacity duration-500 glow-yellow group-hover:opacity-100"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="relative flex items-start gap-3">
        <CoinImage src={coin.meta?.image} symbol={coin.symbol} size={52} className="transition-colors group-hover:border-accent/50" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-semibold leading-tight tracking-[-0.02em]">{coin.name}</div>
              <div className="mt-0.5 truncate font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-accent-hi/90">${coin.symbol}</div>
            </div>
            <StageBadge stage={coin.stage} />
          </div>
          <FeeDest mode={coin.mode} className="mt-1.5" />
        </div>
      </div>
      {coin.meta?.description && <p className="relative line-clamp-2 text-xs leading-relaxed text-muted">{coin.meta.description}</p>}
      <div className="relative mt-auto space-y-3">
        <div className="well grid grid-cols-2 divide-x divide-line">
          <div className="min-w-0 px-3 py-2">
            <div className="mono-label">{t('coin.mcap')}</div>
            <ZecAmount wei={mcap} className="mt-0.5 block truncate text-sm font-semibold text-fg" />
            <div className="num truncate font-mono text-[10.5px] text-faint">≈ {fmtAmt(weiToNum(mcap))} BNB</div>
          </div>
          <div className="min-w-0 px-3 py-2">
            <div className="mono-label">{t('coin.fees')}</div>
            <ZecAmount wei={big(coin.feesWei)} className="mt-0.5 block truncate text-sm font-semibold text-fg" />
            <div className="truncate font-mono text-[10.5px] text-faint">{timeAgo(coin.plantedAt, t)}</div>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
            <span>{t('coin.progress')}</span>
            <span className={`num ${coin.stage === 'grove' ? 'text-bamboo-hi' : 'text-muted'}`}>{Math.round(progress * 100)}%</span>
          </div>
          <BambooBar value={progress} segments={5} tone={coin.stage === 'grove' ? 'green' : 'yellow'} label={t('coin.progress')} />
        </div>
      </div>
    </Link>
  );
}

export function CoinSkeletons({ n = 4 }: { n?: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="card space-y-3.5 p-4">
          <div className="flex gap-3">
            <div className="skeleton h-[52px] w-[52px] rounded-xl" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/3" />
            </div>
          </div>
          <div className="skeleton h-14 w-full rounded-xl" />
          <div className="flex gap-[3px]">
            {Array.from({ length: 5 }).map((__, j) => (
              <div key={j} className="skeleton h-1.5 flex-1" />
            ))}
          </div>
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

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

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
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative block w-full min-w-0 sm:w-64">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
              <SearchIcon />
            </span>
            <input
              className="input-mono w-full py-1.5 pl-9"
              placeholder={t('ex.searchPh')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label={t('ui.search')}
            />
          </label>
          <label className="flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
            {t('ex.sort')}
            <select
              className="input w-auto py-1.5 font-mono text-[12px] normal-case tracking-normal"
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
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['holders', 'ex.fHolders'],
            ['zcash', 'ex.fZcash'],
            ['zf', 'ex.fZf'],
            ['deployer', 'ex.fDeployer'],
          ] as const
        ).map(([f, k]) => (
          <button key={f} type="button" className={`chip ${filters.includes(f) ? 'chip-on' : ''}`} onClick={() => toggle(f)} aria-pressed={filters.includes(f)}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${filters.includes(f) ? 'bg-accent shadow-[0_0_8px_rgb(var(--accent))]' : 'bg-line-2'}`} />
            {t(k)}
          </button>
        ))}
        {!loading && (
          <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
            <span className="num text-muted">{list.length}</span> / <span className="num">{coins.length}</span>
          </span>
        )}
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
  const c = useCopy();
  if (loading)
    return (
      <div className="box divide-y divide-line/60">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 px-4 py-3">
            <div className="skeleton h-4 w-12" />
            <div className="skeleton h-4 flex-1" />
          </div>
        ))}
      </div>
    );
  if (!trades.length) return <Empty text={empty} />;
  return (
    <div className="box">
      <div className="hidden items-center gap-3 border-b border-line px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint sm:flex">
        <span className="w-12 shrink-0">{c('side')}</span>
        {showToken && <span className="w-20 shrink-0">{c('coin')}</span>}
        <span className="min-w-0 flex-1">{c('amount')}</span>
        <span className="hidden w-28 md:inline">{c('trader')}</span>
        <span className="w-16 shrink-0 text-right">{c('time')}</span>
      </div>
      <div className="divide-y divide-line/60">
        {trades.slice(0, 20).map((tr) => (
          <a
            key={`${tr.tx}-${tr.token}-${tr.side}-${tr.amountWei}`}
            href={explorerTx(tr.tx)}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white/[0.03]"
          >
            <span
              className={`w-12 shrink-0 rounded-full border px-2 py-0.5 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.06em] ${
                tr.side === 'buy' ? 'border-up/40 bg-up/10 text-up' : 'border-down/40 bg-down/10 text-down'
              }`}
            >
              {tr.side === 'buy' ? t('trade.buy') : t('trade.sell')}
            </span>
            {showToken && <span className="w-20 shrink-0 truncate font-mono text-xs font-medium text-accent-hi">${tr.symbol ?? shortAddr(tr.token, 3)}</span>}
            <span className="num min-w-0 flex-1 truncate">
              <ZecAmount wei={big(tr.bnbWei)} className="font-semibold" />
              <span className="ml-2 hidden font-mono text-xs text-faint sm:inline">{fmtAmt(weiToNum(tr.amountWei))}</span>
            </span>
            <span className="hidden w-28 font-mono text-xs text-faint md:inline">{shortAddr(tr.trader)}</span>
            <span className="w-16 shrink-0 text-right font-mono text-[11px] text-faint group-hover:text-muted">{timeAgo(tr.ts, t)}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
