'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { useAccount, useBalance, useDisconnect, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi';
import { targetChain } from '@/lib/wagmi';
import { isValidZcashAddress } from './address';
import { env } from './constants';
import { loadSwaps, onSwapsChange, pollSwap, shouldPoll, submitDeposit, upsertSwap } from './oneclick';
import {
  SPROUT_ACCOUNT_ABI,
  SPROUT_ACCOUNT_FACTORY_ABI,
  computeAccountAddress,
  computeChallenge,
  webAuthnSigToJson,
} from './passkey/challenge';
import { samePoint } from './passkey/p256';
import {
  assertPresence,
  createPasskey,
  discoverPasskey,
  loadPasskey,
  loadZcashAddrs,
  passkeyRpId,
  savePasskey,
  saveZcashAddrs,
  secondAssertionCandidates,
  signChallenge,
  type StoredPasskey,
} from './passkey/webauthn';

export type AccountKind = 'none' | 'passkey' | 'evm';
export type Call = { to: `0x${string}`; value: bigint; data: `0x${string}` };

export const ACCOUNT_FACTORY: Address | undefined = isAddress(env.accountFactory) ? getAddress(env.accountFactory) : undefined;
const ACCOUNT_IMPL: Address | undefined = isAddress(env.accountImpl) ? getAddress(env.accountImpl) : undefined;
export const ACCOUNTS_LIVE = Boolean(ACCOUNT_FACTORY);
export const RELAYER_URL = /^https?:\/\//.test(env.relayerUrl) ? env.relayerUrl : '';

// ------------------------------------------------------------------------------------------- prices

type Prices = { zecUsd: number | null; bnbUsd: number | null; updatedAt: string | null };
const PriceCtx = createContext<Prices>({ zecUsd: null, bnbUsd: null, updatedAt: null });

// ------------------------------------------------------------------------------------------- account

export type SproutAccount = {
  kind: AccountKind;
  address?: `0x${string}`;
  balanceWei?: bigint;
  zcashRefundAddress?: string;
  zcashPayoutAddress?: string;
  ready: boolean;
  createPasskeyAccount(opts: { zcashRefundAddress: string; zcashPayoutAddress?: string }): Promise<void>;
  loginPasskey(opts?: { discover?: boolean }): Promise<void>;
  logout(): void;
  executeBatch(calls: Call[]): Promise<`0x${string}`>;
  // ---- extras (superset of the interface contract)
  accountsLive: boolean;
  relayerLive: boolean;
  passkey: StoredPasskey | null;
  /** A passkey this browser knows but is signed out of. */
  knownPasskey: StoredPasskey | null;
  setZcashAddresses(v: { refund?: string; payout?: string }): void;
  refetchBalance(): void;
};

const AccountCtx = createContext<SproutAccount | null>(null);

/** Module-level mirror of the current account for plain functions (prepareCashOut). */
export const accountRef: { address?: `0x${string}`; kind: AccountKind } = { kind: 'none' };

class AccountError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.code = code;
  }
}

type RelayGas = { gasFee: bigint; feeRecipient: Address; deadline?: bigint };

