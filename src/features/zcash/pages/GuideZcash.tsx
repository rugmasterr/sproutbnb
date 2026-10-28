'use client';

import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { ZecGlyph } from '@/components/brand';
import { DEPOSIT_DEADLINE_MIN, SHIELD_MAX_PER_PAYOUT_ZEC } from '../constants';
import type { ZKey } from '../i18n';
import { useZT } from '../i18n-hook';

const STEPS: { title: ZKey; body: ZKey[]; cta?: { href: string; label: ZKey } }[] = [
  { title: 'g.s1.t', body: ['g.s1.b1', 'g.s1.b2'] },
  { title: 'g.s2.t', body: ['g.s2.b1', 'g.s2.b2'] },
  { title: 'g.s3.t', body: ['g.s3.b1', 'g.s3.b2', 'g.s3.b3'], cta: { href: '/account', label: 'g.s3.cta' } },
  { title: 'g.s4.t', body: ['g.s4.b1', 'g.s4.b2', 'g.s4.b3'], cta: { href: '/zec', label: 'g.s4.cta' } },
  { title: 'g.s5.t', body: ['g.s5.b1', 'g.s5.b2'], cta: { href: '/', label: 'g.s5.cta' } },
  { title: 'g.s6.t', body: ['g.s6.b1', 'g.s6.b2', 'g.s6.b3'], cta: { href: '/zec#out', label: 'g.s6.cta' } },
];

export function GuideZcashPage() {
  const { t } = useZT();
  const vars = { min: DEPOSIT_DEADLINE_MIN, max: SHIELD_MAX_PER_PAYOUT_ZEC };
  return (
    <>
      <PageHead title={t('g.title')} sub={t('g.sub')}>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/account" className="btn bg-gold text-ink hover:brightness-105">
            <ZecGlyph size={14} /> {t('cb.start')}
          </Link>
          <Link href="/zec" className="btn-ghost">
            {t('cb.moveZec')}
          </Link>
        </div>
      </PageHead>
      <div className="container grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ol className="relative space-y-6">
          <span className="stalk absolute bottom-4 left-[19px] top-4 hidden sm:block" aria-hidden />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative flex gap-4">
              <span className="relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold/50 bg-card font-display text-lg font-semibold text-gold">
                {i + 1}
              </span>
              <div className="card min-w-0 flex-1 p-4 sm:p-5">
                <h2 className="text-lg font-semibold sm:text-xl">{t(s.title)}</h2>
                <div className="mt-2 space-y-2 text-sm leading-6 text-muted">
                  {s.body.map((b) => (
                    <p key={b}>{t(b, vars)}</p>
                  ))}
                </div>
                {s.cta && (
                  <Link href={s.cta.href} className="link mt-3 inline-block text-sm font-medium">
                    {t(s.cta.label)} →
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
        <aside className="space-y-4">
          <div className="card p-4">
            <span className="kicker">{t('g.priv.t')}</span>
            <ul className="mt-2 space-y-2 text-[13px] leading-5 text-muted">
              <li>{t('g.priv.1')}</li>
              <li>{t('g.priv.2')}</li>
              <li>{t('g.priv.3')}</li>
              <li>{t('g.priv.4')}</li>
            </ul>
          </div>
          <div className="card p-4">
            <span className="kicker">{t('g.safe.t')}</span>
            <ul className="mt-2 space-y-2 text-[13px] leading-5 text-muted">
              <li>{t('g.safe.1')}</li>
              <li>{t('g.safe.2', vars)}</li>
              <li>{t('g.safe.3')}</li>
              <li>{t('g.safe.4')}</li>
            </ul>
          </div>
          <p className="px-1 text-[11px] leading-5 text-faint">{t('g.disclaimer')}</p>
        </aside>
      </div>
    </>
  );
}
