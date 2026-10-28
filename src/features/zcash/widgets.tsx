'use client';

import { useEffect, useState } from 'react';
import { StatusDot } from '@/components/fx';
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
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="font-mono text-[12px] text-fg">{label}</span>
      {r === undefined ? (
        <span className="skeleton h-4 w-20" />
      ) : !h ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em] text-faint">
          <StatusDot tone="muted" />
          {t('rs.unknown')}
        </span>
      ) : h.ok ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-bamboo-hi">
          <StatusDot tone="green" />
          {t('rs.ok')}
          {h.timeEstimate ? <span className="normal-case tracking-normal text-muted">· ~{Math.max(1, Math.round(h.timeEstimate / 60))} min</span> : null}
        </span>
      ) : (
        <span className="max-w-[60%] text-right text-xs text-down">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium">
            <StatusDot tone="red" />
            {h.minUsd ? t('rs.min', { usd: h.minUsd.toLocaleString('en-US') }) : t('rs.down')}
          </span>
          {h.message && !h.minUsd && <span className="mt-0.5 block break-words font-mono text-[10px] text-muted">{h.message}</span>}
        </span>
      )}
    </div>
  );
  return (
    <div className="glass relative overflow-hidden p-4 sm:p-5">
      <div aria-hidden className="glow-green pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="kicker">{t('rs.title')}</span>
        {r?.checkedAt && <span className="font-mono text-[10px] text-faint num">{new Date(r.checkedAt).toLocaleTimeString()}</span>}
      </div>
      <div className="relative mt-2 divide-y divide-line/70 border-y border-line/70">
        {row(t('rs.in'), r?.in)}
        {row(t('rs.out'), r?.out)}
      </div>
      <p className="relative mt-3 text-[11px] leading-5 text-faint">{r?.authenticated ? t('rs.auth') : t('rs.unauth')}</p>
    </div>
  );
}

export function PriceLine() {
  const { t } = useZT();
  const { zecUsd, bnbUsd } = usePrices();
  if (!zecUsd || !bnbUsd)
    return (
      <span className="inline-flex items-center gap-2 font-mono text-[11px] text-faint">
        <StatusDot tone="muted" />
        {t('px.loading')}
      </span>
    );
  const cell = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line-2 bg-raised/70 px-3 py-1 font-mono text-[11px] text-muted num';
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={cell}>
        <StatusDot tone="green" />
        <span className="text-gold">1 ZEC</span> ≈ <span className="text-fg">${zecUsd.toFixed(2)}</span>
      </span>
      <span className={cell}>
        <span className="text-accent">1 BNB</span> ≈ <span className="text-fg">${bnbUsd.toFixed(2)}</span>
      </span>
      <span className={cell}>
        <span className="text-accent">1 BNB</span> ≈ <span className="text-gold">{fmtZec(bnbUsd / zecUsd)} ZEC</span>
      </span>
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
  if (!items.length)
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-line-2 px-4 py-5 text-sm text-faint">
        <span aria-hidden className="inline-flex flex-col items-center gap-[3px]">
          <span className="h-[3px] w-3 rounded-sm bg-line-2" />
          <span className="h-3 w-px bg-line-2" />
          <span className="h-[3px] w-3 rounded-sm bg-line-2" />
        </span>
        {t('hist.empty')}
      </div>
    );
  return (
    <ul className="divide-y divide-line/70 overflow-hidden rounded-xl border border-line">
      {items.map((s) => (
        <li key={s.depositAddress} className={open === s.depositAddress ? 'bg-white/[0.02]' : ''}>
          <button
            type="button"
            className="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.025] sm:px-4"
            onClick={() => setOpen(open === s.depositAddress ? null : s.depositAddress)}
            aria-expanded={open === s.depositAddress}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border font-mono text-sm ${
                s.direction === 'in' ? 'border-gold/40 bg-gold/10 text-gold' : 'border-bamboo/40 bg-bamboo/10 text-bamboo-hi'
              }`}
              aria-hidden
            >
              {s.direction === 'in' ? '↓' : '↑'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[13px] font-medium num">
                {s.direction === 'in' ? (
                  <>
                    <span className="text-gold">{fmtZec(Number(s.amountInFormatted))} ZEC</span> <span className="text-faint">→</span> {fmtBnb(Number(s.amountOutFormatted))} BNB
                  </>
                ) : (
                  <>
                    {fmtBnb(Number(s.amountInFormatted))} BNB <span className="text-faint">→</span> <span className="text-gold">{fmtZec(Number(s.amountOutFormatted))} ZEC</span>
                  </>
                )}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-faint">
                {new Date(s.createdAt).toLocaleString()} · {shortZ(s.depositAddress, 6)}
              </span>
            </span>
            <StatusPill status={s.status} direction={s.direction} deadline={s.deadline} />
          </button>
          {open === s.depositAddress && (
            <div className="space-y-2 px-3 pb-4 sm:pl-[3.75rem] sm:pr-4">
              <SwapProgress swap={s} />
              {!shouldPoll(s) ? (
                <button type="button" className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint transition hover:text-down" onClick={() => removeSwap(s.depositAddress)}>
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