async function relayerJson(path: string, body: unknown, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${RELAYER_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
      signal: ctrl.signal,
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new AccountError('relayer', String(j.error || j.message || `relayer ${r.status}`));
    return j;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * After a BNB Chain tx: if it pays a pending cash-out deposit address this browser prepared (plain transfer, or the
 * address inside calldata such as SproutTerminal.sellAndBridge), record the tx on the tracked swap and tell 1Click.
 */
function linkCashOuts(calls: Call[], hash: `0x${string}`) {
  try {
    for (const s of loadSwaps()) {
      if (s.direction !== 'out' || s.bscTx || s.status !== 'PENDING_DEPOSIT') continue;
      const a = s.depositAddress.toLowerCase();
      if (!calls.some((c) => c.to.toLowerCase() === a || c.data.toLowerCase().includes(a.slice(2)))) continue;
      upsertSwap({ depositAddress: s.depositAddress, bscTx: hash, status: 'KNOWN_DEPOSIT_TX' });
      void submitDeposit(hash, s.depositAddress);
    }
  } catch {
    /* tracking only */
  }
}

export function ZcashProvider({ children }: { children: React.ReactNode }) {
  // ---- prices
  const [prices, setPrices] = useState<Prices>({ zecUsd: null, bnbUsd: null, updatedAt: null });
  useEffect(() => {
    let dead = false;
    const load = () =>
      fetch('/api/prices')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (dead || !j) return;
          const z = Number(j.zecUsd);
          const b = Number(j.bnbUsd);
          setPrices({ zecUsd: z > 0 ? z : null, bnbUsd: b > 0 ? b : null, updatedAt: j.updatedAt ?? null });
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, []);

  // ---- swap tracker: keep polling unfinished swaps from the last 24h on every page
  useEffect(() => {
    const stops = new Map<string, () => void>();
    const sync = () => {
      const live = loadSwaps().filter((s) => shouldPoll(s));
      for (const s of live) if (!stops.has(s.depositAddress)) stops.set(s.depositAddress, pollSwap(s.depositAddress, s.depositMemo));
      for (const [k, stop] of stops) if (!live.some((s) => s.depositAddress === k)) {
        stop();
        stops.delete(k);
      }
    };
    sync();
    const off = onSwapsChange(sync);
    return () => {
      off();
      for (const stop of stops.values()) stop();
    };
  }, []);

  // ---- accounts
  const wag = useAccount();
  const { disconnect } = useDisconnect();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();
  const pc = usePublicClient({ chainId: targetChain.id });
  const [record, setRecord] = useState<StoredPasskey | null>(null);
  const [ready, setReady] = useState(false);
  const [evmAddrs, setEvmAddrs] = useState<{ refund?: string; payout?: string }>({});

  useEffect(() => {
    setRecord(loadPasskey());
    setReady(true);
  }, []);

  const signedIn = record && !record.signedOut ? record : null;
  const kind: AccountKind = signedIn ? 'passkey' : wag.isConnected && wag.address ? 'evm' : 'none';
  const address = (signedIn?.address ?? (kind === 'evm' ? wag.address : undefined)) as `0x${string}` | undefined;

  useEffect(() => {
    if (kind === 'evm' && wag.address) setEvmAddrs(loadZcashAddrs(wag.address));
  }, [kind, wag.address]);

  useEffect(() => {
    accountRef.address = address;
    accountRef.kind = kind;
  }, [address, kind]);

  const bal = useBalance({ address, chainId: targetChain.id, query: { enabled: Boolean(address), refetchInterval: 15_000 } });

  const resolveAddress = useCallback(
    async (qx: Hex, qy: Hex): Promise<Address> => {
      if (!ACCOUNT_FACTORY) throw new AccountError('accounts-not-live');
      // The factory is authoritative (a wrong NEXT_PUBLIC_SPROUT_ACCOUNT_IMPL would derive an address nobody controls,
      // and users fund this address from Zcash). The local CREATE2 derivation is only a fallback when RPC is down.
      if (pc) {
        try {
          const onchain = await pc.readContract({ address: ACCOUNT_FACTORY, abi: SPROUT_ACCOUNT_FACTORY_ABI, functionName: 'getAddress', args: [qx, qy] });
          if (ACCOUNT_IMPL && getAddress(onchain) !== computeAccountAddress({ factory: ACCOUNT_FACTORY, implementation: ACCOUNT_IMPL, qx, qy })) {
            console.warn('[sprout] NEXT_PUBLIC_SPROUT_ACCOUNT_IMPL does not match the factory; using factory.getAddress');
          }
          return getAddress(onchain);
        } catch {
          /* fall through to the local derivation */
        }
      }
      if (ACCOUNT_IMPL) return computeAccountAddress({ factory: ACCOUNT_FACTORY, implementation: ACCOUNT_IMPL, qx, qy });
      throw new AccountError('rpc');
    },
    [pc],
  );

  const persist = useCallback((r: StoredPasskey | null) => {
    savePasskey(r);
    setRecord(r);
  }, []);

  const createPasskeyAccount = useCallback(
    async (opts: { zcashRefundAddress: string; zcashPayoutAddress?: string }) => {
      if (!ACCOUNTS_LIVE) throw new AccountError('accounts-not-live');
      const refund = opts.zcashRefundAddress.trim();
      const payout = (opts.zcashPayoutAddress || '').trim();
      if (!isValidZcashAddress(refund, ['t'])) throw new AccountError('bad-refund');
      if (payout && !isValidZcashAddress(payout)) throw new AccountError('bad-payout');
      const day = new Date().toISOString().slice(0, 10);
      const k = await createPasskey(`Sprout account ${day}`);
      const addr = await resolveAddress(k.qx, k.qy);
      const rec: StoredPasskey = {
        v: 1,
        credentialId: k.credentialId,
        qx: k.qx,
        qy: k.qy,
        address: addr,
        rpId: k.rpId,
        createdAt: Date.now(),
        zcashRefundAddress: refund,
        zcashPayoutAddress: payout || undefined,
      };
      saveZcashAddrs(addr, { refund, payout: payout || undefined });
      persist(rec);
      if (wag.isConnected) disconnect();
    },
    [resolveAddress, persist, wag.isConnected, disconnect],
  );

  const loginPasskey = useCallback(
    async (opts?: { discover?: boolean }) => {
      if (!ACCOUNTS_LIVE) throw new AccountError('accounts-not-live');
      const known = loadPasskey();
      if (known && !opts?.discover) {
        // Proves presence of the same credential (the account itself verifies every real signature on-chain).
        const credentialId = await assertPresence(known.credentialId);
        if (credentialId !== known.credentialId) throw new AccountError('wrong-passkey');
        persist({ ...known, signedOut: false });
        if (wag.isConnected) disconnect();
        return;
      }
      // New device / no local record: recover the public key from the assertion signature.
      const first = await discoverPasskey();
      if (!first.candidates.length) throw new AccountError('recover-failed');
      let chosen: { qx: Hex; qy: Hex } | null = null;
      const addrs = await Promise.all(first.candidates.map((c) => resolveAddress(c.qx, c.qy)));
      if (pc) {
        const codes = await Promise.all(addrs.map((a) => pc.getCode({ address: a }).catch(() => undefined)));
        const deployed = first.candidates.filter((_, i) => codes[i] && codes[i] !== '0x');
        if (deployed.length === 1) chosen = deployed[0];
      }
      if (!chosen) {
        const second = await secondAssertionCandidates(first.credentialId);
        chosen = first.candidates.find((c) => second.some((d) => samePoint(c, d))) ?? null;
      }
      if (!chosen) throw new AccountError('recover-failed');
      const addr = await resolveAddress(chosen.qx, chosen.qy);
      const saved = loadZcashAddrs(addr);
      persist({
        v: 1,
        credentialId: first.credentialId,
        qx: chosen.qx,
        qy: chosen.qy,
        address: addr,
        rpId: passkeyRpId(),
        createdAt: Date.now(),
        zcashRefundAddress: saved.refund,
        zcashPayoutAddress: saved.payout,
      });
      if (wag.isConnected) disconnect();
    },
    [persist, resolveAddress, pc, wag.isConnected, disconnect],
  );

  const logout = useCallback(() => {
    if (record && !record.signedOut) persist({ ...record, signedOut: true });
    if (wag.isConnected) disconnect();
  }, [record, persist, wag.isConnected, disconnect]);

  const setZcashAddresses = useCallback(
    (v: { refund?: string; payout?: string }) => {
      if (v.refund !== undefined && v.refund !== '' && !isValidZcashAddress(v.refund, ['t'])) throw new AccountError('bad-refund');
      if (v.payout !== undefined && v.payout !== '' && !isValidZcashAddress(v.payout)) throw new AccountError('bad-payout');
      const next = { refund: v.refund === '' ? undefined : v.refund, payout: v.payout === '' ? undefined : v.payout };
      if (signedIn) {
        const rec = {
          ...signedIn,
          ...(v.refund !== undefined ? { zcashRefundAddress: next.refund } : {}),
          ...(v.payout !== undefined ? { zcashPayoutAddress: next.payout } : {}),
        };
        persist(rec);
        saveZcashAddrs(rec.address, { refund: rec.zcashRefundAddress, payout: rec.zcashPayoutAddress });
      } else if (address) {
        const cur = loadZcashAddrs(address);
        const merged = {
          refund: v.refund !== undefined ? next.refund : cur.refund,
          payout: v.payout !== undefined ? next.payout : cur.payout,
        };
        saveZcashAddrs(address, merged);
        setEvmAddrs(merged);
      }
    },
    [signedIn, address, persist],
  );

  const busy = useRef(false);
  const executeBatch = useCallback(
    async (calls: Call[]): Promise<`0x${string}`> => {
      const linkWhenMined = (cs: Call[], h: `0x${string}`) => {
        if (!pc) return;
        pc.waitForTransactionReceipt({ hash: h, timeout: 300_000 })
          .then((rc) => rc.status === 'success' && linkCashOuts(cs, h))
          .catch(() => {});
      };
      if (!calls.length) throw new AccountError('empty-batch');
      if (busy.current) throw new AccountError('busy');
      busy.current = true;
      try {
        if (kind === 'passkey' && signedIn) {
          if (!RELAYER_URL) throw new AccountError('relayer-not-configured');
          if (!pc) throw new AccountError('rpc');
          const account = signedIn.address;
          const code = await pc.getCode({ address: account }).catch(() => undefined);
          const deployed = Boolean(code && code !== '0x');
          const nonce = deployed ? await pc.readContract({ address: account, abi: SPROUT_ACCOUNT_ABI, functionName: 'nonce' }) : 0n;
          const jsonCalls = calls.map((c) => ({ to: c.to, value: c.value.toString(), data: c.data }));
          const g = await relayerJson('/quote-gas', { account, qx: signedIn.qx, qy: signedIn.qy, calls: jsonCalls, deployed });
          const gas: RelayGas = {
            gasFee: BigInt(String(g.gasFee ?? '0')),
            feeRecipient: getAddress(String(g.feeRecipient)),
            deadline: g.deadline !== undefined ? BigInt(String(g.deadline)) : undefined,
          };
          const deadline = gas.deadline ?? BigInt(Math.floor(Date.now() / 1000) + 600);
          const challenge = computeChallenge({
            chainId: targetChain.id,
            account,
            nonce,
            deadline,
            gasFee: gas.gasFee,
            feeRecipient: gas.feeRecipient,
            calls,
          });
          const sig = await signChallenge(challenge, signedIn.credentialId);
          const res = await relayerJson(
            '/relay',
            {
              account,
              qx: signedIn.qx,
              qy: signedIn.qy,
              calls: jsonCalls,
              deadline: deadline.toString(),
              gasFee: gas.gasFee.toString(),
              feeRecipient: gas.feeRecipient,
              sig: webAuthnSigToJson(sig),
            },
            60_000,
          );
          let hash = (res.txHash || res.hash) as `0x${string}` | undefined;
          const id = (res.id as string | undefined) || hash;
          // The relayer may re-broadcast with a higher gas price (new hash, same nonce). Follow GET /tx/:id until the
          // tx is mined so callers waiting on the returned hash never wait on a replaced one.
          const t0 = Date.now();
          let mined = false;
          while (id && Date.now() - t0 < 120_000) {
            const s = await relayerJson(`/tx/${encodeURIComponent(id)}`, undefined).catch(() => null);
            if (s) {
              if (typeof s.txHash === 'string') hash = s.txHash as `0x${string}`;
              if (s.status === 'success') {
                mined = true;
                break;
              }
              if (s.status === 'failed') throw new AccountError('relay-failed', String(s.error || 'transaction failed'));
            }
            await new Promise((r) => setTimeout(r, 2500));
          }
          if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new AccountError('relay-no-hash');
          if (mined) linkCashOuts(calls, hash);
          else linkWhenMined(calls, hash);
          bal.refetch();
          return hash;
        }
        if (kind === 'evm') {
          if (wag.chainId !== targetChain.id) await switchChainAsync({ chainId: targetChain.id });
          let last: `0x${string}` = '0x';
          for (let i = 0; i < calls.length; i++) {
            const c = calls[i];
            last = await sendTransactionAsync({ to: c.to, value: c.value, data: c.data, chainId: targetChain.id });
            if (i < calls.length - 1 && pc) {
              const rc = await pc.waitForTransactionReceipt({ hash: last });
              if (rc.status !== 'success') throw new AccountError('call-reverted', `call ${i} reverted`);
              linkCashOuts([c], last);
            } else linkWhenMined([c], last);
          }
          bal.refetch();
          return last;
        }
        throw new AccountError('not-connected');
      } finally {
        busy.current = false;
      }
    },
    [kind, signedIn, pc, wag.chainId, switchChainAsync, sendTransactionAsync, bal],
  );

  const acct: SproutAccount = useMemo(
    () => ({
      kind,
      address,
      balanceWei: address ? bal.data?.value : undefined,
      zcashRefundAddress: kind === 'passkey' ? signedIn?.zcashRefundAddress : kind === 'evm' ? evmAddrs.refund : undefined,
      zcashPayoutAddress: kind === 'passkey' ? signedIn?.zcashPayoutAddress : kind === 'evm' ? evmAddrs.payout : undefined,
      ready: ready && (wag.status !== 'connecting' && wag.status !== 'reconnecting'),
      createPasskeyAccount,
      loginPasskey,
      logout,
      executeBatch,
      accountsLive: ACCOUNTS_LIVE,
      relayerLive: Boolean(RELAYER_URL),
      passkey: signedIn,
      knownPasskey: record && record.signedOut ? record : null,
      setZcashAddresses,
      refetchBalance: () => void bal.refetch(),
    }),
    [kind, address, bal, signedIn, evmAddrs, ready, wag.status, createPasskeyAccount, loginPasskey, logout, executeBatch, record, setZcashAddresses],
  );

  return (
    <PriceCtx.Provider value={prices}>
      <AccountCtx.Provider value={acct}>{children}</AccountCtx.Provider>
    </PriceCtx.Provider>
  );
}

export function usePrices(): Prices {
  return useContext(PriceCtx);
}

export function useSproutAccount(): SproutAccount {
  const c = useContext(AccountCtx);
  if (!c) throw new Error('useSproutAccount outside ZcashProvider');
  return c;
}

export function useZec() {
  const { zecUsd, bnbUsd } = useContext(PriceCtx);
  const bnbWeiToZec = useCallback(
    (wei: bigint): number | null => (zecUsd && bnbUsd ? (Number(wei) / 1e18) * (bnbUsd / zecUsd) : null),
    [zecUsd, bnbUsd],
  );
  const zecToBnbWei = useCallback(
    (zec: number): bigint | null => {
      if (!zecUsd || !bnbUsd || !Number.isFinite(zec) || zec < 0) return null;
      // 1e9 fixed-point on the float to keep 18-decimal precision sane
      return (BigInt(Math.round(((zec * zecUsd) / bnbUsd) * 1e9)) * 10n ** 9n) as bigint;
    },
    [zecUsd, bnbUsd],
  );
  return { zecUsd, bnbUsd, bnbWeiToZec, zecToBnbWei };
}
