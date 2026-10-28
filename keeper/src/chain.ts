import {
  createPublicClient,
  createWalletClient,
  fallback,
  http,
  formatEther,
  type Abi,
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type WalletClient,
  type ContractFunctionName,
  type ContractFunctionArgs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";
import type { Config } from "./config.js";
import { errMsg, log } from "./log.js";

export interface Chainish {
  cfg: Config;
  chain: Chain;
  pub: PublicClient;
  wallet?: WalletClient;
  account?: Account;
  /** Address used as `from` for simulations (keeper account, KEEPER_ADDRESS, or zero). */
  from: Address;
}

export function makeChain(cfg: Config): Chainish {
  const chain = cfg.chainId === 97 ? bscTestnet : bsc;
  const transports = cfg.rpcUrls.map((u) => http(u, { timeout: 20_000, retryCount: 2, retryDelay: 500 }));
  const transport = transports.length === 1 ? transports[0]! : fallback(transports, { rank: false });
  const pub = createPublicClient({ chain, transport, batch: { multicall: { wait: 16 } } }) as PublicClient;
  let account: Account | undefined;
  let wallet: WalletClient | undefined;
  if (cfg.privateKey) {
    account = privateKeyToAccount(cfg.privateKey);
    wallet = createWalletClient({ chain, transport, account });
  }
  const from = (account?.address ?? cfg.keeperAddressOverride ?? "0x0000000000000000000000000000000000000000") as Address;
  return { cfg, chain, pub, wallet, account, from };
}

export interface TxResult {
  dryRun: boolean;
  hash?: Hex;
  ok: boolean;
  error?: string;
  gasUsed?: bigint;
  /** tx broadcast but receipt not seen within the timeout */
  unconfirmed?: boolean;
}

/**
 * Simulate first (catches reverts with decoded custom errors), then send unless DRY_RUN, then wait for the
 * receipt. Never throws for a revert; returns ok=false with the decoded reason.
 */
export async function sendTx<
  const abi extends Abi,
  fn extends ContractFunctionName<abi, "nonpayable" | "payable">,
>(
  c: Chainish,
  label: string,
  p: {
    address: Address;
    abi: abi;
    functionName: fn;
    args: ContractFunctionArgs<abi, "nonpayable" | "payable", fn>;
  },
  /** Called right after broadcast, before waiting for the receipt (persist the hash so a crash cannot lose it). */
  onBroadcast?: (hash: Hex) => void,
): Promise<TxResult> {
  const { pub, wallet, account, cfg } = c;
  try {
    if (!cfg.dryRun && wallet && account) {
      // Never queue new transactions behind one that is still in the mempool (stuck / receipt timed out):
      // they would all wait on its nonce. Report it and let the next loop retry.
      const [mined, pending] = await Promise.all([
        pub.getTransactionCount({ address: account.address, blockTag: "latest" }),
        pub.getTransactionCount({ address: account.address, blockTag: "pending" }),
      ]);
      if (pending > mined) {
        return {
          dryRun: false,
          ok: false,
          error: `keeper has ${pending - mined} unmined transaction(s) (nonce ${mined}); not sending ${label} until they clear`,
        };
      }
    }
    const sim = await pub.simulateContract({
      address: p.address,
      abi: p.abi as Abi,
      functionName: p.functionName as string,
      args: p.args as readonly unknown[],
      account: account ?? c.from,
    });
    if (cfg.dryRun || !wallet || !account) {
      log.info(`[dry-run] would send ${label}`, { to: p.address, fn: p.functionName, args: p.args as unknown });
      return { dryRun: true, ok: true };
    }
    if (cfg.maxGasPriceWei) {
      const gp = await pub.getGasPrice();
      if (gp > cfg.maxGasPriceWei) {
        return { dryRun: false, ok: false, error: `gas price ${gp} above MAX_GAS_PRICE_GWEI cap; skipped` };
      }
    }
    const hash = await wallet.writeContract({ ...(sim.request as Parameters<WalletClient["writeContract"]>[0]), account, chain: c.chain });
    log.info(`sent ${label}`, { hash });
    try {
      onBroadcast?.(hash);
    } catch (e) {
      log.error("onBroadcast hook failed", { error: errMsg(e) });
    }
    let rcpt;
    try {
      rcpt = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
    } catch (e) {
      // The tx is out; we just do not know its fate yet. Callers must treat this as "maybe sent".
      log.warn(`${label} receipt not available yet`, { hash, error: errMsg(e) });
      return { dryRun: false, ok: false, hash, unconfirmed: true, error: `receipt timeout: ${errMsg(e)}` };
    }
    if (rcpt.status !== "success") {
      log.error(`${label} reverted on-chain`, { hash });
      return { dryRun: false, ok: false, hash, error: "reverted", gasUsed: rcpt.gasUsed };
    }
    log.info(`${label} confirmed`, { hash, block: rcpt.blockNumber, gasUsed: rcpt.gasUsed });
    return { dryRun: false, ok: true, hash, gasUsed: rcpt.gasUsed };
  } catch (e) {
    return { dryRun: cfg.dryRun, ok: false, error: errMsg(e) };
  }
}

export async function keeperBalance(c: Chainish): Promise<bigint | undefined> {
  if (c.from === "0x0000000000000000000000000000000000000000") return undefined;
  return c.pub.getBalance({ address: c.from });
}

export function fmtBnb(wei: bigint): string {
  return `${formatEther(wei)} BNB`;
}
