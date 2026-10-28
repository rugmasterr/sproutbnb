'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAddress, isAddress, type Address } from 'viem';
import { ZecAmount } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { TokenStatus } from '@/lib/abi/portal';
import { explorerAddr, explorerToken, TERMINAL_LIVE } from '@/lib/config';
import { big, fmtAmt, fmtNum, fmtPct, shortAddr, weiToNum } from '@/lib/format';
import { useToken } from '@/lib/useApi';
import type { TokenResponse } from '@/lib/types';
import { PriceZec } from './CoinView';
import { BambooBar, CopyChip, Kicker, StatusDot, StatusLine } from './fx';
import { TradePanel } from './TradePanel';
import { useCopy } from './tradeCopy';
import { CoinImage, Empty, ErrorNote, Ext, Notice, PrelaunchBanner, StageBadge } from './ui';

const STATUS_NAME: Record<number, string> = { 0: 'Invalid', 1: 'Tradable', 2: 'InDuel', 3: 'Killed', 4: 'DEX', 5: 'Staged' };

export function guardOf(d: TokenResponse | undefined): 'invalid' | 'tax' | null {
  if (!d || !d.valid || !d.state) return 'invalid';
  if (d.state.status !== TokenStatus.Tradable && d.state.status !== TokenStatus.DEX) return 'invalid';
  if (d.state.buyTaxBps > 500 || d.state.sellTaxBps > 500) return 'tax';
  return null;
}

type Tone = 'green' | 'red' | 'muted';

