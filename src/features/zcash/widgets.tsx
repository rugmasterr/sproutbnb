'use client';

import { useEffect, useState } from 'react';
import { shortZ } from './address';
import { fmtBnb, fmtZec, StatusPill, SwapProgress } from './components';
import { useZT } from './i18n-hook';
import { fetchRoutes, loadSwaps, onSwapsChange, removeSwap, shouldPoll, type Routes, type TrackedSwap } from './oneclick';
import { usePrices } from './provider';

/** Live route availability (1Click dry quotes, cached server-side). */
export function RouteStatus() {
  const { t } = useZT();
  const [r, setR] = useState<Routes | null | undefined>(undefined);
  useEffect(() => {
    let dead = false;
    const load = () => fetchRoutes().then((v) => !dead && setR(v));
    load();
    const id = setInterval(load, 120_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);
  const row = (label: string, h?: Routes['in']) => (
    <div className="flex items-start justify-between gap-3 py-2">
      <span className="text-sm">{label}</span>
      {r === undefined ? (
        <span className="skeleton h-4 w-20" />
      ) : !h ? (
        <span className="text-xs text-faint">{t('rs.unknown')}</span>
      ) : h.ok ? (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
          <span className="h-2 w-2 rounded-full bg-accent" />
          {t('rs.ok')}
          {h.timeEstimate ? <span className="text-muted">· ~{Math.max(1, Math.round(h.timeEstimate / 60))} min</span> : null}
        </span>
      ) : (
        <span className="max-w-[60%] text-right text-xs text-down">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-down" />
            {h.minUsd ? t('rs.min', { usd: h.minUsd.toLocaleString('en-US') }) : t('rs.down')}
          </span>
          {h.message && !h.minUsd && <span className="mt-0.5 block font-mono text-[10px] text-muted">{h.message}</span>}
        </span>
      )}
    </div>
  );
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="kicker">{t('rs.title')}</span>
        {r?.checkedAt && <span className="text-[10px] text-faint">{new Date(r.checkedAt).toLocaleTimeString()}</span>}
      </div>
      <div className="mt-1 divide-y divide-line/60">
        {row(t('rs.in'), r?.in)}
        {row(t('rs.out'), r?.out)}
      </div>
      <p className="mt-2 text-[11px] leading-5 text-faint">{r?.authenticated ? t('rs.auth') : t('rs.unauth')}</p>
    </div>
  );
}

export function PriceLine() {
  const { t } = useZT();
  const { zecUsd, bnbUsd } = usePrices();
  if (!zecUsd || !bnbUsd) return <span className="text-xs text-faint">{t('px.loading')}</span>;
  return (
    <span className="num text-xs text-muted">
      1 ZEC ≈ ${zecUsd.toFixed(2)} · 1 BNB ≈ ${bnbUsd.toFixed(2)} · 1 BNB ≈ {fmtZec(bnbUsd / zecUsd)} ZEC
    </span>
  );
}

export function SwapHistory({ filter }: { filter?: 'in' | 'out' }) {
  const { t } = useZT();
  const [list, setList] = useState<TrackedSwap[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const load = () => setList(loadSwaps());
    load();
    return onSwapsChange(load);
  }, []);
  const items = list.filter((s) => !filter || s.direction === filter);
  if (!items.length) return <p className="text-sm text-faint">{t('hist.empty')}</p>;
  return (
    <ul className="divide-y divide-line/60">
      {items.map((s) => (
        <li key={s.depositAddress} className="py-3">
          <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === s.depositAddress ? null : s.depositAddress)} aria-expanded={open === s.depositAddress}>
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm ${s.direction === 'in' ? 'bg-gold/15 text-gold' : 'bg-accent/15 text-accent'}`} aria-hidden>
              {s.direction === 'in' ? '↓' : '↑'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {s.direction === 'in'
                  ? `${fmtZec(Number(s.amountInFormatted))} ZEC → ${fmtBnb(Number(s.amountOutFormatted))} BNB`
                  : `${fmtBnb(Number(s.amountInFormatted))} BNB → ${fmtZec(Number(s.amountOutFormatted))} ZEC`}
              </span>
              <span className="block truncate text-[11px] text-faint">
                {new Date(s.createdAt).toLocaleString()} · {shortZ(s.depositAddress, 6)}
              </span>
            </span>
            <StatusPill status={s.status} direction={s.direction} deadline={s.deadline} />
          </button>
          {open === s.depositAddress && (
            <div className="mt-3 space-y-2 pl-11">
              <SwapProgress swap={s} />
              {!shouldPoll(s) ? (
                <button type="button" className="text-[11px] text-faint hover:text-down" onClick={() => removeSwap(s.depositAddress)}>
                  {t('hist.remove')}
                </button>
              ) : null}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
