'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import type { Stage } from '@/lib/types';
import { fmtAmt, weiToNum } from '@/lib/format';
import { Seal, Stalks, ZecGlyph } from './brand';

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
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label={t('ui.close')} onClick={onClose} />
      <div
        className={`relative max-h-[92vh] w-full overflow-y-auto animate-rise rounded-t-2xl border border-line bg-card p-5 shadow-2xl sm:rounded-2xl ${
          wide ? 'max-w-xl' : 'max-w-md'
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="rounded-full p-1.5 text-muted hover:bg-raised hover:text-fg" onClick={onClose} aria-label={t('ui.close')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionHead({ title, zh, sub, action }: { title: string; zh?: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex flex-wrap items-baseline gap-2 text-2xl font-semibold sm:text-[28px]">
          {title}
          {zh && <span className="zh-glyph text-base font-bold text-seal">{zh}</span>}
        </h2>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHead({ title, zh, sub, children }: { title: string; zh?: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden border-b border-line/60">
      <div className="ink-wash pointer-events-none absolute inset-0" aria-hidden />
      <Stalks className="pointer-events-none absolute -right-6 top-0 hidden h-[115%] w-40 opacity-25 md:block" />
      <div className="container relative py-10 sm:py-14">
        <h1 className="flex flex-wrap items-baseline gap-3 text-4xl font-semibold sm:text-5xl">
          {title}
          {zh && <span className="zh-glyph text-2xl font-bold text-seal sm:text-3xl">{zh}</span>}
        </h1>
        {sub && <p className="mt-3 max-w-2xl text-base text-muted">{sub}</p>}
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
    <div className="card relative overflow-hidden p-4" title={hint}>
      <div className="flex min-h-[2rem] items-start gap-1.5 text-xs leading-4 text-muted">
        {icon}
        <span className="line-clamp-2 min-w-0">{label}</span>
        {est && <span className="mt-px shrink-0 rounded bg-gold/15 px-1 py-px text-[10px] font-semibold uppercase leading-3 text-gold">{t('ui.est')}</span>}
      </div>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-24" />
      ) : (
        <div className="num mt-1.5 break-words font-display text-xl font-semibold sm:text-2xl">{value}</div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-transparent via-gold/40 to-transparent" />
    </div>
  );
}

/** BEP-20 ZEC (already ZEC, 18 decimals). For BNB-denominated values use ZecAmount from the zcash module. */
export function ZecValue({ zecWei, className = '' }: { zecWei: string | bigint | null | undefined; className?: string }) {
  return (
    <span className={`num ${className}`}>
      {fmtAmt(weiToNum(zecWei ?? '0'))} <span className="text-[0.8em] font-medium text-gold">ZEC</span>
    </span>
  );
}

export function Empty({ text, cta }: { text: string; cta?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <Stalks className="h-20 w-10 opacity-70" />
      <p className="max-w-md text-sm text-muted">{text}</p>
      {cta}
    </div>
  );
}

export function ErrorNote({ onRetry, detail }: { onRetry?: () => void; detail?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-down/40 bg-down/10 px-4 py-3 text-sm">
      <span className="flex-1">
        {t('ui.rpcError')}
        {detail && <span className="mt-0.5 block break-all font-mono text-[11px] text-muted">{detail}</span>}
      </span>
      {onRetry && (
        <button className="btn-ghost py-1" onClick={onRetry}>
          {t('ui.retry')}
        </button>
      )}
    </div>
  );
}

export function PrelaunchBanner({ compact = false, text }: { compact?: boolean; text?: string }) {
  const { t } = useI18n();
  return (
    <div className="card relative flex items-start gap-4 overflow-hidden p-4 sm:p-5">
      <Seal size={compact ? 36 : 44} className="shrink-0" />
      <div className="min-w-0">
        <span className="kicker">{t('pre.badge')}</span>
        <h3 className="mt-1 text-lg font-semibold">{t('pre.title')}</h3>
        {!compact && <p className="mt-1 text-sm text-muted">{text ?? t('pre.body')}</p>}
      </div>
    </div>
  );
}

const stageStyle: Record<Stage, string> = {
  seed: 'border-gold/50 text-gold bg-gold/10',
  shoot: 'border-accent/50 text-accent bg-accent/10',
  grove: 'border-bamboo-500/70 text-leaf-200 bg-bamboo-700/50',
};

export function StageBadge({ stage }: { stage: Stage }) {
  const { t, lang } = useI18n();
  const zh = lang === 'en' ? { seed: '笋芽', shoot: '春笋', grove: '竹林' }[stage] : null;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stageStyle[stage]}`}
      title={t(`stage.${stage}Hint` as Key)}
    >
      <StageIcon stage={stage} />
      {t(`stage.${stage}` as Key)}
      {zh && <span className="zh-glyph opacity-70">{zh}</span>}
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

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div
      className={`relative h-2 overflow-hidden rounded-full bg-raised ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-bamboo-500 via-shoot-300 to-leaf-200 transition-[width] duration-700"
        style={{ width: `${pct}%` }}
      />
      {[20, 40, 60, 80].map((x) => (
        <span key={x} className="absolute inset-y-0 w-px bg-bg/70" style={{ left: `${x}%` }} />
      ))}
    </div>
  );
}

const feeStyle: Record<number, string> = {
  0: 'text-gold',
  1: 'text-gold',
  2: 'text-accent',
  3: 'text-gold',
  4: 'text-seal',
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
      className={`relative shrink-0 overflow-hidden rounded-xl border border-line bg-gradient-to-br from-bamboo-700 to-bamboo-900 ${className}`}
      style={{ width: size, height: size }}
    >
      {show ? (
        <img src={src} alt={symbol} className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <span className="grid h-full w-full place-items-center font-display font-semibold text-leaf-200" style={{ fontSize: size * 0.38 }}>
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
      className={`chip ${className}`}
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
    <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          onClick={() => onChange(it.id)}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition ${
            value === it.id ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-raised hover:text-fg'
          }`}
        >
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
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted">{k}</span>
      <span className="num min-w-0 truncate text-right">{v}</span>
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok' | 'err'; children: React.ReactNode }) {
  const cls = {
    info: 'border-line bg-raised/60 text-muted',
    warn: 'border-gold/40 bg-gold/10 text-fg',
    ok: 'border-accent/40 bg-accent/10 text-fg',
    err: 'border-down/40 bg-down/10 text-fg',
  }[tone];
  return <div className={`rounded-xl border px-3.5 py-2.5 text-sm ${cls}`}>{children}</div>;
}
