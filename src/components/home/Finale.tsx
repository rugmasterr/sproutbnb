'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import { ACTIONS_ENABLED, IS_LIVE, sprout } from '@/lib/config';
import { Mark } from '../brand';
import { useComingSoon } from '../ComingSoon';
import { GlowPanel, Kicker, NodeTrack, Reveal, type TrackItem, Scramble } from '../fx';
import { C, useL } from './copy';
import { TwoLine } from './TwoLine';

export function Roadmap() {
  const L = useL();
  // Honest progress: only the build is done until contracts are published.
  const deployed = IS_LIVE;
  const launched = Boolean(sprout.token);
  const states: TrackItem['state'][] = [
    'done',
    deployed ? 'done' : 'now',
    deployed ? (launched ? 'done' : 'now') : 'next',
    deployed && launched ? 'now' : 'next',
    'next',
  ];
  const items: TrackItem[] = C.road.i.map((it, i) => ({ label: L(it), when: L(C.road.w[i]), state: states[i] }));
  return (
    <section className="section relative border-t border-line">
      <div className="container">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <Kicker index={5} node>
              <Scramble text={L(C.road.kicker)} />
            </Kicker>
            <h2 className="h2 mt-4 max-w-[20ch]">
              <TwoLine a={L(C.road.t1)} b={L(C.road.t2)} />
            </h2>
          </div>
          <Link href="/roadmap" className="btn-ghost">
            {L(C.road.full)} <span className="arr">→</span>
          </Link>
        </Reveal>
        <Reveal i={1} className="mt-12">
          <NodeTrack items={items} />
        </Reveal>
      </div>
    </section>
  );
}

export function LaunchCta() {
  const { t } = useI18n();
  const L = useL();
  const notify = useComingSoon();
  return (
    <section className="section pt-0">
      <div className="container">
        <Reveal>
          <GlowPanel href={ACTIONS_ENABLED ? '/launch' : undefined} onClick={ACTIONS_ENABLED ? undefined : notify}>
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-end">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <Mark size={40} glow />
                  <Kicker>{L(C.cta.kicker)}</Kicker>
                </div>
                <h2 className="h1 mt-6 max-w-[14ch]">
                  <TwoLine a={L(C.cta.t1)} b={L(C.cta.t2)} block />
                </h2>
                <span className="btn-primary btn-lg mt-8">
                  {t('home.ctaLaunch')} <span className="arr">→</span>
                </span>
              </div>
              <ol className="min-w-0 divide-y divide-line border-y border-line">
                {C.cta.steps.map((s, i) => (
                  <li key={i} className="grid grid-cols-[2.6rem_minmax(0,1fr)] items-baseline gap-3 py-4">
                    <span className="font-mono text-xs text-accent">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-lg font-semibold tracking-[-0.02em] text-fg sm:text-xl">{L(s)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </GlowPanel>
        </Reveal>
      </div>
    </section>
  );
}
