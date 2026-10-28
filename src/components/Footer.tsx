'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { socialLinks } from '@/lib/social';
import { Logo, NodeRule, Seal } from './brand';

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

  return (
    <footer className="mt-20 border-t border-line/60 bg-raised/30">
      <div className="container py-12">
        <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-sm text-muted">{t('brand.tagline')}</p>
            <p className="mt-1 text-sm text-muted">{t('brand.secondary')}</p>
            <div className="mt-5">
              <Seal size={40} />
            </div>
          </div>
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-faint">{t(g.title)}</h3>
              <ul className="mt-3 space-y-2">
                {g.links.map((l) => (
                  <li key={l.href}>
                    {l.ext ? (
                      <a href={l.href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted hover:text-fg">
                        {t(l.k)}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-sm text-muted hover:text-fg">
                        {t(l.k)}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <NodeRule className="my-8" />
        <div className="space-y-2 text-xs leading-relaxed text-faint">
          <p>{t('foot.disclaimer')}</p>
          <p>{t('foot.privacy')}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>© {new Date().getFullYear()} Sprout 春笋</span>
            <span aria-hidden>·</span>
            <span>{t('foot.built')}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
