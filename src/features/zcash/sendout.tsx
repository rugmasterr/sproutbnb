'use client';

import { useEffect, useMemo, useState } from 'react';
import { bridgeBnbCall } from '@/lib/trade';
import { isValidZcashAddress, shortZ } from './address';
import { CashOutPicker, FORWARDER_TADDR, prepareCashOut, type CashOutChoice } from './cashout';
import { Callout, fmtBnb, fmtZec, Spinner, SwapProgress, ZecAmount } from './components';
import { ErrorLine, useTrackedSwap } from './deposit';
import { useZT } from './i18n-hook';
import { removeSwap, requestQuote, submitDeposit, upsertSwap, type Quote } from './oneclick';
import { useSproutAccount, useZec } from './provider';
import { SignInPanel } from './signin';

/** BNB kept back for gas (relayer reimbursement or wallet gas). */
const GAS_RESERVE_WEI = 10n ** 15n; // 0.001 BNB

/** "Send ZEC out": BNB in the account → native ZEC on Zcash (t-address, or shielded via Sprout's forwarder). */
export function SendOutFlow() {
  const { t } = useZT();
  const acct = useSproutAccount();
  const { zecToBnbWei, bnbWeiToZec } = useZec();
  const [choice, setChoice] = useState<CashOutChoice>({ kind: 'zcash', tAddress: '' });
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<Quote | null>(null);
  const [previewErr, setPreviewErr] = useState<unknown>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [active, setActive] = useState<string | undefined>();
  const swap = useTrackedSwap(active);

  // Prefill the destination from the account's saved Zcash addresses.
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (prefilled) return;
    const p = acct.zcashPayoutAddress && isValidZcashAddress(acct.zcashPayoutAddress, ['t']) ? acct.zcashPayoutAddress : acct.zcashRefundAddress;
    if (!p) return;
    setPrefilled(true);
    setChoice((c) => (c.kind === 'zcash' && !c.tAddress ? { kind: 'zcash', tAddress: p } : c));
  }, [acct.zcashPayoutAddress, acct.zcashRefundAddress, prefilled]);

  const balance = acct.balanceWei ?? 0n;
  const maxWei = balance > GAS_RESERVE_WEI ? balance - GAS_RESERVE_WEI : 0n;
  const zecNum = Number(amount.replace(',', '.'));
  const wei = useMemo(() => {
    if (!amount || !Number.isFinite(zecNum) || zecNum <= 0) return null;
    const w = zecToBnbWei(zecNum);
    return w && w > maxWei && maxWei > 0n && w - maxWei < 10n ** 12n ? maxWei : w; // snap rounding dust from "Max"
  }, [amount, zecNum, zecToBnbWei, maxWei]);
  const tooMuch = wei !== null && wei > maxWei;
  const destOk =
    choice.kind === 'zcash' ? isValidZcashAddress(choice.tAddress, ['t']) : choice.kind === 'shielded' ? isValidZcashAddress(choice.address, ['shielded', 'unified']) : false;

  useEffect(() => {
    setPreview(null);
    setPreviewErr(null);
    if (!wei || wei <= 0n || !acct.address || !destOk || tooMuch) return;
    const recipient = choice.kind === 'zcash' ? choice.tAddress : FORWARDER_TADDR;
    if (!recipient) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setPreviewing(true);
      try {
        setPreview(await requestQuote({ direction: 'out', amount: wei, recipient, refundTo: acct.address!, dry: true, signal: ctrl.signal }));
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') setPreviewErr(e);
      } finally {
        setPreviewing(false);
      }
    }, 600);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [wei, acct.address, destOk, tooMuch, choice]);

  if (!acct.ready) return <div className="skeleton h-40 w-full" />;
  if (acct.kind === 'none' || !acct.address) {
    return (
      <div className="space-y-4">
        <Callout>{t('out.needAccount')}</Callout>
        <SignInPanel compact />
      </div>
    );
  }

  const send = async () => {
    if (!wei || choice.kind === 'bsc') return;
    setBusy(true);
    setErr(null);
    try {
      // BNB to the 1Click deposit address via SproutTerminal.bridge (emits CashOut, which the shield forwarder
      // verifies on-chain); plain transfer only when the terminal is not configured (transparent payouts only).
      const prep = await prepareCashOut(choice, wei);
      if (!prep) return;
      let hash: `0x${string}`;
      try {
        hash = await acct.executeBatch([bridgeBnbCall(prep.depositAddress, wei, prep.quoteRef)]);
      } catch (e) {
        // Cancelled / rejected before anything was broadcast: forget the unused one-time quote.
        const code = (e as { code?: string })?.code;
        if (code !== 'relay-failed' && code !== 'relay-no-hash' && code !== 'call-reverted') removeSwap(prep.depositAddress);
        throw e;
      }
      upsertSwap({ depositAddress: prep.depositAddress, bscTx: hash, status: 'KNOWN_DEPOSIT_TX' });
      void submitDeposit(hash, prep.depositAddress);
      setActive(prep.depositAddress);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  if (active && swap) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-raised/40 p-3.5 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted">{t('out.sent')}</span>
            <span className="num">{fmtBnb(Number(swap.amountInFormatted))} BNB</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-muted">{t('out.expect')}</span>
            <span className="num font-semibold text-gold">≈ {fmtZec(Number(swap.amountOutFormatted))} ZEC</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-muted">{t('out.to')}</span>
            <span className="font-mono text-xs">{shortZ(swap.shieldedTo || swap.recipient, 8)}</span>
          </div>
        </div>
        <SwapProgress swap={swap} />
        {swap.shieldedTo && <Callout>{t('out.shieldedNext')}</Callout>}
        <button type="button" className="btn-ghost" onClick={() => { setActive(undefined); setAmount(''); }}>
          {t('out.another')}
        </button>
      </div>
    );
  }

  const maxZec = bnbWeiToZec(maxWei);
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-end justify-between gap-2">
          <label htmlFor="out-amt" className="label mb-0">
            {t('out.amount')}
          </label>
          <span className="text-[11px] text-muted">
            {t('out.available')} <ZecAmount wei={maxWei} />{' '}
            {maxZec !== null && maxWei > 0n && (
              <button type="button" className="link ml-1 font-semibold" onClick={() => setAmount(maxZec.toFixed(8).replace(/\.?0+$/, ''))}>
                {t('out.max')}
              </button>
            )}
          </span>
        </div>
        <div className="relative">
          <input
            id="out-amt"
            className="input pr-16 text-lg font-semibold num"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-gold">ZEC</span>
        </div>
        <p className="mt-1 text-[11px] text-faint">{wei ? t('out.fromBnb', { bnb: fmtBnb(Number(wei) / 1e18) }) : t('out.denom')}</p>
        {tooMuch && <p className="mt-1 text-[11px] text-down">{t('out.tooMuch')}</p>}
      </div>

      <CashOutPicker value={choice} onChange={setChoice} allowBsc={false} />

      <div className="rounded-xl border border-line bg-raised/40 p-3.5 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted">{t('out.youGet')}</span>
          <span className="num">
            {previewing ? <Spinner className="inline" /> : preview ? <span className="font-semibold text-gold">{fmtZec(Number(preview.amountOutFormatted))} ZEC</span> : <span className="text-faint">—</span>}
          </span>
        </div>
        {preview?.minAmountOut && (
          <div className="mt-1 flex items-center justify-between gap-3 text-xs">
            <span className="text-muted">{t('out.min')}</span>
            <span className="num">{fmtZec(Number(preview.minAmountOut) / 1e8)} ZEC</span>
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted">{t('out.refundsTo')}</span>
          <span className="font-mono">{shortZ(acct.address, 6)}</span>
        </div>
      </div>
      {previewErr ? <ErrorLine e={previewErr} /> : null}
      {acct.kind === 'passkey' && !acct.relayerLive && <Callout tone="warn">{t('err.relayerOff')}</Callout>}

      <button type="button" className="btn w-full bg-gold py-2.5 text-ink hover:brightness-105" disabled={!wei || tooMuch || !destOk || busy || !preview} onClick={send}>
        {busy && <Spinner />}
        {acct.kind === 'passkey' ? t('out.sendPasskey') : t('out.sendWallet')}
      </button>
      {err ? <ErrorLine e={err} /> : null}
    </div>
  );
}
