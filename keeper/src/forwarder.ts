import type { Config } from "./config.js";
import { redact } from "./log.js";
import { classifyZcash } from "./zcash.js";

/**
 * Client for Sprout's shield forwarder (zforward/). Used when a mode-3 vault's Zcash address is shielded
 * (zs1…) or unified (u1…): 1Click can only pay transparent addresses, so 1Click pays the forwarder's
 * t-address and the forwarder sends on to the shielded/unified address with the stamp memo
 * `sprout-stamp:v1:<payoutId>:<bsc tx hash>`.
 *
 * Interface the keeper expects (documented in keeper/README.md; zforward/ must implement it):
 *   GET  {FORWARDER_URL}/v1/info                      → { tAddress: "t1…" }
 *   POST {FORWARDER_URL}/v1/requests                  ← { quoteRef, source: "keeper", vault, recipient,
 *                                                         depositAddress, expectedZat, minZat, deadline,
 *                                                         bnbChunks }
 *                                                     → { id, tAddress }
 *   POST {FORWARDER_URL}/v1/requests/{quoteRef}/tx    ← { bscTxHash }   (once per bridgeOut chunk)
 * Auth: `Authorization: Bearer ${FORWARDER_TOKEN}` when set.
 * The forwarder must also verify each request against the on-chain `BridgedOut(vault, …, quoteRef, …)` event
 * before paying out (the keeper is not trusted blindly). One quote can be funded by several bridgeOut calls
 * (SproutPayouts.MAX_BRIDGE is 1 BNB per call): the forwarder sums every BridgedOut with the same quoteRef.
 */
export class Forwarder {
  constructor(private readonly cfg: Pick<Config, "forwarderUrl" | "forwarderToken" | "forwarderTaddr">) {}

  get configured(): boolean {
    return Boolean(this.cfg.forwarderUrl);
  }

  private async req<T>(path: string, init: RequestInit): Promise<T> {
    if (!this.cfg.forwarderUrl) throw new Error("forwarder not configured (FORWARDER_URL)");
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.cfg.forwarderToken) headers.authorization = `Bearer ${this.cfg.forwarderToken}`;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    try {
      const res = await fetch(`${this.cfg.forwarderUrl}${path}`, { ...init, headers, signal: ctl.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(`forwarder ${path} HTTP ${res.status}: ${redact(text).slice(0, 200)}`);
      return (text ? JSON.parse(text) : {}) as T;
    } catch (e) {
      throw new Error(redact((e as Error).message ?? String(e)));
    } finally {
      clearTimeout(t);
    }
  }

  /** The forwarder's transparent receiving address (env FORWARDER_TADDR wins; else asked from the service). */
  async tAddress(): Promise<string> {
    let t = this.cfg.forwarderTaddr;
    if (!t) t = (await this.req<{ tAddress?: string }>("/v1/info", { method: "GET" })).tAddress;
    if (!t || classifyZcash(t) !== "transparent") throw new Error("forwarder t-address missing or not transparent");
    return t;
  }

  async register(r: {
    quoteRef: string;
    vault: string;
    recipient: string;
    depositAddress: string;
    expectedZat: string;
    minZat: string;
    deadline?: string;
    /** number of bridgeOut calls (BridgedOut events with this quoteRef) that together fund the quote */
    bnbChunks?: number;
  }): Promise<{ id?: string; tAddress?: string }> {
    return this.req("/v1/requests", { method: "POST", body: JSON.stringify({ ...r, source: "keeper" }) });
  }

  async attachTx(quoteRef: string, bscTxHash: string): Promise<void> {
    await this.req(`/v1/requests/${quoteRef}/tx`, { method: "POST", body: JSON.stringify({ bscTxHash }) });
  }
}
