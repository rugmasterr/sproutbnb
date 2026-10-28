'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

const short = (s: string, n = 6) => (s.length > n * 2 + 3 ? `${s.slice(0, n)}…${s.slice(-4)}` : s);

/**
 * Contract / address chip with a copy button (veilit "token CA" style).
 *   <CopyChip label="CA" value={address} href={explorerToken(address)} />
 * `full` shows the whole value (wraps on mobile); otherwise it is shortened.
 */
export function CopyChip({
  value,
  label,
  href,
  full = false,
  className = '',
}: {
  value: string;
  label?: React.ReactNode;
  /** Optional explorer link for the value text. */
  href?: string;
  full?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const [ok, setOk] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setOk(true);
        setTimeout(() => setOk(false), 1400);
      },
      () => {},
    );
  };
  const text = full ? value : short(value);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-0 overflow-hidden rounded-full border border-line-2 bg-raised/80 font-mono text-xs ${className}`}
    >
      {label && (
        <span className="shrink-0 border-r border-line-2 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-accent">{label}</span>
      )}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`min-w-0 px-3 py-1.5 text-fg transition hover:text-accent-hi ${full ? 'break-all' : 'truncate'}`}
          title={value}
        >
          {text}
        </a>
      ) : (
        <span className={`min-w-0 px-3 py-1.5 text-fg ${full ? 'break-all' : 'truncate'}`} title={value}>
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 items-center self-stretch border-l border-line-2 px-2.5 text-muted transition hover:bg-white/[0.06] hover:text-accent-hi"
        aria-label={ok ? t('ui.copied') : `${t('ui.copy')} ${typeof label === 'string' ? label : ''}`.trim()}
        title={ok ? t('ui.copied') : t('ui.copy')}
      >
        {ok ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--bamboo-hi))" strokeWidth="2.4" aria-hidden>
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2.5" />
            <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
          </svg>
        )}
        <span className="sr-only" aria-live="polite">
          {ok ? t('ui.copied') : ''}
        </span>
      </button>
    </span>
  );
}
