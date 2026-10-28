import type { Address } from "viem";
import type { Chainish } from "./chain.js";
import type { Config } from "./config.js";
import type { Forwarder } from "./forwarder.js";
import type { OneClick } from "./oneclick.js";
import type { StateStore } from "./state.js";

export interface Contracts {
  factory: Address;
  roots: Address;
  payouts: Address;
  portal?: Address;
  sprout?: Address; // $SPROUT (0 until set on Roots)
  zec?: Address; // Binance-Peg ZEC (SproutPayouts.zec())
  rootsZec?: Address; // SproutRoots.zec() (same on mainnet; set separately on testnet)
  maxBridge?: bigint;
  maxDraw?: bigint;
  minInterval?: bigint;
  epochReclaimDelay?: bigint;
  factorySpecVersion?: string;
  rootsKeeper?: Address;
  payoutsKeeper?: Address;
  holderFallbackAvailable: boolean;
}

export interface Planting {
  token: Address;
  vault: Address;
  creator: Address;
  mode: number;
  plantedAt: bigint;
}

export interface ActionRecord {
  at: string;
  kind: string;
  target?: string;
  ok: boolean;
  dryRun: boolean;
  detail?: string;
  tx?: string;
}

export interface Ctx {
  cfg: Config;
  c: Chainish;
  store: StateStore;
  oneclick: OneClick;
  forwarder: Forwarder;
  contracts: Contracts;
  /** true when not DRY_RUN and the keeper balance is above the reserve */
  canSend: boolean;
  record(a: Omit<ActionRecord, "at" | "dryRun"> & { dryRun?: boolean }): void;
  warn(msg: string): void;
}

/** Per-target exponential backoff stored in state.vaults[key]. */
export function shouldTry(ctx: Ctx, key: string): boolean {
  const v = ctx.store.vault(key);
  return !v.nextTryAt || Date.now() >= v.nextTryAt;
}

export function markFailure(ctx: Ctx, key: string, error: string) {
  const v = ctx.store.vault(key);
  v.failures = (v.failures ?? 0) + 1;
  const delay = Math.min(6 * 3600_000, 60_000 * 2 ** Math.min(v.failures, 12));
  v.nextTryAt = Date.now() + delay;
  v.lastError = error.slice(0, 300);
  ctx.store.touch();
}

export function markSuccess(ctx: Ctx, key: string) {
  const v = ctx.store.vault(key);
  if (v.failures || v.nextTryAt || v.lastError) {
    v.failures = 0;
    v.nextTryAt = undefined;
    v.lastError = undefined;
    ctx.store.touch();
  }
}
