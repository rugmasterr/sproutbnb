'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ZecGlyph } from '@/components/brand';
import { StatusDot } from '@/components/fx';
import { explorerTx } from '@/lib/config';
import { ALL_KINDS, isValidZcashAddress, shortZ, zcashAddressKind, zcashAddressProblem, type ZcashAddressKind } from './address';
import { ZCASH_EXPLORER_TX } from './constants';
import type { ZKey } from './i18n';
import { useZT } from './i18n-hook';
import { FINAL, isExpired, type SwapStatus, type TrackedSwap } from './oneclick';
import { useZec } from './provider';
import { NodeStepper, useL, ZC } from './zfx';

const nf = (d: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 });
export function fmtZec(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  return nf(a >= 100 ? 2 : a >= 1 ? 4 : a >= 0.0001 ? 6 : 8).format(n);
}
export const fmtBnb = (n: number) => nf(Math.abs(n) >= 1 ? 4 : 6).format(n);
export const fmtUsd = (n: number) => `$${nf(2).format(n)}`;

// ------------------------------------------------------------------------------------------- ZecAmount

/** A BNB amount (wei) shown in ZEC at the live 1Click rate, e.g. "1.2345 ZEC ≈ 0.42 BNB". Falls back to BNB. */
export function ZecAmount({ wei, showBnb, className = '' }: { wei: bigint; showBnb?: boolean; className?: string }) {
  const { bnbWeiToZec } = useZec();
  const zec = bnbWeiToZec(wei);
  const bnb = Number(wei) / 1e18;
  if (zec === null)
    return (
      <span className={`num ${className}`} title="ZEC rate unavailable">
        {fmtBnb(bnb)} <span className="font-mono text-[0.72em] font-medium tracking-normal text-muted">BNB</span>
      </span>
    );
  return (
    <span className={`num ${className}`}>
      {fmtZec(zec)} <span className="font-mono text-[0.72em] font-medium tracking-normal text-gold">ZEC</span>
      {showBnb && <span className="ml-1.5 font-mono text-[0.72em] font-normal tracking-normal text-muted">≈ {fmtBnb(bnb)} BNB</span>}
    </span>
  );
}

// ------------------------------------------------------------------------------------------- address input

const KIND_KEY: Record<ZcashAddressKind, ZKey> = { t: 'addr.kind.t', shielded: 'addr.kind.shielded', unified: 'addr.kind.unified' };

export function ZcashAddressInput({
  value,
  onChange,
  kinds = ALL_KINDS,
  label,
  placeholder,
  id,
}: {
  value: string;
  onChange(v: string): void;
  kinds?: ZcashAddressKind[];
  label?: string;
  placeholder?: string;
  id?: string;
}) {
  const { t } = useZT();
  const [touched, setTouched] = useState(false);
  const problem = useMemo(() => (value ? zcashAddressProblem(value, kinds) : null), [value, kinds]);
  const kind = value ? zcashAddressKind(value) : null;
  const inputId = id || `zaddr-${kinds.join('')}`;
  const ph = placeholder || kinds.map((k) => ({ t: 't1…', shielded: 'zs1…', unified: 'u1…' })[k]).join(' / ');
  return (
    <div className="block">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          id={inputId}
          className={`input-mono pr-28 ${problem && touched ? 'border-down/70 focus:border-down/70' : kind && !problem ? 'border-bamboo/45' : ''}`}
          value={value}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          placeholder={ph}
          onBlur={() => setTouched(true)}
          onChange={(e) => onChange(e.target.value.replace(/\s+/g, ''))}
          aria-invalid={Boolean(problem)}
          aria-describedby={`${inputId}-hint`}
        />
        {kind && !problem && (
          <span className="tag-green pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 bg-bamboo/10">
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            {t(KIND_KEY[kind])}
          </span>
        )}
      </div>
      <p id={`${inputId}-hint`} className={`mt-1.5 text-[11px] leading-4 ${problem && touched ? 'text-down' : 'text-faint'}`}>
        {problem === 'kind' && touched
          ? t('addr.wrongKind', { kinds: kinds.map((k) => t(KIND_KEY[k])).join(' / ') })
          : problem === 'invalid' && touched
            ? t('addr.invalid')
            : t('addr.accepts', { kinds: kinds.map((k) => t(KIND_KEY[k])).join(' / ') })}
      </p>
    </div>
  );
}

