import type { Address } from "viem";
import { portalAbi, quoterV2Abi, WBNB } from "./abi.js";
import type { Chainish } from "./chain.js";

/** amount * (10000 - bps) / 10000 */
export function minusBps(amount: bigint, bps: number): bigint {
  const b = BigInt(Math.max(0, Math.min(10_000, Math.floor(bps))));
  return (amount * (10_000n - b)) / 10_000n;
}

/**
 * BNB → Binance-Peg ZEC (18 dec) via PancakeSwap V3 QuoterV2.quoteExactInputSingle on the WBNB/ZEC 0.25% pool
 * — the exact route ZecSwap.bnbToZec uses on-chain. QuoterV2 is non-view (reverts internally), so simulate.
 */
export async function quoteBnbToZec(c: Chainish, zec: Address, amountWei: bigint): Promise<bigint> {
  if (!c.cfg.quoterV2) throw new Error("QuoterV2 address unknown for this chain (set QUOTER_V2)");
  const wbnb = WBNB[c.cfg.chainId];
  if (!wbnb) throw new Error("WBNB unknown for chain");
  const { result } = await c.pub.simulateContract({
    address: c.cfg.quoterV2,
    abi: quoterV2Abi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn: wbnb, tokenOut: zec, amountIn: amountWei, fee: c.cfg.zecPoolFee, sqrtPriceLimitX96: 0n }],
    account: c.from,
  });
  return result[0];
}

/**
 * BNB → $SPROUT through Flap Portal.quoteExactInput (bonding curve or DEX, same router as swapExactInput).
 * Non-view: eth_call via simulate.
 */
export async function quoteBnbToToken(c: Chainish, portal: Address, token: Address, amountWei: bigint): Promise<bigint> {
  const { result } = await c.pub.simulateContract({
    address: portal,
    abi: portalAbi,
    functionName: "quoteExactInput",
    args: [{ inputToken: "0x0000000000000000000000000000000000000000", outputToken: token, inputAmount: amountWei }],
    account: c.from,
  });
  return result;
}
