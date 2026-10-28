'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAddress, isAddress, type Address } from 'viem';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { TokenStatus } from '@/lib/abi/portal';
import { explorerAddr, TERMINAL_LIVE } from '@/lib/config';
import { big, fmtNum, fmtPct, shortAddr } from '@/lib/format';
import { useToken } from '@/lib/useApi';
import type { TokenResponse } from '@/lib/types';
import { PriceZec } from './CoinView';
import { TradePanel } from './TradePanel';
import { CoinImage, Empty, ErrorNote, Ext, Notice, PrelaunchBanner, Row, StageBadge } from './ui';

const STATUS_NAME: Record<number, string> = { 0: 'Invalid', 1: 'Tradable', 2: 'InDuel', 3: 'Killed', 4: 'DEX', 5: 'Staged' };

export function guardOf(d: TokenResponse | undefined): 'invalid' | 'tax' | null {
  if (!d || !d.valid || !d.state) return 'invalid';
  if (d.state.status !== TokenStatus.Tradable && d.state.status !== TokenStatus.DEX) return 'invalid';
  if (d.state.buyTaxBps > 500 || d.state.sellTaxBps > 500) return 'tax';
  return null;
}

function Guard({ d }: { d: TokenResponse }) {
  const { t } = useI18n();
  const st = d.state;
  const g = guardOf(d);
  const yes = (b: boolean) => (b ? t('ui.yes') : t('ui.no'));
  return (
    <div className="card p-4 sm:p-5">
      <h3 className="text-lg font-semibold">{t('term.guard')}</h3>
      <p className="mt-1 text-xs text-gold">{t('term.never')}</p>
      <div className="mt-3 divide-y divide-line/50">
        <Row k={t('term.status')} v={st ? STATUS_NAME[st.status] ?? String(st.status) : '—'} />
        <Row k={t('term.taxes')} v={st ? `${fmtPct(st.buyTaxBps / 10_000, 2)} / ${fmtPct(st.sellTaxBps / 10_000, 2)}` : '—'} />
        <Row k={t('term.progress')} v={st ? `${fmtNum((d.stage === 'grove' ? 1 : st.progress) * 100, { max: 1 })}%` : '—'} />
        <Row
          k={t('term.pool')}
          v={st?.pool ? <Ext href={explorerAddr(st.pool)} className="link font-mono text-xs">{shortAddr(st.pool)}</Ext> : '—'}
        />
        <Row k={t('term.planted')} v={yes(Boolean(d.sprout))} />
      </div>
      <p className="mt-3 text-[11px] text-faint">{t('term.refuses')}</p>
      {g && (
        <div className="mt-3">
          <Notice tone="err">{t('term.blocked', { why: g === 'tax' ? t('term.whyTax') : t('term.whyInvalid') })}</Notice>
        </div>
      )}
    </div>
  );
}

export function TerminalView() {
  const { t } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const initial = sp.get('ca') ?? '';
  const [input, setInput] = useState(initial);
  const [ca, setCa] = useState<Address | undefined>(isAddress(initial) ? getAddress(initial) : undefined);
  useEffect(() => {
    const c = sp.get('ca');
    if (c && isAddress(c)) {
      setCa(getAddress(c));
      setInput(c);
    }
  }, [sp]);
  const q = useToken(ca);
  const d = q.data;

  const load = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!isAddress(v)) return;
    setCa(getAddress(v));
    router.replace(`/terminal?ca=${getAddress(v)}`, { scroll: false });
  };

  const g = guardOf(d);
  const disabledReason = !TERMINAL_LIVE
    ? t('pre.terminalDisabled')
    : g
      ? t('term.blocked', { why: g === 'tax' ? t('term.whyTax') : t('term.whyInvalid') })
      : null;

  return (
    <div className="space-y-6">
      {!TERMINAL_LIVE && <PrelaunchBanner text={t('pre.terminalDisabled')} />}
      <form onSubmit={load} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="label">{t('term.ca')}</span>
          <input className="input font-mono" value={input} spellCheck={false} placeholder="0x…7777" onChange={(e) => setInput(e.target.value.trim())} />
        </label>
        <button type="submit" className="btn-primary" disabled={!isAddress(input.trim())}>
          {t('term.load')}
        </button>
      </form>
      <p className="text-xs text-muted">{t('term.fee')}</p>

      {!ca ? (
        <Empty text={t('term.empty')} />
      ) : q.isLoading ? (
        <div className="skeleton h-64 w-full" />
      ) : !d || (!d.ok && !d.valid) ? (
        <ErrorNote onRetry={() => q.refetch()} detail={d?.error} />
      ) : !d.valid ? (
        <Empty text={t('coin.notFound')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0 space-y-6">
            <div className="card flex flex-wrap items-center gap-4 p-4 sm:p-5">
              <CoinImage src={d.meta?.image} symbol={d.symbol ?? '?'} size={64} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold">{d.name}</h2>
                  {d.stage && <StageBadge stage={d.stage} />}
                </div>
                <div className="mt-1 text-sm text-muted">${d.symbol}</div>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <span className="text-muted">{t('coin.price')}</span>
                <PriceZec priceWei={d.state?.priceWei} />
                <span className="text-muted">{t('coin.mcap')}</span>
                <ZecAmount wei={big(d.state?.mcapWei)} className="num" />
              </div>
            </div>
            {d.sprout && (
              <Notice tone="info">
                {t('term.sproutCoin')}{' '}
                <Link className="link" href={`/coin/${d.address}`}>
                  {t('launch.viewCoin')}
                </Link>
              </Notice>
            )}
            <Guard d={d} />
          </div>
          <div className="min-w-0">
            <TradePanel token={d.address as Address} symbol={d.symbol ?? ''} venue="terminal" disabledReason={disabledReason} />
          </div>
        </div>
      )}
    </div>
  );
}
