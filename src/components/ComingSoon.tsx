'use client';

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { ACTIONS_ENABLED } from '@/lib/config';

/**
 * Action gate. With NEXT_PUBLIC_ACTIONS_ENABLED !== 'true' every transaction (launch, trade, deposit, cash out,
 * flush) shows a short bilingual notice instead of running: nothing is signed or sent. Navigating, filling in
 * forms, connecting a wallet and Zcash/passkey sign-in still work. With the flag on, gated handlers pass through.
 */
const Ctx = createContext<() => void>(() => {});

const SHOW_MS = 4200;

export function ComingSoonProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = useCallback(() => {
    setOpen(true);
    setN((x) => x + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), SHOW_MS);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <Ctx.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[130] flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-8">
        {open && (
          <div
            key={n}
            role="status"
            data-testid="coming-soon"
            className="pointer-events-auto relative w-full max-w-md animate-fade-up overflow-hidden rounded-2xl border border-accent/40 bg-raised/95 p-4 pr-12 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85),0_0_0_1px_rgb(var(--accent)/0.08),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-xl sm:p-5 sm:pr-14"
          >
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
            <div aria-hidden className="glow-yellow pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full opacity-70" />
            <div className="relative flex items-start gap-3.5">
              <span aria-hidden className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/45 bg-ink/80 shadow-[0_0_22px_-6px_rgb(var(--accent)/0.7)]">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="7" width="10" height="7" rx="1.5" fill="rgb(var(--accent))" />
                  <path d="M5.25 7V5.25a2.75 2.75 0 0 1 5.5 0V7" stroke="rgb(var(--accent))" strokeWidth="1.6" />
                </svg>
              </span>
              <div className="min-w-0">
                <span className="kicker">
                  <span aria-hidden className="status-dot" data-pulse="true" style={{ ['--dot' as string]: 'rgb(var(--accent))' }} />
                  {t('soon.kicker')}
                </span>
                <p className="mt-1.5 text-[15px] font-semibold leading-snug tracking-[-0.015em] text-fg">{t('soon.title')}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{t('soon.body')}</p>
              </div>
            </div>
            <button
              type="button"
              className="icon-btn absolute right-3 top-3 h-8 w-8"
              aria-label={t('ui.close')}
              onClick={() => setOpen(false)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

/** Shows the "not available yet" notice. */
export function useComingSoon(): () => void {
  return useContext(Ctx);
}

/**
 * Wraps an action handler: returns it unchanged when actions are enabled, otherwise a handler that shows the notice
 * (and swallows the event, so forms do not submit and links do not navigate).
 */
export function useGate() {
  const notify = useComingSoon();
  return useCallback(
    <A extends unknown[], R>(fn: (...a: A) => R): ((...a: A) => R | void) => {
      if (ACTIONS_ENABLED) return fn;
      return (...a: A) => {
        const e = a[0] as { preventDefault?: () => void; stopPropagation?: () => void } | undefined;
        if (e && typeof e === 'object') {
          e.preventDefault?.();
          e.stopPropagation?.();
        }
        notify();
      };
    },
    [notify],
  );
}

/** "Launch a coin"-style CTA. Always navigates; the gate sits on the final submit of the page it opens. */
export function ActionLink({
  href,
  className,
  children,
  onClick,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link href={href} className={className} onClick={onClick} data-action={href}>
      {children}
    </Link>
  );
}

export { ACTIONS_ENABLED };
