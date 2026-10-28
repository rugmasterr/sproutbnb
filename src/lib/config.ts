import { getAddress, isAddress, type Address } from 'viem';

/** Reads a NEXT_PUBLIC_* address env var, returning undefined when unset or malformed. */
function addr(value: string | undefined): Address | undefined {
  if (!value) return undefined;
  const v = value.trim();
  return isAddress(v) ? getAddress(v) : undefined;
}

export const CHAIN_ID: 56 | 97 = process.env.NEXT_PUBLIC_CHAIN_ID === '97' ? 97 : 56;
export const IS_TESTNET = CHAIN_ID === 97;

type ChainConsts = {
  portal: Address;
  vaultPortal: Address;
  taxTokenV3Impl: Address;
  guardian: Address;
  pancakeRouter: Address;
  wbnb: Address;
  /** Binance-Peg ZEC (BEP-20, 18 decimals). Undefined on testnet (mock set via env). */
  zec?: Address;
  explorer: string;
  defaultRpc: string;
  defaultLogsRpc: string;
  pancake: string;
};

const CHAINS: Record<56 | 97, ChainConsts> = {
  56: {
    portal: '0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0',
    vaultPortal: '0x90497450f2a706f1951b5bdda52B4E5d16f34C06',
    taxTokenV3Impl: '0x024f18294970B5c76c0691b87f138A0317156422',
    guardian: '0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b',
    pancakeRouter: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    wbnb: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    zec: '0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb',
    explorer: 'https://bscscan.com',
    defaultRpc: 'https://bsc-dataseed.bnbchain.org',
    // bsc-dataseed rejects eth_getLogs, so event scans use a node that serves them.
    defaultLogsRpc: 'https://bsc-rpc.publicnode.com',
    pancake: 'https://pancakeswap.finance',
  },
  97: {
    portal: '0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9',
    vaultPortal: '0x027e3704fC5C16522e9393d04C60A3ac5c0d775f',
    taxTokenV3Impl: '0xE6Ff967a887084c16D0fD71548CF709542cc1557',
    guardian: '0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950',
    pancakeRouter: '0xD99D1c33F9fC3444f8101754aBC46c52416550D1',
    wbnb: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    zec: undefined,
    explorer: 'https://testnet.bscscan.com',
    defaultRpc: 'https://bsc-testnet-dataseed.bnbchain.org',
    defaultLogsRpc: 'https://bsc-testnet-rpc.publicnode.com',
    pancake: 'https://pancakeswap.finance',
  },
};

export const chain = CHAINS[CHAIN_ID];

export const DEAD: Address = '0x000000000000000000000000000000000000dEaD';
export const ZERO: Address = '0x0000000000000000000000000000000000000000';

/** Sprout's own contracts — unknown until deployed. Undefined => honest pre-launch state. */
export const sprout = {
  factory: addr(process.env.NEXT_PUBLIC_SPROUT_FACTORY),
  roots: addr(process.env.NEXT_PUBLIC_SPROUT_ROOTS),
  payouts: addr(process.env.NEXT_PUBLIC_SPROUT_PAYOUTS),
  terminal: addr(process.env.NEXT_PUBLIC_SPROUT_TERMINAL),
  accountFactory: addr(process.env.NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY),
  token: addr(process.env.NEXT_PUBLIC_SPROUT_TOKEN),
  relayerUrl: (process.env.NEXT_PUBLIC_RELAYER_URL || '').trim() || undefined,
  forwarderTaddr: (process.env.NEXT_PUBLIC_FORWARDER_TADDR || '').trim() || undefined,
  startBlock: (() => {
    const n = Number(process.env.NEXT_PUBLIC_FACTORY_START_BLOCK);
    return Number.isFinite(n) && n > 0 ? BigInt(Math.floor(n)) : undefined;
  })(),
};

/** BEP-20 ZEC address: chain constant on mainnet, env override (mock) on testnet. */
export const ZEC_TOKEN: Address | undefined = addr(process.env.NEXT_PUBLIC_ZEC_TOKEN) ?? chain.zec;

export const IS_LIVE = Boolean(sprout.factory);
export const CAN_LAUNCH = Boolean(sprout.factory && sprout.roots);
export const TERMINAL_LIVE = Boolean(sprout.terminal);

/** Client-side RPC (wallet reads, quotes). Public endpoint by default. */
export const PUBLIC_RPC = process.env.NEXT_PUBLIC_BSC_RPC_URL || chain.defaultRpc;

export const IPFS_GATEWAY = 'https://flap.mypinata.cloud/ipfs/';
export const FLAP_UPLOAD_API = 'https://funcs.flap.sh/api/upload';
export const SITE_URL = 'https://sproutbnb.cash';

export const TOTAL_SUPPLY = 1_000_000_000; // every Flap token has a fixed 1B supply

/** Launch constants — SPEC "Launch call". */
export const LAUNCH = {
  taxBps: 200,
  taxDuration: 3_153_600_000n, // 100 years
  antiFarmerDuration: 86_400n,
  dexThresh: 1, // FOUR_FIFTHS
  migratorType: 1, // V2_MIGRATOR
  tokenVersion: 6, // TOKEN_TAXED_V3
  mktBps: 10_000,
  defaultMinShare: 100_000, // tokens
  minMinShare: 10_000,
};

/** Terminal fee: 1% on the BNB side (0.25% rootstock, 0.75% Sprout). */
export const TERMINAL_FEE_BPS = 100;

export const explorerTx = (h: string) => `${chain.explorer}/tx/${h}`;
export const explorerAddr = (a: string) => `${chain.explorer}/address/${a}`;
export const explorerToken = (a: string) => `${chain.explorer}/token/${a}`;
export const flapTokenUrl = (a: string) => `https://x.flap.sh/${a}` // URL format from Flap docs (parse-token-meta);
export const pancakeUrl = (a: string) =>
  `${chain.pancake}/swap?chain=${IS_TESTNET ? 'bscTestnet' : 'bsc'}&inputCurrency=BNB&outputCurrency=${a}`;

export const ipfsUrl = (cidOrUrl: string | null | undefined): string | null => {
  if (!cidOrUrl) return null;
  const s = cidOrUrl.trim();
  if (!s) return null;
  // Any gateway URL of the form …/ipfs/<cid>[/path] is served through Flap's (faster, pinned) gateway.
  const gw = s.match(/^https?:\/\/[^/]+\/ipfs\/([a-zA-Z0-9]{32,}(?:\/[^?#]*)?)/);
  if (gw) return IPFS_GATEWAY + gw[1];
  if (s.startsWith('https://')) return s;
  if (s.startsWith('ipfs://')) return IPFS_GATEWAY + s.slice(7).replace(/^ipfs\//, '');
  if (/^[a-zA-Z0-9]{32,}$/.test(s)) return IPFS_GATEWAY + s;
  return null;
};
