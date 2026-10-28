import { formatEther, type Address } from "viem";
import { factoryAbi, payoutsAbi, rootsAbi, vaultAbi } from "./abi.js";
import { keeperBalance, makeChain, type Chainish } from "./chain.js";
import { publicConfig, type Config } from "./config.js";
import type { ActionRecord, Contracts, Ctx, Planting } from "./context.js";
import { Forwarder } from "./forwarder.js";
import { errMsg, log } from "./log.js";
import { OneClick } from "./oneclick.js";
import { StateStore } from "./state.js";
import { runFlush } from "./tasks/flush.js";
import { runHolders } from "./tasks/holders.js";
import { OPEN_BRIDGE, pollBridges, runBridge, runSettle } from "./tasks/payouts.js";
import { runRoots, type RootsSnapshot } from "./tasks/roots.js";

export interface KeeperStatus {
  service: "sprout-keeper";
  mode: "idle" | "running";
  reason?: string;
  startedAt: string;
  config: ReturnType<typeof publicConfig>;
  missing: string[];
  problems: string[];
  keeper?: { address: string; balanceBnb?: string; gasLow?: boolean; isRootsKeeper?: boolean; isPayoutsKeeper?: boolean; unminedTxs?: number };
  contracts?: Record<string, string | undefined>;
  loop: {
    count: number;
    lastStart?: string;
    lastEnd?: string;
    lastOk?: boolean;
    lastDurationMs?: number;
    consecutiveFailures: number;
    lastError?: string;
    nextAt?: string;
  };
  plantings?: number;
  modes?: Record<string, number>;
  roots?: RootsSnapshot;
  payouts?: { totalPendingBnb?: string; totalHolderPoolZec?: string; totals?: Record<string, string> };
  bridges?: { open: number; recent: unknown[]; refundsOwed: unknown[] };
  warnings: string[];
  recentActions: ActionRecord[];
}

export class Keeper {
  readonly status: KeeperStatus;
  readonly store?: StateStore;
  private c?: Chainish;
  private contracts?: Contracts;
  private oneclick: OneClick;
  private forwarder: Forwarder;
  private stopped = false;
  private timer?: NodeJS.Timeout;
  private warningsThisLoop = new Set<string>();

  constructor(readonly cfg: Config) {
    this.oneclick = new OneClick(cfg);
    this.forwarder = new Forwarder(cfg);
    this.status = {
      service: "sprout-keeper",
      mode: cfg.configured ? "running" : "idle",
      reason: cfg.configured ? undefined : `not configured: missing ${cfg.missing.join(", ") || "(invalid values)"}`,
      startedAt: new Date().toISOString(),
      config: publicConfig(cfg),
      missing: cfg.missing,
      problems: cfg.problems,
      loop: { count: 0, consecutiveFailures: 0 },
      warnings: [],
      recentActions: [],
    };
    if (cfg.configured) {
      try {
        this.store = new StateStore(cfg.stateDir);
      } catch (e) {
        // e.g. a fly volume mounted root-owned: stay up (healthz/status) instead of crash-looping
        this.status.mode = "idle";
        this.status.reason = `STATE_DIR ${cfg.stateDir} not usable: ${errMsg(e)}`;
        log.error("state dir not usable — keeper idle", { stateDir: cfg.stateDir, error: errMsg(e) });
        return;
      }
      this.c = makeChain(cfg);
      this.status.keeper = { address: this.c.from };
    }
  }

  start() {
    if (!this.cfg.configured || !this.c || !this.store) {
      log.warn("keeper idle — not configured", { missing: this.cfg.missing, problems: this.cfg.problems });
      return;
    }
    log.info("keeper starting", {
      chainId: this.cfg.chainId,
      factory: this.cfg.factory,
      keeper: this.c.from,
      dryRun: this.cfg.dryRun,
    });
    void this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    try {
      this.store?.save(true);
    } catch (e) {
      log.error("state save on stop failed", { error: errMsg(e) });
    }
  }

