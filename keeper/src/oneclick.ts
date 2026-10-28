import type { Config } from "./config.js";
import { redact } from "./log.js";

/**
 * NEAR Intents 1Click API client (https://1click.chaindefuser.com/v0).
 * Direction used by the keeper: BNB on BSC → native ZEC on Zcash (transparent recipient).
 * Unauthenticated requests work (+0.25% fee); ONECLICK_JWT is sent as `X-API-Key` when set (SPEC).
 */

export interface OneClickQuote {
  depositAddress?: string;
  depositMemo?: string;
  amountIn: string;
  amountInFormatted: string;
  amountInUsd?: string;
  minAmountIn: string;
  amountOut: string;
  amountOutFormatted: string;
  amountOutUsd?: string;
  minAmountOut: string;
  deadline?: string;
  timeWhenInactive?: string;
  timeEstimate: number;
  withdrawFee?: string;
}

export interface OneClickQuoteResponse {
  correlationId: string;
  timestamp: string;
  signature: string;
  quoteRequest: Record<string, unknown>;
  quote: OneClickQuote;
}

export type OneClickStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

export interface OneClickStatusResponse {
  correlationId: string;
  status: OneClickStatus;
  updatedAt: string;
  swapDetails?: {
    amountOut?: string;
    amountOutFormatted?: string;
    refundedAmount?: string;
    refundReason?: string;
    depositedAmount?: string;
    destinationChainTxHashes?: { hash: string; explorerUrl: string }[];
    originChainTxHashes?: { hash: string; explorerUrl: string }[];
  };
}

export class OneClickError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class OneClick {
  constructor(private readonly cfg: Pick<Config, "oneClickUrl" | "oneClickJwt" | "oneClickReferral">) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
    if (this.cfg.oneClickJwt) h["X-API-Key"] = this.cfg.oneClickJwt;
    return h;
  }

  private async req<T>(path: string, init: RequestInit, timeoutMs = 25_000): Promise<T> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${this.cfg.oneClickUrl}${path}`, { ...init, headers: this.headers(), signal: ctl.signal });
      const text = await res.text();
      if (!res.ok) {
        let m = text;
        try {
          m = (JSON.parse(text) as { message?: string }).message ?? text;
        } catch {
          /* not json */
        }
        throw new OneClickError(`1Click ${path} HTTP ${res.status}: ${redact(String(m)).slice(0, 300)}`, res.status);
      }
      return JSON.parse(text) as T;
    } catch (e) {
      if (e instanceof OneClickError) throw e;
      throw new OneClickError(`1Click ${path} request failed: ${redact((e as Error).message ?? String(e))}`);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * EXACT_INPUT (default) or FLEX_INPUT quote for `amountWei` BNB on BSC → ZEC on Zcash to a *transparent* `zcashRecipient`.
   * dry=true previews without generating a deposit address. FLEX_INPUT accepts several deposits to the same
   * address and swaps once their total reaches `minAmountIn` (used when one swap needs > MAX_BRIDGE).
   */
  quoteBnbToZec(p: {
    dry: boolean;
    amountWei: bigint;
    zcashRecipient: string;
    refundTo: string;
    deadline: Date;
    slippageBps: number;
    originAsset: string;
    destinationAsset: string;
    swapType?: "EXACT_INPUT" | "FLEX_INPUT";
  }): Promise<OneClickQuoteResponse> {
    const body = {
      dry: p.dry,
      swapType: p.swapType ?? "EXACT_INPUT",
      slippageTolerance: p.slippageBps,
      originAsset: p.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: p.destinationAsset,
      amount: p.amountWei.toString(),
      refundTo: p.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: p.zcashRecipient,
      recipientType: "DESTINATION_CHAIN",
      deadline: p.deadline.toISOString(),
      referral: this.cfg.oneClickReferral,
      quoteWaitingTimeMs: 3000,
    };
    return this.req<OneClickQuoteResponse>("/quote", { method: "POST", body: JSON.stringify(body) }, 30_000);
  }

  status(depositAddress: string, depositMemo?: string): Promise<OneClickStatusResponse> {
    const q = new URLSearchParams({ depositAddress });
    if (depositMemo) q.set("depositMemo", depositMemo);
    return this.req<OneClickStatusResponse>(`/status?${q.toString()}`, { method: "GET" });
  }

  submitDeposit(txHash: string, depositAddress: string): Promise<unknown> {
    return this.req("/deposit/submit", { method: "POST", body: JSON.stringify({ txHash, depositAddress }) });
  }
}

export const TERMINAL_1CLICK = new Set<string>(["SUCCESS", "REFUNDED", "FAILED"]);
