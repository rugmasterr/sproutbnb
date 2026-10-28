// JSON-safe shapes returned by /api/* (bigints are serialized as decimal wei strings).
// BNB amounts are `...Wei` (18 decimals) and are rendered in ZEC on the client via ZecAmount (live rate).
// BEP-20 ZEC amounts are `...ZecWei` (18 decimals) and are already ZEC.

export type Stage = 'seed' | 'shoot' | 'grove';

export type TokenMeta = {
  description: string | null;
  image: string | null; // resolved https URL
  website: string | null;
  twitter: string | null;
  telegram: string | null;
};

export type TokenState = {
  status: number; // TokenStatus enum
  tokenVersion: number;
  reserveWei: string;
  circulatingSupplyWei: string;
  priceWei: string; // BNB wei per 1 whole token
  mcapWei: string; // BNB wei for the 1B supply
  progress: number; // 0..1
  buyTaxBps: number;
  sellTaxBps: number;
  pool: string | null;
  quoteToken: string;
  dexPriced: boolean;
};

export type VaultInfo = {
  address: string;
  mode: number;
  payee: string | null;
  zcashAddress: string | null;
  controller: string | null;
  lpPotWei: string;
  rootPotWei: string;
  opsPotWei: string;
  payeePotWei: string;
  receivedWei: string;
  toLiquidityWei: string;
  toRootstockWei: string;
  toOpsWei: string;
  toPayeeWei: string;
  pendingWei: string;
  payoutsPendingWei: string | null; // SproutPayouts.pendingBnb(vault)
};

export type Coin = {
  address: string;
  name: string;
  symbol: string;
  creator: string;
  mode: number;
  plantedAt: number; // unix seconds
  stage: Stage;
  state: TokenState | null;
  meta: TokenMeta | null;
  metaCid: string | null;
  vault: VaultInfo | null;
  vaultAddress: string;
  feesWei: string; // vault revenue received (BNB wei)
};

type Base = { configured: boolean; ok: boolean; error?: string; updatedAt: number };

export type CoinsResponse = Base & { coins: Coin[] };

export type Trade = {
  tx: string;
  block: number;
  ts: number;
  token: string;
  symbol: string | null;
  side: 'buy' | 'sell';
  trader: string;
  amountWei: string; // token amount
  bnbWei: string;
};

export type TradesResponse = Base & { trades: Trade[]; fromBlock: number | null; toBlock: number | null };

export type RootsTotals = {
  sproutBurnedWei: string;
  bnbBurnSpentWei: string;
  bnbToLiquidityWei: string;
  zecToLiquidityZecWei: string;
  lpBurnedWei: string;
  lpPotWei: string;
  rootPotWei: string;
  lastBurnAt: number;
  lastLiquidityAt: number;
  grovePair: string | null;
};

export type PayoutsTotals = {
  zecToPayeesZecWei: string;
  zecToHoldersZecWei: string;
  bnbBridgedToZcashWei: string;
  bnbBridgedToFoundationWei: string;
};

export type ModeBreakdown = { mode: number; coins: number; feesWei: string };

export type StatsResponse = Base & {
  coinsPlanted: number;
  graduated: number;
  totalRevenueWei: string;
  estVolumeWei: string; // total vault revenue / 0.02
  toLiquidityWei: string;
  toRootstockWei: string;
  toOpsWei: string;
  toPayeeWei: string;
  pendingWei: string;
  roots: RootsTotals | null;
  payouts: PayoutsTotals | null;
  byMode: ModeBreakdown[];
  topByFees: { address: string; name: string; symbol: string; image: string | null; feesWei: string; mode: number }[];
};

export type LedgerKind =
  | 'Deposited'
  | 'BurnRun'
  | 'LiquidityRun'
  | 'Flushed'
  | 'Settled'
  | 'BridgedOut'
  | 'CashOut';

export type LedgerEntry = {
  kind: LedgerKind;
  tx: string;
  block: number;
  ts: number | null;
  source: string; // contract that emitted
  token: string | null;
  symbol: string | null;
  values: Record<string, string>; // wei strings / addresses / strings
};

export type LedgerResponse = Base & { entries: LedgerEntry[]; fromBlock: number | null; toBlock: number | null };

export type TokenResponse = {
  ok: boolean;
  error?: string;
  address: string;
  valid: boolean; // known to Flap Portal
  name: string | null;
  symbol: string | null;
  state: TokenState | null;
  meta: TokenMeta | null;
  stage: Stage | null;
  sprout: { vault: VaultInfo | null; vaultAddress: string; mode: number; creator: string | null; plantedAt: number | null } | null;
  updatedAt: number;
};

export type ConfigResponse = {
  chainId: number;
  live: boolean;
  canLaunch: boolean;
  terminalLive: boolean;
  zcashFoundationAddress: string | null; // read on-chain from SproutPayouts; null until set
  contracts: Record<string, string | null>;
  updatedAt: number;
};
