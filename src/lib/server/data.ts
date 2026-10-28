import { unstable_cache } from 'next/cache';
import { getAddress, parseEventLogs, type Abi, type AbiEvent, type Address, type Log } from 'viem';
import { chain, ipfsUrl, sprout, ZERO } from '../config';
import { portalAbi, TokenStatus } from '../abi/portal';
import { factoryAbi, payoutsAbi, rootsAbi, terminalAbi, vaultAbi } from '../abi/sprout';
import { erc20Abi, flapTokenAbi, pairAbi } from '../abi/erc20';
import { stageOf } from '../stage';
import type {
  Coin,
  LedgerEntry,
  LedgerKind,
  PayoutsTotals,
  RootsTotals,
  StatsResponse,
  TokenMeta,
  TokenState,
  Trade,
  VaultInfo,
} from '../types';
import { client, logsClient } from './clients';

const REVALIDATE = 20;
const E18 = 10n ** 18n;
const SUPPLY = 1_000_000_000n;
const s = (v: bigint) => v.toString();

function evt<const A extends Abi>(abi: A, name: string): AbiEvent {
  const e = abi.find((x) => x.type === 'event' && x.name === name);
  if (!e) throw new Error(`event ${name} missing`);
  return e as AbiEvent;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const res: T[][] = [];
  for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
  return res;
}

/* ------------------------------------------------------------------ */
/* Metadata (IPFS via the Flap-pinned gateway). CIDs are immutable.    */
/* ------------------------------------------------------------------ */

