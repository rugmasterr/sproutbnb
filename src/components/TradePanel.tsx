'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Address, PublicClient } from 'viem';
import { usePublicClient, useReadContract } from 'wagmi';
import {
  CashOutPicker,
  ConnectButton,
  DepositZecDialog,
  ZecAmount,
  prepareCashOut,
  useSproutAccount,
  useZec,
  type Call,
  type CashOutChoice,
} from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import { erc20Abi } from '@/lib/abi/erc20';
import { ACTIONS_ENABLED, CHAIN_ID, explorerTx } from '@/lib/config';
import { fmtAmt, weiToNum } from '@/lib/format';
import {
  afterTerminalFee,
  applySlippage,
  errText,
  NATIVE,
  parseUnits18,
  portalBuyCalls,
  portalSellCalls,
  quoteExactInput,
  bridgeBnbCall,
  terminalBuyCalls,
  terminalSellAndBridgeCalls,
  terminalSellCalls,
} from '@/lib/trade';
import { ZecGlyph } from './brand';
import { useComingSoon } from './ComingSoon';
import { Notice, Row } from './ui';

type Side = 'buy' | 'sell';
type Status = { k: 'idle' } | { k: 'busy' } | { k: 'done'; tx: string } | { k: 'error'; msg: string };

const SLIPPAGES = [100, 300, 500, 1000];

function useDebounced<T>(v: T, ms = 400) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const id = setTimeout(() => setD(v), ms);
    return () => clearTimeout(id);
  }, [v, ms]);
  return d;
}

