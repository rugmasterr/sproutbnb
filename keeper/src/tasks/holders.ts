import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { formatEther, getAddress, parseEther, type Address } from "viem";
import { DEAD, dividendAbi, payoutsAbi, taxTokenAbi } from "../abi.js";
import { sendTx } from "../chain.js";
import { markFailure, markSuccess, shouldTry, type Ctx, type Planting } from "../context.js";
import { errMsg, log } from "../log.js";
import { readJson, writeJsonAtomic, type EpochRecord } from "../state.js";

/**
 * Holder rewards (mode 2).
 *
 * SproutPayouts.settle() first tries the coin's Flap Dividend contract (tracker-only, dividendToken = ZEC). If
 * that is not usable (no shares yet, wrong token, call fails) the ZEC is kept in `holderPool[vault]`. Then:
 *   1. usableDividend(vault) != 0  → pushHolderPool(vault, pool)   (retry the Flap path)
 *   2. otherwise (HOLDER_FALLBACK auto|on) the Sprout-run snapshot distributor:
 *        pool ≥ HOLDER_EPOCH_MIN_ZEC, ≥ HOLDER_EPOCH_INTERVAL since the last epoch (+ random minute),
 *        snapshot holders from Transfer logs, holders ≥ min balance (contracts excluded) pro-rata,
 *        OZ StandardMerkleTree(["address","uint256"]) → publishHolderEpoch(vault, root, total).
 *      Proofs are written to STATE_DIR/epochs/ and served at GET /claims/<vault>/<account>.
 *   3. Epochs older than EPOCH_RECLAIM_DELAY are reclaimed back to the vault's pool (never to us).
 */

interface HolderScan {
  token: string;
  startBlock: string;
  nextBlock: string;
  balances: Record<string, string>;
  contracts: Record<string, boolean>;
  chunk: number;
}

const ZERO = "0x0000000000000000000000000000000000000000";

async function blockAtOrBefore(ctx: Ctx, ts: bigint): Promise<bigint> {
  const pub = ctx.c.pub;
  const latest = await pub.getBlock({ blockTag: "latest" });
  if (ts >= latest.timestamp) return latest.number;
  let lo = 0n;
  let hi = latest.number;
  // narrow the range with an estimate first (BSC ~0.45–3 s blocks)
  const guess = latest.number - (latest.timestamp - ts) * 4n; // assume ≥0.25s blocks → safe lower bound
  if (guess > 0n) lo = guess;
  while (hi - lo > 1n) {
    const mid = (lo + hi) / 2n;
    const b = await pub.getBlock({ blockNumber: mid });
    if (b.timestamp <= ts) lo = mid;
    else hi = mid;
  }
  return lo;
}

async function scanHolders(ctx: Ctx, p: Planting): Promise<{ scan: HolderScan; caughtUp: boolean; head: bigint }> {
  const file = ctx.store.holdersFile(p.token);
  let scan = readJson<HolderScan>(file);
  if (!scan) {
    const start = await blockAtOrBefore(ctx, p.plantedAt > 120n ? p.plantedAt - 120n : 0n);
    scan = { token: p.token, startBlock: start.toString(), nextBlock: start.toString(), balances: {}, contracts: {}, chunk: ctx.cfg.holderLogChunk };
  }
  const head = await ctx.c.pub.getBlockNumber();
  const safeHead = head > 3n ? head - 3n : head; // tiny reorg margin
  let from = BigInt(scan.nextBlock);
  const limit = from + BigInt(ctx.cfg.holderMaxScanBlocksPerLoop);
  while (from <= safeHead && from < limit) {
    const to = from + BigInt(scan.chunk) - 1n < safeHead ? from + BigInt(scan.chunk) - 1n : safeHead;
    try {
      const logs = await ctx.c.pub.getLogs({
        address: p.token,
        event: taxTokenAbi[2],
        fromBlock: from,
        toBlock: to,
      });
      for (const l of logs) {
        const { from: f, to: t, value } = l.args as { from: Address; to: Address; value: bigint };
        if (value === 0n) continue;
        const fk = f.toLowerCase();
        const tk = t.toLowerCase();
        if (fk !== ZERO) scan.balances[fk] = (BigInt(scan.balances[fk] ?? "0") - value).toString();
        if (tk !== ZERO) scan.balances[tk] = (BigInt(scan.balances[tk] ?? "0") + value).toString();
      }
      from = to + 1n;
      scan.nextBlock = from.toString();
      if (scan.chunk < ctx.cfg.holderLogChunk) scan.chunk = Math.min(ctx.cfg.holderLogChunk, scan.chunk * 2);
    } catch (e) {
      if (scan.chunk > 100) {
        scan.chunk = Math.max(100, Math.floor(scan.chunk / 2));
        continue;
      }
      writeJsonAtomic(file, scan);
      throw new Error(`getLogs failed: ${errMsg(e)}`);
    }
  }
  writeJsonAtomic(file, scan);
  return { scan, caughtUp: BigInt(scan.nextBlock) > safeHead, head: BigInt(scan.nextBlock) - 1n };
}

