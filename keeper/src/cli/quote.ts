/**
 * Live *dry* 1Click quote: BNB on BSC → native ZEC on Zcash. No deposit address is generated, nothing moves.
 *   node dist/cli/quote.js <bnbAmount> <t-address> [refundTo 0x…]
 * Uses ONECLICK_URL / ONECLICK_JWT from env if set.
 */
import { parseEther } from "viem";
import { loadConfig } from "../config.js";
import { errMsg } from "../log.js";
import { OneClick } from "../oneclick.js";
import { classifyZcash } from "../zcash.js";

async function main() {
  const [amountArg, recipient, refundArg] = process.argv.slice(2);
  if (!amountArg || !recipient) {
    console.error("usage: node dist/cli/quote.js <bnbAmount> <zcash t-address> [refundTo]");
    process.exit(2);
  }
  if (classifyZcash(recipient) !== "transparent") {
    console.error("recipient must be a transparent Zcash address (t1…/t3…); shielded goes via the forwarder");
    process.exit(2);
  }
  const cfg = loadConfig();
  const oc = new OneClick(cfg);
  // 1Click rejects some addresses as refundTo (e.g. 0x…dEaD → "refundTo is not valid").
  const refundTo = refundArg ?? cfg.bridgeRefundTo ?? cfg.keeperAddressOverride;
  if (!refundTo) {
    console.error("pass a BSC refundTo address (3rd arg) or set BRIDGE_REFUND_TO / KEEPER_ADDRESS");
    process.exit(2);
  }
  const r = await oc.quoteBnbToZec({
    dry: true,
    amountWei: parseEther(amountArg),
    zcashRecipient: recipient,
    refundTo,
    deadline: new Date(Date.now() + 60 * 60_000),
    slippageBps: cfg.oneClickSlippageBps,
    originAsset: cfg.oneClickBnbAsset,
    destinationAsset: cfg.oneClickZecAsset,
  });
  console.log(
    JSON.stringify(
      {
        correlationId: r.correlationId,
        amountIn: r.quote.amountInFormatted + " BNB",
        amountInUsd: r.quote.amountInUsd,
        amountOut: r.quote.amountOutFormatted + " ZEC",
        amountOutZat: r.quote.amountOut,
        minAmountOutZat: r.quote.minAmountOut,
        amountOutUsd: r.quote.amountOutUsd,
        timeEstimateSec: r.quote.timeEstimate,
        withdrawFee: r.quote.withdrawFee,
        depositAddress: r.quote.depositAddress ?? "(none — dry quote)",
        authenticated: Boolean(cfg.oneClickJwt),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error("quote failed:", errMsg(e));
  process.exit(1);
});