const metaMemo = new Map<string, TokenMeta | null>();

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 600) : null);
const safeHref = (v: unknown): string | null => {
  const x = str(v);
  if (!x) return null;
  if (/^https?:\/\//i.test(x)) return x;
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(x)) return `https://${x}`;
  return null;
};
const xHref = (v: unknown): string | null => {
  const x = str(v);
  if (!x) return null;
  if (/^https?:\/\//i.test(x)) return x;
  const h = x.replace(/^@/, '');
  return /^\w{1,30}$/.test(h) ? `https://x.com/${h}` : null;
};
const tgHref = (v: unknown): string | null => {
  const x = str(v);
  if (!x) return null;
  if (/^https?:\/\//i.test(x)) return x;
  const h = x.replace(/^@/, '');
  return /^\w{3,40}$/.test(h) ? `https://t.me/${h}` : null;
};

export async function fetchMeta(cid: string | null): Promise<TokenMeta | null> {
  if (!cid) return null;
  if (metaMemo.has(cid)) return metaMemo.get(cid) ?? null;
  const url = ipfsUrl(cid);
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    const meta: TokenMeta = {
      description: str(j.description),
      image: ipfsUrl(str(j.image)),
      website: safeHref(j.website),
      twitter: xHref(j.twitter),
      telegram: tgHref(j.telegram),
    };
    metaMemo.set(cid, meta);
    return meta;
  } catch {
    return null; // transient: try again next time
  }
}

/* ------------------------------------------------------------------ */
/* Token state                                                         */
/* ------------------------------------------------------------------ */

type RawState = {
  status: number;
  reserve: bigint;
  circulatingSupply: bigint;
  price: bigint;
  tokenVersion: number;
  buyTaxRate: bigint;
  sellTaxRate: bigint;
  pool: Address;
  progress: bigint;
  quoteTokenAddress: Address;
};

function toState(raw: RawState, dexPriceWei: bigint | null): TokenState {
  const priceWei = dexPriceWei ?? raw.price;
  const pool = raw.pool && raw.pool !== ZERO ? raw.pool : null;
  return {
    status: Number(raw.status),
    tokenVersion: Number(raw.tokenVersion),
    reserveWei: s(raw.reserve),
    circulatingSupplyWei: s(raw.circulatingSupply),
    priceWei: s(priceWei),
    mcapWei: s(priceWei * SUPPLY),
    progress: Math.max(0, Math.min(1, Number(raw.progress) / 1e18)),
    buyTaxBps: Number(raw.buyTaxRate),
    sellTaxBps: Number(raw.sellTaxRate),
    pool,
    quoteToken: raw.quoteTokenAddress,
    dexPriced: dexPriceWei !== null,
  };
}

/** Reads Portal state + ERC20 basics for many tokens with multicall. */
async function readTokens(tokens: Address[]) {
  if (tokens.length === 0) return [];
  const calls = tokens.flatMap((t) => [
    { address: chain.portal, abi: portalAbi, functionName: 'getTokenV8Safe', args: [t] } as const,
    { address: t, abi: erc20Abi, functionName: 'name' } as const,
    { address: t, abi: erc20Abi, functionName: 'symbol' } as const,
    { address: t, abi: flapTokenAbi, functionName: 'metaURI' } as const,
  ]);
  const res = await client.multicall({ contracts: calls, allowFailure: true });
  const base = tokens.map((t, i) => {
    const st = res[i * 4];
    const nm = res[i * 4 + 1];
    const sy = res[i * 4 + 2];
    const mu = res[i * 4 + 3];
    return {
      token: t,
      raw: st.status === 'success' ? (st.result as unknown as RawState) : null,
      name: nm.status === 'success' ? String(nm.result) : null,
      symbol: sy.status === 'success' ? String(sy.result) : null,
      metaCid: mu.status === 'success' ? String(mu.result) || null : null,
    };
  });

  // Graduated tokens: price from the PancakeSwap V2 pair reserves (quote = WBNB).
  const listed = base.filter((b) => b.raw && b.raw.pool && b.raw.pool !== ZERO && Number(b.raw.status) === TokenStatus.DEX);
  const dexPrice = new Map<string, bigint>();
  if (listed.length) {
    const pc = listed.flatMap((b) => [
      { address: b.raw!.pool, abi: pairAbi, functionName: 'token0' } as const,
      { address: b.raw!.pool, abi: pairAbi, functionName: 'getReserves' } as const,
    ]);
    const pr = await client.multicall({ contracts: pc, allowFailure: true });
    listed.forEach((b, i) => {
      const t0 = pr[i * 2];
      const rs = pr[i * 2 + 1];
      if (t0.status !== 'success' || rs.status !== 'success') return;
      const [r0, r1] = rs.result as readonly [bigint, bigint, number];
      const tokenIs0 = (t0.result as string).toLowerCase() === b.token.toLowerCase();
      const rt = tokenIs0 ? r0 : r1;
      const rq = tokenIs0 ? r1 : r0;
      if (rt > 0n) dexPrice.set(b.token.toLowerCase(), (rq * E18) / rt);
    });
  }

  return base.map((b) => ({
    ...b,
    state: b.raw ? toState(b.raw, dexPrice.get(b.token.toLowerCase()) ?? null) : null,
  }));
}

async function readVaults(vaults: Address[]): Promise<(VaultInfo | null)[]> {
  if (vaults.length === 0) return [];
  const fns = ['mode', 'payee', 'lpPot', 'rootPot', 'opsPot', 'payeePot', 'stats', 'zcashAddress', 'controller'] as const;
  const calls = vaults.flatMap((v) => [
    ...fns.map((fn) => ({ address: v, abi: vaultAbi, functionName: fn }) as const),
    ...(sprout.payouts
      ? [{ address: sprout.payouts, abi: payoutsAbi, functionName: 'pendingBnb', args: [v] } as const]
      : []),
  ]);
  const per = fns.length + (sprout.payouts ? 1 : 0);
  const res = await client.multicall({ contracts: calls, allowFailure: true });
  return vaults.map((v, i) => {
    const r = res.slice(i * per, (i + 1) * per);
    // Core fields must succeed; zcashAddress/controller/pendingBnb are optional.
    if (r.slice(0, 7).some((x) => x.status !== 'success')) return null;
    const ok = (k: number) => (r[k] && r[k].status === 'success' ? r[k].result : undefined);
    const mode = Number(ok(0));
    const payee = ok(1) as Address;
    const st = ok(6) as readonly [bigint, bigint, bigint, bigint, bigint, bigint];
    const za = ok(7) as string | undefined;
    const ctl = ok(8) as Address | undefined;
    const pend = sprout.payouts ? (ok(9) as bigint | undefined) : undefined;
    return {
      address: v,
      mode,
      payee: payee && payee !== ZERO ? payee : null,
      zcashAddress: za && za.trim() ? za.trim() : null,
      controller: ctl && ctl !== ZERO ? ctl : null,
      lpPotWei: s(ok(2) as bigint),
      rootPotWei: s(ok(3) as bigint),
      opsPotWei: s(ok(4) as bigint),
      payeePotWei: s(ok(5) as bigint),
      receivedWei: s(st[0]),
      toLiquidityWei: s(st[1]),
      toRootstockWei: s(st[2]),
      toOpsWei: s(st[3]),
      toPayeeWei: s(st[4]),
      pendingWei: s(st[5]),
      payoutsPendingWei: pend !== undefined ? s(pend) : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Factory registry → coins                                            */
/* ------------------------------------------------------------------ */

type Planting = { token: Address; vault: Address; creator: Address; mode: number; plantedAt: bigint };

async function readPlantings(): Promise<Planting[]> {
  if (!sprout.factory) return [];
  const len = Number(await client.readContract({ address: sprout.factory, abi: factoryAbi, functionName: 'plantingsLength' }));
  const PAGE = 200;
  const pages = Array.from({ length: Math.ceil(len / PAGE) }, (_, i) => i * PAGE);
  const slices = await mapLimit(pages, 4, (offset) =>
    client.readContract({
      address: sprout.factory!,
      abi: factoryAbi,
      functionName: 'getPlantings',
      args: [BigInt(offset), BigInt(PAGE)],
    }),
  );
  return slices.flat().map((p) => ({ ...p, mode: Number(p.mode) }));
}

async function buildCoins(): Promise<Coin[]> {
  const plantings = await readPlantings();
  if (plantings.length === 0) return [];
  const tokens = plantings.map((p) => p.token);
  const [toks, vaults] = await Promise.all([readTokens(tokens), readVaults(plantings.map((p) => p.vault))]);
  const metas = await mapLimit(toks, 8, (t) => fetchMeta(t.metaCid));
  const coins = plantings.map((p, i): Coin => {
    const t = toks[i];
    const v = vaults[i];
    return {
      address: getAddress(p.token),
      name: t.name ?? 'Unknown',
      symbol: t.symbol ?? '???',
      creator: p.creator,
      mode: p.mode,
      plantedAt: Number(p.plantedAt),
      stage: stageOf(t.state?.status, t.state?.progress),
      state: t.state,
      meta: metas[i],
      metaCid: t.metaCid,
      vault: v,
      vaultAddress: p.vault,
      feesWei: v ? v.receivedWei : '0',
    };
  });
  return coins.reverse(); // newest first
}

const cachedCoins = unstable_cache(buildCoins, ['sprout-coins-v2'], { revalidate: REVALIDATE });

export async function getCoins(): Promise<Coin[]> {
  if (!sprout.factory) return [];
  return cachedCoins();
}

/* ------------------------------------------------------------------ */
/* Single token (any Flap token — used by /coin and /terminal)         */
/* ------------------------------------------------------------------ */

async function buildToken(address: string) {
  const token = getAddress(address);
  const [t] = await readTokens([token]);
  const valid = Boolean(t.raw && Number(t.raw.status) !== TokenStatus.Invalid);
  let sproutInfo: {
    vault: VaultInfo | null;
    vaultAddress: string;
    mode: number;
    creator: string | null;
    plantedAt: number | null;
  } | null = null;
  if (valid && sprout.factory) {
    const vaultAddr = await client
      .readContract({ address: sprout.factory, abi: factoryAbi, functionName: 'vaultOf', args: [token] })
      .catch(() => ZERO);
    if (vaultAddr && vaultAddr !== ZERO) {
      const [vault] = await readVaults([vaultAddr]);
      const coin = (await getCoins().catch(() => [] as Coin[])).find((c) => c.address.toLowerCase() === token.toLowerCase());
      sproutInfo = {
        vault,
        vaultAddress: vaultAddr,
        mode: vault?.mode ?? coin?.mode ?? 0,
        creator: coin?.creator ?? null,
        plantedAt: coin?.plantedAt ?? null,
      };
    }
  }
  const meta = valid ? await fetchMeta(t.metaCid) : null;
  return {
    address: token,
    valid,
    name: t.name,
    symbol: t.symbol,
    state: t.state,
    meta,
    stage: valid && t.state ? stageOf(t.state.status, t.state.progress) : null,
    sprout: sproutInfo,
  };
}

export const getToken = (address: string) =>
  unstable_cache(() => buildToken(address), ['sprout-token-v2', address.toLowerCase()], { revalidate: 15 })();

/* ------------------------------------------------------------------ */
/* Trades — Portal TokenBought / TokenSold                              */
/* ------------------------------------------------------------------ */

const TRADE_WINDOW = BigInt(Number(process.env.SPROUT_TRADES_WINDOW) || 2400);
const TRADE_CHUNK = 800n;

/**
 * Portal trade events are not indexed and the Portal is busy, so scanning it blindly is wasteful.
 * Instead: find blocks where our tokens moved (Transfer logs are address-filterable, chunked over the
 * recent window), then fetch Portal logs only for those blocks and decode the trades.
 */
async function buildTrades(tokensKey: string, symbolsJson: string): Promise<{ trades: Trade[]; fromBlock: number; toBlock: number }> {
  const tokens = tokensKey.split(',').filter(Boolean) as Address[];
  const symbols = JSON.parse(symbolsJson) as Record<string, string>;
  const latest = await logsClient.getBlockNumber();
  const fromBlock = latest > TRADE_WINDOW ? latest - TRADE_WINDOW : 0n;
  const set = new Set(tokens.map((t) => t.toLowerCase()));

  const ranges: [bigint, bigint][] = [];
  for (let b = fromBlock; b <= latest; b += TRADE_CHUNK) {
    const e = b + TRADE_CHUNK - 1n;
    ranges.push([b, e > latest ? latest : e]);
  }
  const jobs = chunk(tokens, 50).flatMap((group) => ranges.map((r) => ({ group, r })));
  const transferLogs = (
    await mapLimit(jobs, 4, ({ group, r }) =>
      logsClient
        .getLogs({ address: group, event: evt(erc20Abi, 'Transfer'), fromBlock: r[0], toBlock: r[1] })
        .catch(() => [] as Log[]),
    )
  ).flat();

  const blocks = Array.from(new Set(transferLogs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null)))
    .sort((a, b) => (a > b ? -1 : 1))
    .slice(0, 30);

  const perBlock = await mapLimit(blocks, 5, (b) =>
    logsClient
      .getLogs({
        address: chain.portal,
        events: [evt(portalAbi, 'TokenBought'), evt(portalAbi, 'TokenSold')],
        fromBlock: b,
        toBlock: b,
      })
      .catch(() => [] as Log[]),
  );

  const trades: Trade[] = [];
  for (const logs of perBlock) {
    const parsed = parseEventLogs({ abi: portalAbi, logs: logs as Log[], strict: false });
    for (const ev of parsed) {
      if (ev.eventName !== 'TokenBought' && ev.eventName !== 'TokenSold') continue;
      const a = ev.args as Record<string, unknown>;
      const token = String(a.token ?? '');
      if (!set.has(token.toLowerCase())) continue;
      trades.push({
        tx: ev.transactionHash!,
        block: Number(ev.blockNumber),
        ts: Number((a.ts as bigint) ?? 0n),
        token: getAddress(token),
        symbol: symbols[token.toLowerCase()] ?? null,
        side: ev.eventName === 'TokenBought' ? 'buy' : 'sell',
        trader: String(ev.eventName === 'TokenBought' ? a.buyer : a.seller),
        amountWei: s((a.amount as bigint) ?? 0n),
        bnbWei: s((a.eth as bigint) ?? 0n),
      });
    }
  }
  trades.sort((x, y) => y.block - x.block || y.ts - x.ts);
  return { trades: trades.slice(0, 80), fromBlock: Number(fromBlock), toBlock: Number(latest) };
}

export async function getTrades(filterToken?: string) {
  let tokens: string[];
  const symbols: Record<string, string> = {};
  if (filterToken) {
    tokens = [getAddress(filterToken)];
  } else {
    const coins = await getCoins();
    tokens = coins.map((c) => c.address);
    coins.forEach((c) => (symbols[c.address.toLowerCase()] = c.symbol));
  }
  if (tokens.length === 0) return { trades: [] as Trade[], fromBlock: null, toBlock: null };
  const key = tokens.join(',');
  return unstable_cache(() => buildTrades(key, JSON.stringify(symbols)), ['sprout-trades-v2', key.slice(0, 2000)], {
    revalidate: 15,
  })();
}

/* ------------------------------------------------------------------ */
/* SproutRoots / SproutPayouts totals + stats                           */
/* ------------------------------------------------------------------ */

async function readRoots(): Promise<RootsTotals | null> {
  if (!sprout.roots) return null;
  const r = sprout.roots;
  const res = await client.multicall({
    allowFailure: true,
    contracts: [
      { address: r, abi: rootsAbi, functionName: 'totals' },
      { address: r, abi: rootsAbi, functionName: 'lpPot' },
      { address: r, abi: rootsAbi, functionName: 'rootPot' },
      { address: r, abi: rootsAbi, functionName: 'lastBurnAt' },
      { address: r, abi: rootsAbi, functionName: 'lastLiquidityAt' },
      { address: r, abi: rootsAbi, functionName: 'grovePair' },
    ],
  });
  if (res[0].status !== 'success') return null;
  const t = res[0].result as readonly [bigint, bigint, bigint, bigint, bigint];
  const g = (i: number) => (res[i].status === 'success' ? (res[i].result as bigint) : 0n);
  const pair = res[5].status === 'success' ? (res[5].result as Address) : ZERO;
  return {
    sproutBurnedWei: s(t[0]),
    bnbBurnSpentWei: s(t[1]),
    bnbToLiquidityWei: s(t[2]),
    zecToLiquidityZecWei: s(t[3]),
    lpBurnedWei: s(t[4]),
    lpPotWei: s(g(1)),
    rootPotWei: s(g(2)),
    lastBurnAt: Number(g(3)),
    lastLiquidityAt: Number(g(4)),
    grovePair: pair !== ZERO ? pair : null,
  };
}

async function readPayouts(): Promise<PayoutsTotals | null> {
  if (!sprout.payouts) return null;
  try {
    const t = await client.readContract({ address: sprout.payouts, abi: payoutsAbi, functionName: 'totals' });
    return {
      zecToPayeesZecWei: s(t[0]),
      zecToHoldersZecWei: s(t[1]),
      bnbBridgedToZcashWei: s(t[2]),
      bnbBridgedToFoundationWei: s(t[3]),
    };
  } catch {
    return null;
  }
}

const cachedRoots = unstable_cache(readRoots, ['sprout-roots-v2'], { revalidate: REVALIDATE });
const cachedPayouts = unstable_cache(readPayouts, ['sprout-payouts-v2'], { revalidate: REVALIDATE });

/** Zcash Foundation address as set on-chain by the admin (one-time). Null until set — never guessed. */
async function readZf(): Promise<string | null> {
  if (!sprout.payouts) return null;
  try {
    const a = await client.readContract({ address: sprout.payouts, abi: payoutsAbi, functionName: 'zcashFoundationAddress' });
    return a && a.trim() ? a.trim() : null;
  } catch {
    return null;
  }
}
export const getZcashFoundationAddress = unstable_cache(readZf, ['sprout-zf-v2'], { revalidate: 60 });

export type StatsBody = Omit<StatsResponse, 'configured' | 'ok' | 'error' | 'updatedAt'>;

export const emptyStats = (): StatsBody => ({
  coinsPlanted: 0,
  graduated: 0,
  totalRevenueWei: '0',
  estVolumeWei: '0',
  toLiquidityWei: '0',
  toRootstockWei: '0',
  toOpsWei: '0',
  toPayeeWei: '0',
  pendingWei: '0',
  roots: null,
  payouts: null,
  byMode: [0, 1, 2, 3, 4].map((mode) => ({ mode, coins: 0, feesWei: '0' })),
  topByFees: [],
});

export async function getStats(): Promise<StatsBody> {
  const [coins, roots, payouts] = await Promise.all([
    getCoins(),
    sprout.roots ? cachedRoots() : Promise.resolve(null),
    sprout.payouts ? cachedPayouts() : Promise.resolve(null),
  ]);
  const sum = (f: (c: Coin) => bigint) => coins.reduce((a, c) => a + f(c), 0n);
  const w = (c: Coin, k: keyof VaultInfo) => (c.vault ? BigInt((c.vault[k] as string | null) ?? '0') : 0n);
  const total = sum((c) => BigInt(c.feesWei));
  return {
    coinsPlanted: coins.length,
    graduated: coins.filter((c) => c.stage === 'grove').length,
    totalRevenueWei: s(total),
    // The vault receives the whole 2% tax remainder (vaultBps = 10000) → volume ≈ revenue / 0.02.
    // Estimate only: Flap's own protocol cut is ignored, so real volume is slightly higher.
    estVolumeWei: s(total * 50n),
    toLiquidityWei: s(sum((c) => w(c, 'toLiquidityWei'))),
    toRootstockWei: s(sum((c) => w(c, 'toRootstockWei'))),
    toOpsWei: s(sum((c) => w(c, 'toOpsWei'))),
    toPayeeWei: s(sum((c) => w(c, 'toPayeeWei'))),
    pendingWei: s(sum((c) => w(c, 'pendingWei'))),
    roots,
    payouts,
    byMode: [0, 1, 2, 3, 4].map((m) => {
      const cs = coins.filter((c) => c.mode === m);
      return { mode: m, coins: cs.length, feesWei: s(cs.reduce((a, c) => a + BigInt(c.feesWei), 0n)) };
    }),
    topByFees: [...coins]
      .sort((a, b) => (BigInt(b.feesWei) > BigInt(a.feesWei) ? 1 : -1))
      .slice(0, 10)
      .map((c) => ({
        address: c.address,
        name: c.name,
        symbol: c.symbol,
        image: c.meta?.image ?? null,
        feesWei: c.feesWei,
        mode: c.mode,
      })),
  };
}

/* ------------------------------------------------------------------ */
/* Nodes ledger — Roots, vaults, Payouts, Terminal events               */
/* ------------------------------------------------------------------ */

const LEDGER_WINDOW = BigInt(Number(process.env.SPROUT_LEDGER_WINDOW) || 200_000);
const LOG_CHUNK = BigInt(Number(process.env.SPROUT_LOG_CHUNK) || 40_000);

async function buildLedger(): Promise<{ entries: LedgerEntry[]; fromBlock: number; toBlock: number }> {
  const coins = await getCoins().catch(() => [] as Coin[]);
  const vaultToCoin = new Map(coins.map((c) => [c.vaultAddress.toLowerCase(), c]));
  const special = [sprout.roots, sprout.payouts, sprout.terminal].filter(Boolean) as Address[];
  const addresses = [...special, ...coins.map((c) => c.vaultAddress as Address)];
  const latest = await logsClient.getBlockNumber();
  let fromBlock = latest > LEDGER_WINDOW ? latest - LEDGER_WINDOW : 0n;
  if (sprout.startBlock && sprout.startBlock > fromBlock) fromBlock = sprout.startBlock;
  if (addresses.length === 0) return { entries: [], fromBlock: Number(fromBlock), toBlock: Number(latest) };

  const ranges: [bigint, bigint][] = [];
  for (let b = fromBlock; b <= latest; b += LOG_CHUNK) {
    const e = b + LOG_CHUNK - 1n;
    ranges.push([b, e > latest ? latest : e]);
  }
  const events = [
    evt(rootsAbi, 'Deposited'),
    evt(rootsAbi, 'BurnRun'),
    evt(rootsAbi, 'LiquidityRun'),
    evt(vaultAbi, 'Flushed'),
    evt(payoutsAbi, 'Settled'),
    evt(payoutsAbi, 'BridgedOut'),
    evt(terminalAbi, 'CashOut'),
  ];
  const jobs = chunk(addresses, 100).flatMap((group) => ranges.map((r) => ({ group, r })));
  const logs = (
    await mapLimit(jobs, 4, ({ group, r }) => logsClient.getLogs({ address: group, events, fromBlock: r[0], toBlock: r[1] }))
  ).flat() as Log[];

  const lc = (a?: string) => a?.toLowerCase();
  const rootsLc = lc(sprout.roots);
  const payoutsLc = lc(sprout.payouts);
  const termLc = lc(sprout.terminal);
  const parsed = parseEventLogs({ abi: [...rootsAbi, ...vaultAbi, ...payoutsAbi, ...terminalAbi], logs, strict: false });
  const entries: LedgerEntry[] = [];
  for (const ev of parsed) {
    const kind = ev.eventName as LedgerKind;
    const src = ev.address.toLowerCase();
    // Only accept each event from the contract that is supposed to emit it.
    const okSource =
      ((kind === 'Deposited' || kind === 'BurnRun' || kind === 'LiquidityRun') && src === rootsLc) ||
      (kind === 'Flushed' && vaultToCoin.has(src)) ||
      ((kind === 'Settled' || kind === 'BridgedOut') && src === payoutsLc) ||
      (kind === 'CashOut' && src === termLc);
    if (!okSource) continue;
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries((ev.args ?? {}) as Record<string, unknown>)) {
      if (typeof v === 'bigint' || typeof v === 'number') values[k] = v.toString();
      else if (typeof v === 'string') values[k] = v;
      else if (typeof v === 'boolean') values[k] = String(v);
    }
    let coin = vaultToCoin.get(src);
    if (!coin && values.vault) coin = vaultToCoin.get(values.vault.toLowerCase());
    entries.push({
      kind,
      tx: ev.transactionHash!,
      block: Number(ev.blockNumber),
      ts: null,
      source: getAddress(ev.address),
      token: coin?.address ?? null,
      symbol: coin?.symbol ?? null,
      values,
    });
  }
  entries.sort((a, b) => b.block - a.block);
  const top = entries.slice(0, 150);
  const uniq = Array.from(new Set(top.map((e) => e.block))).slice(0, 60);
  const times = new Map<number, number>();
  await mapLimit(uniq, 6, async (b) => {
    const blk = await client.getBlock({ blockNumber: BigInt(b) }).catch(() => null);
    if (blk) times.set(b, Number(blk.timestamp));
  });
  top.forEach((e) => (e.ts = times.get(e.block) ?? null));
  return { entries: top, fromBlock: Number(fromBlock), toBlock: Number(latest) };
}

const cachedLedger = unstable_cache(buildLedger, ['sprout-ledger-v2'], { revalidate: 30 });

export const LEDGER_CONFIGURED = Boolean(sprout.factory || sprout.roots || sprout.payouts || sprout.terminal);

export async function getLedger() {
  if (!LEDGER_CONFIGURED) return { entries: [] as LedgerEntry[], fromBlock: null, toBlock: null };
  return cachedLedger();
}

export const errMsg = (e: unknown) => {
  const m = e instanceof Error ? (e as Error & { shortMessage?: string }).shortMessage || e.message : String(e);
  return m.split('\n')[0].slice(0, 200);
};
