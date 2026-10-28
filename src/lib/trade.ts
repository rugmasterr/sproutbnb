import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import type { Call } from '@/features/zcash';
import { portalAbi } from './abi/portal';
import { erc20Abi } from './abi/erc20';
import { terminalAbi } from './abi/sprout';
import { chain, sprout, TERMINAL_FEE_BPS, ZERO } from './config';

export const NATIVE: Address = ZERO; // Flap uses address(0) for native BNB

export const applySlippage = (x: bigint, bps: number) => (x * BigInt(10_000 - Math.round(bps))) / 10_000n;
export const afterTerminalFee = (x: bigint) => (x * BigInt(10_000 - TERMINAL_FEE_BPS)) / 10_000n;

/** Flap Portal.quoteExactInput is non-view; run it through eth_call. */
export async function quoteExactInput(client: PublicClient, inputToken: Address, outputToken: Address, inputAmount: bigint) {
  const { result } = await client.simulateContract({
    address: chain.portal,
    abi: portalAbi,
    functionName: 'quoteExactInput',
    args: [{ inputToken, outputToken, inputAmount }],
  });
  return result as bigint;
}

const swapData = (inputToken: Address, outputToken: Address, inputAmount: bigint, minOutputAmount: bigint): Hex =>
  encodeFunctionData({
    abi: portalAbi,
    functionName: 'swapExactInput',
    args: [{ inputToken, outputToken, inputAmount, minOutputAmount, permitData: '0x' }],
  });

const approveCall = (token: Address, spender: Address, amount: bigint): Call => ({
  to: token,
  value: 0n,
  data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amount] }),
});

/** Coin page buy: BNB → token through the Flap Portal (curve or DEX). */
export const portalBuyCalls = (token: Address, bnbWei: bigint, minOut: bigint): Call[] => [
  { to: chain.portal, value: bnbWei, data: swapData(NATIVE, token, bnbWei, minOut) },
];

/** Coin page sell: approve Portal, then token → BNB. */
export const portalSellCalls = (token: Address, amount: bigint, minBnbOut: bigint): Call[] => [
  approveCall(token, chain.portal, amount),
  { to: chain.portal, value: 0n, data: swapData(token, NATIVE, amount, minBnbOut) },
];

export const sendBnbCall = (to: Address, value: bigint): Call => ({ to, value, data: '0x' });

/**
 * Send BNB the account already holds to a 1Click deposit address. Goes through SproutTerminal.bridge (no fee) when
 * the terminal is deployed, so the tx carries a CashOut(depositAddress, quoteRef) event — required for shielded
 * payouts (the shield forwarder only pays after verifying it on-chain). Plain transfer otherwise (transparent only).
 */
export function bridgeBnbCall(deposit: Address, value: bigint, quoteRef: Hex): Call {
  if (!sprout.terminal) return sendBnbCall(deposit, value);
  return {
    to: sprout.terminal,
    value,
    data: encodeFunctionData({ abi: terminalAbi, functionName: 'bridge', args: [deposit, quoteRef] }),
  };
}

/* ---------------- SproutTerminal (any Flap token, 1% fee) ---------------- */

export function terminalBuyCalls(token: Address, bnbWei: bigint, minOut: bigint, recipient: Address): Call[] {
  if (!sprout.terminal) throw new Error('terminal not deployed');
  return [
    {
      to: sprout.terminal,
      value: bnbWei,
      data: encodeFunctionData({ abi: terminalAbi, functionName: 'buy', args: [token, minOut, recipient] }),
    },
  ];
}

export function terminalSellCalls(token: Address, amount: bigint, minBnbOut: bigint, recipient: Address): Call[] {
  if (!sprout.terminal) throw new Error('terminal not deployed');
  return [
    approveCall(token, sprout.terminal, amount),
    {
      to: sprout.terminal,
      value: 0n,
      data: encodeFunctionData({ abi: terminalAbi, functionName: 'sell', args: [token, amount, minBnbOut, recipient] }),
    },
  ];
}

export function terminalSellAndBridgeCalls(token: Address, amount: bigint, minBnbOut: bigint, deposit: Address, quoteRef: Hex): Call[] {
  if (!sprout.terminal) throw new Error('terminal not deployed');
  return [
    approveCall(token, sprout.terminal, amount),
    {
      to: sprout.terminal,
      value: 0n,
      data: encodeFunctionData({ abi: terminalAbi, functionName: 'sellAndBridge', args: [token, amount, minBnbOut, deposit, quoteRef] }),
    },
  ];
}

/** Parses a decimal string into 18-decimal wei without floating point. */
export function parseUnits18(v: string): bigint | null {
  const s = v.trim().replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return null;
  const [w, f = ''] = s.split('.');
  const frac = (f + '0'.repeat(18)).slice(0, 18);
  try {
    return BigInt(w || '0') * 10n ** 18n + BigInt(frac || '0');
  } catch {
    return null;
  }
}

export const errText = (e: unknown) => {
  const x = e as { shortMessage?: string; message?: string };
  return (x?.shortMessage || x?.message || String(e)).split('\n')[0].slice(0, 220);
};
