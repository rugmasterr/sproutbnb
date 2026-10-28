'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/ui';
import { ZecGlyph } from '@/components/brand';
import { SHIELD_MAX_PAYOUTS_PER_DAY, SHIELD_MAX_PER_DAY_ZEC, SHIELD_MAX_PER_PAYOUT_ZEC, DEPOSIT_DEADLINE_MIN } from '../constants';
import { ZecAmount } from '../components';
import { DepositFlow } from '../deposit';
import { useZT } from '../i18n-hook';
import { useSproutAccount } from '../provider';
import { SendOutFlow } from '../sendout';
import { PriceLine, RouteStatus, SwapHistory } from '../widgets';

type Tab = 'in' | 'out';

export function MoveZecPage() {
  const { t } = useZT();
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

  return (
    <>
      <PageHead title={t('mz.title')} sub={t('mz.sub')}>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PriceLine />
          {acct.address && acct.balanceWei !== undefined && (
            <span className="chip">
              <ZecGlyph size={12} /> {t('mz.balance')} <ZecAmount wei={acct.balanceWei} showBnb />
            </span>
          )}
        </div>
      </PageHead>
      <div className="container grid gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-4 sm:p-6">
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-line bg-raised/50 p-1" role="tablist" aria-label={t('mz.title')}>
            {(['in', 'out'] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${tab === k ? 'bg-gold text-ink' : 'text-muted hover:text-fg'}`}
                onClick={() => pick(k)}
              >
                {k === 'in' ? t('mz.tabIn') : t('mz.tabOut')}
              </button>
            ))}
          </div>
          <h2 className="mb-1 text-xl font-semibold">{tab === 'in' ? t('mz.inTitle') : t('mz.outTitle')}</h2>
          <p className="mb-5 text-sm text-muted">{tab === 'in' ? t('mz.inSub') : t('mz.outSub')}</p>
          {tab === 'in' ? <DepositFlow /> : <SendOutFlow />}
        </section>

        <aside className="space-y-4">
          <RouteStatus />
          <div className="card p-4">
            <span className="kicker">{t('fees.title')}</span>
            <ul className="mt-2 space-y-2.5 text-[13px] leading-5 text-muted">
              <li>{t('fees.1click')}</li>
              <li>{t('fees.unauth')}</li>
              <li>{t('fees.min')}</li>
              <li>{t('fees.refund')}</li>
              <li>{t('fees.deadline', { min: DEPOSIT_DEADLINE_MIN })}</li>
              <li>{t('fees.shielded', { per: SHIELD_MAX_PER_PAYOUT_ZEC, day: SHIELD_MAX_PER_DAY_ZEC, n: SHIELD_MAX_PAYOUTS_PER_DAY })}</li>
              <li>{t('fees.privacy')}</li>
            </ul>
            <Link href="/guide/zcash" className="link mt-3 inline-block text-sm">
              {t('mz.guideLink')} →
            </Link>
          </div>
        </aside>

        <section className="card p-4 sm:p-6 lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold">{t('hist.title')}</h2>
          <p className="mb-3 text-xs text-faint">{t('hist.sub')}</p>
          <SwapHistory />
        </section>
      </div>
    </>
  );
}
