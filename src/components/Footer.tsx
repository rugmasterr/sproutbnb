'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { CHAIN_ID, IS_TESTNET } from '@/lib/config';
import { socialLinks } from '@/lib/social';
import { Logo, Mark, Seal } from './brand';
import { NodeDivider } from './fx/NodeDivider';
import { StatusLine } from './fx/StatusDot';

type L = { href: string; k: Key; ext?: boolean };

export function Footer() {
  const { t } = useI18n();
  const groups: { title: Key; links: L[] }[] = [
    {
      title: 'foot.product',
      links: [
        { href: '/launch', k: 'foot.launch' },
        { href: '/terminal', k: 'nav.terminal' },
        { href: '/stats', k: 'nav.stats' },
        { href: '/nodes', k: 'nav.nodes' },
      ],
    },
    {
      title: 'foot.learn',
      links: [
        { href: '/about', k: 'foot.about' },
        { href: '/guide', k: 'foot.guide' },
        { href: '/docs', k: 'foot.docs' },
        { href: '/zec', k: 'foot.moveZec' },
        { href: '/roadmap', k: 'foot.roadmap' },
      ],
    },
    ...(socialLinks.length
      ? [
          {
            title: 'foot.community' as Key,
            links: socialLinks.map((s) => ({ href: s.href, k: `foot.social.${s.key}` as Key, ext: true })),
          },
        ]
      : []),
    {
      title: 'foot.legal',
      links: [
        { href: '/terms', k: 'foot.terms' },
        { href: '/risk', k: 'foot.risk' },
      ],
    },
  ];

  const linkCls = 'group inline-flex items-center gap-1.5 text-sm text-muted transition hover:text-fg';

  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line bg-bg">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
      <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-x-0 top-0 h-64 opacity-40" />
      <div aria-hidden className="glow-yellow pointer-events-none absolute -top-40 left-1/2 h-80 w-[60rem] max-w-[200%] -translate-x-1/2 opacity-40" />

      <div className="container relative pb-10 pt-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_repeat(4,minmax(0,1fr))]">
          <div className="col-span-2 max-w-xs md:col-span-1">
            <Logo />
            <p className="mt-4 text-[15px] font-medium tracking-[-0.01em] text-fg">{t('brand.tagline')}</p>
            <p className="mt-1 text-sm text-muted">{t('brand.secondary')}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              <StatusLine tone={IS_TESTNET ? 'yellow' : 'green'}>
                BNB Chain · {CHAIN_ID}
                {IS_TESTNET ? ' · testnet' : ''}
              </StatusLine>
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Flap · ZEC</span>
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">{t(g.title)}</h3>
              <ul className="mt-4 space-y-2.5">
                {g.links.map((l) => (
                  <li key={l.href}>
                    {l.ext ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className={linkCls}>
                        {t(l.k)}
                        <span aria-hidden className="text-faint transition group-hover:translate-x-0.5 group-hover:text-accent">
                          ↗
                        </span>
                      </a>
                    ) : (
                      <Link href={l.href} className={`${linkCls} transition-transform hover:translate-x-0.5`}>
                        {t(l.k)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <NodeDivider className="my-10" />

        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="max-w-3xl space-y-2 text-xs leading-relaxed text-faint">
            <p>{t('foot.disclaimer')}</p>
            <p>{t('foot.privacy')}</p>
          </div>
          <div className="flex items-center gap-3 md:justify-end">
            <Seal size={34} />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-line pt-6 font-mono text-[11px] uppercase tracking-[0.08em] text-faint">
          <span className="inline-flex items-center gap-2">
            <Mark size={16} />© {new Date().getFullYear()} Sprout 春笋
          </span>
          <span className="normal-case tracking-normal">{t('foot.built')}</span>
        </div>
      </div>
    </footer>
  );
}