function Guard({ d }: { d: TokenResponse }) {
  const { t } = useI18n();
  const c = useCopy();
  const st = d.state;
  const g = guardOf(d);
  const yes = (b: boolean) => (b ? t('ui.yes') : t('ui.no'));
  const statusOk = Boolean(st && (st.status === TokenStatus.Tradable || st.status === TokenStatus.DEX));
  const taxOk = Boolean(st && st.buyTaxBps <= 500 && st.sellTaxBps <= 500);
  const rows: { k: string; v: React.ReactNode; tone: Tone }[] = [
    { k: t('term.status'), v: st ? STATUS_NAME[st.status] ?? String(st.status) : '—', tone: st ? (statusOk ? 'green' : 'red') : 'muted' },
    {
      k: t('term.taxes'),
      v: st ? `${fmtPct(st.buyTaxBps / 10_000, 2)} / ${fmtPct(st.sellTaxBps / 10_000, 2)}` : '—',
      tone: st ? (taxOk ? 'green' : 'red') : 'muted',
    },
    { k: t('term.progress'), v: st ? `${fmtNum((d.stage === 'grove' ? 1 : st.progress) * 100, { max: 1 })}%` : '—', tone: 'muted' },
    {
      k: t('term.pool'),
      v: st?.pool ? (
        <Ext href={explorerAddr(st.pool)} className="link font-mono text-xs">
          {shortAddr(st.pool)}
        </Ext>
      ) : (
        '—'
      ),
      tone: 'muted',
    },
    { k: t('term.planted'), v: yes(Boolean(d.sprout)), tone: d.sprout ? 'green' : 'muted' },
  ];
  return (
    <div className="box">
      <div className="box-h">
        <Kicker index={2}>{c('guardKicker')}</Kicker>
        {g ? (
          <span className="tag-red">{c('blocked')}</span>
        ) : (
          <span className="tag-green">{c('pass')}</span>
        )}
      </div>
      <div className="px-4 pt-3 sm:px-5">
        <h3 className="text-lg font-semibold tracking-[-0.025em]">{t('term.guard')}</h3>
        <p className="mt-1 text-xs text-gold">{t('term.never')}</p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="table-tech">
          <thead>
            <tr>
              <th className="pl-4 sm:pl-5">{c('check')}</th>
              <th className="num pr-4 sm:pr-5">{c('value')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.k}>
                <td className="pl-4 text-muted sm:pl-5">
                  <span className="inline-flex items-center gap-2.5">
                    <StatusDot tone={r.tone} pulse={false} />
                    {r.k}
                  </span>
                </td>
                <td className="num pr-4 font-mono text-[13px] font-medium sm:pr-5">{r.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 sm:px-5">
        <p className="text-[11px] leading-relaxed text-faint">{t('term.refuses')}</p>
        {g && (
          <div className="mt-3">
            <Notice tone="err">{t('term.blocked', { why: g === 'tax' ? t('term.whyTax') : t('term.whyInvalid') })}</Notice>
          </div>
        )}
      </div>
    </div>
  );
}

export function TerminalView() {
  const { t } = useI18n();
  const cp = useCopy();
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

  const valid = isAddress(input.trim());

  return (
    <div className="space-y-6">
      {!TERMINAL_LIVE && <PrelaunchBanner text={t('pre.terminalDisabled')} />}
      <form onSubmit={load} className="box relative">
        <div aria-hidden className="lines-bg fade-mask-b pointer-events-none absolute inset-0 opacity-60" />
        <div className="box-h relative">
          <Kicker index={1}>{cp('command')}</Kicker>
          <StatusLine tone={TERMINAL_LIVE ? 'green' : 'yellow'} pulse={TERMINAL_LIVE}>
            BNB Chain
          </StatusLine>
        </div>
        <div className="relative flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
          <label className="block min-w-0 flex-1">
            <span className="label">{t('term.ca')}</span>
            <span className="relative block">
              <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm text-accent">
                ›
              </span>
              <input
                className="input-mono py-3 pl-8 pr-12"
                value={input}
                spellCheck={false}
                autoComplete="off"
                placeholder="0x…7777"
                onChange={(e) => setInput(e.target.value.trim())}
              />
              {input && (
                <span
                  aria-hidden
                  className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.08em] ${
                    valid ? 'text-bamboo-hi' : 'text-faint'
                  }`}
                >
                  {valid ? 'OK' : '0x…'}
                </span>
              )}
            </span>
          </label>
          <button type="submit" className="btn-primary py-3" disabled={!valid}>
            {t('term.load')} <span className="arr">→</span>
          </button>
        </div>
        <p className="relative border-t border-line px-4 py-2.5 font-mono text-[11px] text-faint sm:px-5">{t('term.fee')}</p>
      </form>

      {!ca ? (
        <Empty text={t('term.empty')} />
      ) : q.isLoading ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-6">
            <div className="skeleton h-32 w-full rounded-2xl" />
            <div className="skeleton h-72 w-full rounded-2xl" />
          </div>
          <div className="skeleton h-96 w-full rounded-2xl" />
        </div>
      ) : !d || (!d.ok && !d.valid) ? (
        <ErrorNote onRetry={() => q.refetch()} detail={d?.error} />
      ) : !d.valid ? (
        <Empty text={t('coin.notFound')} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="min-w-0 space-y-6">
            <div className="box">
              <div className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
                <CoinImage src={d.meta?.image} symbol={d.symbol ?? '?'} size={60} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="min-w-0 truncate text-2xl font-semibold tracking-[-0.035em]">{d.name}</h2>
                    {d.stage && <StageBadge stage={d.stage} />}
                  </div>
                  <div className="mt-1 font-mono text-xs font-medium uppercase tracking-[0.06em] text-accent-hi">${d.symbol}</div>
                </div>
                <div className="w-full sm:w-auto">
                  <CopyChip label="CA" value={d.address} href={explorerToken(d.address)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-px border-t border-line bg-line">
                <div className="min-w-0 bg-ink-2 px-4 py-3 sm:px-5">
                  <div className="mono-label">{t('coin.price')}</div>
                  <div className="mt-1 truncate font-mono text-[15px] font-semibold">
                    <PriceZec priceWei={d.state?.priceWei} />
                  </div>
                </div>
                <div className="min-w-0 bg-ink-2 px-4 py-3 sm:px-5">
                  <div className="mono-label">{t('coin.mcap')}</div>
                  <div className="mt-1 truncate font-mono text-[15px] font-semibold">
                    <ZecAmount wei={big(d.state?.mcapWei)} />
                  </div>
                  <div className="num truncate font-mono text-[10.5px] text-faint">≈ {fmtAmt(weiToNum(d.state?.mcapWei))} BNB</div>
                </div>
              </div>
              <div className="border-t border-line px-4 py-3 sm:px-5">
                <BambooBar
                  value={d.stage === 'grove' ? 1 : d.state?.progress ?? 0}
                  segments={10}
                  tone={d.stage === 'grove' ? 'green' : 'yellow'}
                  label={t('term.progress')}
                />
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
          <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <TradePanel token={d.address as Address} symbol={d.symbol ?? ''} venue="terminal" disabledReason={disabledReason} />
          </div>
        </div>
      )}
    </div>
  );
}