export async function runHolders(ctx: Ctx, p: Planting) {
  const { pub } = ctx.c;
  const payouts = ctx.contracts.payouts;
  const pool = await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "holderPool", args: [p.vault] });

  if (ctx.contracts.holderFallbackAvailable) {
    await reconcileEpochs(ctx, p).catch((e) => log.debug("epoch reconcile failed", { vault: p.vault, error: errMsg(e) }));
  }
  if (ctx.contracts.holderFallbackAvailable && ctx.cfg.holderFallback !== "off") {
    await reclaimOld(ctx, p).catch((e) => log.debug("reclaim check failed", { vault: p.vault, error: errMsg(e) }));
  }
  if (pool === 0n) return;
  if (!ctx.canSend && !ctx.cfg.dryRun) return;

  // 1) Flap dividend tracker usable now? push the pool there.
  const dividend = await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "usableDividend", args: [p.vault] });
  if (dividend !== ZERO) {
    const key = `push:${p.vault}`;
    if (!shouldTry(ctx, key)) return;
    const r = await sendTx(ctx.c, `Payouts.pushHolderPool ${p.vault}`, {
      address: payouts,
      abi: payoutsAbi,
      functionName: "pushHolderPool",
      args: [p.vault, pool],
    });
    ctx.record({ kind: "pushHolderPool", target: p.vault, ok: r.ok, dryRun: r.dryRun, detail: r.error ?? `${formatEther(pool)} ZEC → Flap dividend`, tx: r.hash });
    if (r.ok) markSuccess(ctx, key);
    else markFailure(ctx, key, r.error ?? "unknown");
    return;
  }

  // 2) Sprout-run fallback distributor.
  if (!ctx.contracts.holderFallbackAvailable || ctx.cfg.holderFallback === "off") return;
  if (pool < ctx.cfg.holderEpochMinZec) return;
  const vs = ctx.store.vault(p.vault);
  const key = `epoch:${p.vault}`;
  if (!shouldTry(ctx, key)) return;
  const nextAt = (vs.lastEpochAt ?? 0) + ctx.cfg.holderEpochIntervalMs;
  if (Date.now() < nextAt) return;
  // random minute (like Sapling): skip this loop with probability so runs land at an unpredictable time
  if (vs.lastEpochAt && Math.random() < 0.5) return;

  try {
    const { scan, caughtUp, head } = await scanHolders(ctx, p);
    if (!caughtUp) {
      ctx.record({ kind: "holderSnapshot", target: p.token, ok: true, detail: `scanning… at block ${scan.nextBlock}` });
      return;
    }
    let minBal = ctx.cfg.holderMinBalance;
    if (minBal === undefined) {
      try {
        const d = await pub.readContract({ address: p.token, abi: taxTokenAbi, functionName: "dividendContract" });
        if (d !== ZERO) minBal = await pub.readContract({ address: d, abi: dividendAbi, functionName: "minimumShareBalance" });
      } catch {
        /* fall through */
      }
    }
    if (minBal === undefined || minBal === 0n) minBal = parseEther("100000"); // SPEC default minimumShareBalance

    const exclude = new Set([ZERO, DEAD.toLowerCase(), p.token.toLowerCase(), p.vault.toLowerCase(), payouts.toLowerCase()]);
    const candidates = Object.entries(scan.balances)
      .map(([a, b]) => [a, BigInt(b)] as const)
      .filter(([a, b]) => b >= minBal! && !exclude.has(a));
    // exclude contracts (pools, Portal, routers, lockers) — cached
    for (const [a] of candidates) {
      if (scan.contracts[a] === undefined) {
        const code = await pub.getCode({ address: a as Address });
        // EIP-7702 delegated EOAs (code = 0xef0100 ‖ 20-byte address; live on BSC) are people, not pools.
        const is7702 = Boolean(code && code.length === 2 + 46 && code.toLowerCase().startsWith("0xef0100"));
        scan.contracts[a] = Boolean(code && code !== "0x") && !is7702;
      }
    }
    writeJsonAtomic(ctx.store.holdersFile(p.token), scan);
    const holders = candidates.filter(([a]) => !scan.contracts[a]);
    if (holders.length === 0) {
      ctx.record({ kind: "holderEpoch", target: p.vault, ok: true, detail: "no eligible holders yet" });
      vs.lastEpochAt = Date.now();
      ctx.store.touch();
      return;
    }
    // spot-check the log replay against balanceOf for the 5 largest holders
    const top = [...holders].sort((x, y) => (y[1] > x[1] ? 1 : -1)).slice(0, 5);
    for (const [a, b] of top) {
      const real = await pub.readContract({ address: p.token, abi: taxTokenAbi, functionName: "balanceOf", args: [a as Address], blockNumber: head });
      if (real !== b) throw new Error(`snapshot mismatch for ${a}: logs ${b} vs balanceOf ${real}; delete ${ctx.store.holdersFile(p.token)} to rescan`);
    }
    const sum = holders.reduce((s, [, b]) => s + b, 0n);
    const values: [string, string][] = [];
    let total = 0n;
    for (const [a, b] of holders) {
      const amt = (pool * b) / sum;
      if (amt === 0n) continue;
      values.push([getAddress(a), amt.toString()]);
      total += amt;
    }
    if (values.length === 0 || total === 0n) return;
    const tree = StandardMerkleTree.of(values, ["address", "uint256"]);
    const root = tree.root as `0x${string}`;
    const claims: Record<string, { amount: string; proof: string[] }> = {};
    for (const [i, v] of tree.entries()) claims[v[0].toLowerCase()] = { amount: v[1], proof: tree.getProof(i) };
    const file = ctx.store.epochFile(p.vault, root.slice(2, 14));
    writeJsonAtomic(file, { vault: p.vault, token: p.token, root, total: total.toString(), snapshotBlock: head.toString(), minBalance: minBal.toString(), claims, tree: tree.dump() });

    const r = await sendTx(ctx.c, `Payouts.publishHolderEpoch ${p.vault}`, {
      address: payouts,
      abi: payoutsAbi,
      functionName: "publishHolderEpoch",
      args: [p.vault, root, total],
    });
    ctx.record({
      kind: "holderEpoch",
      target: p.vault,
      ok: r.ok,
      dryRun: r.dryRun,
      detail: r.error ?? `${formatEther(total)} ZEC to ${values.length} holders (root ${root.slice(0, 10)}…)`,
      tx: r.hash,
    });
    if (r.ok && !r.dryRun) {
      const n = await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "epochsLength", args: [p.vault] });
      const rec: EpochRecord = {
        vault: p.vault,
        token: p.token,
        epoch: Number(n) - 1,
        root,
        total: total.toString(),
        holders: values.length,
        snapshotBlock: head.toString(),
        file,
        txHash: r.hash,
        createdAt: Date.now(),
      };
      ctx.store.state.epochs.push(rec);
      vs.lastEpochAt = Date.now();
      markSuccess(ctx, key);
      ctx.store.touch();
    } else if (r.unconfirmed) {
      // tx is out; reconcileEpochs() indexes it by root once mined (the proofs file is already on disk)
      vs.lastEpochAt = Date.now();
      ctx.store.touch();
    } else if (!r.ok) {
      markFailure(ctx, key, r.error ?? "unknown");
    }
  } catch (e) {
    markFailure(ctx, key, errMsg(e));
    ctx.record({ kind: "holderEpoch", target: p.vault, ok: false, detail: errMsg(e) });
  }
}

