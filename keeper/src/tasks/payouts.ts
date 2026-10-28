import { formatEther, getAddress, isAddress, keccak256, toBytes, type Address } from "viem";
import { payoutsAbi, vaultAbi } from "../abi.js";
import { fmtBnb, sendTx } from "../chain.js";
import { markFailure, markSuccess, shouldTry, type Ctx, type Planting } from "../context.js";
import { errMsg, log } from "../log.js";
import { TERMINAL_1CLICK } from "../oneclick.js";
import { minusBps, quoteBnbToZec } from "../quotes.js";
import type { BridgeChunk, BridgeRecord } from "../state.js";
import { classifyZcash, formatZat, shortZ, zatToBep20 } from "../zcash.js";

/** Our lifecycle states + 1Click's non-terminal states. */
export const OPEN_BRIDGE = new Set(["quoted", "sending", "sent", "KNOWN_DEPOSIT_TX", "PENDING_DEPOSIT", "INCOMPLETE_DEPOSIT", "PROCESSING"]);
/** Stop broadcasting further chunks this close to the 1Click deadline (the deposit address goes inactive). */
const CHUNK_DEADLINE_MARGIN_MS = 10 * 60_000;
const ZERO: Address = "0x0000000000000000000000000000000000000000";

/**
 * 1Click enforces (sometimes "temporary") minimum swap sizes, e.g. HTTP 400 "Temporary swap limits: minimum swap
 * amount is $1,000" (observed 2026-10-27 for BNB→ZEC). That is not a keeper failure: the pot keeps accumulating
 * and we retry in an hour. Returns true when handled.
 */
function handleMinimum(ctx: Ctx, p: Planting, amount: bigint, pending: bigint, e: unknown): boolean {
  const msg = errMsg(e);
  const m = /minimum swap amount is \$?([\d,\.]+)/i.exec(msg);
  if (!m) return false;
  const v = ctx.store.vault(`bridge:${p.vault}`);
  v.nextTryAt = Date.now() + 3600_000;
  v.lastError = `1Click minimum $${m[1]} not reached`;
  ctx.store.touch();
  const capped = pending > amount;
  ctx.warn(
    capped
      ? `1Click minimum swap is $${m[1]} but one quote is capped at ${formatEther(amount)} BNB (BRIDGE_MAX_QUOTE_BNB) — raise it; vault ${p.vault} holds ${formatEther(pending)} BNB`
      : `1Click minimum swap is $${m[1]}; vault ${p.vault} pot (${formatEther(amount)} BNB) keeps accumulating until it is reached`,
  );
  ctx.record({ kind: `bridge(mode ${p.mode})`, target: p.vault, ok: true, detail: `waiting: 1Click minimum $${m[1]} (pot ${fmtBnb(amount)})` });
  return true;
}

/** Deterministic, recomputable reference tying bridgeOut call(s) to their 1Click deposit (also used by zforward). */
export function quoteRefFor(chainId: number, depositAddress: string): `0x${string}` {
  return keccak256(toBytes(`sprout-bridge:v1:${chainId}:${depositAddress.toLowerCase()}`));
}

/**
 * Split `amount` into the fewest equal chunks ≤ maxBridge (remainder on the last). Equal chunks keep every
 * partial sum ≤ (n-1)/n of the total, i.e. well below FLEX_INPUT's minAmountIn, so 1Click never starts the swap
 * on a partial deposit.
 */
export function planChunks(amount: bigint, maxBridge: bigint): bigint[] {
  if (amount <= 0n) return [];
  if (maxBridge <= 0n) throw new Error("MAX_BRIDGE is zero");
  const n = (amount + maxBridge - 1n) / maxBridge;
  const each = amount / n;
  const out: bigint[] = [];
  for (let i = 0n; i < n - 1n; i++) out.push(each);
  out.push(amount - each * (n - 1n));
  return out;
}

/** Older records (pre-chunking) carry a single txHash. */
function chunksOf(b: BridgeRecord): BridgeChunk[] {
  if (!b.chunks) {
    b.chunks = [
      {
        amount: b.amountIn,
        state: b.txHash ? (b.statusDetail === "receipt pending" ? "pending" : "done") : "todo",
        tx: b.txHash,
      },
    ];
  }
  return b.chunks;
}

