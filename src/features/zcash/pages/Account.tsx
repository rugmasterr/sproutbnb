'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PageHead } from '@/components/ui';
import { Mark, ZecGlyph } from '@/components/brand';
import { CopyChip, NodeRing, StatusLine } from '@/components/fx';
import { explorerAddr } from '@/lib/config';
import { isValidZcashAddress, shortZ } from '../address';
import { Callout, fmtBnb, ZcashAddressInput, ZecAmount } from '../components';
import { DepositZecDialog, ErrorLine } from '../deposit';
import { useZT } from '../i18n-hook';
import { useSproutAccount } from '../provider';
import { SendOutFlow } from '../sendout';
import { SignInPanel } from '../signin';
import { SwapHistory } from '../widgets';
import { IndexKicker, useL, type L } from '../zfx';

const PITCH: { t: L; b: L }[] = [
  { t: { en: 'Passkey, not a seed phrase', zh: '通行密钥，不用助记词' }, b: { en: 'Face ID, Touch ID, Windows Hello or a security key.', zh: '面容、指纹、Windows Hello 或安全密钥。' } },
  { t: { en: 'Fund straight from Zcash', zh: '直接从 Zcash 充值' }, b: { en: 'Send ZEC from any Zcash wallet — no BNB needed.', zh: '从任意 Zcash 钱包发送 ZEC，无需 BNB。' } },
  { t: { en: 'Cash out back to ZEC', zh: '随时提现回 ZEC' }, b: { en: 'Native ZEC to your Zcash wallet, any time.', zh: '原生 ZEC 直达你的 Zcash 钱包。' } },
];

