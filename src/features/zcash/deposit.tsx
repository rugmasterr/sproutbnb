'use client';

import { useEffect, useMemo, useState } from 'react';
import { ZecGlyph } from '@/components/brand';
import { NodeRing, StatusDot } from '@/components/fx';
import { Modal } from '@/components/ui';
import { isValidZcashAddress, shortZ } from './address';
import { Callout, CopyField, fmtBnb, fmtUsd, fmtZec, Qr, Spinner, SwapProgress, ZcashAddressInput } from './components';
import { BigCountdown, KV, NodeStepper, QrFrame, useL, ZC } from './zfx';
import { DEPOSIT_DEADLINE_MIN, ZEC_DECIMALS } from './constants';
import { errInfo } from './errors';
import { useZT } from './i18n-hook';
import { FINAL, isExpired, loadSwaps, onSwapsChange, parseUnitsSafe, requestQuote, upsertSwap, zcashUri, type Quote, type TrackedSwap } from './oneclick';
import { usePrices, useSproutAccount } from './provider';
import { SignInPanel } from './signin';

export function ErrorLine({ e }: { e: unknown }) {
  const { t } = useZT();
  if (!e) return null;
  const info = errInfo(e);
  return (
    <Callout tone="err">
      {t(info.key, info.vars)}
      {info.detail && <span className="mt-1 block break-words font-mono text-[11px] text-muted">{info.detail}</span>}
    </Callout>
  );
}

export function useTrackedSwap(depositAddress?: string): TrackedSwap | undefined {
  const [s, setS] = useState<TrackedSwap | undefined>();
  useEffect(() => {
    if (!depositAddress) return setS(undefined);
    const load = () => setS(loadSwaps().find((x) => x.depositAddress === depositAddress));
    load();
    return onSwapsChange(load);
  }, [depositAddress]);
  return s;
}

