'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import type { Stage } from '@/lib/types';
import { fmtAmt, weiToNum } from '@/lib/format';
import { Mark, Stalks, ZecGlyph } from './brand';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', k);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal aria-label={title}>
      <button className="absolute inset-0 bg-black/70 backdrop-blur-md" aria-label={t('ui.close')} onClick={onClose} />
      <div
        className={`relative max-h-[92vh] w-full animate-fade-up overflow-y-auto rounded-t-3xl border border-line-2 bg-raised p-5 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-3xl sm:p-6 ${
          wide ? 'max-w-xl' : 'max-w-md'
        }`}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-[-0.03em]">{title}</h2>
          <button className="icon-btn h-8 w-8" onClick={onClose} aria-label={t('ui.close')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Section heading. Optional mono `kicker` above (with `index` → "01 —"). */
export function SectionHead({
  title,
  zh,
  sub,
  action,
  kicker,
  index,
}: {
  title: string;
  zh?: string;
  sub?: string;
  action?: React.ReactNode;
  kicker?: string;
  index?: number;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {(kicker || index !== undefined) && (
          <span className="kicker mb-2.5">
            {index !== undefined && <span className="opacity-60">{String(index).padStart(2, '0')}</span>}
            {index !== undefined && kicker && <span aria-hidden className="h-px w-4 bg-current opacity-40" />}
            {kicker}
          </span>
        )}
        <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[1.75rem] font-semibold leading-[1.05] tracking-[-0.04em] sm:text-[2.25rem]">
          {title}
          {zh && <span className="zh-glyph text-base font-medium tracking-normal text-accent/80">{zh}</span>}
        </h2>
        {sub && <p className="mt-2 max-w-2xl text-sm text-muted sm:text-[15px]">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/** Inner-page head: kicker, big tight title, softer subline, faint grid + yellow glow + stalks. */
export function PageHead({
  title,
  zh,
  sub,
  kicker,
  children,
}: {
  title: string;
  zh?: string;
  sub?: string;
  kicker?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative overflow-hidden border-b border-line">
      <div className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div className="ink-wash pointer-events-none absolute inset-0" aria-hidden />
      <Stalks className="pointer-events-none absolute -right-4 bottom-0 hidden h-[120%] w-44 opacity-60 md:block" />
      <div className="container relative py-12 sm:py-20">
        {kicker && <span className="kicker mb-4">{kicker}</span>}
        <h1 className="h1 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span>{title}</span>
          {zh && <span className="zh-glyph text-2xl font-bold tracking-normal text-accent sm:text-3xl">{zh}</span>}
        </h1>
        {sub && <p className="lede mt-5 max-w-2xl">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  est,
  loading,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  est?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="card group relative overflow-hidden p-4 transition-colors hover:border-line-2 sm:p-5" title={hint}>
      <div className="flex min-h-[2rem] items-start gap-1.5 font-mono text-[10.5px] font-medium uppercase leading-4 tracking-[0.08em] text-faint">
        {icon}
        <span className="line-clamp-2 min-w-0">{label}</span>
        {est && (
          <span className="mt-px shrink-0 rounded border border-accent/40 px-1 py-px text-[9px] font-medium uppercase leading-3 text-accent">{t('ui.est')}</span>
        )}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-8 w-28" />
      ) : (
        <div className="num mt-2 break-words font-display text-[1.6rem] font-semibold leading-tight tracking-[-0.04em] sm:text-[1.9rem]">{value}</div>
      )}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent opacity-60 transition-opacity group-hover:opacity-100" />
    </div>
  );
}

/** BEP-20 ZEC (already ZEC, 18 decimals). For BNB-denominated values use ZecAmount from the zcash module. */
export function ZecValue({ zecWei, className = '' }: { zecWei: string | bigint | null | undefined; className?: string }) {
  return (
    <span className={`num ${className}`}>
      {fmtAmt(weiToNum(zecWei ?? '0'))} <span className="font-mono text-[0.62em] font-medium tracking-normal text-gold">ZEC</span>
    </span>
  );
}

export function Empty({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div className="card relative flex flex-col items-center justify-center gap-3 overflow-hidden px-6 py-12 text-center">
      <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-50" />
      <Stalks className="relative h-20 w-10 opacity-80" />
      <p className="relative max-w-md text-sm text-muted">{text}</p>
      {cta && <div className="relative">{cta}</div>}
    </div>
  );
}

export function ErrorNote({ onRetry, detail }: { onRetry?: () => void; detail?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-down/40 bg-down/[0.07] px-4 py-3 text-sm">
      <span aria-hidden className="status-dot" style={{ ['--dot' as string]: 'rgb(var(--down))' }} />
      <span className="min-w-0 flex-1">
        {t('ui.rpcError')}
        {detail && <span className="mt-0.5 block break-all font-mono text-[11px] text-muted">{detail}</span>}
      </span>
      {onRetry && (
        <button className="btn-ghost btn-sm" onClick={onRetry}>
          {t('ui.retry')}
        </button>
      )}
    </div>
  );
}

export function PrelaunchBanner({ compact = false, text }: { compact?: boolean; text?: string }) {
  const { t } = useI18n();
  return (
    <div className="glass relative flex items-start gap-4 overflow-hidden p-4 sm:p-5">
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full glow-yellow" />
      <span aria-hidden className={`relative grid shrink-0 place-items-center rounded-xl border border-accent/35 bg-ink/70 shadow-[0_0_24px_-6px_rgb(var(--accent)/0.55)] ${compact ? 'h-9 w-9' : 'h-11 w-11'}`}>
        <Mark size={compact ? 20 : 26} />
      </span>
      <div className="relative min-w-0">
        <span className="kicker">
          <span aria-hidden className="status-dot" data-pulse="true" style={{ ['--dot' as string]: 'rgb(var(--accent))' }} />
          {t('pre.badge')}
        </span>
        <h3 className="mt-1.5 text-lg font-semibold tracking-[-0.025em]">{t('pre.title')}</h3>
        {!compact && <p className="mt-1 text-sm text-muted">{text ?? t('pre.body')}</p>}
      </div>
    </div>
  );
}

const stageStyle: Record<Stage, string> = {
  seed: 'border-accent/45 text-accent-hi bg-accent/10',
  shoot: 'border-bamboo/50 text-bamboo-hi bg-bamboo/10',
  grove: 'border-bamboo-hi/50 text-[#04140a] bg-bamboo-hi',
};

export function StageBadge({ stage }: { stage: Stage }) {
  const { t, lang } = useI18n();
  const zh = lang === 'en' ? { seed: '笋芽', shoot: '春笋', grove: '竹林' }[stage] : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase tracking-[0.06em] ${stageStyle[stage]}`}
      title={t(`stage.${stage}Hint` as Key)}
    >
      <StageIcon stage={stage} />
      {t(`stage.${stage}` as Key)}
      {zh && <span className="zh-glyph normal-case tracking-normal opacity-75">{zh}</span>}
    </span>
  );
}

function StageIcon({ stage }: { stage: Stage }) {
  if (stage === 'seed')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M5 9 Q2 6 5 1 Q8 6 5 9Z" fill="currentColor" />
      </svg>
    );
  if (stage === 'shoot')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M3 9 L4 4 L5 1 L6 4 L7 9Z" fill="currentColor" />
      </svg>
    );
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden>
      <rect x="1" y="0" width="2" height="10" rx="1" fill="currentColor" />
      <rect x="5" y="2" width="2" height="8" rx="1" fill="currentColor" />
      <rect x="9" y="1" width="2" height="9" rx="1" fill="currentColor" />
    </svg>
  );
}

/** Bonding-curve progress as a bamboo stalk: yellow → green fill, node ticks every 20%. */
export function Progress({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div
      className={`relative h-1.5 overflow-hidden rounded-full bg-white/[0.07] ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-accent-deep via-accent to-bamboo-hi shadow-[0_0_12px_rgb(var(--accent)/0.55)] transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
      {[20, 40, 60, 80].map((x) => (
        <span key={x} className="absolute inset-y-0 w-[2px] bg-bg" style={{ left: `${x}%` }} />
      ))}
    </div>
  );
}

const feeStyle: Record<number, string> = {
  0: 'text-gold',
  1: 'text-gold',
  2: 'text-bamboo-hi',
  3: 'text-gold',
  4: 'text-gold',
};

/** Fee label for a coin's deployer's choice (always paid in ZEC). */
export function FeeDest({ mode, className = '' }: { mode: number; className?: string }) {
  const { t } = useI18n();
  const m = mode >= 0 && mode <= 4 ? mode : 0;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${feeStyle[m]} ${className}`}>
      <ZecGlyph size={12} />
      {t(`fee.${m}` as Key)}
    </span>
  );
}

export function CoinImage({ src, symbol, size = 48, className = '' }: { src?: string | null; symbol: string; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const show = src && !broken;
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl border border-line-2 bg-gradient-to-br from-ink-4 to-raised ${className}`}
      style={{ width: size, height: size }}
    >
      {show ? (
        <img src={src} alt={symbol} className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="grid h-full w-full place-items-center font-mono font-medium text-accent" style={{ fontSize: size * 0.36 }}>
          {symbol.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
}

export function CopyButton({ value, className = '' }: { value: string; className?: string }) {
  const { t } = useI18n();
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={`chip ${ok ? 'border-bamboo/60 text-bamboo-hi' : ''} ${className}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => {
            setOk(true);
            setTimeout(() => setOk(false), 1200);
          },
          () => {},
        );
      }}
    >
      {ok ? t('ui.copied') : t('ui.copy')}
    </button>
  );
}

export function Ext({ href, children, className = 'link' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/** Segmented tabs (pill track, active = raised white wash). */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: { id: T; label: string }[];
}) {
  return (
    <div className="seg max-w-full" role="tablist">
      {items.map((it) => (
        <button key={it.id} type="button" role="tab" aria-selected={value === it.id} onClick={() => onChange(it.id)} className="seg-btn">
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function InternalLink({ href, children, className = 'link' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line/70 py-2 text-sm last:border-0">
      <span className="text-muted">{k}</span>
      <span className="num min-w-0 truncate text-right font-medium">{v}</span>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'err'; children: React.ReactNode }) {
  const cls = {
    info: 'border-line-2 bg-white/[0.03] text-muted',
    warn: 'border-accent/35 bg-accent/[0.07] text-fg',
    ok: 'border-bamboo/40 bg-bamboo/[0.08] text-fg',
    err: 'border-down/40 bg-down/[0.08] text-fg',
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>{children}</div>;
}
