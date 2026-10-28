'use client';

import { useEffect, useRef } from 'react';
import { getAddress, isAddress, keccak256, toBytes, type Hex } from 'viem';
import { isValidZcashAddress } from './address';
import { ZcashAddressInput } from './components';
import { SHIELD_MAX_PER_PAYOUT_ZEC, ZEC_DECIMALS, env } from './constants';
import { useZT } from './i18n-hook';
import { formatUnitsTrim, requestQuote, upsertSwap } from './oneclick';
import { RELAYER_URL, accountRef, useSproutAccount } from './provider';

export type CashOutChoice = { kind: 'bsc' } | { kind: 'zcash'; tAddress: string } | { kind: 'shielded'; address: string };

export const FORWARDER_TADDR = isValidZcashAddress(env.forwarderTaddr, ['t']) ? env.forwarderTaddr : '';
/** Shielded cash-outs need the forwarder, the relayer (registration) and SproutTerminal (on-chain CashOut proof). */
export const SHIELDED_LIVE = Boolean(FORWARDER_TADDR && RELAYER_URL && isAddress(env.terminal));

export type PreparedCashOut = {
  depositAddress: `0x${string}`;
  quoteRef: `0x${string}`;
  /** 1Click accepts any deposit ≥ this (FLEX_INPUT, 1% slippage). Use it as the floor for the sale's minBnbOut. */
  minAmountInWei: bigint;
  amountOutZec: string;
  minAmountOutZec: string;
  deadline?: string;
  correlationId: string;
};

/** quoteRef = keccak256 of the 20 address bytes of the 1Click BSC deposit address (transparent cash-outs). */
export const quoteRefOf = (depositAddress: `0x${string}`): `0x${string}` => keccak256(getAddress(depositAddress) as Hex);

/**
 * Binding quoteRef for shielded cash-outs: keccak256(utf8("sprout-shield:v1:" + lower(depositAddress) + ":" +
 * shieldedAddress)). The user's own signed BSC tx (CashOut event) then commits to the shielded destination, so no other
 * registration can redirect the ZEC (zforward REQUIRE_BOUND_QUOTEREF=1; relayer validate.ts uses the same formula).
 */
export const shieldQuoteRefOf = (depositAddress: `0x${string}`, shieldedAddress: string): `0x${string}` =>
  keccak256(toBytes(`sprout-shield:v1:${depositAddress.toLowerCase()}:${shieldedAddress.trim()}`));

/**
 * Prepare a cash-out to Zcash: get a live 1Click quote BNB (BSC) → ZEC (Zcash) for `bnbWei` and return the BSC
 * deposit address + quoteRef to pass to SproutTerminal.sellAndBridge (or a plain BNB transfer). Returns null for 'bsc'.
 * - 'zcash': recipient = the user's t-address.
 * - 'shielded': recipient = Sprout's forwarder t-address; the request is registered with the relayer/forwarder, which
 *   then sends the ZEC on to the shielded/unified address with a stamp memo.
 * Refunds (if 1Click can't fill) go back to the Sprout/BNB account on BSC.
 */