  private schedule(ms: number) {
    if (this.stopped) return;
    this.status.loop.nextAt = new Date(Date.now() + ms).toISOString();
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick() {
    const t0 = Date.now();
    this.status.loop.count++;
    this.status.loop.lastStart = new Date(t0).toISOString();
    this.warningsThisLoop.clear();
    try {
      await this.loopOnce();
      this.status.loop.lastOk = true;
      this.status.loop.consecutiveFailures = 0;
      this.status.loop.lastError = undefined;
    } catch (e) {
      this.status.loop.lastOk = false;
      this.status.loop.consecutiveFailures++;
      this.status.loop.lastError = errMsg(e);
      log.error("keeper loop failed", { error: errMsg(e), consecutive: this.status.loop.consecutiveFailures });
    } finally {
      this.status.warnings = [...this.warningsThisLoop];
      this.status.loop.lastEnd = new Date().toISOString();
      this.status.loop.lastDurationMs = Date.now() - t0;
      try {
        this.store?.save();
      } catch (e) {
        log.error("state save failed", { error: errMsg(e) });
      }
    }
    if (this.cfg.once) {
      log.info("RUN_ONCE set — exiting after one loop");
      this.stopped = true;
      process.exitCode = this.status.loop.lastOk ? 0 : 1;
      return;
    }
    const f = this.status.loop.consecutiveFailures;
    const delay = f === 0 ? this.cfg.loopIntervalMs : Math.min(15 * 60_000, this.cfg.loopIntervalMs * 2 ** Math.min(f, 6));
    this.schedule(delay);
  }

  private warn(msg: string) {
    if (!this.warningsThisLoop.has(msg)) log.warn(msg);
    this.warningsThisLoop.add(msg);
  }

  private record(a: Omit<ActionRecord, "at" | "dryRun"> & { dryRun?: boolean }) {
    const rec: ActionRecord = { at: new Date().toISOString(), dryRun: a.dryRun ?? this.cfg.dryRun, ...a } as ActionRecord;
    this.status.recentActions.unshift(rec);
    this.status.recentActions.length = Math.min(this.status.recentActions.length, 100);
  }

  /** Resolve and sanity-check the contract set. Throws a readable error on a wrong SPROUT_FACTORY. */
  private async resolveContracts(): Promise<Contracts> {
    const c = this.c!;
    const factory = this.cfg.factory as Address;
    const code = await c.pub.getCode({ address: factory });
    if (!code || code === "0x") throw new Error(`SPROUT_FACTORY ${factory} has no contract code on chain ${this.cfg.chainId}`);
    let roots: Address, payouts: Address;
    try {
      [roots, payouts] = await Promise.all([
        this.cfg.rootsOverride ?? c.pub.readContract({ address: factory, abi: factoryAbi, functionName: "roots" }),
        this.cfg.payoutsOverride ?? c.pub.readContract({ address: factory, abi: factoryAbi, functionName: "payouts" }),
      ]);
      await c.pub.readContract({ address: factory, abi: factoryAbi, functionName: "plantingsLength" });
    } catch (e) {
      throw new Error(`SPROUT_FACTORY ${factory} does not look like a SproutVaultFactory (${errMsg(e)})`);
    }
    const ct: Contracts = { factory, roots, payouts, holderFallbackAvailable: false };
    const tryRead = async <T>(f: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await f();
      } catch {
        return undefined;
      }
    };
    const [zec, maxBridge, portal, maxDraw, minInterval, spec, rk, pk, reclaimDelay, rootsZec] = await Promise.all([
      tryRead(() => c.pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "zec" })),
      tryRead(() => c.pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "MAX_BRIDGE" })),
      tryRead(() => c.pub.readContract({ address: roots, abi: rootsAbi, functionName: "portal" })),
      tryRead(() => c.pub.readContract({ address: roots, abi: rootsAbi, functionName: "MAX_DRAW" })),
      tryRead(() => c.pub.readContract({ address: roots, abi: rootsAbi, functionName: "MIN_INTERVAL" })),
      tryRead(() => c.pub.readContract({ address: factory, abi: factoryAbi, functionName: "factorySpecVersion" })),
      tryRead(() => c.pub.readContract({ address: roots, abi: rootsAbi, functionName: "keeper" })),
      tryRead(() => c.pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "keeper" })),
      tryRead(() => c.pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "EPOCH_RECLAIM_DELAY" })),
      tryRead(() => c.pub.readContract({ address: roots, abi: rootsAbi, functionName: "zec" })),
    ]);
    Object.assign(ct, {
      zec,
      rootsZec,
      maxBridge,
      portal,
      maxDraw,
      minInterval,
      factorySpecVersion: spec,
      rootsKeeper: rk,
      payoutsKeeper: pk,
      epochReclaimDelay: reclaimDelay,
      holderFallbackAvailable: reclaimDelay !== undefined,
    });
    if (this.cfg.holderFallback === "on" && !ct.holderFallbackAvailable) {
      this.warn("HOLDER_FALLBACK=on but SproutPayouts has no fallback distributor (EPOCH_RECLAIM_DELAY missing)");
    }
    log.info("contracts resolved", { factory, roots, payouts, zec, portal, spec });
    return ct;
  }

  private async listPlantings(): Promise<Planting[]> {
    const c = this.c!;
    const n = await c.pub.readContract({ address: this.contracts!.factory, abi: factoryAbi, functionName: "plantingsLength" });
    const out: Planting[] = [];
    const page = BigInt(this.cfg.plantingsPage);
    for (let off = 0n; off < n; off += page) {
      const rows = await c.pub.readContract({
        address: this.contracts!.factory,
        abi: factoryAbi,
        functionName: "getPlantings",
        args: [off, page],
      });
      for (const r of rows) out.push({ token: r.token, vault: r.vault, creator: r.creator, mode: Number(r.mode), plantedAt: r.plantedAt });
    }
    return out;
  }

  private async loopOnce() {
    const c = this.c!;
    const store = this.store!;
    if (!this.contracts) this.contracts = await this.resolveContracts();
    const contracts = this.contracts;
    this.status.contracts = {
      factory: contracts.factory,
      roots: contracts.roots,
      payouts: contracts.payouts,
      portal: contracts.portal,
      zec: contracts.zec,
      sprout: contracts.sprout,
      factorySpecVersion: contracts.factorySpecVersion,
    };

    // ---- gas ----
    const bal = await keeperBalance(c);
    const gasLow = bal !== undefined && bal < this.cfg.gasWarnWei;
    const k = this.status.keeper!;
    k.balanceBnb = bal !== undefined ? formatEther(bal) : undefined;
    k.gasLow = gasLow;
    k.isRootsKeeper = contracts.rootsKeeper ? contracts.rootsKeeper.toLowerCase() === c.from.toLowerCase() : undefined;
    k.isPayoutsKeeper = contracts.payoutsKeeper ? contracts.payoutsKeeper.toLowerCase() === c.from.toLowerCase() : undefined;
    if (gasLow) this.warn(`keeper gas low: ${formatEther(bal!)} BNB < ${formatEther(this.cfg.gasWarnWei)} BNB — top up ${c.from}`);
    if (k.isRootsKeeper === false) this.warn("this key is not SproutRoots.keeper() — burn/liquidity runs will revert");
    if (k.isPayoutsKeeper === false) this.warn("this key is not SproutPayouts.keeper() — settle/bridge will revert");
    let nonceGap = 0;
    if (c.account) {
      try {
        const [mined, pend] = await Promise.all([
          c.pub.getTransactionCount({ address: c.account.address, blockTag: "latest" }),
          c.pub.getTransactionCount({ address: c.account.address, blockTag: "pending" }),
        ]);
        nonceGap = Math.max(0, pend - mined);
      } catch {
        /* informational */
      }
    }
    k.unminedTxs = nonceGap;
    if (nonceGap > 0) this.warn(`keeper has ${nonceGap} unmined transaction(s) in the mempool — new transactions wait until they clear (speed up / replace nonce manually if stuck)`);
    const canSend = !this.cfg.dryRun && Boolean(c.account) && bal !== undefined && bal >= this.cfg.gasReserveWei;
    if (!this.cfg.dryRun && !canSend) this.warn("not sending transactions: keeper balance below GAS_RESERVE_BNB");

    const ctx: Ctx = {
      cfg: this.cfg,
      c,
      store,
      oneclick: this.oneclick,
      forwarder: this.forwarder,
      contracts,
      canSend,
      record: (a) => this.record(a),
      warn: (m) => this.warn(m),
    };

    // ---- plantings & pending amounts ----
    const plantings = await this.listPlantings();
    this.status.plantings = plantings.length;
    const modes: Record<string, number> = {};
    for (const p of plantings) modes[p.mode] = (modes[p.mode] ?? 0) + 1;
    this.status.modes = modes;

    const vaultPending = new Map<string, bigint>();
    const payoutPending = new Map<string, bigint>();
    await Promise.all(
      plantings.map(async (p) => {
        try {
          const [stats, pend] = await Promise.all([
            c.pub.readContract({ address: p.vault, abi: vaultAbi, functionName: "stats" }),
            c.pub.readContract({ address: contracts.payouts, abi: payoutsAbi, functionName: "pendingBnb", args: [p.vault] }),
          ]);
          vaultPending.set(p.vault.toLowerCase(), stats[5]);
          payoutPending.set(p.vault.toLowerCase(), pend);
        } catch (e) {
          log.debug("vault read failed", { vault: p.vault, error: errMsg(e) });
        }
      }),
    );

    // 1) flush vaults
    await runFlush(ctx, plantings, vaultPending);

    // re-read payouts pending after flushes (live mode only; dry-run flushes are simulated)
    if (!this.cfg.dryRun) {
      await Promise.all(
        plantings.map(async (p) => {
          try {
            payoutPending.set(
              p.vault.toLowerCase(),
              await c.pub.readContract({ address: contracts.payouts, abi: payoutsAbi, functionName: "pendingBnb", args: [p.vault] }),
            );
          } catch {
            /* keep previous */
          }
        }),
      );
    }

    // 2) payouts in ZEC
    for (const p of plantings) {
      const pending = payoutPending.get(p.vault.toLowerCase()) ?? 0n;
      try {
        if (p.mode <= 2) await runSettle(ctx, p, pending);
        else if (p.mode === 3 || p.mode === 4) await runBridge(ctx, p, pending);
      } catch (e) {
        log.warn("payout task error", { vault: p.vault, error: errMsg(e) });
      }
    }

    // 3) holder rewards (mode 2)
    for (const p of plantings.filter((x) => x.mode === 2)) {
      try {
        await runHolders(ctx, p);
      } catch (e) {
        log.warn("holder task error", { vault: p.vault, error: errMsg(e) });
      }
    }

    // 4) Roots (Grove + Rootstock)
    try {
      this.status.roots = await runRoots(ctx);
      if (this.status.roots?.note) this.warn(this.status.roots.note);
      this.status.contracts.sprout = contracts.sprout;
    } catch (e) {
      this.warn(`roots task error: ${errMsg(e)}`);
    }

    // 5) 1Click delivery status
    await pollBridges(ctx);

    // ---- status snapshot ----
    try {
      const [tp, th, totals] = await Promise.all([
        c.pub.readContract({ address: contracts.payouts, abi: payoutsAbi, functionName: "totalPendingBnb" }),
        contracts.holderFallbackAvailable
          ? c.pub.readContract({ address: contracts.payouts, abi: payoutsAbi, functionName: "totalHolderPool" })
          : Promise.resolve(undefined),
        c.pub.readContract({ address: contracts.payouts, abi: payoutsAbi, functionName: "totals" }),
      ]);
      this.status.payouts = {
        totalPendingBnb: formatEther(tp),
        totalHolderPoolZec: th !== undefined ? formatEther(th) : undefined,
        totals: {
          zecToPayees: formatEther(totals[0]),
          zecToHolders: formatEther(totals[1]),
          bnbBridgedToZcash: formatEther(totals[2]),
          bnbBridgedToFoundation: formatEther(totals[3]),
        },
      };
    } catch (e) {
      log.debug("payouts status read failed", { error: errMsg(e) });
    }
    const bridges = store.state.bridges;
    this.status.bridges = {
      open: bridges.filter((b) => OPEN_BRIDGE.has(b.status)).length,
      recent: bridges.slice(-20).reverse().map((b) => ({
        quoteRef: b.quoteRef,
        vault: b.vault,
        mode: b.mode,
        bnb: formatEther(BigInt(b.amountIn)),
        zecExpectedZat: b.amountOutZat,
        shielded: b.shielded,
        status: b.status,
        statusDetail: b.statusDetail,
        swapType: b.swapType,
        chunks: b.chunks?.map((x) => ({ bnb: formatEther(BigInt(x.amount)), state: x.state, tx: x.tx })),
        txHash: b.txHash,
        zcashTx: b.zcashTxHashes,
        updatedAt: new Date(b.updatedAt).toISOString(),
      })),
      refundsOwed: store.state.refundsOwed,
    };
  }
}