/** chunk still to be broadcast or confirmed */
const unfinished = (c: BridgeChunk) => c.state === "todo" || c.state === "pending";

const sentWei = (b: BridgeRecord) => chunksOf(b).reduce((s, c) => (c.state === "done" ? s + BigInt(c.amount) : s), 0n);

/**
 * Modes 0/1/2 → settle(vault, amount, minZecOut): BNB → BEP-20 ZEC on PancakeSwap V3, to the payee (0/1) or
 * to holders (2: Flap dividend tracker, or the fallback pool). minZecOut = QuoterV2 quote − SLIPPAGE_BPS.
 */
export async function runSettle(ctx: Ctx, p: Planting, pending: bigint) {
  if (pending === 0n) return;
  const zec = ctx.contracts.zec;
  if (!zec || zec === ZERO) {
    ctx.warn("settle skipped: Payouts.zec() not set");
    return;
  }
  const key = `settle:${p.vault}`;
  if (!shouldTry(ctx, key)) return;
  if (!ctx.canSend && !ctx.cfg.dryRun) return;
  const amount = pending < ctx.cfg.settleMaxWei ? pending : ctx.cfg.settleMaxWei;
  let zecOut: bigint;
  try {
    zecOut = await quoteBnbToZec(ctx.c, zec, amount);
  } catch (e) {
    markFailure(ctx, key, `QuoterV2: ${errMsg(e)}`);
    ctx.record({ kind: "settle", target: p.vault, ok: false, detail: `QuoterV2 failed: ${errMsg(e)}` });
    return;
  }
  if (zecOut < ctx.cfg.settleMinZec) {
    log.debug("settle below threshold", { vault: p.vault, zecOut: formatEther(zecOut) });
    return;
  }
  const minZecOut = minusBps(zecOut, ctx.cfg.slippageBps);
  if (minZecOut === 0n) return;
  const r = await sendTx(ctx.c, `Payouts.settle ${p.vault}`, {
    address: ctx.contracts.payouts,
    abi: payoutsAbi,
    functionName: "settle",
    args: [p.vault, amount, minZecOut],
  });
  ctx.record({
    kind: `settle(mode ${p.mode})`,
    target: p.vault,
    ok: r.ok,
    dryRun: r.dryRun,
    detail: r.error ?? `${fmtBnb(amount)} → ≈${formatEther(zecOut)} ZEC (min ${formatEther(minZecOut)})`,
    tx: r.hash,
  });
  if (r.ok) {
    markSuccess(ctx, key);
    if (!r.dryRun) ctx.store.vault(p.vault).lastSettleAt = Date.now();
    ctx.store.touch();
  } else markFailure(ctx, key, r.error ?? "unknown");
}

/**
 * Modes 3/4 → native ZEC on Zcash through NEAR Intents 1Click.
 *   trigger: pending ≥ ≈BRIDGE_MIN_ZEC (0.25 ZEC) equivalent, or ≥ ≈BRIDGE_DUST_ZEC (0.01) and ≥7 days since
 *            the last bridge (or since planting). 1Click's own USD minimum (currently $1,000) may hold it longer.
 *   recipient: vault.zcashAddress() (mode 4: the Zcash Foundation address set on Payouts) if transparent
 *              (t1/t3); for shielded/unified (zs1/u1) the forwarder's t-address + a registered shield request.
 *   amount: min(pending, BRIDGE_MAX_QUOTE_BNB) in ONE quote. If that is above Payouts.MAX_BRIDGE (1 BNB per call)
 *           the quote is FLEX_INPUT and is funded by several equal bridgeOut calls to the same deposit address.
 *   one open bridge per vault at a time.
 */
