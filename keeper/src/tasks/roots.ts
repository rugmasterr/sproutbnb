import { rootsAbi } from "../abi.js";
import { fmtBnb, sendTx } from "../chain.js";
import { markFailure, markSuccess, shouldTry, type Ctx } from "../context.js";
import { errMsg, log } from "../log.js";
import { minusBps, quoteBnbToToken, quoteBnbToZec } from "../quotes.js";

export interface RootsSnapshot {
  sprout?: string;
  lpPot: string;
  rootPot: string;
  lastBurnAt: string;
  lastLiquidityAt: string;
  grovePair?: string;
  note?: string;
}

/**
 * SproutRoots runs:
 *  - burnRun(amount ≤ MAX_DRAW, minSproutOut): rootPot → buy $SPROUT on Flap → 0x…dEaD
 *  - liquidityRun(amount ≤ MAX_DRAW, minZecOut, minSproutOut): half → ZEC (Pancake V3), half → $SPROUT (Flap),
 *    addLiquidity on the $SPROUT/ZEC V2 Grove pair, LP → 0x…dEaD.
 * Each respects MIN_INTERVAL (checked against the latest block timestamp, like the contract does).
 * minOut values come from Flap Portal.quoteExactInput (simulated) and PancakeSwap QuoterV2, minus SLIPPAGE_BPS;
 * $SPROUT quotes are additionally reduced by SPROUT_TAX_BPS because the contract measures the *net* tokens
 * received (Flap tax tokens may tax the transfer).
 */
export async function runRoots(ctx: Ctx): Promise<RootsSnapshot | undefined> {
  const { pub } = ctx.c;
  const roots = ctx.contracts.roots;
  const [sprout, lpPot, rootPot, lastBurnAt, lastLiquidityAt, block] = await Promise.all([
    pub.readContract({ address: roots, abi: rootsAbi, functionName: "sprout" }),
    pub.readContract({ address: roots, abi: rootsAbi, functionName: "lpPot" }),
    pub.readContract({ address: roots, abi: rootsAbi, functionName: "rootPot" }),
    pub.readContract({ address: roots, abi: rootsAbi, functionName: "lastBurnAt" }),
    pub.readContract({ address: roots, abi: rootsAbi, functionName: "lastLiquidityAt" }),
    pub.getBlock({ blockTag: "latest" }),
  ]);
  ctx.contracts.sprout = sprout;
  const snap: RootsSnapshot = {
    sprout,
    lpPot: lpPot.toString(),
    rootPot: rootPot.toString(),
    lastBurnAt: lastBurnAt.toString(),
    lastLiquidityAt: lastLiquidityAt.toString(),
  };
  if (sprout === "0x0000000000000000000000000000000000000000") {
    snap.note = "$SPROUT not set on SproutRoots yet (setSprout) — runs skipped";
    return snap;
  }
  const portal = ctx.contracts.portal;
  const zec = ctx.contracts.rootsZec ?? ctx.contracts.zec;
  const maxDraw = ctx.contracts.maxDraw ?? 500_000_000_000_000_000n;
  const minInterval = ctx.contracts.minInterval ?? 300n;
  const now = block.timestamp;
  if (!portal) {
    snap.note = "Flap Portal address unknown";
    return snap;
  }
  const sendable = ctx.canSend || ctx.cfg.dryRun;

  // ---- burn ----
  const burnReady = lastBurnAt === 0n || now >= lastBurnAt + minInterval;
  if (sendable && burnReady && rootPot >= ctx.cfg.burnMinWei && shouldTry(ctx, "roots:burn")) {
    const amount = rootPot < maxDraw ? rootPot : maxDraw;
    try {
      const q = await quoteBnbToToken(ctx.c, portal, sprout, amount);
      const minOut = minusBps(minusBps(q, ctx.cfg.sproutTaxBps), ctx.cfg.slippageBps);
      if (minOut === 0n) throw new Error(`Portal quote is zero for ${fmtBnb(amount)}`);
      const r = await sendTx(ctx.c, "Roots.burnRun", {
        address: roots,
        abi: rootsAbi,
        functionName: "burnRun",
        args: [amount, minOut],
      });
      ctx.record({ kind: "burnRun", ok: r.ok, dryRun: r.dryRun, detail: r.error ?? `${fmtBnb(amount)} → ≥${minOut} $SPROUT`, tx: r.hash });
      if (r.ok) {
        markSuccess(ctx, "roots:burn");
        if (r.hash) ctx.store.state.roots.lastBurnTx = r.hash;
      } else markFailure(ctx, "roots:burn", r.error ?? "unknown");
    } catch (e) {
      log.warn("burnRun quote failed", { error: errMsg(e) });
      ctx.record({ kind: "burnRun", ok: false, detail: errMsg(e) });
      markFailure(ctx, "roots:burn", errMsg(e));
    }
    ctx.store.state.roots.lastBurnTryAt = Date.now();
    ctx.store.touch();
  }

  // ---- liquidity (The Grove: $SPROUT/ZEC) ----
  const liqReady = lastLiquidityAt === 0n || now >= lastLiquidityAt + minInterval;
  if (sendable && liqReady && lpPot >= ctx.cfg.liquidityMinWei && shouldTry(ctx, "roots:liquidity")) {
    const amount = lpPot < maxDraw ? lpPot : maxDraw;
    const half = amount / 2n;
    try {
      if (!zec || zec === "0x0000000000000000000000000000000000000000") throw new Error("ZEC token not set on Roots");
      const [zq, sq] = await Promise.all([
        quoteBnbToZec(ctx.c, zec, half),
        quoteBnbToToken(ctx.c, portal, sprout, amount - half),
      ]);
      const minZec = minusBps(zq, ctx.cfg.slippageBps);
      const minSprout = minusBps(minusBps(sq, ctx.cfg.sproutTaxBps), ctx.cfg.slippageBps);
      if (minZec === 0n || minSprout === 0n) throw new Error("zero quote for liquidity run");
      const r = await sendTx(ctx.c, "Roots.liquidityRun", {
        address: roots,
        abi: rootsAbi,
        functionName: "liquidityRun",
        args: [amount, minZec, minSprout],
      });
      ctx.record({
        kind: "liquidityRun",
        ok: r.ok,
        dryRun: r.dryRun,
        detail: r.error ?? `${fmtBnb(amount)} → ≥${minZec} ZEC-wei + ≥${minSprout} $SPROUT`,
        tx: r.hash,
      });
      if (r.ok) {
        markSuccess(ctx, "roots:liquidity");
        if (r.hash) ctx.store.state.roots.lastLiquidityTx = r.hash;
      } else markFailure(ctx, "roots:liquidity", r.error ?? "unknown");
    } catch (e) {
      log.warn("liquidityRun quote failed", { error: errMsg(e) });
      ctx.record({ kind: "liquidityRun", ok: false, detail: errMsg(e) });
      markFailure(ctx, "roots:liquidity", errMsg(e));
    }
    ctx.store.state.roots.lastLiquidityTryAt = Date.now();
    ctx.store.touch();
  }

  try {
    snap.grovePair = await pub.readContract({ address: roots, abi: rootsAbi, functionName: "grovePair" });
  } catch {
    /* optional */
  }
  return snap;
}