export { isValidZcashAddress };

// ------------------------------------------------------------------------------------------- small UI

function CopyIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--bamboo-hi))" strokeWidth="2.4" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
    </svg>
  );
}

/** Label + mono value well with a copy button. `big` = the amount to send (large, ZEC yellow). */
export function CopyField({ label, value, mono = true, big = false }: { label: string; value: string; mono?: boolean; big?: boolean }) {
  const { t } = useZT();
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`well flex items-stretch overflow-hidden ${big ? 'border-accent/30' : ''}`}>
        <div
          className={`min-w-0 flex-1 break-all px-3.5 ${big ? 'py-2.5 font-mono text-[1.65rem] font-semibold leading-tight tracking-[-0.03em] text-gold num' : `py-2.5 text-[13px] leading-5 text-fg ${mono ? 'font-mono' : ''}`}`}
        >
          {value}
          {big && <span className="ml-2 font-mono text-xs font-medium tracking-normal text-gold/70">ZEC</span>}
        </div>
        <button
          type="button"
          className={`flex shrink-0 items-center gap-1.5 border-l border-line px-3 font-mono text-[11px] font-medium uppercase tracking-[0.06em] transition hover:bg-white/[0.05] ${ok ? 'text-bamboo-hi' : 'text-muted hover:text-accent-hi'}`}
          onClick={() =>
            navigator.clipboard?.writeText(value).then(
              () => {
                setOk(true);
                setTimeout(() => setOk(false), 1400);
              },
              () => {},
            )
          }
        >
          <CopyIcon ok={ok} />
          <span className="hidden sm:inline">{ok ? t('ui.copied') : t('ui.copy')}</span>
          <span className="sr-only sm:hidden">{ok ? t('ui.copied') : t('ui.copy')}</span>
        </button>
      </div>
    </div>
  );
}

export function Countdown({ to, className = '' }: { to: string | number; className?: string }) {
  const { t } = useZT();
  const target = typeof to === 'number' ? to : Date.parse(to);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!Number.isFinite(target)) return null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className={`num font-mono ${left < 600 ? 'text-down' : ''} ${className}`}>
      {left === 0 ? t('dep.expired') : `${m}:${String(s).padStart(2, '0')}`}
    </span>
  );
}

