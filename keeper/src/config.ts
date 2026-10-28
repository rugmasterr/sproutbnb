import { formatEther, getAddress, isAddress, parseEther, type Address, type Hex } from "viem";
import { registerSecret } from "./log.js";

/**
 * Keeper configuration from the environment. Nothing here is required to *start*: when the essentials are
 * missing the keeper boots into an idle "not configured" mode and only serves /healthz and /status.
 */

export type HolderFallbackMode = "auto" | "on" | "off";

export interface Config {
  configured: boolean;
  missing: string[];
  problems: string[];

  chainId: number;
  rpcUrls: string[];
  factory?: Address;
  rootsOverride?: Address;
  payoutsOverride?: Address;
  privateKey?: Hex;
  keeperAddressOverride?: Address;
  dryRun: boolean;
  once: boolean;

  port: number;
  stateDir: string;
  loopIntervalMs: number;
  plantingsPage: number;

  slippageBps: number;
  sproutTaxBps: number;
  maxGasPriceWei?: bigint;
  gasWarnWei: bigint;
  gasReserveWei: bigint;

  flushMinWei: bigint;
  burnMinWei: bigint;
  liquidityMinWei: bigint;
  settleMinZec: bigint; // 18-dec BEP-20 ZEC units
  settleMaxWei: bigint;

  bridgeEnabled: boolean;
  bridgeMinZec: bigint; // 18-dec units (≈0.25 ZEC)
  bridgeDustZec: bigint; // 18-dec units (≈0.01 ZEC)
  bridgeDustAfterMs: number; // 7 days
  bridgeDeadlineMin: number;
  /** Largest single 1Click quote; funded by ceil(amount / MAX_BRIDGE) bridgeOut calls (FLEX_INPUT when > 1). */
  bridgeMaxQuoteWei: bigint;
  bridgeMaxShortfallBps: number;
  bridgeRefundTo?: Address;
  oneClickUrl: string;
  oneClickJwt?: string;
  oneClickReferral: string;
  oneClickSlippageBps: number;
  oneClickBnbAsset: string;
  oneClickZecAsset: string;

  forwarderUrl?: string;
  forwarderToken?: string;
  forwarderTaddr?: string;

  quoterV2?: Address;
  zecPoolFee: number;

  holderFallback: HolderFallbackMode;
  holderEpochMinZec: bigint;
  holderEpochIntervalMs: number;
  holderMinBalance?: bigint;
  holderLogChunk: number;
  holderMaxScanBlocksPerLoop: number;
}

const QUOTER_V2: Record<number, Address | undefined> = {
  56: "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997",
  97: undefined, // SPEC: "(verify)" — set QUOTER_V2 explicitly on testnet
};

function env(name: string, ...aliases: string[]): string | undefined {
  for (const n of [name, ...aliases]) {
    const v = process.env[n];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return undefined;
}

function bool(v: string | undefined, d: boolean): boolean {
  if (v === undefined) return d;
  return /^(1|true|yes|on)$/i.test(v);
}

function num(v: string | undefined, d: number, problems: string[], name: string): number {
  if (v === undefined) return d;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    problems.push(`${name} is not a valid non-negative number; using default ${d}`);
    return d;
  }
  return n;
}

function ether(v: string | undefined, d: string, problems: string[], name: string): bigint {
  try {
    return parseEther(v ?? d);
  } catch {
    problems.push(`${name} is not a valid decimal amount; using default ${d}`);
    return parseEther(d);
  }
}

function addr(v: string | undefined, name: string, problems: string[]): Address | undefined {
  if (!v) return undefined;
  if (!isAddress(v, { strict: false })) {
    problems.push(`${name} is not a valid address`);
    return undefined;
  }
  return getAddress(v);
}

