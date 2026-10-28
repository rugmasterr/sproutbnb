'use client';

import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ZecGlyph } from '@/components/brand';
import { explorerTx } from '@/lib/config';
import { ALL_KINDS, isValidZcashAddress, shortZ, zcashAddressKind, zcashAddressProblem, type ZcashAddressKind } from './address';
import { ZCASH_EXPLORER_TX } from './constants';
import type { ZKey } from './i18n';
import { useZT } from './i18n-hook';
import { FINAL, isExpired, type SwapStatus, type TrackedSwap } from './oneclick';
import { useZec } from './provider';

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
        {fmtBnb(bnb)} <span className="text-[0.8em] font-medium text-muted">BNB</span>
      </span>
    );
  return (
    <span className={`num ${className}`}>
      {fmtZec(zec)} <span className="text-[0.8em] font-medium text-gold">ZEC</span>
      {showBnb && <span className="ml-1.5 text-[0.82em] text-muted">≈ {fmtBnb(bnb)} BNB</span>}
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
          className={`input pr-24 font-mono text-[13px] ${problem && touched ? 'border-down/70 focus:border-down/70 focus:ring-down/20' : ''}`}
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
          <span className="pointer-events-none absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
              <path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            {t(KIND_KEY[kind])}
          </span>
        )}
      </div>
      <p id={`${inputId}-hint`} className={`mt-1 text-[11px] ${problem && touched ? 'text-down' : 'text-faint'}`}>
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

export function CopyField({ label, value, mono = true, big = false }: { label: string; value: string; mono?: boolean; big?: boolean }) {
  const { t } = useZT();
  const [ok, setOk] = useState(false);
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-stretch gap-2">
        <div className={`min-w-0 flex-1 break-all rounded-xl border border-line bg-raised/70 px-3 py-2 ${mono ? 'font-mono' : ''} ${big ? 'text-lg font-semibold' : 'text-[13px]'}`}>
          {value}
        </div>
        <button
          type="button"
          className="btn-ghost shrink-0 px-3"
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
          {ok ? t('ui.copied') : t('ui.copy')}
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
    <span className={`num ${left < 600 ? 'text-down' : ''} ${className}`}>
      {left === 0 ? t('dep.expired') : `${m}:${String(s).padStart(2, '0')}`}
    </span>
  );
}

export function Qr({ value, size = 168 }: { value: string; size?: number }) {
  return (
    <div className="inline-block rounded-2xl bg-paper p-3 shadow-[0_8px_30px_-12px_rgb(var(--gold)/0.5)]">
      <QRCodeSVG value={value} size={size} bgColor="#F4EEDC" fgColor="#141613" level="M" marginSize={0} />
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'err'; children: React.ReactNode }) {
  const cls = {
    info: 'border-line bg-raised/60 text-muted',
    warn: 'border-gold/40 bg-gold/10 text-fg',
    ok: 'border-accent/40 bg-accent/10 text-fg',
    err: 'border-down/40 bg-down/10 text-fg',
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm leading-6 ${cls}`}>{children}</div>;
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
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold text-faint">
        {t('stshort.EXPIRED')}
        <span className="sr-only">{t(direction === 'in' ? 'st.in.EXPIRED' : 'st.out.EXPIRED')}</span>
      </span>
    );
  }
  const tone =
    status === 'SUCCESS'
      ? 'border-accent/50 bg-accent/15 text-accent'
      : status === 'REFUNDED'
        ? 'border-gold/50 bg-gold/10 text-gold'
        : status === 'FAILED' || status === 'INCOMPLETE_DEPOSIT'
          ? 'border-down/50 bg-down/10 text-down'
          : 'border-line bg-raised text-muted';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {!FINAL.includes(status) && <Spinner className="h-3 w-3" />}
      {t(`stshort.${status}` as ZKey)}
      <span className="sr-only">{t(statusKey(status, direction))}</span>
    </span>
  );
}

export function SwapProgress({ swap }: { swap: TrackedSwap }) {
  const { t } = useZT();
  const idx = swap.status === 'INCOMPLETE_DEPOSIT' ? 1 : Math.max(0, STEPS.indexOf(swap.status));
  const failed = swap.status === 'FAILED' || swap.status === 'REFUNDED';
  return (
    <div className="space-y-3">
      <ol className="grid grid-cols-4 gap-1.5" aria-label={t('st.progress')}>
        {STEPS.map((s, i) => (
          <li key={s} className="min-w-0">
            <div
              className={`h-1.5 rounded-full ${
                failed ? (i <= idx ? 'bg-gold/70' : 'bg-raised') : i < idx || swap.status === 'SUCCESS' ? 'bg-accent' : i === idx ? 'animate-pulse bg-accent/60' : 'bg-raised'
              }`}
            />
            <div className={`mt-1 truncate text-[10px] ${i <= idx ? 'text-fg' : 'text-faint'}`}>{t(`stshort.${s}` as ZKey)}</div>
          </li>
        ))}
      </ol>
      <Callout tone={swap.status === 'SUCCESS' ? 'ok' : swap.status === 'FAILED' || swap.status === 'INCOMPLETE_DEPOSIT' ? 'err' : swap.status === 'REFUNDED' || isExpired(swap) ? 'warn' : 'info'}>
        {isExpired(swap)
          ? t(swap.direction === 'in' ? 'st.in.EXPIRED' : 'st.out.EXPIRED')
          : t(statusKey(swap.status, swap.direction), { refund: shortZ(swap.refundTo, 6) })}
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
    <ul className="space-y-1 text-xs">
      {items.map((x) => (
        <li key={x.k + x.h} className="flex items-center justify-between gap-2">
          <span className="text-muted">{x.k}</span>
          <a className="link font-mono" href={x.href} target="_blank" rel="noopener noreferrer">
            {shortZ(x.h, 6)}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ZecBadge({ className = '' }: { className?: string }) {
  return <ZecGlyph size={14} className={className} />;
}