export function Qr({ value, size = 168 }: { value: string; size?: number }) {
  // Light plate, dark modules: keeps the code reliably scannable inside the dark UI.
  return <QRCodeSVG value={value} size={size} bgColor="#F2F0E8" fgColor="#07080A" level="M" marginSize={0} />;
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Glass callout with a coloured leading edge. info = hairline, warn = yellow, ok = green, err = red. */
export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'err'; children: React.ReactNode }) {
  const cls = {
    info: { box: 'border-line-2 bg-white/[0.025] text-muted', edge: 'bg-line-2' },
    warn: { box: 'border-accent/30 bg-accent/[0.06] text-fg', edge: 'bg-accent shadow-[0_0_12px_rgb(var(--accent)/0.7)]' },
    ok: { box: 'border-bamboo/35 bg-bamboo/[0.07] text-fg', edge: 'bg-bamboo shadow-[0_0_12px_rgb(var(--bamboo)/0.7)]' },
    err: { box: 'border-down/40 bg-down/[0.07] text-fg', edge: 'bg-down shadow-[0_0_12px_rgb(var(--down)/0.6)]' },
  }[tone];
  return (
    <div className={`relative overflow-hidden rounded-xl border py-2.5 pl-4 pr-3.5 text-sm leading-6 ${cls.box}`}>
      <span aria-hidden className={`absolute inset-y-2 left-0 w-[2px] rounded-full ${cls.edge}`} />
      {children}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- swap status

const STEPS: SwapStatus[] = ['PENDING_DEPOSIT', 'KNOWN_DEPOSIT_TX', 'PROCESSING', 'SUCCESS'];

export function statusKey(s: SwapStatus, direction: 'in' | 'out'): ZKey {
  return `st.${direction}.${s}` as ZKey;
}

export function StatusPill({ status, direction, deadline }: { status: SwapStatus; direction: 'in' | 'out'; deadline?: string }) {
  const { t } = useZT();
  if (isExpired({ status, deadline })) {
    return (
      <span className="tag-muted shrink-0">
        <StatusDot tone="muted" pulse={false} />
        {t('stshort.EXPIRED')}
        <span className="sr-only">{t(direction === 'in' ? 'st.in.EXPIRED' : 'st.out.EXPIRED')}</span>
      </span>
    );
  }
  const live = !FINAL.includes(status);
  const [cls, tone] =
    status === 'SUCCESS'
      ? (['tag-green bg-bamboo/10', 'green'] as const)
      : status === 'REFUNDED'
        ? (['tag-yellow bg-accent/10', 'yellow'] as const)
        : status === 'FAILED' || status === 'INCOMPLETE_DEPOSIT'
          ? (['tag-red bg-down/10', 'red'] as const)
          : (['tag-yellow', 'yellow'] as const);
  return (
    <span className={`${cls} shrink-0`}>
      <StatusDot tone={tone} pulse={live} />
      {t(`stshort.${status}` as ZKey)}
      <span className="sr-only">{t(statusKey(status, direction))}</span>
    </span>
  );
}

/** Swap timeline: numbered nodes (done = green, live = pulsing yellow, failed = red), status message, tx links. */
export function SwapProgress({ swap }: { swap: TrackedSwap }) {
  const { t } = useZT();
  const l = useL();
  const idx = swap.status === 'INCOMPLETE_DEPOSIT' ? 1 : Math.max(0, STEPS.indexOf(swap.status));
  const failed = swap.status === 'FAILED' || swap.status === 'REFUNDED' || swap.status === 'INCOMPLETE_DEPOSIT';
  const expired = isExpired(swap);
  const current = swap.status === 'SUCCESS' ? STEPS.length : idx;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label">{t('st.progress')}</span>
        {!FINAL.includes(swap.status) && !expired && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-accent">
            <StatusDot tone="yellow" />
            {l(ZC.live)}
          </span>
        )}
      </div>
      <NodeStepper steps={STEPS.map((s) => t(`stshort.${s}` as ZKey))} current={current} failed={failed || expired} label={t('st.progress')} />
      <Callout tone={swap.status === 'SUCCESS' ? 'ok' : swap.status === 'FAILED' || swap.status === 'INCOMPLETE_DEPOSIT' ? 'err' : swap.status === 'REFUNDED' || expired ? 'warn' : 'info'}>
        {expired ? t(swap.direction === 'in' ? 'st.in.EXPIRED' : 'st.out.EXPIRED') : t(statusKey(swap.status, swap.direction), { refund: shortZ(swap.refundTo, 6) })}
      </Callout>
      <TxLinks swap={swap} />
    </div>
  );
}

export function TxLinks({ swap }: { swap: TrackedSwap }) {
  const { t } = useZT();
  const zLink = (h: string) => ZCASH_EXPLORER_TX(h);
  const bLink = (h: string) => explorerTx(h);
  const origin = swap.direction === 'in' ? zLink : bLink;
  const dest = swap.direction === 'in' ? bLink : zLink;
  const items = [
    ...(swap.bscTx ? [{ k: t('tx.bsc'), h: swap.bscTx, href: bLink(swap.bscTx) }] : []),
    ...(swap.originTx || []).filter((h) => h !== swap.bscTx).map((h) => ({ k: t('tx.origin'), h, href: origin(h) })),
    ...(swap.destinationTx || []).map((h) => ({ k: t('tx.destination'), h, href: dest(h) })),
  ];
  if (!items.length) return null;
  return (
    <ul className="divide-y divide-line/70 rounded-xl border border-line text-xs">
      {items.map((x) => (
        <li key={x.k + x.h} className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">{x.k}</span>
          <a className="font-mono text-accent-hi transition hover:text-accent" href={x.href} target="_blank" rel="noopener noreferrer">
            {shortZ(x.h, 6)} <span aria-hidden>↗</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ZecBadge({ className = '' }: { className?: string }) {
  return <ZecGlyph size={14} className={className} />;
}