/** "Bring ZEC in": ZEC on Zcash → BNB in the user's Sprout/BNB account via a one-time 1Click deposit address. */
export function DepositFlow({ onDone }: { onDone?: () => void }) {
  const { t } = useZT();
  const l = useL();
  const acct = useSproutAccount();
  const { zecUsd } = usePrices();
  const [amount, setAmount] = useState('');
  const [refund, setRefund] = useState('');
  const [preview, setPreview] = useState<Quote | null>(null);
  const [previewErr, setPreviewErr] = useState<unknown>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [active, setActive] = useState<string | undefined>();
  const [ack, setAck] = useState(false);
  const swap = useTrackedSwap(active);

  useEffect(() => {
    if (!refund && acct.zcashRefundAddress) setRefund(acct.zcashRefundAddress);
  }, [acct.zcashRefundAddress, refund]);

  const units = useMemo(() => parseUnitsSafe(amount, ZEC_DECIMALS), [amount]);
  const refundOk = isValidZcashAddress(refund, ['t']);

  // Debounced dry quote for the preview.
  useEffect(() => {
    setPreview(null);
    setPreviewErr(null);
    if (!units || units <= 0n || !acct.address || !refundOk) return;
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      setPreviewing(true);
      try {
        const q = await requestQuote({ direction: 'in', amount: units, recipient: acct.address!, refundTo: refund, dry: true, signal: ctrl.signal });
        setPreview(q);
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
  }, [units, acct.address, refund, refundOk]);

  if (!acct.ready) return <div className="skeleton h-40 w-full" />;
  if (acct.kind === 'none' || !acct.address) {
    return (
      <div className="space-y-4">
        <Callout>{t('dep.needAccount')}</Callout>
        <SignInPanel compact />
      </div>
    );
  }

  const start = async () => {
    if (!units || !acct.address) return;
    setBusy(true);
    setErr(null);
    try {
      const q = await requestQuote({ direction: 'in', amount: units, recipient: acct.address, refundTo: refund, dry: false });
      // Defence in depth: a ZEC deposit address must be a transparent Zcash address.
      if (!q.depositAddress || !isValidZcashAddress(q.depositAddress, ['t'])) throw Object.assign(new Error('no-deposit-address'), { code: 'no-deposit-address' });
      try {
        acct.setZcashAddresses({ refund });
      } catch {
        /* already validated */
      }
      upsertSwap({
        depositAddress: q.depositAddress,
        depositMemo: q.depositMemo,
        direction: 'in',
        createdAt: Date.now(),
        deadline: q.deadline,
        amountInFormatted: q.amountInFormatted,
        amountOutFormatted: q.amountOutFormatted,
        recipient: acct.address,
        refundTo: refund,
        correlationId: q.correlationId,
        signature: q.signature,
        status: 'PENDING_DEPOSIT',
      });
      setActive(q.depositAddress);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  };

  if (active && swap) return <DepositInstructions swap={swap} onNew={() => { setActive(undefined); setAck(false); }} onDone={onDone} />;

  const usd = units && zecUsd ? (Number(units) / 1e8) * zecUsd : null;
  const step = !units || units <= 0n ? 0 : !refundOk ? 1 : !ack ? 2 : 3;
  return (
    <div className="space-y-5">
      <NodeStepper steps={[l(ZC.flowAmount), l(ZC.flowRefund), l(ZC.flowConfirm), l(ZC.flowSend)]} current={step} label={t('dep.title')} />

      <div>
        <label htmlFor="dep-amt" className="label">
          {t('dep.amount')}
        </label>
        <div className="well relative flex items-center focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgb(var(--accent)/0.12)]">
          <input
            id="dep-amt"
            className="w-full min-w-0 bg-transparent px-4 py-3 pr-20 font-mono text-[1.6rem] font-semibold tracking-[-0.03em] text-fg outline-none num placeholder:text-faint/60"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 font-mono text-xs font-semibold text-gold">
            <ZecGlyph size={13} />
            ZEC
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-faint">
          {usd !== null ? <span className="font-mono text-muted num">≈ {fmtUsd(usd)} · </span> : ''}
          {t('dep.minHint')}
        </p>
      </div>

      <ZcashAddressInput value={refund} onChange={setRefund} kinds={['t']} label={t('dep.refund')} id="dep-refund" />

      <div className="rounded-xl border border-line-2 bg-ink-3/60 px-4 py-2">
        <div className="flex items-center justify-between gap-3 border-b border-line py-2">
          <span className="mono-label">{l(ZC.quote)} · 1Click</span>
          {previewing ? <StatusDot tone="yellow" /> : preview ? <StatusDot tone="green" pulse={false} /> : <StatusDot tone="muted" />}
        </div>
        <KV
          k={t('dep.youGet')}
          v={
            previewing ? (
              <Spinner className="inline text-accent" />
            ) : preview ? (
              <>
                <span className="font-mono font-semibold">{fmtBnb(Number(preview.amountOutFormatted))} BNB</span>
                <span className="ml-1.5 font-mono text-xs text-gold">≈ {fmtZec(Number(preview.amountInFormatted) * (Number(preview.amountOutUsd) / Math.max(1e-9, Number(preview.amountInUsd))))} ZEC</span>
              </>
            ) : (
              <span className="text-faint">—</span>
            )
          }
        />
        <KV className="border-t border-line/60 text-xs" k={t('dep.to')} v={<span className="font-mono">{shortZ(acct.address, 6)}</span>} />
        {preview?.timeEstimate ? (
          <KV className="border-t border-line/60 text-xs" k={t('dep.eta')} v={<span className="font-mono">{t('dep.etaVal', { min: Math.max(10, Math.round(preview.timeEstimate / 60) + 8) })}</span>} />
        ) : null}
      </div>
      {previewErr ? <ErrorLine e={previewErr} /> : null}

      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 text-xs leading-5 transition ${ack ? 'border-accent/40 bg-accent/[0.05] text-fg' : 'border-line bg-white/[0.02] text-muted hover:border-line-2'}`}>
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>{t('dep.ack', { min: DEPOSIT_DEADLINE_MIN })}</span>
      </label>

      <button type="button" className="btn-primary btn-lg w-full" disabled={!units || !refundOk || !ack || busy || !!previewErr} onClick={start}>
        {busy && <Spinner />}
        {t('dep.getAddress')}
        <span className="arr" aria-hidden>
          →
        </span>
      </button>
      {err ? <ErrorLine e={err} /> : null}
    </div>
  );
}

function DepositInstructions({ swap, onNew, onDone }: { swap: TrackedSwap; onNew(): void; onDone?: () => void }) {
  const { t } = useZT();
  const l = useL();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const expired = isExpired(swap);
  const final = FINAL.includes(swap.status) || expired;
  // Never show the one-time address once its deadline has passed — ZEC sent after it may not be recoverable.
  const waiting = (swap.status === 'PENDING_DEPOSIT' || swap.status === 'INCOMPLETE_DEPOSIT') && !expired;
  const amountExact = swap.amountInFormatted;
  return (
    <div className="space-y-5">
      {waiting && (
        <>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
            <QrFrame caption={l(ZC.scan)}>
              <Qr value={zcashUri(swap.depositAddress, amountExact)} />
            </QrFrame>
            <div className="w-full min-w-0 space-y-3 sm:pt-3">
              <CopyField label={t('dep.sendExactly')} value={`${amountExact}`} big mono={false} />
              {swap.deadline && <BigCountdown to={swap.deadline} from={swap.createdAt} label={t('dep.timeLeft')} expiredText={t('dep.expired')} />}
            </div>
          </div>
          <CopyField label={t('dep.depositAddr')} value={swap.depositAddress} />
          {swap.depositMemo && <CopyField label={t('dep.memo')} value={swap.depositMemo} />}
          <Callout tone="warn">
            <strong className="font-semibold">{t('dep.warnTitle')}</strong> {t('dep.warn')}
          </Callout>
          <ul className="space-y-2 text-xs leading-5 text-muted">
            {[t('dep.tip1'), t('dep.tip2', { refund: shortZ(swap.refundTo, 6) }), t('dep.tip3')].map((x, i) => (
              <li key={i} className="flex gap-2.5">
                <NodeRing tone={i === 0 ? 'yellow' : 'muted'} className="mt-[5px]" />
                <span className="min-w-0">{x}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <SwapProgress swap={swap} />
      <div className="flex flex-wrap gap-2">
        {final && (
          <button type="button" className="btn-primary" onClick={onNew}>
            {t('dep.another')}
          </button>
        )}
        {onDone && (
          <button type="button" className="btn-ghost" onClick={onDone}>
            {final ? t('ui.close') : t('dep.hide')}
          </button>
        )}
        {!final && !onDone && (
          <button type="button" className="btn-ghost" onClick={onNew}>
            {t('dep.startOver')}
          </button>
        )}
      </div>
      {!final && (
        <p className="flex items-start gap-2 text-[11px] leading-4 text-faint">
          <StatusDot tone="green" className="mt-[3px]" />
          {t('dep.keepsTracking')}
        </p>
      )}
    </div>
  );
}

export function DepositZecDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t } = useZT();
  return (
    <Modal open={open} onClose={onClose} title={t('dep.title')} wide>
      <p className="-mt-1 mb-5 text-sm leading-6 text-muted">{t('dep.sub')}</p>
      {open && <DepositFlow onDone={onClose} />}
    </Modal>
  );
}