export function AccountPage() {
  const { t } = useZT();
  const l = useL();
  const acct = useSproutAccount();
  const [deposit, setDeposit] = useState(false);

  return (
    <>
      <PageHead title={t('ac.title')} sub={t('ac.sub')} kicker={acct.kind === 'passkey' ? t('cb.sproutAccount') : 'Passkey · BNB Chain · ZEC'} />
      <div className="container py-8 sm:py-12">
        {/* Signed out, the sign-in panel already shows this notice. */}
        {!acct.accountsLive && acct.ready && acct.kind !== 'none' && !!acct.address && (
          <div className="mb-6">
            <Callout tone="warn">
              <strong className="font-semibold">{t('si.notLiveTitle')}</strong> {t('si.notLive')}
            </Callout>
          </div>
        )}
        {!acct.ready ? (
          <div className="skeleton h-64 w-full" />
        ) : acct.kind === 'none' || !acct.address ? (
          <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,480px)] lg:gap-12">
            <div className="min-w-0 lg:pt-4">
              <Mark size={56} glow />
              <h2 className="h2 mt-6 max-w-[14ch]">{t('ac.signInTitle')}</h2>
              <p className="mt-4 max-w-[44ch] text-[15px] leading-7 text-muted">{t('ac.signInSub')}</p>
              <ol className="relative mt-8 space-y-5">
                <span aria-hidden className="absolute bottom-3 left-[17px] top-3 w-px bg-gradient-to-b from-accent/70 via-bamboo/50 to-transparent" />
                {PITCH.map((p, i) => (
                  <li key={i} className="relative flex gap-4">
                    <span className="relative z-[1] inline-flex h-[22px] w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-accent/70 bg-bg font-mono text-[10px] font-semibold text-accent-hi">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold tracking-[-0.01em] text-fg">{l(p.t)}</span>
                      <span className="mt-0.5 block text-sm text-muted">{l(p.b)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="glass relative min-w-0 overflow-hidden p-5 sm:p-7">
              <div aria-hidden className="glow-yellow pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full" />
              <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
              <div className="relative">
                <StatusLine tone={acct.accountsLive ? 'green' : 'yellow'}>{t('si.title')}</StatusLine>
                <div className="mt-5">
                  <SignInPanel />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-6">
              <section className="glass relative overflow-hidden p-5 sm:p-7">
                <div aria-hidden className="glow-yellow pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full" />
                <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-50" />
                <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
                <div className="relative flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <StatusLine tone="green">{acct.kind === 'passkey' ? t('cb.sproutAccount') : t('cb.bnbWallet')}</StatusLine>
                    <div className="mt-4 font-display text-[2.6rem] font-semibold leading-none tracking-[-0.05em] sm:text-[3.4rem]">
                      {acct.balanceWei !== undefined ? <ZecAmount wei={acct.balanceWei} /> : '—'}
                    </div>
                    <div className="mt-2 font-mono text-xs text-muted">
                      {acct.balanceWei !== undefined && (
                        <span className="num">
                          ≈ {fmtBnb(Number(acct.balanceWei) / 1e18)} BNB {t('ac.held')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-primary" onClick={() => setDeposit(true)}>
                      <ZecGlyph size={14} /> {t('cb.deposit')}
                    </button>
                    <Link href="/zec#out" className="btn-ghost">
                      {t('cb.withdraw')} <span className="arr">↗</span>
                    </Link>
                  </div>
                </div>
                <div className="relative mt-6">
                  <div className="label">{t('ac.address')}</div>
                  <CopyChip value={acct.address} label="BSC" full className="w-full sm:w-auto" />
                  <a className="link mt-2 block w-fit font-mono text-[11px]" href={explorerAddr(acct.address)} target="_blank" rel="noopener noreferrer">
                    {t('cb.explorer')} ↗
                  </a>
                </div>
                <p className="relative mt-3 max-w-[70ch] text-xs leading-5 text-faint">{acct.kind === 'passkey' ? t('ac.passkeyAddrNote') : t('ac.evmAddrNote')}</p>
              </section>

              <section className="box">
                <div className="box-h">
                  <IndexKicker i={1} tone="green">
                    BNB → ZEC
                  </IndexKicker>
                </div>
                <div className="p-5 sm:p-6">
                  <h2 className="h3">{t('ac.withdrawTitle')}</h2>
                  <p className="mb-5 mt-1.5 text-sm leading-6 text-muted">{t('mz.outSub')}</p>
                  <SendOutFlow />
                </div>
              </section>

              <section className="card p-5 sm:p-6">
                <IndexKicker i={2} tone="muted">
                  1Click
                </IndexKicker>
                <h2 className="h3 mb-4 mt-2">{t('hist.title')}</h2>
                <SwapHistory />
              </section>
            </div>

            <aside className="min-w-0 space-y-6">
              <ZcashAddressesCard />
              {acct.kind === 'passkey' && acct.passkey && (
                <section className="card p-5">
                  <span className="kicker">
                    <NodeRing tone="yellow" />
                    {t('ac.passkeyTitle')}
                  </span>
                  <dl className="mb-4 mt-3 divide-y divide-line/70 rounded-xl border border-line text-sm">
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
                <button type="button" className="btn-ghost w-full hover:!border-down/50 hover:!text-down" onClick={acct.logout}>
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
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.07em] text-faint">{k}</dt>
      <dd className={`min-w-0 truncate ${mono ? 'font-mono text-xs text-fg' : ''}`}>{v}</dd>
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
    <section className="card space-y-4 p-5">
      <div>
        <span className="kicker">
          <ZecGlyph size={12} />
          {t('ac.zTitle')}
        </span>
        <p className="mt-2 text-xs leading-5 text-muted">{t('ac.zSub')}</p>
      </div>
      <ZcashAddressInput value={refund} onChange={setRefund} kinds={['t']} label={t('si.refund')} id="ac-refund" />
      <ZcashAddressInput value={payout} onChange={setPayout} label={t('si.payout')} id="ac-payout" placeholder={t('si.payoutPh')} />
      <button
        type="button"
        className={`w-full ${saved ? 'btn-green' : 'btn-ghost'}`}
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
      <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-faint">{t('ac.zLocal')}</p>
      {err ? <ErrorLine e={err} /> : null}
    </section>
  );
}
