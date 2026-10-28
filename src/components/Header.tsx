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

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <button
      type="button"
      className="rounded-full border border-line px-2.5 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/60 hover:text-fg"
      onClick={() => setLang(lang === 'en' ? 'zh' : 'en')}
      aria-label={t('ui.langLabel')}
      title={t('ui.langLabel')}
    >
      <span className={lang === 'en' ? 'zh-glyph' : ''}>{t('ui.lang')}</span>
    </button>
  );
}

export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `sprout_theme=${next}; path=/; max-age=31536000; samesite=lax`;
    try {
      localStorage.setItem('sprout.theme', next);
    } catch {
      /* storage blocked */
    }
  };
  return (
    <button
      type="button"
      onClick={flip}
      className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted transition hover:border-accent/60 hover:text-fg"
      aria-label={t('ui.theme')}
      title={t('ui.theme')}
    >
      {theme === 'dark' ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

export function Header() {
  const { t } = useI18n();
  const path = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);

  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-bg/80 backdrop-blur-md">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded focus:bg-card focus:px-3 focus:py-2">
        {t('ui.skip')}
      </a>
      <div className="container flex h-16 items-center gap-3">
        <Logo />
        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                isActive(path, n.href) ? 'bg-raised text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              {t(n.k)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/launch" className="btn-seal hidden md:inline-flex">
            {t('nav.launch')}
          </Link>
          <div className="hidden sm:block">
            <ConnectButton />
          </div>
          <LangToggle />
          <ThemeToggle />
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full border border-line text-muted lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? t('nav.close') : t('nav.menu')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <div id="mobile-nav" className="border-t border-line/60 bg-bg/95 lg:hidden">
          <nav className="container flex flex-col gap-1 py-3" aria-label="Mobile">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-xl px-3 py-2.5 text-base ${isActive(path, n.href) ? 'bg-raised text-fg' : 'text-muted'}`}
              >
                {t(n.k)}
              </Link>
            ))}
            <Link href="/zec" className="rounded-xl px-3 py-2.5 text-base text-muted">
              {t('nav.moveZec')}
            </Link>
            <Link href="/account" className="rounded-xl px-3 py-2.5 text-base text-muted">
              {t('nav.account')}
            </Link>
            <div className="mt-2 flex flex-wrap items-center gap-2 px-1">
              <Link href="/launch" className="btn-seal">
                {t('nav.launch')}
              </Link>
              <div className="sm:hidden">
                <ConnectButton />
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
