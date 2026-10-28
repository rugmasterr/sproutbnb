import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { log, errMsg } from "./log.js";

/**
 * Small JSON state persisted on the fly volume (STATE_DIR). Written atomically (tmp + rename).
 * bigint values are stored as decimal strings.
 */

export type BridgeStatus =
  | "quoted" // quote obtained, no bridgeOut broadcast yet
  | "sending" // some bridgeOut chunks broadcast/mined, more to go (one quote > MAX_BRIDGE)
  | "sent" // every bridgeOut chunk mined; waiting for 1Click
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED"
  | "expired" // quote never funded (tx not sent / reverted) — nothing left the contract
  | "tx_failed";

export interface BridgeRecord {
  quoteRef: `0x${string}`;
  vault: `0x${string}`;
  mode: number;
  /** BNB wei sent (exact 1Click amountIn). */
  amountIn: string;
  /** Expected native ZEC out, zatoshi (8 decimals). */
  amountOutZat: string;
  minAmountOutZat: string;
  depositAddress: `0x${string}`;
  /** Where 1Click delivers (t-address: the payee's own or Sprout's shield forwarder). */
  oneClickRecipient: string;
  /** Final Zcash destination (equals oneClickRecipient unless shielded via the forwarder). */
  zcashAddress: string;
  shielded: boolean;
  forwarderRegistered?: boolean;
  correlationId?: string;
  quoteSignature?: string;
  quoteDeadline?: string;
  /** 1Click swapType used: EXACT_INPUT (single bridgeOut) or FLEX_INPUT (several bridgeOut chunks, summed). */
  swapType?: "EXACT_INPUT" | "FLEX_INPUT";
  /** 1Click minAmountIn (wei): FLEX_INPUT only processes once the deposits reach it. */
  minAmountIn?: string;
  /**
   * SproutPayouts.bridgeOut is capped at MAX_BRIDGE per call, while 1Click has a USD minimum per swap. One quote
   * can therefore be funded by several bridgeOut calls to the same deposit address (same quoteRef).
   */
  chunks?: BridgeChunk[];
  /** first chunk's tx (kept for /status and older records) */
  txHash?: `0x${string}`;
  status: BridgeStatus;
  statusDetail?: string;
  zcashTxHashes?: string[];
  refundedAmount?: string;
  /** wei that was planned but never sent (deadline) — stays in SproutPayouts.pendingBnb */
  abandonedWei?: string;
  createdAt: number;
  updatedAt: number;
}

export interface BridgeChunk {
  amount: string; // wei
  /** todo: not broadcast (or reverted) · pending: broadcast, receipt not seen · done: mined successfully ·
   *  abandoned: never sent because the 1Click deadline came first (the partial deposit is refunded) */
  state: "todo" | "pending" | "done" | "abandoned";
  tx?: `0x${string}`;
  broadcastAt?: number;
}

export interface VaultState {
  lastBridgeAt?: number;
  lastSettleAt?: number;
  lastFlushAt?: number;
  lastEpochAt?: number;
  failures?: number;
  nextTryAt?: number;
  lastError?: string;
}

export interface EpochRecord {
  vault: `0x${string}`;
  token: `0x${string}`;
  epoch?: number;
  root: `0x${string}`;
  total: string;
  holders: number;
  snapshotBlock: string;
  file: string;
  txHash?: `0x${string}`;
  createdAt: number;
}

export interface KeeperState {
  version: 2;
  vaults: Record<string, VaultState>;
  bridges: BridgeRecord[];
  epochs: EpochRecord[];
  roots: { lastBurnTx?: string; lastLiquidityTx?: string; lastBurnTryAt?: number; lastLiquidityTryAt?: number };
  /** Refunds 1Click returned to BRIDGE_REFUND_TO that must be re-credited by an operator (see README). */
  refundsOwed: { quoteRef: string; vault: string; amount: string; at: number }[];
}

const empty = (): KeeperState => ({ version: 2, vaults: {}, bridges: [], epochs: [], roots: {}, refundsOwed: [] });

export class StateStore {
  readonly dir: string;
  readonly file: string;
  state: KeeperState;
  private dirty = false;

  constructor(dir: string) {
    this.dir = resolve(dir);
    this.file = join(this.dir, "keeper-state.json");
    mkdirSync(this.dir, { recursive: true });
    mkdirSync(join(this.dir, "holders"), { recursive: true });
    mkdirSync(join(this.dir, "epochs"), { recursive: true });
    this.state = this.load();
  }

  private load(): KeeperState {
    if (!existsSync(this.file)) return empty();
    try {
      const raw = JSON.parse(stripBom(readFileSync(this.file, "utf8"))) as Partial<KeeperState>;
      return { ...empty(), ...raw, version: 2 } as KeeperState;
    } catch (e) {
      log.error("state file unreadable; starting fresh (old file kept as .corrupt)", { error: errMsg(e) });
      try {
        renameSync(this.file, this.file + ".corrupt-" + Date.now());
      } catch {
        /* ignore */
      }
      return empty();
    }
  }

  vault(addr: string): VaultState {
    const k = addr.toLowerCase();
    return (this.state.vaults[k] ??= {});
  }

  touch() {
    this.dirty = true;
  }

  save(force = false) {
    if (!this.dirty && !force) return;
    // keep the file small: drop terminal bridge records older than 60 days (keep last 500)
    const cutoff = Date.now() - 60 * 86_400_000;
    const terminal = new Set(["SUCCESS", "expired", "tx_failed"]);
    this.state.bridges = this.state.bridges
      .filter((b) => !(terminal.has(b.status) && b.updatedAt < cutoff))
      .slice(-500);
    this.state.epochs = this.state.epochs.slice(-1000);
    writeJsonAtomic(this.file, this.state);
    this.dirty = false;
  }

  holdersFile(token: string) {
    return join(this.dir, "holders", `${token.toLowerCase()}.json`);
  }

  epochFile(vault: string, epochKey: string) {
    return join(this.dir, "epochs", `${vault.toLowerCase()}-${epochKey}.json`);
  }
}

/** Hand-edited files (e.g. PowerShell Out-File) may carry a UTF-8 BOM. */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function writeJsonAtomic(path: string, data: unknown) {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  renameSync(tmp, path);
}

export function readJson<T>(path: string): T | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(stripBom(readFileSync(path, "utf8"))) as T;
  } catch {
    return undefined;
  }
}