export async function runBridge(ctx: Ctx, p: Planting, pending: bigint) {
  const { cfg } = ctx;
  const key = `bridge:${p.vault}`;
  if (!cfg.bridgeEnabled) {
    if (pending > 0n) ctx.warn("bridging disabled (BRIDGE_ENABLED=false or not BSC mainnet) — modes 3/4 accumulate");
    return;
  }
  if (!ctx.canSend && !cfg.dryRun) return;
  const open = ctx.store.state.bridges.find((b) => b.vault.toLowerCase() === p.vault.toLowerCase() && OPEN_BRIDGE.has(b.status));
  if (open) {
    // finish funding a multi-chunk quote (or confirm pending receipts); otherwise wait for delivery
    if (!cfg.dryRun && chunksOf(open).some(unfinished)) await fundBridge(ctx, open);
    return;
  }
  if (pending === 0n) return;
  if (!shouldTry(ctx, key)) return;

  const zaddr = await ctx.c.pub.readContract({ address: p.vault, abi: vaultAbi, functionName: "zcashAddress" });
  if (!zaddr) {
    ctx.warn(
      p.mode === 4
        ? "Zcash Foundation address not set on SproutPayouts — mode 4 payouts accumulate until the admin sets it"
        : `vault ${p.vault} has no Zcash address`,
    );
    return;
  }
  const kind = classifyZcash(zaddr);
  if (kind === "invalid") {
    ctx.warn(`vault ${p.vault} Zcash address not recognised (${shortZ(zaddr)}) — skipped`);
    return;
  }

  const maxBridge = ctx.contracts.maxBridge ?? 1_000_000_000_000_000_000n;
  const amount = pending < cfg.bridgeMaxQuoteWei ? pending : cfg.bridgeMaxQuoteWei;
  const chunks = planChunks(amount, maxBridge);
  const swapType = chunks.length > 1 ? "FLEX_INPUT" : "EXACT_INPUT";
  if (chunks.length > 1 && 10_000 / chunks.length <= cfg.oneClickSlippageBps) {
    ctx.warn(`bridge for ${p.vault}: ${chunks.length} chunks with ONECLICK_SLIPPAGE_BPS=${cfg.oneClickSlippageBps} could start the swap on a partial deposit — lower BRIDGE_MAX_QUOTE_BNB`);
    return;
  }

  // Threshold check in ZEC (≈ value; QuoterV2 BEP-20 price, falling back to a dry 1Click quote).
  let zecEst: bigint | undefined;
  try {
    if (ctx.contracts.zec) zecEst = await quoteBnbToZec(ctx.c, ctx.contracts.zec, amount);
  } catch (e) {
    log.debug("QuoterV2 estimate failed; using 1Click dry quote", { error: errMsg(e) });
  }
  const refundTo = cfg.bridgeRefundTo ?? (ctx.c.account?.address as Address | undefined) ?? ctx.c.from;
  let recipient = zaddr;
  if (kind === "shielded") {
    if (!ctx.forwarder.configured && !cfg.forwarderTaddr) {
      ctx.warn(`vault ${p.vault} pays a shielded/unified address but the shield forwarder is not configured (FORWARDER_URL)`);
      return;
    }
    if (!ctx.forwarder.configured && !cfg.dryRun) {
      ctx.warn(`vault ${p.vault}: FORWARDER_TADDR is set but FORWARDER_URL is not — cannot register the shield request; not bridging`);
      return;
    }
    try {
      recipient = await ctx.forwarder.tAddress();
    } catch (e) {
      markFailure(ctx, key, `forwarder: ${errMsg(e)}`);
      ctx.record({ kind: "bridge", target: p.vault, ok: false, detail: `forwarder unavailable: ${errMsg(e)}` });
      return;
    }
  }
  const deadline = new Date(Date.now() + cfg.bridgeDeadlineMin * 60_000);
  const quoteArgs = {
    amountWei: amount,
    zcashRecipient: recipient,
    refundTo,
    deadline,
    slippageBps: cfg.oneClickSlippageBps,
    originAsset: cfg.oneClickBnbAsset,
    destinationAsset: cfg.oneClickZecAsset,
    swapType: swapType as "EXACT_INPUT" | "FLEX_INPUT",
  };
  if (zecEst === undefined) {
    try {
      const dry = await ctx.oneclick.quoteBnbToZec({ dry: true, ...quoteArgs });
      zecEst = zatToBep20(BigInt(dry.quote.amountOut));
    } catch (e) {
      if (handleMinimum(ctx, p, amount, pending, e)) return;
      markFailure(ctx, key, errMsg(e));
      ctx.record({ kind: "bridge", target: p.vault, ok: false, detail: `estimate failed: ${errMsg(e)}` });
      return;
    }
  }
  const since = ctx.store.vault(p.vault).lastBridgeAt ?? Number(p.plantedAt) * 1000;
  const dueBySize = zecEst >= cfg.bridgeMinZec;
  const dueByAge = zecEst >= cfg.bridgeDustZec && Date.now() - since >= cfg.bridgeDustAfterMs;
  if (!dueBySize && !dueByAge) {
    log.debug("bridge not due", { vault: p.vault, zecEst: formatEther(zecEst) });
    return;
  }

  if (cfg.dryRun) {
    // Preview with a dry quote (no deposit address is created) and simulate the first bridgeOut chunk
    // against a placeholder deposit address.
    try {
      const dry = await ctx.oneclick.quoteBnbToZec({ dry: true, ...quoteArgs });
      const placeholder = (ctx.c.from !== ZERO ? ctx.c.from : "0x000000000000000000000000000000000000dEaD") as Address;
      const sim = await sendTx(ctx.c, `Payouts.bridgeOut ${p.vault} (simulated chunk 1/${chunks.length})`, {
        address: ctx.contracts.payouts,
        abi: payoutsAbi,
        functionName: "bridgeOut",
        args: [p.vault, chunks[0]!, placeholder, quoteRefFor(cfg.chainId, placeholder)],
      });
      ctx.record({
        kind: `bridge(mode ${p.mode})`,
        target: p.vault,
        ok: sim.ok,
        dryRun: true,
        detail: `${fmtBnb(amount)} in ${chunks.length} bridgeOut call(s), ${swapType} → ≈${dry.quote.amountOutFormatted} ZEC to ${shortZ(zaddr)}${kind === "shielded" ? " (shielded via forwarder)" : ""}${sim.error ? "; sim: " + sim.error : ""}`,
      });
    } catch (e) {
      if (handleMinimum(ctx, p, amount, pending, e)) return;
      ctx.record({ kind: "bridge", target: p.vault, ok: false, dryRun: true, detail: errMsg(e) });
    }
    return;
  }

  // ---- live: real quote with a deposit address ----
  let q;
  try {
    q = await ctx.oneclick.quoteBnbToZec({ dry: false, ...quoteArgs });
  } catch (e) {
    if (handleMinimum(ctx, p, amount, pending, e)) return;
    markFailure(ctx, key, errMsg(e));
    ctx.record({ kind: "bridge", target: p.vault, ok: false, detail: `quote failed: ${errMsg(e)}` });
    return;
  }
  const dep = q.quote.depositAddress;
  const problems: string[] = [];
  if (!dep || !isAddress(dep, { strict: false })) problems.push("quote has no EVM deposit address");
  if (q.quote.depositMemo) problems.push("quote requires a deposit memo (unsupported for BSC native)");
  if (BigInt(q.quote.amountIn) !== amount) problems.push(`amountIn ${q.quote.amountIn} != requested ${amount}`);
  if (String(q.quoteRequest?.recipient ?? recipient) !== recipient) problems.push("quote recipient mismatch");
  if (q.quoteRequest?.swapType !== undefined && q.quoteRequest.swapType !== swapType) problems.push(`quote swapType ${String(q.quoteRequest.swapType)} != ${swapType}`);
  const minIn = BigInt(q.quote.minAmountIn ?? q.quote.amountIn);
  if (minIn > amount) problems.push(`minAmountIn ${minIn} > amount ${amount}`);
  // FLEX_INPUT must not start on a partial deposit: every partial sum has to stay below minAmountIn.
  if (chunks.length > 1 && amount - chunks[chunks.length - 1]! >= minIn) problems.push("chunk plan would reach minAmountIn before the last chunk");
  const qDeadline = q.quote.deadline ? Date.parse(q.quote.deadline) : NaN;
  if (!Number.isFinite(qDeadline) || qDeadline - Date.now() < CHUNK_DEADLINE_MARGIN_MS + chunks.length * 3 * 60_000) {
    problems.push(`quote deadline ${q.quote.deadline ?? "(none)"} too close for ${chunks.length} bridgeOut call(s)`);
  }
  const outZat = BigInt(q.quote.amountOut);
  const minZat = BigInt(q.quote.minAmountOut);
  if (minZat <= 0n) problems.push("minAmountOut is zero");
  // Guard against a bad quote: 1Click output must not be far below the on-chain BEP-20 price.
  if (zecEst > 0n && zatToBep20(outZat) < minusBps(zecEst, cfg.bridgeMaxShortfallBps)) {
    problems.push(`1Click out ${formatZat(outZat)} ZEC is >${cfg.bridgeMaxShortfallBps / 100}% below the on-chain estimate ${formatEther(zecEst)}`);
  }
  if (problems.length) {
    markFailure(ctx, key, problems.join("; "));
    ctx.record({ kind: "bridge", target: p.vault, ok: false, detail: `quote rejected: ${problems.join("; ")}` });
    return;
  }
  const depositAddress = getAddress(dep!) as `0x${string}`;
  const quoteRef = quoteRefFor(cfg.chainId, depositAddress);
  const rec: BridgeRecord = {
    quoteRef,
    vault: p.vault,
    mode: p.mode,
    amountIn: amount.toString(),
    amountOutZat: outZat.toString(),
    minAmountOutZat: minZat.toString(),
    depositAddress,
    oneClickRecipient: recipient,
    zcashAddress: zaddr,
    shielded: kind === "shielded",
    correlationId: q.correlationId,
    quoteSignature: q.signature,
    quoteDeadline: q.quote.deadline,
    swapType,
    minAmountIn: minIn.toString(),
    chunks: chunks.map((c) => ({ amount: c.toString(), state: "todo" as const })),
    status: "quoted",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  ctx.store.state.bridges.push(rec);
  ctx.store.touch();
  ctx.store.save(); // persist the quote (incl. 1Click signature) BEFORE any value moves

  if (rec.shielded) {
    try {
      await ctx.forwarder.register({
        quoteRef,
        vault: p.vault,
        recipient: zaddr,
        depositAddress,
        expectedZat: outZat.toString(),
        minZat: minZat.toString(),
        deadline: q.quote.deadline,
        bnbChunks: chunks.length,
      });
      rec.forwarderRegistered = true;
    } catch (e) {
      rec.status = "expired";
      rec.statusDetail = `forwarder registration failed: ${errMsg(e)}`;
      rec.updatedAt = Date.now();
      ctx.store.touch();
      markFailure(ctx, key, rec.statusDetail);
      ctx.record({ kind: "bridge", target: p.vault, ok: false, detail: rec.statusDetail });
      return;
    }
  }
  markSuccess(ctx, key);
  await fundBridge(ctx, rec);
}

/**
 * Broadcast the remaining bridgeOut chunks of `rec` in order, one at a time (each waits for its receipt).
 * Safe to call repeatedly: confirms pending receipts first, never re-sends a chunk that may be in flight, and
 * stops near the 1Click deadline (a partial FLEX_INPUT deposit is then refunded by 1Click to BRIDGE_REFUND_TO).
 */
async function fundBridge(ctx: Ctx, rec: BridgeRecord) {
  const chunks = chunksOf(rec);
  const key = `bridge:${rec.vault}`;
  const save = () => {
    rec.updatedAt = Date.now();
    ctx.store.touch();
    try {
      ctx.store.save();
    } catch (e) {
      log.error("state save failed", { error: errMsg(e) });
    }
  };

  // 1) settle chunks whose receipt we have not seen yet
  for (const c of chunks) {
    if (c.state !== "pending" || !c.tx) continue;
    try {
      const rc = await ctx.c.pub.getTransactionReceipt({ hash: c.tx });
      c.state = rc.status === "success" ? "done" : "todo";
      if (c.state === "todo") {
        log.warn("bridgeOut chunk reverted; will retry if before the deadline", { quoteRef: rec.quoteRef, tx: c.tx });
        c.tx = undefined;
      } else {
        afterChunk(ctx, rec, c.tx!);
      }
      save();
    } catch {
      return; // still not mined (or RPC hiccup): never send the next chunk behind an unknown one
    }
  }

  // 2) send what is left
  const deadline = rec.quoteDeadline ? Date.parse(rec.quoteDeadline) : rec.createdAt + ctx.cfg.bridgeDeadlineMin * 60_000;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i]!;
    if (c.state !== "todo") continue;
    if (Date.now() > deadline - CHUNK_DEADLINE_MARGIN_MS) {
      const sent = sentWei(rec);
      if (sent === 0n) {
        rec.status = "expired";
        rec.statusDetail = "deadline reached before any bridgeOut — nothing left the contract";
      } else {
        rec.statusDetail = `deadline reached with ${formatEther(sent)}/${formatEther(BigInt(rec.amountIn))} BNB deposited — 1Click will refund the partial deposit to BRIDGE_REFUND_TO`;
        ctx.warn(`bridge ${rec.quoteRef.slice(0, 10)}: ${rec.statusDetail}`);
        for (const x of chunks) if (x.state === "todo") x.state = "abandoned"; // nothing more will be sent
        rec.abandonedWei = (BigInt(rec.amountIn) - sent).toString();
      }
      save();
      return;
    }
    if (!ctx.canSend || !shouldTry(ctx, key)) return;
    const r = await sendTx(
      ctx.c,
      `Payouts.bridgeOut ${rec.vault} chunk ${i + 1}/${chunks.length}`,
      {
        address: ctx.contracts.payouts,
        abi: payoutsAbi,
        functionName: "bridgeOut",
        args: [rec.vault, BigInt(c.amount), rec.depositAddress, rec.quoteRef],
      },
      (hash) => {
        c.tx = hash;
        c.state = "pending";
        c.broadcastAt = Date.now();
        rec.txHash ??= hash;
        if (rec.status === "quoted") rec.status = "sending";
        save();
      },
    );
    ctx.record({
      kind: `bridge(mode ${rec.mode})`,
      target: rec.vault,
      ok: r.ok,
      dryRun: false,
      detail:
        r.error ??
        `chunk ${i + 1}/${chunks.length}: ${fmtBnb(BigInt(c.amount))} → 1Click (${rec.swapType ?? "EXACT_INPUT"}, ${formatZat(BigInt(rec.amountOutZat))} ZEC total to ${shortZ(rec.zcashAddress)}${rec.shielded ? ", shielded" : ""})`,
      tx: r.hash,
    });
    if (r.ok) {
      c.state = "done";
      afterChunk(ctx, rec, r.hash!);
      save();
      continue;
    }
    if (r.unconfirmed) {
      save(); // maybe mined later; confirmed on the next loop
      return;
    }
    // failed before broadcast (simulation revert, gas cap, nonce gap) or reverted on-chain: nothing moved
    if (r.hash) {
      c.state = "todo";
      c.tx = undefined;
    }
    if (sentWei(rec) === 0n && !chunks.some((x) => x.state === "pending")) {
      // nothing moved yet: keep the record open until the deadline so a transient error can retry
      rec.statusDetail = `bridgeOut failed: ${r.error ?? "unknown"}`;
    }
    markFailure(ctx, key, r.error ?? "unknown");
    save();
    return;
  }

  if (!chunks.some(unfinished) && (rec.status === "quoted" || rec.status === "sending")) {
    rec.status = sentWei(rec) > 0n ? "sent" : "expired";
    ctx.store.vault(rec.vault).lastBridgeAt = Date.now();
    save();
  }
}

