'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/ui';
import { ZecGlyph } from '@/components/brand';
import { explorerAddr } from '@/lib/config';
import { isValidZcashAddress, shortZ } from '../address';
import { Callout, CopyField, fmtBnb, ZcashAddressInput, ZecAmount } from '../components';
import { DepositZecDialog, ErrorLine } from '../deposit';
import { useZT } from '../i18n-hook';
import { useSproutAccount } from '../provider';
import { SendOutFlow } from '../sendout';
import { SignInPanel } from '../signin';
import { SwapHistory } from '../widgets';

export function AccountPage() {
  const { t } = useZT();
  const acct = useSproutAccount();
  const [deposit, setDeposit] = useState(false);

  return (
    <>
      <PageHead title={t('ac.title')} sub={t('ac.sub')} />
      <div className="container py-8">
        {!acct.accountsLive && (
          <div className="mb-6">
            <Callout tone="warn">
              <strong className="font-semibold">{t('si.notLiveTitle')}</strong> {t('si.notLive')}
            </Callout>
          </div>
        )}
        {!acct.ready ? (
          <div className="skeleton h-64 w-full" />
        ) : acct.kind === 'none' || !acct.address ? (
          <div className="mx-auto max-w-xl card p-5 sm:p-6">
            <h2 className="mb-1 text-xl font-semibold">{t('ac.signInTitle')}</h2>
            <p className="mb-4 text-sm text-muted">{t('ac.signInSub')}</p>
            <SignInPanel />
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="space-y-6">
              <section className="card relative overflow-hidden p-5 sm:p-6">
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="kicker">{acct.kind === 'passkey' ? t('cb.sproutAccount') : t('cb.bnbWallet')}</div>
                    <div className="mt-2 font-display text-4xl font-semibold">
                      {acct.balanceWei !== undefined ? <ZecAmount wei={acct.balanceWei} /> : '—'}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {acct.balanceWei !== undefined && <span className="num">≈ {fmtBnb(Number(acct.balanceWei) / 1e18)} BNB {t('ac.held')}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn bg-gold text-ink hover:brightness-105" onClick={() => setDeposit(true)}>
                      <ZecGlyph size={14} /> {t('cb.deposit')}
                    </button>
                    <Link href="/zec#out" className="btn-ghost">
                      {t('cb.withdraw')}
                    </Link>
                  </div>
                </div>
                <div className="mt-5">
                  <CopyField label={t('ac.address')} value={acct.address} />
                  <a className="link mt-1.5 inline-block text-xs" href={explorerAddr(acct.address)} target="_blank" rel="noopener noreferrer">
                    {t('cb.explorer')} ↗
                  </a>
                </div>
                <p className="mt-3 text-xs leading-5 text-faint">{acct.kind === 'passkey' ? t('ac.passkeyAddrNote') : t('ac.evmAddrNote')}</p>
              </section>

              <section className="card p-5 sm:p-6">
                <h2 className="mb-1 text-lg font-semibold">{t('ac.withdrawTitle')}</h2>
                <p className="mb-4 text-sm text-muted">{t('mz.outSub')}</p>
                <SendOutFlow />
              </section>

              <section className="card p-5 sm:p-6">
                <h2 className="mb-3 text-lg font-semibold">{t('hist.title')}</h2>
                <SwapHistory />
              </section>
            </div>

            <aside className="space-y-6">
              <ZcashAddressesCard />
              {acct.kind === 'passkey' && acct.passkey && (
                <section className="card p-5">
                  <h2 className="mb-3 text-lg font-semibold">{t('ac.passkeyTitle')}</h2>
                  <dl className="space-y-2 text-sm">
                    <Item k={t('ac.pkSite')} v={acct.passkey.rpId} />
                    <Item k={t('ac.pkCreated')} v={new Date(acct.passkey.createdAt).toLocaleDateString()} />
                    <Item k={t('ac.pkId')} v={shortZ(acct.passkey.credentialId, 8)} mono />
                    <Item k={t('ac.pkKey')} v={`${shortZ(acct.passkey.qx, 6)} / ${shortZ(acct.passkey.qy, 6)}`} mono />
                  </dl>
                  <Callout tone="warn">
                    <strong className="font-semibold">{t('si.onlyKey')}</strong> {t('ac.pkWarn')}
                  </Callout>
                  <p className="mt-3 text-xs leading-5 text-faint">{acct.relayerLive ? t('ac.relayerOn') : t('err.relayerOff')}</p>
                </section>
              )}
              <section className="card p-5">
                <button type="button" className="btn-ghost w-full" onClick={acct.logout}>
                  {t('cb.signOut')}
                </button>
                {acct.kind === 'passkey' && <p className="mt-2 text-[11px] leading-5 text-faint">{t('ac.signOutNote')}</p>}
              </section>
            </aside>
          </div>
        )}
      </div>
      <DepositZecDialog open={deposit} onClose={() => setDeposit(false)} />
    </>
  );
}

function Item({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`min-w-0 truncate ${mono ? 'font-mono text-xs' : ''}`}>{v}</dd>
    </div>
  );
}

function ZcashAddressesCard() {
  const { t } = useZT();
  const acct = useSproutAccount();
  const [refund, setRefund] = useState('');
  const [payout, setPayout] = useState('');
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  useEffect(() => {
    setRefund(acct.zcashRefundAddress || '');
    setPayout(acct.zcashPayoutAddress || '');
  }, [acct.zcashRefundAddress, acct.zcashPayoutAddress]);
  const dirty = refund !== (acct.zcashRefundAddress || '') || payout !== (acct.zcashPayoutAddress || '');
  const ok = (!refund || isValidZcashAddress(refund, ['t'])) && (!payout || isValidZcashAddress(payout));
  return (
    <section className="card space-y-3.5 p-5">
      <div>
        <h2 className="text-lg font-semibold">{t('ac.zTitle')}</h2>
        <p className="mt-1 text-xs leading-5 text-muted">{t('ac.zSub')}</p>
      </div>
      <ZcashAddressInput value={refund} onChange={setRefund} kinds={['t']} label={t('si.refund')} id="ac-refund" />
      <ZcashAddressInput value={payout} onChange={setPayout} label={t('si.payout')} id="ac-payout" placeholder={t('si.payoutPh')} />
      <button
        type="button"
        className="btn-primary w-full"
        disabled={!dirty || !ok}
        onClick={() => {
          setErr(null);
          try {
            acct.setZcashAddresses({ refund, payout });
            setSaved(true);
            setTimeout(() => setSaved(false), 1500);
          } catch (e) {
            setErr(e);
          }
        }}
      >
        {saved ? t('ac.saved') : t('ac.save')}
      </button>
      <p className="text-[11px] leading-5 text-faint">{t('ac.zLocal')}</p>
      {err ? <ErrorLine e={err} /> : null}
    </section>
  );
}