export function TradePanel({
  token,
  symbol,
  venue,
  disabledReason,
}: {
  token: Address;
  symbol: string;
  venue: 'portal' | 'terminal';
  disabledReason?: string | null;
}) {
  const { t } = useI18n();
  const acct = useSproutAccount();
  const { zecToBnbWei, zecUsd } = useZec();
  const client = usePublicClient({ chainId: CHAIN_ID }) as PublicClient | undefined;
  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState('');
  const [slip, setSlip] = useState(300);
  const [cashOut, setCashOut] = useState<CashOutChoice>({ kind: 'bsc' });
  const [status, setStatus] = useState<Status>({ k: 'idle' });
  const [depositOpen, setDepositOpen] = useState(false);
  const connected = acct.kind !== 'none' && Boolean(acct.address);

  const bal = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: acct.address ? [acct.address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: Boolean(acct.address), refetchInterval: 15_000 },
  });
  const tokenBal = (bal.data as bigint | undefined) ?? 0n;

  // Input: ZEC for buys (converted to BNB at the live rate), token units for sells.
  const zecNum = Number(amount || '0');
  const inWei: bigint | null =
    side === 'buy' ? (amount.trim() && zecNum > 0 ? zecToBnbWei(zecNum) : 0n) : parseUnits18(amount || '0');
  const dIn = useDebounced(inWei?.toString() ?? '');

  const quote = useQuery({
    queryKey: ['quote', venue, side, token, dIn],
    enabled: Boolean(client) && dIn !== '' && dIn !== '0',
    refetchInterval: 20_000,
    retry: 0,
    queryFn: async () => {
      const x = BigInt(dIn);
      if (side === 'buy') {
        const net = venue === 'terminal' ? afterTerminalFee(x) : x;
        return quoteExactInput(client!, NATIVE, token, net);
      }
      const out = await quoteExactInput(client!, token, NATIVE, x);
      return venue === 'terminal' ? afterTerminalFee(out) : out;
    },
  });
  const out = quote.data;
  const minOut = out !== undefined ? applySlippage(out, slip) : undefined;
  const insufficient =
    connected && inWei !== null && inWei > 0n && (side === 'buy' ? acct.balanceWei !== undefined && inWei > acct.balanceWei : inWei > tokenBal);

  async function submit() {
    if (!connected || !acct.address || inWei === null || inWei === 0n || minOut === undefined) return;
    setStatus({ k: 'busy' });
    try {
      let calls: Call[];
      if (side === 'buy') {
        calls = venue === 'portal' ? portalBuyCalls(token, inWei, minOut) : terminalBuyCalls(token, inWei, minOut, acct.address);
      } else {
        const prep = await prepareCashOut(cashOut, minOut);
        if (venue === 'portal') {
          // Sell to the account, then (if cashing out to Zcash) forward the guaranteed minimum to the 1Click deposit address.
          calls = portalSellCalls(token, inWei, minOut);
          if (prep) calls.push(bridgeBnbCall(prep.depositAddress, minOut, prep.quoteRef));
        } else {
          calls = prep
            ? terminalSellAndBridgeCalls(token, inWei, minOut, prep.depositAddress, prep.quoteRef)
            : terminalSellCalls(token, inWei, minOut, acct.address);
        }
      }
      const tx = await acct.executeBatch(calls);
      setStatus({ k: 'done', tx });
      setAmount('');
      bal.refetch();
    } catch (e) {
      setStatus({ k: 'error', msg: errText(e) });
    }
  }

  const blocked = Boolean(disabledReason);
  const notify = useComingSoon();

  return (
    <>
    <div className="glass relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full glow-yellow" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
      <div className="relative flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <span className="kicker">
          <span aria-hidden className="status-dot" data-pulse={blocked ? 'false' : 'true'} style={{ ['--dot' as string]: blocked ? 'rgb(var(--faint))' : 'rgb(var(--bamboo))' }} />
          {venue === 'portal' ? 'Flap Portal' : 'Sprout Terminal'}
        </span>
        <span className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-muted">${symbol}</span>
      </div>

      <div className="relative p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-black/35 p-1" role="tablist">
          {(['buy', 'sell'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => {
                setSide(s);
                setAmount('');
                setStatus({ k: 'idle' });
              }}
              className={`rounded-full py-2 font-mono text-[12px] font-semibold uppercase tracking-[0.08em] transition duration-200 ${
                side === s
                  ? s === 'buy'
                    ? 'bg-up/15 text-up shadow-[inset_0_0_0_1px_rgb(var(--up)/0.45),0_0_24px_-6px_rgb(var(--up)/0.6)]'
                    : 'bg-down/15 text-down shadow-[inset_0_0_0_1px_rgb(var(--down)/0.45),0_0_24px_-6px_rgb(var(--down)/0.6)]'
                  : 'text-faint hover:text-fg'
              }`}
            >
              {s === 'buy' ? t('trade.buy') : t('trade.sell')}
            </button>
          ))}
        </div>

        <label className="well mt-4 block px-3.5 pb-3 pt-2.5 transition focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgb(var(--accent)/0.12)]">
          <span className="label mb-1 flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              {side === 'buy' && <ZecGlyph size={12} />}
              <span className="truncate">{side === 'buy' ? t('trade.payZec') : t('trade.payTok', { sym: symbol })}</span>
            </span>
            {connected && (
              <button
                type="button"
                className="shrink-0 normal-case tracking-normal text-accent transition hover:text-accent-hi"
                onClick={() => {
                  if (side === 'sell') setAmount(String(weiToNum(tokenBal)));
                }}
              >
                {side === 'buy' ? (
                  acct.balanceWei !== undefined ? <ZecAmount wei={acct.balanceWei} /> : null
                ) : (
                  `${t('ui.max')} ${fmtAmt(weiToNum(tokenBal))}`
                )}
              </button>
            )}
          </span>
          <span className="flex items-baseline gap-2">
            <input
              className="num w-full min-w-0 bg-transparent font-mono text-[1.65rem] font-semibold tracking-[-0.02em] text-fg outline-none placeholder:text-faint/60 disabled:opacity-60"
              inputMode="decimal"
              placeholder="0.0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={blocked}
            />
            <span className={`shrink-0 font-mono text-xs font-semibold uppercase ${side === 'buy' ? 'text-gold' : 'text-muted'}`}>
              {side === 'buy' ? 'ZEC' : symbol}
            </span>
          </span>
        </label>

        {side === 'buy' && !zecUsd && <p className="mt-2 text-xs text-gold">{t('trade.needRate')}</p>}

        <div className="mt-3 rounded-xl border border-line bg-white/[0.02] px-3.5 py-1.5">
          <Row
            k={t('trade.receive')}
            v={
              quote.isFetching && out === undefined ? (
                <span className="font-mono text-xs text-faint">{t('trade.quoting')}</span>
              ) : out === undefined ? (
                '—'
              ) : side === 'buy' ? (
                <span className="font-mono">{`${fmtAmt(weiToNum(out))} ${symbol}`}</span>
              ) : (
                <ZecAmount wei={out} showBnb />
              )
            }
          />
          <Row
            k={t('trade.minReceive')}
            v={
              minOut === undefined ? (
                '—'
              ) : side === 'buy' ? (
                <span className="font-mono text-muted">{`${fmtAmt(weiToNum(minOut))} ${symbol}`}</span>
              ) : (
                <ZecAmount wei={minOut} />
              )
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span className="text-muted">{t('trade.slippage')}</span>
            <div className="flex gap-1">
              {SLIPPAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlip(s)}
                  aria-pressed={slip === s}
                  className={`chip px-2 py-0.5 ${slip === s ? 'chip-on' : ''}`}
                >
                  {s / 100}%
                </button>
              ))}
            </div>
          </div>
        </div>
        {quote.isError && (
          <p className="mt-2 text-xs text-down">
            {t('trade.quoteFail')} <span className="font-mono text-[11px] opacity-80">{errText(quote.error)}</span>
          </p>
        )}

        {side === 'sell' && (
          <div className="mt-4 space-y-2">
            <span className="label">{t('trade.cashOut')}</span>
            <CashOutPicker value={cashOut} onChange={setCashOut} />
            {cashOut.kind !== 'bsc' && <p className="text-xs text-faint">{t('trade.cashOutNote')}</p>}
          </div>
        )}

        <div className="mt-4">
          {blocked ? (
            <Notice tone="warn">{disabledReason}</Notice>
          ) : !ACTIONS_ENABLED ? (
            <button
              type="button"
              data-action={`trade-${side}`}
              className={`btn-lg w-full ${side === 'buy' ? 'btn-primary' : 'btn-seal'}`}
              onClick={notify}
            >
              {side === 'buy' ? t('trade.buy') : t('trade.sell')} {symbol ? `$${symbol}` : ''}
              <span className="arr">→</span>
            </button>
          ) : !connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line-2 px-3.5 py-3">
              <span className="text-sm text-muted">{t('ui.connectFirst')}</span>
              <ConnectButton />
            </div>
          ) : (
            <button
              type="button"
              className={`btn-lg w-full ${side === 'buy' ? 'btn-primary' : 'btn-seal'}`}
              disabled={status.k === 'busy' || !inWei || minOut === undefined || insufficient}
              onClick={submit}
            >
              {status.k === 'busy' ? t('trade.working') : insufficient ? t('trade.insufficient') : t('trade.submit')}
              {status.k !== 'busy' && !insufficient && <span className="arr">→</span>}
            </button>
          )}
          {connected && acct.kind === 'passkey' && side === 'buy' && (
            <button
              type="button"
              className="mt-2 w-full text-center font-mono text-[11px] uppercase tracking-[0.08em] text-accent transition hover:text-accent-hi"
              onClick={ACTIONS_ENABLED ? () => setDepositOpen(true) : notify}
            >
              + {t('trade.deposit')}
            </button>
          )}
        </div>

        {status.k === 'done' && (
          <div className="mt-3">
            <Notice tone="ok">
              {t('trade.done')} ·{' '}
              <a className="link" href={explorerTx(status.tx)} target="_blank" rel="noopener noreferrer">
                {t('trade.viewTx')}
              </a>
            </Notice>
          </div>
        )}
        {status.k === 'error' && (
          <div className="mt-3">
            <Notice tone="err">{status.msg}</Notice>
          </div>
        )}
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-faint">
          {venue === 'portal' ? t('trade.taxNote') : t('term.fee')} {side === 'sell' && t('trade.approveNote')}
        </p>
      </div>
    </div>
    {/* outside .glass: backdrop-filter would trap the fixed-position dialog */}
    <DepositZecDialog open={depositOpen} onClose={() => setDepositOpen(false)} />
    </>
  );
}