function afterChunk(ctx: Ctx, rec: BridgeRecord, hash: `0x${string}`) {
  ctx.oneclick.submitDeposit(hash, rec.depositAddress).catch((e) => log.debug("1Click deposit/submit failed", { error: errMsg(e) }));
  if (rec.shielded) {
    // zforward keeps the first attached chunk's tx as its on-chain proof (every chunk's BridgedOut carries the same
    // quoteRef) and answers 409 for later chunks — expected for multi-chunk quotes, so not a warning.
    ctx.forwarder.attachTx(rec.quoteRef, hash).catch((e) => {
      const m = errMsg(e);
      if (/HTTP 409/.test(m)) log.debug("forwarder already holds a proof tx for this quote", { quoteRef: rec.quoteRef });
      else log.warn("forwarder attachTx failed", { error: m });
    });
  }
}

/** Poll 1Click for every open bridge and record outcomes. */
export async function pollBridges(ctx: Ctx) {
  const now = Date.now();
  for (const b of ctx.store.state.bridges) {
    if (!OPEN_BRIDGE.has(b.status)) continue;
    const chunks = chunksOf(b);
    const anyOut = chunks.some((c) => c.state !== "todo");
    if (!anyOut) {
      // Nothing broadcast (as far as we know). After the deadline, ask 1Click before expiring: if it saw a
      // deposit we lost track of a broadcast (crash) — adopt its status instead of forgetting the money.
      const dl = b.quoteDeadline ? Date.parse(b.quoteDeadline) : b.createdAt + ctx.cfg.bridgeDeadlineMin * 60_000;
      if (now <= dl) continue;
      try {
        const s = await ctx.oneclick.status(b.depositAddress);
        if (s.status !== "PENDING_DEPOSIT") {
          log.error("1Click saw a deposit for a bridge with no recorded bridgeOut — adopting", { quoteRef: b.quoteRef, status: s.status });
          for (const c of chunks) c.state = "done";
          b.status = s.status;
        } else {
          b.status = "expired";
        }
      } catch (e) {
        if (now - dl < 24 * 3600_000) continue; // retry later
        b.status = "expired";
        b.statusDetail = `expired; 1Click status unavailable: ${errMsg(e)}`;
      }
      b.updatedAt = now;
      ctx.store.touch();
      continue;
    }
    try {
      const s = await ctx.oneclick.status(b.depositAddress);
      // keep our "sending" state while chunks are still going out (1Click reports INCOMPLETE_DEPOSIT meanwhile)
      const funding = chunks.some(unfinished);
      if (!funding && s.status !== b.status) {
        log.info("1Click status", { quoteRef: b.quoteRef, vault: b.vault, from: b.status, to: s.status });
        b.status = s.status;
        b.updatedAt = now;
        ctx.store.touch();
      }
      if (s.swapDetails?.destinationChainTxHashes?.length) {
        b.zcashTxHashes = s.swapDetails.destinationChainTxHashes.map((t) => t.hash);
      }
      if (TERMINAL_1CLICK.has(s.status)) {
        b.status = s.status;
        if (s.status === "REFUNDED") {
          const amt = s.swapDetails?.refundedAmount ?? sentWei(b).toString();
          b.refundedAmount = amt;
          b.statusDetail = s.swapDetails?.refundReason;
          if (!ctx.store.state.refundsOwed.some((r) => r.quoteRef === b.quoteRef)) {
            ctx.store.state.refundsOwed.push({ quoteRef: b.quoteRef, vault: b.vault, amount: amt, at: now });
          }
          log.error("1Click REFUNDED a bridge — BNB went to BRIDGE_REFUND_TO and must be re-credited by an operator", {
            vault: b.vault,
            quoteRef: b.quoteRef,
            amount: amt,
          });
          ctx.warn(`bridge ${b.quoteRef.slice(0, 10)} refunded (${amt} wei) — operator action needed`);
        } else if (s.status === "FAILED") {
          log.error("1Click FAILED a bridge", { vault: b.vault, quoteRef: b.quoteRef });
          ctx.warn(`bridge ${b.quoteRef.slice(0, 10)} FAILED at 1Click — check correlationId ${b.correlationId}`);
        } else {
          log.info("bridge delivered on Zcash", { vault: b.vault, zcashTx: b.zcashTxHashes, zec: formatZat(BigInt(b.amountOutZat)) });
        }
        b.updatedAt = now;
        ctx.store.touch();
      }
    } catch (e) {
      log.debug("1Click status poll failed", { quoteRef: b.quoteRef, error: errMsg(e) });
    }
  }
}