/**
 * Index on-chain epochs that are missing from state (e.g. publishHolderEpoch's receipt timed out or the process
 * restarted before recording it) by matching their root to a proofs file in STATE_DIR/epochs/.
 */
async function reconcileEpochs(ctx: Ctx, p: Planting) {
  const { pub } = ctx.c;
  const payouts = ctx.contracts.payouts;
  const n = Number(await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "epochsLength", args: [p.vault] }));
  const known = new Set(
    ctx.store.state.epochs.filter((e) => e.vault.toLowerCase() === p.vault.toLowerCase() && e.epoch !== undefined).map((e) => e.epoch!),
  );
  if (known.size >= n) return;
  for (let i = 0; i < n; i++) {
    if (known.has(i)) continue;
    const e = await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "getEpoch", args: [p.vault, BigInt(i)] });
    const file = ctx.store.epochFile(p.vault, e.root.slice(2, 14));
    const f = readJson<{ root: string; total: string; snapshotBlock: string; claims: Record<string, unknown> }>(file);
    if (!f || f.root.toLowerCase() !== e.root.toLowerCase()) {
      log.warn("on-chain holder epoch has no local proofs file", { vault: p.vault, epoch: i, root: e.root });
      continue;
    }
    ctx.store.state.epochs.push({
      vault: p.vault,
      token: p.token,
      epoch: i,
      root: e.root,
      total: e.total.toString(),
      holders: Object.keys(f.claims ?? {}).length,
      snapshotBlock: f.snapshotBlock,
      file,
      createdAt: Number(e.publishedAt) * 1000,
    });
    log.info("indexed holder epoch from chain", { vault: p.vault, epoch: i });
    ctx.store.touch();
  }
}

