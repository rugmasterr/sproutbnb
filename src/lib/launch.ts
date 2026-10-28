import { encodeAbiParameters, encodeFunctionData, type Address, type Hex } from 'viem';
import type { Call } from '@/features/zcash';
import { vaultPortalAbi } from './abi/vaultPortal';
import type { Mode } from './abi/sprout';
import { chain, LAUNCH, sprout, ZEC_TOKEN, ZERO } from './config';

/** vaultData = abi.encode(uint8 mode, address payee, string zcashAddress). Payee must be 0 except mode 1. */
export function encodeVaultData(mode: Mode, payee: Address | null, zcashAddress: string): Hex {
  return encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'address' }, { type: 'string' }],
    [mode, mode === 1 && payee ? payee : ZERO, mode === 3 ? zcashAddress.trim() : ''],
  );
}

export type LaunchInput = {
  name: string;
  symbol: string;
  metaCid: string;
  salt: Hex;
  firstBuyWei: bigint;
  mode: Mode;
  payee: Address | null;
  zcashAddress: string;
  minHoldTokens: number; // holders mode only
};

/**
 * VaultPortal.newTokenV6WithVault — fields in the exact order of
 * contracts/src/flap/IVaultPortal.sol NewTokenV6WithVaultParams (SPEC "Launch call").
 */
export function buildLaunchCall(i: LaunchInput): Call {
  if (!sprout.factory || !sprout.roots) throw new Error('Sprout is not deployed yet');
  const holders = i.mode === 2;
  if (holders && !ZEC_TOKEN) throw new Error('ZEC token unknown on this chain');
  const params = {
    name: i.name,
    symbol: i.symbol,
    meta: i.metaCid,
    dexThresh: LAUNCH.dexThresh,
    salt: i.salt,
    migratorType: LAUNCH.migratorType,
    quoteToken: ZERO,
    quoteAmt: i.firstBuyWei,
    permitData: '0x' as Hex,
    extensionID: ('0x' + '00'.repeat(32)) as Hex,
    extensionData: '0x' as Hex,
    dexId: 0,
    lpFeeProfile: 0,
    buyTaxRate: LAUNCH.taxBps,
    sellTaxRate: LAUNCH.taxBps,
    taxDuration: LAUNCH.taxDuration,
    antiFarmerDuration: LAUNCH.antiFarmerDuration,
    mktBps: LAUNCH.mktBps,
    deflationBps: 0,
    dividendBps: 0,
    lpBps: 0,
    minimumShareBalance: holders ? BigInt(Math.floor(i.minHoldTokens)) * 10n ** 18n : 0n,
    dividendToken: holders ? (ZEC_TOKEN as Address) : ZERO,
    commissionReceiver: sprout.roots,
    tokenVersion: LAUNCH.tokenVersion,
    vaultFactory: sprout.factory,
    vaultData: encodeVaultData(i.mode, i.payee, i.zcashAddress),
  } as const;
  return {
    to: chain.vaultPortal,
    value: i.firstBuyWei,
    data: encodeFunctionData({ abi: vaultPortalAbi, functionName: 'newTokenV6WithVault', args: [params] }),
  };
}

/** Runs the 7777 vanity-salt search in a Web Worker. */
export function findSalt(onProgress: (tries: number) => void, signal?: AbortSignal): Promise<{ salt: Hex; address: Address }> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./salt.worker.ts', import.meta.url), { type: 'module' });
    const stop = () => w.terminate();
    signal?.addEventListener('abort', () => {
      stop();
      reject(new Error('aborted'));
    });
    w.onmessage = (e: MessageEvent<{ type: string; tries?: number; salt?: Hex; address?: Address; error?: string }>) => {
      const m = e.data;
      if (m.type === 'progress') onProgress(m.tries ?? 0);
      else if (m.type === 'done') {
        stop();
        resolve({ salt: m.salt!, address: m.address! });
      } else if (m.type === 'error') {
        stop();
        reject(new Error(m.error));
      }
    };
    w.onerror = (e) => {
      stop();
      reject(new Error(e.message || 'salt worker failed'));
    };
    w.postMessage({ portal: chain.portal, impl: chain.taxTokenV3Impl, suffix: '7777' });
  });
}