export function loadConfig(): Config {
  const missing: string[] = [];
  const problems: string[] = [];

  const chainId = num(env("CHAIN_ID", "NEXT_PUBLIC_CHAIN_ID"), 56, problems, "CHAIN_ID");
  if (chainId !== 56 && chainId !== 97) problems.push(`CHAIN_ID ${chainId} is not BSC mainnet (56) or testnet (97)`);

  const rpcRaw = env("BSC_RPC_URL");
  const rpcUrls = (rpcRaw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const u of rpcUrls) registerSecret(u); // RPC URLs often embed API keys
  if (rpcUrls.length === 0) missing.push("BSC_RPC_URL");

  const factoryRaw = env("SPROUT_FACTORY", "NEXT_PUBLIC_SPROUT_FACTORY");
  const factory = addr(factoryRaw, "SPROUT_FACTORY", problems);
  if (!factoryRaw) missing.push("SPROUT_FACTORY");

  const dryRun = bool(env("DRY_RUN"), false);

  const pkRaw = env("KEEPER_PRIVATE_KEY");
  registerSecret(pkRaw);
  let privateKey: Hex | undefined;
  if (pkRaw) {
    const pk = (pkRaw.startsWith("0x") ? pkRaw : `0x${pkRaw}`) as Hex;
    if (/^0x[0-9a-fA-F]{64}$/.test(pk)) privateKey = pk;
    else problems.push("KEEPER_PRIVATE_KEY is malformed (expected 32-byte hex)");
  } else if (!dryRun) {
    missing.push("KEEPER_PRIVATE_KEY");
  }

  const oneClickJwt = env("ONECLICK_JWT");
  registerSecret(oneClickJwt);
  const forwarderToken = env("FORWARDER_TOKEN", "ZFORWARD_TOKEN");
  registerSecret(forwarderToken);

  const quoterV2 = addr(env("QUOTER_V2"), "QUOTER_V2", problems) ?? QUOTER_V2[chainId];

  const holderFallbackRaw = (env("HOLDER_FALLBACK") ?? "auto").toLowerCase();
  const holderFallback: HolderFallbackMode =
    holderFallbackRaw === "on" || holderFallbackRaw === "off" ? holderFallbackRaw : "auto";

  const holderMinRaw = env("HOLDER_MIN_BALANCE");
  let holderMinBalance: bigint | undefined;
  if (holderMinRaw) holderMinBalance = ether(holderMinRaw, "100000", problems, "HOLDER_MIN_BALANCE");

  const maxGasGwei = env("MAX_GAS_PRICE_GWEI");
  const maxGasPriceWei =
    maxGasGwei !== undefined ? BigInt(Math.round(num(maxGasGwei, 5, problems, "MAX_GAS_PRICE_GWEI") * 1e9)) : 5_000_000_000n;

  const fatal = problems.some((p) => /SPROUT_FACTORY|KEEPER_PRIVATE_KEY|CHAIN_ID/.test(p));

  const cfg: Config = {
    configured: missing.length === 0 && !fatal,
    missing,
    problems,
    chainId,
    rpcUrls,
    factory,
    rootsOverride: addr(env("SPROUT_ROOTS", "NEXT_PUBLIC_SPROUT_ROOTS"), "SPROUT_ROOTS", problems),
    payoutsOverride: addr(env("SPROUT_PAYOUTS", "NEXT_PUBLIC_SPROUT_PAYOUTS"), "SPROUT_PAYOUTS", problems),
    privateKey,
    keeperAddressOverride: addr(env("KEEPER_ADDRESS"), "KEEPER_ADDRESS", problems),
    dryRun,
    once: bool(env("RUN_ONCE"), false),

    port: num(env("PORT"), 8080, problems, "PORT"),
    stateDir: env("STATE_DIR") ?? "./state",
    loopIntervalMs: num(env("LOOP_INTERVAL_SEC"), 60, problems, "LOOP_INTERVAL_SEC") * 1000,
    plantingsPage: Math.max(1, Math.min(500, num(env("PLANTINGS_PAGE"), 100, problems, "PLANTINGS_PAGE"))),

    slippageBps: Math.min(5000, num(env("SLIPPAGE_BPS"), 100, problems, "SLIPPAGE_BPS")),
    sproutTaxBps: Math.min(5000, num(env("SPROUT_TAX_BPS"), 200, problems, "SPROUT_TAX_BPS")),
    maxGasPriceWei,
    gasWarnWei: ether(env("GAS_WARN_BNB"), "0.02", problems, "GAS_WARN_BNB"),
    gasReserveWei: ether(env("GAS_RESERVE_BNB"), "0.002", problems, "GAS_RESERVE_BNB"),

    flushMinWei: ether(env("FLUSH_MIN_BNB"), "0.002", problems, "FLUSH_MIN_BNB"),
    burnMinWei: ether(env("BURN_MIN_BNB"), "0.01", problems, "BURN_MIN_BNB"),
    liquidityMinWei: ether(env("LIQUIDITY_MIN_BNB"), "0.02", problems, "LIQUIDITY_MIN_BNB"),
    settleMinZec: ether(env("SETTLE_MIN_ZEC"), "0.005", problems, "SETTLE_MIN_ZEC"),
    settleMaxWei: ether(env("SETTLE_MAX_BNB"), "1", problems, "SETTLE_MAX_BNB"),

    bridgeEnabled: bool(env("BRIDGE_ENABLED"), chainId === 56),
    bridgeMinZec: ether(env("BRIDGE_MIN_ZEC"), "0.25", problems, "BRIDGE_MIN_ZEC"),
    bridgeDustZec: ether(env("BRIDGE_DUST_ZEC"), "0.01", problems, "BRIDGE_DUST_ZEC"),
    bridgeDustAfterMs: num(env("BRIDGE_DUST_AFTER_DAYS"), 7, problems, "BRIDGE_DUST_AFTER_DAYS") * 86_400_000,
    bridgeDeadlineMin: Math.max(20, num(env("BRIDGE_DEADLINE_MIN"), 60, problems, "BRIDGE_DEADLINE_MIN")),
    bridgeMaxQuoteWei: ether(env("BRIDGE_MAX_QUOTE_BNB"), "3", problems, "BRIDGE_MAX_QUOTE_BNB"),
    bridgeMaxShortfallBps: Math.min(5000, num(env("BRIDGE_MAX_SHORTFALL_BPS"), 1000, problems, "BRIDGE_MAX_SHORTFALL_BPS")),
    bridgeRefundTo: addr(env("BRIDGE_REFUND_TO"), "BRIDGE_REFUND_TO", problems),
    // ONECLICK_BASE is the name relayer/ and zforward/ use; ONECLICK_URL kept for compatibility
    oneClickUrl: (env("ONECLICK_BASE", "ONECLICK_URL") ?? "https://1click.chaindefuser.com/v0").replace(/\/+$/, ""),
    oneClickJwt,
    oneClickReferral: env("ONECLICK_REFERRAL") ?? "sprout",
    oneClickSlippageBps: num(env("ONECLICK_SLIPPAGE_BPS"), 100, problems, "ONECLICK_SLIPPAGE_BPS"),
    oneClickBnbAsset: env("ONECLICK_BNB_ASSET") ?? "nep245:v2_1.omni.hot.tg:56_11111111111111111111",
    oneClickZecAsset: env("ONECLICK_ZEC_ASSET") ?? "nep141:zec.omft.near",

    forwarderUrl: env("FORWARDER_URL", "ZFORWARD_URL")?.replace(/\/+$/, ""),
    forwarderToken,
    forwarderTaddr: env("FORWARDER_TADDR", "NEXT_PUBLIC_FORWARDER_TADDR"),

    quoterV2,
    zecPoolFee: num(env("ZEC_V3_FEE"), 2500, problems, "ZEC_V3_FEE"),

    holderFallback,
    holderEpochMinZec: ether(env("HOLDER_EPOCH_MIN_ZEC"), "0.05", problems, "HOLDER_EPOCH_MIN_ZEC"),
    holderEpochIntervalMs: num(env("HOLDER_EPOCH_INTERVAL_SEC"), 3600, problems, "HOLDER_EPOCH_INTERVAL_SEC") * 1000,
    holderMinBalance,
    holderLogChunk: Math.max(100, num(env("HOLDER_LOG_CHUNK"), 5000, problems, "HOLDER_LOG_CHUNK")),
    holderMaxScanBlocksPerLoop: Math.max(1000, num(env("HOLDER_MAX_SCAN_BLOCKS"), 200_000, problems, "HOLDER_MAX_SCAN_BLOCKS")),
  };
  return cfg;
}

