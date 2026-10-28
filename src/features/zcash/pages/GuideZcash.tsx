'use client';

import Link from 'next/link';
import { PageHead } from '@/components/ui';
import { ZecGlyph } from '@/components/brand';
import { NodeRing, Reveal } from '@/components/fx';
import { DEPOSIT_DEADLINE_MIN, SHIELD_MAX_PER_PAYOUT_ZEC } from '../constants';
import type { ZKey } from '../i18n';
import { useZT } from '../i18n-hook';
import { useL } from '../zfx';

const STEPS: { title: ZKey; body: ZKey[]; cta?: { href: string; label: ZKey } }[] = [
  { title: 'g.s1.t', body: ['g.s1.b1', 'g.s1.b2'] },
  { title: 'g.s2.t', body: ['g.s2.b1', 'g.s2.b2'] },
  { title: 'g.s3.t', body: ['g.s3.b1', 'g.s3.b2', 'g.s3.b3'], cta: { href: '/account', label: 'g.s3.cta' } },
  { title: 'g.s4.t', body: ['g.s4.b1', 'g.s4.b2', 'g.s4.b3'], cta: { href: '/zec', label: 'g.s4.cta' } },
  { title: 'g.s5.t', body: ['g.s5.b1', 'g.s5.b2'], cta: { href: '/', label: 'g.s5.cta' } },
  { title: 'g.s6.t', body: ['g.s6.b1', 'g.s6.b2', 'g.s6.b3'], cta: { href: '/zec#out', label: 'g.s6.cta' } },
];

/** Phase label above each step: the Zcash leg, the account, the BNB Chain leg, back to Zcash. */
const PHASE = [
  { en: 'Zcash', zh: 'Zcash' },
  { en: 'Zcash', zh: 'Zcash' },
  { en: 'Passkey', zh: '通行密钥' },
  { en: 'ZEC → BNB Chain', zh: 'ZEC → BNB 链' },
  { en: 'BNB Chain', zh: 'BNB 链' },
  { en: 'BNB Chain → ZEC', zh: 'BNB 链 → ZEC' },
];

export function GuideZcashPage() {
  const { t } = useZT();
  const l = useL();
  const vars = { min: DEPOSIT_DEADLINE_MIN, max: SHIELD_MAX_PER_PAYOUT_ZEC };
  return (
    <>
      <PageHead title={t('g.title')} sub={t('g.sub')} kicker={l({ en: 'Guide · 6 steps', zh: '指南 · 6 步' })}>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/account" className="btn-primary btn-lg">
            <ZecGlyph size={16} /> {t('cb.start')} <span className="arr">→</span>
          </Link>
          <Link href="/zec" className="btn-ghost btn-lg">
            {t('cb.moveZec')}
          </Link>
        </div>
      </PageHead>
      <div className="container grid gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-14">
        <ol className="relative min-w-0 space-y-5 sm:space-y-6">
          <span aria-hidden className="absolute bottom-6 left-[22px] top-6 hidden w-px bg-gradient-to-b from-accent/80 via-bamboo/60 to-bamboo/0 sm:block" />
          {STEPS.map((s, i) => (
            <Reveal as="li" key={s.title} i={i % 3} className="relative flex gap-4 sm:gap-6">
              <span className="relative z-[1] hidden shrink-0 flex-col items-center sm:flex">
                <span
                  className={`inline-flex h-[26px] w-[46px] items-center justify-center rounded-full border-[1.5px] bg-bg font-mono text-[11px] font-semibold num ${
                    i < 2 ? 'border-accent text-accent-hi shadow-[0_0_14px_rgb(var(--accent)/0.45)]' : i < 4 ? 'border-accent/70 text-accent' : 'border-bamboo text-bamboo-hi shadow-[0_0_14px_rgb(var(--bamboo)/0.4)]'
                  }`}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
              </span>
              <div className="card card-hover group min-w-0 flex-1 p-5 sm:p-6">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-[11px] font-semibold text-accent sm:hidden">{String(i + 1).padStart(2, '0')}</span>
                  <span className="mono-label">{l(PHASE[i])}</span>
                </div>
                <h2 className="h3 mt-2">{t(s.title)}</h2>
                <div className="mt-3 space-y-2.5 text-[15px] leading-7 text-muted">
                  {s.body.map((b) => (
                    <p key={b}>{t(b, vars)}</p>
                  ))}
                </div>
                {s.cta && (
                  <Link href={s.cta.href} className="btn-ghost btn-sm mt-4">
                    {t(s.cta.label)} <span className="arr">→</span>
                  </Link>
                )}
              </div>
            </Reveal>
          ))}
        </ol>
        <aside className="min-w-0">
          <div className="space-y-4 lg:sticky lg:top-24">
            <div className="glass relative overflow-hidden p-5">
              <div aria-hidden className="glow-green pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full" />
              <span className="kicker-green relative">{t('g.priv.t')}</span>
              <ul className="relative mt-3 space-y-3 text-[13px] leading-5 text-muted">
                {(['g.priv.1', 'g.priv.2', 'g.priv.3', 'g.priv.4'] as ZKey[]).map((k, i) => (
                  <li key={k} className="flex gap-2.5">
                    <NodeRing tone={i === 3 ? 'green' : 'muted'} className="mt-[5px]" />
                    <span className="min-w-0">{t(k)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card p-5">
              <span className="kicker">{t('g.safe.t')}</span>
              <ul className="mt-3 space-y-3 text-[13px] leading-5 text-muted">
                {(['g.safe.1', 'g.safe.2', 'g.safe.3', 'g.safe.4'] as ZKey[]).map((k, i) => (
                  <li key={k} className="flex gap-2.5">
                    <NodeRing tone={i === 0 ? 'yellow' : 'muted'} className="mt-[5px]" />
                    <span className="min-w-0">{t(k, vars)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="px-1 text-[11px] leading-5 text-faint">{t('g.disclaimer')}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
