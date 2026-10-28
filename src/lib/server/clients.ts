import { createPublicClient, fallback, http } from 'viem';
import { bsc, bscTestnet } from 'viem/chains';
import { CHAIN_ID, chain } from '../config';

const viemChain = CHAIN_ID === 97 ? bscTestnet : bsc;

export const RPC_URL = process.env.BSC_RPC_URL || chain.defaultRpc;
/** eth_getLogs-capable RPC (bsc-dataseed rejects getLogs). */
export const LOGS_RPC_URL = process.env.BSC_LOGS_RPC_URL || chain.defaultLogsRpc;

// Responses are cached by our own unstable_cache layer; never let Next's fetch cache keep RPC POSTs.
const fetchOptions: RequestInit = { cache: 'no-store' };

export const client = createPublicClient({
  chain: viemChain,
  transport: http(RPC_URL, { timeout: 10_000, retryCount: 1, fetchOptions }),
  batch: { multicall: { batchSize: 2048, wait: 0 } },
});

export const logsClient = createPublicClient({
  chain: viemChain,
  transport: fallback([
    http(LOGS_RPC_URL, { timeout: 15_000, retryCount: 1, fetchOptions }),
    ...(RPC_URL !== LOGS_RPC_URL ? [http(RPC_URL, { timeout: 15_000, retryCount: 0, fetchOptions })] : []),
  ]),
});