async function reclaimOld(ctx: Ctx, p: Planting) {
  const delay = ctx.contracts.epochReclaimDelay;
  if (!delay) return;
  const { pub } = ctx.c;
  const payouts = ctx.contracts.payouts;
  const n = await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "epochsLength", args: [p.vault] });
  if (n === 0n) return;
  const nowSec = BigInt(Math.floor(Date.now() / 1000));
  for (let i = 0n; i < n; i++) {
    const e = await pub.readContract({ address: payouts, abi: payoutsAbi, functionName: "getEpoch", args: [p.vault, i] });
    if (e.closed || e.claimed >= e.total) continue;
    if (nowSec < e.publishedAt + delay + 60n) continue;
    const key = `reclaim:${p.vault}:${i}`;
    if (!shouldTry(ctx, key)) continue;
    const r = await sendTx(ctx.c, `Payouts.reclaimEpoch ${p.vault}#${i}`, {
      address: payouts,
      abi: payoutsAbi,
      functionName: "reclaimEpoch",
      args: [p.vault, i],
    });
    ctx.record({ kind: "reclaimEpoch", target: p.vault, ok: r.ok, dryRun: r.dryRun, detail: r.error ?? `epoch ${i}`, tx: r.hash });
    if (r.ok) markSuccess(ctx, key);
    else markFailure(ctx, key, r.error ?? "unknown");
  }
}

/** Claims for the site: every epoch file of `vault` that contains `account`. */
export function claimsFor(ctx: { store: Ctx["store"] }, vault: string, account: string) {
  const out: { epoch?: number; root: string; amount: string; proof: string[] }[] = [];
  for (const e of ctx.store.state.epochs) {
    if (e.vault.toLowerCase() !== vault.toLowerCase()) continue;
    const f = readJson<{ claims: Record<string, { amount: string; proof: string[] }> }>(e.file);
    const c = f?.claims?.[account.toLowerCase()];
    if (c) out.push({ epoch: e.epoch, root: e.root, amount: c.amount, proof: c.proof });
  }
  return out;
}
