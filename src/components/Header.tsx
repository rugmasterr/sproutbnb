'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ConnectButton } from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { Logo } from './brand';

const NAV: { href: string; k: Key }[] = [
  { href: '/', k: 'nav.coins' },
  { href: '/stats', k: 'nav.stats' },
  { href: '/terminal', k: 'nav.terminal' },
  { href: '/nodes', k: 'nav.nodes' },
  { href: '/docs', k: 'nav.docs' },
];

const isActive = (path: string, href: string) => (href === '/' ? path === '/' || path.startsWith('/coin') : path.startsWith(href));

/** Segmented EN | 中 language switch. */
export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  const opts = [
    { id: 'en' as const, label: 'EN', aria: 'English' },
    { id: 'zh' as const, label: '中', aria: '中文' },
  ];
  return (
    <div role="group" aria-label={t('ui.langLabel')} className={`flex shrink-0 items-center rounded-full border border-line-2 bg-black/30 p-0.5 ${className}`}>
      {opts.map((o) => {
        const on = lang === o.id;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            aria-label={o.aria}
            lang={o.id === 'zh' ? 'zh-CN' : 'en'}
            onClick={() => !on && setLang(o.id)}
            className={`grid h-7 min-w-[2rem] place-items-center rounded-full px-2 text-[11px] font-semibold transition ${
              o.id === 'en' ? 'font-mono tracking-[0.06em]' : 'zh-glyph'
            } ${on ? 'bg-accent text-accent-fg shadow-[0_0_14px_-2px_rgb(var(--accent)/0.6)]' : 'text-muted hover:text-fg'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Header() {
  const { t } = useI18n();
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors duration-300 ${
        scrolled || open ? 'border-line bg-bg/75' : 'border-transparent bg-bg/40'
      } backdrop-blur-xl backdrop-saturate-150`}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-10 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2"
      >
        {t('ui.skip')}
      </a>
      <div className="container flex h-16 items-center gap-3">
        <Logo />
        <nav className="ml-6 hidden items-center gap-0.5 lg:flex" aria-label="Main">
          {NAV.map((n) => {
            const on = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? 'page' : undefined}
                className={`relative rounded-full px-3 py-1.5 font-mono text-[12px] font-medium uppercase tracking-[0.08em] transition ${
                  on ? 'text-fg' : 'text-muted hover:bg-white/[0.05] hover:text-fg'
                }`}
              >
                {t(n.k)}
                {on && (
                  <span aria-hidden className="absolute inset-x-3 -bottom-[13px] flex items-center gap-1">
                    <span className="h-px flex-1 bg-accent shadow-[0_0_8px_rgb(var(--accent))]" />
                    <span className="h-[5px] w-2.5 rounded-full border border-accent bg-accent/30" />
                    <span className="h-px flex-1 bg-accent shadow-[0_0_8px_rgb(var(--accent))]" />
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/launch" className="btn-ghost btn-sm hidden md:inline-flex">
            {t('nav.launch')}
            <span className="arr text-accent" aria-hidden>
              →
            </span>
          </Link>
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <LangToggle className="hidden sm:flex" />
          <button
            type="button"
            className="icon-btn lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('nav.close') : t('nav.menu')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 8h16M4 16h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="max-h-[calc(100dvh-64px)] animate-fade-up overflow-y-auto border-t border-line bg-bg lg:hidden">
          <nav className="container flex flex-col py-3" aria-label="Mobile">
            {NAV.map((n, i) => {
              const on = isActive(path, n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-3 border-b border-line/70 px-1 py-3.5 text-lg font-semibold tracking-[-0.02em] ${on ? 'text-fg' : 'text-muted'}`}
                >
                  <span className={`font-mono text-[11px] font-medium ${on ? 'text-accent' : 'text-faint'}`}>{String(i + 1).padStart(2, '0')}</span>
                  {t(n.k)}
                </Link>
              );
            })}
            {(
              [
                { href: '/zec', k: 'nav.moveZec' },
                { href: '/account', k: 'nav.account' },
              ] as const
            ).map((n, i) => (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 border-b border-line/70 px-1 py-3.5 text-lg font-semibold tracking-[-0.02em] ${
                  isActive(path, n.href) ? 'text-fg' : 'text-muted'
                }`}
              >
                <span className="font-mono text-[11px] font-medium text-faint">{String(NAV.length + i + 1).padStart(2, '0')}</span>
                {t(n.k)}
              </Link>
            ))}
            <div className="mt-4 flex flex-wrap items-center gap-2 px-1 pb-2">
              <Link href="/launch" className="btn-primary">
                {t('nav.launch')}
                <span className="arr" aria-hidden>
                  →
                </span>
              </Link>
              <div className="sm:hidden">
                <ConnectButton />
              </div>
              <LangToggle className="ml-auto sm:hidden" />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