/** Non-secret view of the config for /status. */
export function publicConfig(c: Config) {
  return {
    chainId: c.chainId,
    factory: c.factory ?? null,
    dryRun: c.dryRun,
    rpcCount: c.rpcUrls.length,
    loopIntervalSec: c.loopIntervalMs / 1000,
    slippageBps: c.slippageBps,
    sproutTaxBps: c.sproutTaxBps,
    thresholds: {
      flushMinBnb: formatEther(c.flushMinWei),
      burnMinBnb: formatEther(c.burnMinWei),
      liquidityMinBnb: formatEther(c.liquidityMinWei),
      settleMinZec: formatEther(c.settleMinZec),
      settleMaxBnb: formatEther(c.settleMaxWei),
      bridgeMinZec: formatEther(c.bridgeMinZec),
      bridgeDustZec: formatEther(c.bridgeDustZec),
      gasWarnBnb: formatEther(c.gasWarnWei),
      bridgeDustAfterDays: c.bridgeDustAfterMs / 86_400_000,
      bridgeMaxQuoteBnb: formatEther(c.bridgeMaxQuoteWei),
    },
    bridgeEnabled: c.bridgeEnabled,
    oneClickAuthenticated: Boolean(c.oneClickJwt),
    forwarderConfigured: Boolean(c.forwarderUrl),
    forwarderTaddr: c.forwarderTaddr ?? null,
    holderFallback: c.holderFallback,
    quoterV2: c.quoterV2 ?? null,
  };
}
