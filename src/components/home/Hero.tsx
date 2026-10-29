'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import { IS_TESTNET, explorerAddr, explorerToken, sprout } from '@/lib/config';
import { ZecGlyph } from '../brand';
import { ActionLink } from '../ComingSoon';
import { CopyChip, HeroCanvas, Kicker, NodeRing, Rise, Scramble, StatusLine } from '../fx';
import { C, useL } from './copy';

export function Hero() {
  const { t } = useI18n();
  const L = useL();
  return (
    <section className="relative overflow-hidden border-b border-line">
      <HeroCanvas className="absolute inset-0" align="right" />
      <div aria-hidden className="pointer-events-none absolute -left-40 top-10 h-[520px] w-[520px] rounded-full glow-yellow opacity-60" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-bg to-transparent" />

      <div className="container relative flex min-h-[calc(100svh-64px)] flex-col justify-center py-14 sm:py-20 lg:min-h-[820px]">
        <div className="min-w-0 max-w-[720px]">
          <Rise d={0}>
            <Kicker pill>
              <ZecGlyph size={14} />
              <Scramble text={L(C.hero.kicker)} trigger="mount" delay={250} duration={1100} />
            </Kicker>
          </Rise>

          <h1 className="h-display mt-6 text-balance">
            <Rise as="span" d={1} className="block">
              {L(C.hero.l1)}
            </Rise>
            <Rise as="span" d={2} className="soft-yellow block pb-[0.08em]">
              {L(C.hero.l2)}
            </Rise>
          </h1>

          <Rise d={3}>
            <p className="lede mt-6 max-w-[40ch]">{t('home.sub')}</p>
          </Rise>

          <Rise d={4} className="mt-9 grid gap-3 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            {/* status card */}
            <div className="glass relative min-w-0 overflow-hidden p-4 sm:p-5">
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusLine tone="green">
                  {L(IS_TESTNET ? C.hero.testnet : C.hero.mainnet)} {'\u00b7'} {L(C.hero.liveTag)}
                </StatusLine>
                <span className="tag-yellow">{L(C.hero.flap)}</span>
              </div>
              <p className="mt-3 text-sm text-muted">{L(C.hero.live)}</p>
              <div className="mt-3 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint" aria-label={L(C.hero.stages)}>
                <span className="inline-flex items-center gap-1.5 text-accent-hi">
                  <NodeRing tone="yellow" />
                  {t('stage.seed')}
                </span>
                <span aria-hidden className="h-px w-3 bg-line-2 sm:w-5" />
                <span className="inline-flex items-center gap-1.5 text-bamboo">
                  <NodeRing tone="green" />
                  {t('stage.shoot')}
                </span>
                <span aria-hidden className="h-px w-3 bg-line-2 sm:w-5" />
                <span className="inline-flex items-center gap-1.5 text-bamboo-hi">
                  <span aria-hidden className="inline-block h-[9px] w-[18px] rounded-full bg-bamboo-hi" />
                  {t('stage.grove')}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <ActionLink href="/launch" className="btn-primary">
                  {t('home.ctaLaunch')} <span className="arr">{'\u2192'}</span>
                </ActionLink>
                <Link href="/terminal" className="btn-ghost">
                  {L(C.hero.terminal)}
                </Link>
              </div>
            </div>

            {/* Zcash onboarding card */}
            <Link
              href="/zec"
              className="card card-hover group relative flex min-w-0 flex-col justify-between gap-4 overflow-hidden p-4 sm:p-5"
            >
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full glow-yellow opacity-70" />
              <div className="relative flex items-center justify-between">
                <ZecGlyph size={30} />
                <span className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">/zec</span>
              </div>
              <div className="relative">
                <div className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
                  {L(C.hero.zecT)}
                  <span aria-hidden className="text-accent transition-transform duration-300 group-hover:translate-x-1">
                    {'\u2192'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{L(C.hero.zecB)}</p>
              </div>
            </Link>
          </Rise>

          <Rise d={5} className="mt-5 flex min-w-0 flex-wrap items-center gap-3">
            {sprout.token ? (
              <CopyChip label="$SPROUT" value={sprout.token} href={explorerToken(sprout.token)} />
            ) : sprout.factory ? (
              <CopyChip label={L(C.hero.contract)} value={sprout.factory} href={explorerAddr(sprout.factory)} />
            ) : null}
          </Rise>
        </div>
      </div>
    </section>
  );
}
