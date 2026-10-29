'use client';

import { useState } from 'react';
import { useConnect } from 'wagmi';
import { BnbGlyph, ZecGlyph } from '@/components/brand';
import { ACTIONS_ENABLED, useGate } from '@/components/ComingSoon';
import { isValidZcashAddress } from './address';
import { StatusDot } from '@/components/fx';
import { Callout, Spinner, ZcashAddressInput } from './components';
import { errInfo } from './errors';
import { useZT } from './i18n-hook';
import { passkeySupported } from './passkey/webauthn';
import { useSproutAccount } from './provider';

export type SignInTab = 'zcash' | 'bnb';

function Err({ e }: { e: unknown }) {
  const { t } = useZT();
  if (!e) return null;
  const i = errInfo(e);
  return (
    <Callout tone="err">
      {t(i.key, i.vars)}
      {i.detail && <span className="mt-1 block break-words font-mono text-[11px] text-muted">{i.detail}</span>}
    </Callout>
  );
}

/** The two ways in: Zcash wallet + passkey (primary) or an injected BNB wallet. */
export function SignInPanel({ initial = 'zcash', compact = false, onDone }: { initial?: SignInTab; compact?: boolean; onDone?: () => void }) {
  const { t } = useZT();
  const [tab, setTab] = useState<SignInTab>(initial);
  return (
    <div className="space-y-4">
      <div className="seg grid grid-cols-2" role="tablist">
        {(['zcash', 'bnb'] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className="seg-btn inline-flex items-center justify-center gap-1.5" onClick={() => setTab(k)}>
            {k === 'zcash' ? <ZecGlyph size={14} /> : <BnbGlyph size={14} />}
            {k === 'zcash' ? t('si.tabZcash') : t('si.tabBnb')}
          </button>
        ))}
      </div>
      {tab === 'zcash' ? <ZcashPath compact={compact} onDone={onDone} /> : <BnbPath onDone={onDone} />}
    </div>
  );
}

function ZcashPath({ compact, onDone }: { compact: boolean; onDone?: () => void }) {
  const { t } = useZT();
  const acct = useSproutAccount();
  const gate = useGate();
  const [refund, setRefund] = useState('');
  const [payout, setPayout] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState<'create' | 'login' | 'discover' | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const supported = typeof window === 'undefined' ? true : passkeySupported();
  const live = acct.accountsLive;

  const run = async (what: 'create' | 'login' | 'discover') => {
    setBusy(what);
    setErr(null);
    try {
      if (what === 'create') await acct.createPasskeyAccount({ zcashRefundAddress: refund, zcashPayoutAddress: payout || undefined });
      else await acct.loginPasskey({ discover: what === 'discover' });
      onDone?.();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };

  // Actions off: buttons stay clickable and show the notice instead of running.
  const on = ACTIONS_ENABLED;
  const canCreate = live && supported && ack && isValidZcashAddress(refund, ['t']) && (!payout || isValidZcashAddress(payout));

  return (
    <div className="space-y-3.5">
      {!compact && <p className="text-sm leading-6 text-muted">{t('si.zcashIntro')}</p>}
      {on && !live && (
        <Callout tone="warn">
          <strong className="font-semibold">{t('si.notLiveTitle')}</strong> {t('si.notLive')}
        </Callout>
      )}
      {!supported && <Callout tone="err">{t('err.unsupported')}</Callout>}

      {acct.knownPasskey && (
        <div className="glass relative overflow-hidden p-3.5 text-sm">
          <div aria-hidden className="glow-yellow pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full" />
          <p className="relative mb-2.5 flex items-start gap-2">
            <StatusDot tone="yellow" className="mt-[7px]" />
            {t('si.welcomeBack')}
          </p>
          <button type="button" className="btn-primary relative w-full" disabled={on && (!live || !!busy)} onClick={gate(() => run('login'))}>
            {busy === 'login' && <Spinner />}
            {t('si.signInPasskey')}
          </button>
        </div>
      )}

      <ZcashAddressInput value={refund} onChange={setRefund} kinds={['t']} label={t('si.refund')} id="si-refund" />
      <ZcashAddressInput value={payout} onChange={setPayout} label={t('si.payout')} id="si-payout" placeholder={t('si.payoutPh')} />

      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-xs leading-5 transition ${
          ack ? 'border-accent/40 bg-accent/[0.05] text-fg' : 'border-line bg-white/[0.02] text-muted hover:border-line-2'
        }`}
      >
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>
          <strong className="font-semibold text-fg">{t('si.onlyKey')}</strong> {t('si.onlyKeyMore')}
        </span>
      </label>

      <button type="button" className={`${acct.knownPasskey ? 'btn-ghost' : 'btn-primary'} btn-lg w-full`} data-action="create-passkey" disabled={on && (!canCreate || !!busy)} onClick={gate(() => run('create'))}>
        {busy === 'create' && <Spinner />}
        {t('si.create')}
      </button>
      <button type="button" className="btn-ghost w-full" disabled={on && (!live || !supported || !!busy)} onClick={gate(() => run('discover'))}>
        {busy === 'discover' && <Spinner />}
        {t('si.haveOne')}
      </button>
      {busy === 'discover' && <p className="text-[11px] text-faint">{t('si.discoverHint')}</p>}
      <Err e={err} />
    </div>
  );
}

function BnbPath({ onDone }: { onDone?: () => void }) {
  const { t } = useZT();
  const { connectors, connectAsync, isPending } = useConnect();
  const gate = useGate();
  const [err, setErr] = useState<unknown>(null);
  const [which, setWhich] = useState<string | null>(null);
  // EIP-6963 wallets first; drop the generic injected connector when specific ones exist.
  const specific = connectors.filter((c) => c.id !== 'injected');
  const list = specific.length ? specific : connectors;
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted">{t('si.bnbIntro')}</p>
      <div className="grid gap-2">
        {list.map((c) => (
          <button
            key={c.uid}
            type="button"
            className="group flex items-center gap-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-3 text-left text-sm transition duration-300 ease-out hover:-translate-y-0.5 hover:border-accent/50 hover:bg-white/[0.04] disabled:opacity-50"
            data-action="connect-wallet"
            disabled={ACTIONS_ENABLED && isPending}
            onClick={gate(async () => {
              setErr(null);
              setWhich(c.uid);
              try {
                await connectAsync({ connector: c });
                onDone?.();
              } catch (e) {
                setErr(e);
              } finally {
                setWhich(null);
              }
            })}
          >
            {c.icon ? <img src={c.icon} alt="" width={24} height={24} className="h-6 w-6 rounded" /> : <span className="grid h-6 w-6 place-items-center rounded-md border border-accent/40 bg-accent/10 text-[11px] font-bold text-accent">◆</span>}
            <span className="flex-1 font-medium">{c.id === 'injected' ? t('si.browserWallet') : c.name}</span>
            {which === c.uid ? (
              <Spinner className="text-accent" />
            ) : (
              <span aria-hidden className="font-mono text-faint transition group-hover:translate-x-0.5 group-hover:text-accent">
                →
              </span>
            )}
          </button>
        ))}
        {!list.length && <Callout>{t('si.noWallet')}</Callout>}
      </div>
      <p className="text-[11px] leading-5 text-faint">{t('si.bnbNote')}</p>
      <Err e={err} />
    </div>
  );
}
