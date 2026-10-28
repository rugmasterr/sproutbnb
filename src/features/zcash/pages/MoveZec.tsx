'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/ui';
import { BnbGlyph, ZecGlyph } from '@/components/brand';
import { NodeRing } from '@/components/fx';
import { SHIELD_MAX_PAYOUTS_PER_DAY, SHIELD_MAX_PER_DAY_ZEC, SHIELD_MAX_PER_PAYOUT_ZEC, DEPOSIT_DEADLINE_MIN } from '../constants';
import { ZecAmount } from '../components';
import { DepositFlow } from '../deposit';
import { useZT } from '../i18n-hook';
import { useSproutAccount } from '../provider';
import { SendOutFlow } from '../sendout';
import { PriceLine, RouteStatus, SwapHistory } from '../widgets';
import { IndexKicker, useL } from '../zfx';

type Tab = 'in' | 'out';

export function MoveZecPage() {
  const { t } = useZT();
  const l = useL();
  const acct = useSproutAccount();
  const [tab, setTab] = useState<Tab>('in');
  useEffect(() => {
    const sync = () => setTab(window.location.hash === '#out' ? 'out' : 'in');
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const pick = (k: Tab) => {
    setTab(k);
    history.replaceState(null, '', k === 'out' ? '#out' : '#in');
  };

  const fees = [
    t('fees.1click'),
    t('fees.unauth'),
    t('fees.min'),
    t('fees.refund'),
    t('fees.deadline', { min: DEPOSIT_DEADLINE_MIN }),
    t('fees.shielded', { per: SHIELD_MAX_PER_PAYOUT_ZEC, day: SHIELD_MAX_PER_DAY_ZEC, n: SHIELD_MAX_PAYOUTS_PER_DAY }),
    t('fees.privacy'),
  ];

  return (
    <>
      <PageHead title={t('mz.title')} sub={t('mz.sub')} kicker="NEAR Intents · 1Click · ZEC ⇄ BNB">
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <PriceLine />
          {acct.address && acct.balanceWei !== undefined && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-[11px] text-fg">
              <ZecGlyph size={12} /> <span className="uppercase tracking-[0.06em] text-faint">{t('mz.balance')}</span> <ZecAmount wei={acct.balanceWei} showBnb />
            </span>
          )}
        </div>
      </PageHead>
      <div className="container grid gap-6 py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="box min-w-0">
          <div className="box-h flex-wrap">
            <div className="seg grid w-full grid-cols-2 sm:w-auto" role="tablist" aria-label={t('mz.title')}>
              {(['in', 'out'] as const).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className="seg-btn inline-flex items-center justify-center gap-1.5" onClick={() => pick(k)}>
                  <span aria-hidden className={`font-mono ${tab === k ? (k === 'in' ? 'text-gold' : 'text-bamboo-hi') : ''}`}>
                    {k === 'in' ? '↓' : '↑'}
                  </span>
                  {k === 'in' ? t('mz.tabIn') : t('mz.tabOut')}
                </button>
              ))}
            </div>
            <span className="hidden items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-faint sm:inline-flex" aria-hidden>
              {tab === 'in' ? (
                <>
                  <ZecGlyph size={13} /> Zcash <span className="text-accent">→</span> <BnbGlyph size={13} /> BNB Chain
                </>
              ) : (
                <>
                  <BnbGlyph size={13} /> BNB Chain <span className="text-accent">→</span> <ZecGlyph size={13} /> Zcash
                </>
              )}
            </span>
          </div>
          <div className="p-4 sm:p-6">
            <IndexKicker i={tab === 'in' ? 1 : 2} tone={tab === 'in' ? 'accent' : 'green'}>
              {tab === 'in' ? 'ZEC → BNB' : 'BNB → ZEC'}
            </IndexKicker>
            <h2 className="h3 mt-2">{tab === 'in' ? t('mz.inTitle') : t('mz.outTitle')}</h2>
            <p className="mb-6 mt-1.5 max-w-[60ch] text-sm leading-6 text-muted">{tab === 'in' ? t('mz.inSub') : t('mz.outSub')}</p>
            {tab === 'in' ? <DepositFlow /> : <SendOutFlow />}
          </div>
        </section>

        <aside className="min-w-0 space-y-4">
          <RouteStatus />
          <div className="card p-4 sm:p-5">
            <span className="kicker-muted">{t('fees.title')}</span>
            <ul className="mt-3 space-y-3 text-[13px] leading-5 text-muted">
              {fees.map((f, i) => (
                <li key={i} className="flex gap-2.5">
                  <NodeRing tone={i === 4 ? 'yellow' : i === 6 ? 'green' : 'muted'} className="mt-[5px]" />
                  <span className="min-w-0">{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/guide/zcash" className="btn-ghost btn-sm mt-4">
              {t('mz.guideLink')} <span className="arr">→</span>
            </Link>
          </div>
        </aside>

        <section className="card min-w-0 p-4 sm:p-6 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
            <div>
              <IndexKicker i={3} tone="muted">
                {l({ en: '1Click · status', zh: '1Click · 状态' })}
              </IndexKicker>
              <h2 className="h3 mt-2">{t('hist.title')}</h2>
            </div>
            <p className="text-xs text-faint">{t('hist.sub')}</p>
          </div>
          <SwapHistory />
        </section>
      </div>
    </>
  );
}
