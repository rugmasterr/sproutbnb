import { vaultAbi } from "../abi.js";
import { fmtBnb, sendTx } from "../chain.js";
import { markFailure, markSuccess, shouldTry, type Ctx, type Planting } from "../context.js";
import { log } from "../log.js";

/**
 * flush() every vault whose held BNB (stats().pending = vault balance, incl. not-yet-recognized revenue) is at
 * least FLUSH_MIN_BNB. flush() is permissionless; it routes lp+root → SproutRoots, ops → treasury and the
 * deployer's-choice 40% → SproutPayouts.deposit(vault).
 */
export async function runFlush(ctx: Ctx, plantings: Planting[], pendingByVault: Map<string, bigint>) {
  let flushed = 0;
  for (const p of plantings) {
    const pending = pendingByVault.get(p.vault.toLowerCase()) ?? 0n;
    if (pending < ctx.cfg.flushMinWei) continue;
    const key = `flush:${p.vault}`;
    if (!shouldTry(ctx, key)) continue;
    if (!ctx.canSend && !ctx.cfg.dryRun) {
      ctx.warn("flush skipped: keeper cannot send (low gas or no key)");
      return;
    }
    const r = await sendTx(ctx.c, `flush ${p.vault}`, {
      address: p.vault,
      abi: vaultAbi,
      functionName: "flush",
      args: [],
    });
    ctx.record({ kind: "flush", target: p.vault, ok: r.ok, dryRun: r.dryRun, detail: r.error ?? fmtBnb(pending), tx: r.hash });
    if (r.ok) {
      markSuccess(ctx, key);
      ctx.store.vault(p.vault).lastFlushAt = Date.now();
      ctx.store.touch();
      flushed++;
    } else {
      log.warn("flush failed", { vault: p.vault, error: r.error });
      markFailure(ctx, key, r.error ?? "unknown");
    }
  }
  return flushed;
}
