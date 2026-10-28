'use client';

import { useState } from 'react';
import { useConnect } from 'wagmi';
import { ZecGlyph } from '@/components/brand';
import { isValidZcashAddress } from './address';
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
      <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-raised/50 p-1" role="tablist">
        {(['zcash', 'bnb'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={`inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
              tab === k ? (k === 'zcash' ? 'bg-gold text-ink' : 'bg-accent text-accent-fg') : 'text-muted hover:text-fg'
            }`}
            onClick={() => setTab(k)}
          >
            {k === 'zcash' && <ZecGlyph size={14} />}
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

  const canCreate = live && supported && ack && isValidZcashAddress(refund, ['t']) && (!payout || isValidZcashAddress(payout));

  return (
    <div className="space-y-3.5">
      {!compact && <p className="text-sm leading-6 text-muted">{t('si.zcashIntro')}</p>}
      {!live && (
        <Callout tone="warn">
          <strong className="font-semibold">{t('si.notLiveTitle')}</strong> {t('si.notLive')}
        </Callout>
      )}
      {!supported && <Callout tone="err">{t('err.unsupported')}</Callout>}

      {acct.knownPasskey && (
        <div className="rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
          <p className="mb-2">{t('si.welcomeBack')}</p>
          <button type="button" className="btn-primary w-full" disabled={!live || !!busy} onClick={() => run('login')}>
            {busy === 'login' && <Spinner />}
            {t('si.signInPasskey')}
          </button>
        </div>
      )}

      <ZcashAddressInput value={refund} onChange={setRefund} kinds={['t']} label={t('si.refund')} id="si-refund" />
      <ZcashAddressInput value={payout} onChange={setPayout} label={t('si.payout')} id="si-payout" placeholder={t('si.payoutPh')} />

      <label className="flex items-start gap-2.5 text-xs leading-5 text-muted">
        <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>
          <strong className="font-semibold text-fg">{t('si.onlyKey')}</strong> {t('si.onlyKeyMore')}
        </span>
      </label>

      <button type="button" className="btn w-full bg-gold py-2.5 text-ink hover:brightness-105" disabled={!canCreate || !!busy} onClick={() => run('create')}>
        {busy === 'create' && <Spinner />}
        {t('si.create')}
      </button>
      <button type="button" className="btn-ghost w-full" disabled={!live || !supported || !!busy} onClick={() => run('discover')}>
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
            className="flex items-center gap-3 rounded-xl border border-line bg-raised/50 px-3.5 py-3 text-left text-sm transition hover:border-accent/60 disabled:opacity-50"
            disabled={isPending}
            onClick={async () => {
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
            }}
          >
            {c.icon ? <img src={c.icon} alt="" width={24} height={24} className="h-6 w-6 rounded" /> : <span className="grid h-6 w-6 place-items-center rounded bg-bamboo-700 text-[11px] font-bold text-leaf-200">◆</span>}
            <span className="flex-1 font-medium">{c.id === 'injected' ? t('si.browserWallet') : c.name}</span>
            {which === c.uid && <Spinner />}
          </button>
        ))}
        {!list.length && <Callout>{t('si.noWallet')}</Callout>}
      </div>
      <p className="text-[11px] leading-5 text-faint">{t('si.bnbNote')}</p>
      <Err e={err} />
    </div>
  );
}