export async function prepareCashOut(choice: CashOutChoice, bnbWei: bigint): Promise<PreparedCashOut | null> {
  if (choice.kind === 'bsc') return null;
  const refundTo = accountRef.address;
  if (!refundTo || !isAddress(refundTo)) throw new Error('not-connected');
  if (bnbWei <= 0n) throw new Error('amount');
  let recipient: string;
  if (choice.kind === 'zcash') {
    if (!isValidZcashAddress(choice.tAddress, ['t'])) throw new Error('bad-taddr');
    recipient = choice.tAddress.trim();
  } else {
    if (!SHIELDED_LIVE) throw new Error('shielded-unavailable');
    if (!isValidZcashAddress(choice.address, ['shielded', 'unified'])) throw new Error('bad-shielded');
    recipient = FORWARDER_TADDR;
  }
  const q = await requestQuote({ direction: 'out', amount: bnbWei, recipient, refundTo, dry: false, swapType: 'FLEX_INPUT' });
  if (!q.depositAddress || !isAddress(q.depositAddress)) throw new Error('no-deposit-address');
  const depositAddress = getAddress(q.depositAddress) as `0x${string}`;
  const quoteRef = choice.kind === 'shielded' ? shieldQuoteRefOf(depositAddress, choice.address) : quoteRefOf(depositAddress);
  if (choice.kind === 'shielded') {
    if (Number(q.amountOutFormatted) > SHIELD_MAX_PER_PAYOUT_ZEC) throw new Error('shielded-limit');
    const r = await fetch(`${RELAYER_URL}/shield-request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quoteRef,
        shieldedAddress: choice.address.trim(),
        depositAddress,
        correlationId: q.correlationId,
        amountOutZec: q.amountOutFormatted,
        deadline: q.deadline,
        account: refundTo,
      }),
    }).catch(() => null);
    if (!r || !r.ok) {
      const j = r ? ((await r.json().catch(() => ({}))) as { error?: string; message?: string }) : {};
      throw Object.assign(new Error(j.error || j.message || (r ? `relayer ${r.status}` : 'relayer unreachable')), { code: 'shield-register-failed' });
    }
  }
  upsertSwap({
    depositAddress,
    direction: 'out',
    createdAt: Date.now(),
    deadline: q.deadline,
    amountInFormatted: q.amountInFormatted,
    amountOutFormatted: q.amountOutFormatted,
    recipient,
    refundTo,
    shieldedTo: choice.kind === 'shielded' ? choice.address.trim() : undefined,
    correlationId: q.correlationId,
    signature: q.signature,
    status: 'PENDING_DEPOSIT',
  });
  return {
    depositAddress,
    quoteRef,
    // FLEX_INPUT: 1Click converts any deposit ≥ minAmountIn (≈ amount × (1 − slippage)); below it the BNB is refunded.
    minAmountInWei: BigInt(q.minAmountIn || q.amountIn),
    amountOutZec: q.amountOutFormatted,
    minAmountOutZec: q.minAmountOut && /^\d+$/.test(q.minAmountOut) ? formatUnitsTrim(BigInt(q.minAmountOut), ZEC_DECIMALS, ZEC_DECIMALS) : q.amountOutFormatted,
    deadline: q.deadline,
    correlationId: q.correlationId,
  };
}

/** Where sale proceeds go. Prefills Zcash addresses from the account; shielded option only when the forwarder is live. */
export function CashOutPicker({ value, onChange, allowBsc = true }: { value: CashOutChoice; onChange(v: CashOutChoice): void; allowBsc?: boolean }) {
  const { t } = useZT();
  const acct = useSproutAccount();
  const refund = acct.zcashRefundAddress || '';
  const payout = acct.zcashPayoutAddress || '';
  const payoutT = isValidZcashAddress(payout, ['t']) ? payout : '';
  const payoutZ = isValidZcashAddress(payout, ['shielded', 'unified']) ? payout : '';

  // Zcash-wallet users default to cashing out to Zcash once (never overriding an explicit choice afterwards).
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !acct.ready) return;
    defaulted.current = true;
    if (acct.kind === 'passkey' && value.kind === 'bsc' && (payoutT || refund)) onChange({ kind: 'zcash', tAddress: payoutT || refund });
  }, [acct.ready, acct.kind, value.kind, payoutT, refund, onChange]);

  const opt = (active: boolean, disabled = false) =>
    `relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition duration-300 ease-out ${
      active
        ? 'border-accent/55 bg-accent/[0.06] shadow-[0_10px_40px_-22px_rgb(var(--accent)/0.8),inset_0_1px_0_rgba(255,255,255,0.04)]'
        : 'border-line bg-white/[0.02] hover:border-line-2 hover:bg-white/[0.035]'
    } ${disabled ? 'cursor-not-allowed opacity-50 hover:border-line hover:bg-white/[0.02]' : ''}`;
  const dot = (active: boolean) => (
    <span
      className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px] transition ${
        active ? 'border-accent shadow-[0_0_12px_rgb(var(--accent)/0.6)]' : 'border-line-2'
      }`}
    >
      {active && <span className="h-[7px] w-[7px] rounded-full bg-accent" />}
    </span>
  );

  return (
    <div className="space-y-2" role="radiogroup" aria-label={t('co.title')}>
      <button type="button" role="radio" aria-checked={value.kind === 'zcash'} className={opt(value.kind === 'zcash')} onClick={() => value.kind !== 'zcash' && onChange({ kind: 'zcash', tAddress: payoutT || refund })}>
        <span className="flex gap-2.5">
          {dot(value.kind === 'zcash')}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t('co.zcash')}</span>
            <span className="block text-xs text-muted">{t('co.zcashHint')}</span>
          </span>
        </span>
      </button>
      {value.kind === 'zcash' && (
        <div className="pl-1">
          <ZcashAddressInput value={value.tAddress} onChange={(v) => onChange({ kind: 'zcash', tAddress: v })} kinds={['t']} label={t('co.tLabel')} id="co-taddr" />
        </div>
      )}

      <button
        type="button"
        role="radio"
        aria-checked={value.kind === 'shielded'}
        aria-disabled={!SHIELDED_LIVE}
        className={opt(value.kind === 'shielded', !SHIELDED_LIVE)}
        onClick={() => SHIELDED_LIVE && value.kind !== 'shielded' && onChange({ kind: 'shielded', address: payoutZ })}
      >
        <span className="flex gap-2.5">
          {dot(value.kind === 'shielded')}
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {t('co.shielded')}
              {!SHIELDED_LIVE && <span className="tag-muted">{t('co.soon')}</span>}
            </span>
            <span className="block text-xs text-muted">{SHIELDED_LIVE ? t('co.shieldedHint', { max: SHIELD_MAX_PER_PAYOUT_ZEC }) : t('co.shieldedOff')}</span>
          </span>
        </span>
      </button>
      {value.kind === 'shielded' && (
        <div className="pl-1">
          <ZcashAddressInput value={value.address} onChange={(v) => onChange({ kind: 'shielded', address: v })} kinds={['shielded', 'unified']} label={t('co.zLabel')} id="co-zaddr" />
        </div>
      )}

      {allowBsc && (
      <button type="button" role="radio" aria-checked={value.kind === 'bsc'} className={opt(value.kind === 'bsc')} onClick={() => onChange({ kind: 'bsc' })}>
        <span className="flex gap-2.5">
          {dot(value.kind === 'bsc')}
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t('co.bsc')}</span>
            <span className="block text-xs text-muted">{t('co.bscHint')}</span>
          </span>
        </span>
      </button>
      )}
      {value.kind !== 'bsc' && <p className="px-1 text-[11px] leading-5 text-faint">{t('co.note')}</p>}
    </div>
  );
}
