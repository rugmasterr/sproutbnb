# Sprout keeper (春笋 · keeper)

The keeper is the always-on worker that turns Sprout's BNB tax revenue into **ZEC**. It runs on fly.io
(Node 20, viem) and does five things in a loop (default every 60 s):

| # | Job | Contract call | Notes |
|---|-----|---------------|-------|
| 1 | **Flush vaults** | `SproutVault.flush()` | every planting whose held BNB (`stats().pending`) ≥ `FLUSH_MIN_BNB`. This call is permissionless. |
| 2 | **Payouts in ZEC, modes 0/1/2** | `SproutPayouts.settle(vault, amount, minZecOut)` | BNB → Binance-Peg ZEC on the PancakeSwap V3 WBNB/ZEC 0.25% pool. `minZecOut` = QuoterV2 `quoteExactInputSingle` − `SLIPPAGE_BPS`. Mode 2 sends the ZEC to the coin's Flap dividend tracker, or to the fallback pool. |
| 3 | **Native ZEC on Zcash, modes 3/4** | 1Click quote → `SproutPayouts.bridgeOut(vault, amount, depositAddress, quoteRef)` | Bridges when the pot is worth ≈0.25 ZEC, or ≥0.01 ZEC and ≥7 days have passed (and 1Click's USD minimum is met). One quote covers up to `BRIDGE_MAX_QUOTE_BNB` (3) and is funded by as many `bridgeOut` calls as `MAX_BRIDGE` (1 BNB per call) requires. Shielded and unified recipients go through the shield forwarder. The keeper polls `/status` until 1Click reports `SUCCESS`, `REFUNDED` or `FAILED`. |
| 4 | **Holder rewards, mode 2** | `pushHolderPool` / `publishHolderEpoch` / `reclaimEpoch` | The keeper first retries the Flap dividend tracker. If it is unusable, the Sprout-run merkle distributor takes over (see below). |
| 5 | **Roots: Rootstock and The Grove** | `SproutRoots.burnRun` / `liquidityRun` | Both respect `MAX_DRAW` (0.5 BNB) and `MIN_INTERVAL` (300 s, checked against the block timestamp). `minSproutOut` = Flap `Portal.quoteExactInput` (simulated, because it is non-view) − `SPROUT_TAX_BPS` − `SLIPPAGE_BPS`. `minZecOut` comes from QuoterV2. |

Every write is **simulated first** and custom errors are decoded. With `DRY_RUN=true` the keeper only simulates
and uses dry 1Click quotes, which create no deposit address. Each target has its own exponential backoff, and the
loop itself backs off when the RPC fails.

## What happens when something is missing or wrong

* **No env (missing `BSC_RPC_URL` / `SPROUT_FACTORY` / `KEEPER_PRIVATE_KEY`)**: the keeper idles in *not configured*
  mode. `/healthz` still returns 200 and `/status` lists what is missing, so fly does not restart-loop the machine.
* **Wrong `SPROUT_FACTORY`** (an address with no code, or a contract that is not a SproutVaultFactory): the loop fails
  with a readable error, backs off up to 15 min, and the process keeps running.
* **Key is not `keeper()` on Roots/Payouts**: shown as a warning in `/status`. Simulations revert with `NotKeeper()`.
* **Gas**: a warning appears below `GAS_WARN_BNB` (0.02). Below `GAS_RESERVE_BNB` the keeper stops sending.
  `MAX_GAS_PRICE_GWEI` caps the gas price.
* **Secrets are never logged.** The private key, `ONECLICK_JWT`, `FORWARDER_TOKEN` and RPC URLs are redacted from all
  output, and errors are reduced to their short message.

## Zcash specifics

* 1Click assets: BSC native BNB `nep245:v2_1.omni.hot.tg:56_11111111111111111111` → Zcash ZEC `nep141:zec.omft.near`
  (8 decimals). `refundTo` is `BRIDGE_REFUND_TO`, or the keeper address if that is unset (1Click rejects `0x…dEaD`).
* **One quote, several `bridgeOut` calls.** `SproutPayouts.bridgeOut` is capped at `MAX_BRIDGE` (1 BNB) per call, but
  1Click currently needs ≥ $1,000 per swap. The keeper quotes `min(pending, BRIDGE_MAX_QUOTE_BNB)`:
  * ≤ 1 BNB: one `EXACT_INPUT` quote, one `bridgeOut`;
  * > 1 BNB: one `FLEX_INPUT` quote (1Click sums deposits to the same address and swaps once they reach `minAmountIn`,
    99% of `amountIn` at 1% slippage), funded by `n = ceil(amount / MAX_BRIDGE)` **equal** `bridgeOut` calls with the
    same deposit address and `quoteRef`. Equal chunks keep every partial sum ≤ (n−1)/n of the total, below
    `minAmountIn`, so 1Click never swaps a partial deposit; the keeper refuses plans where that could happen.
  * Chunks go out one at a time, each after the previous receipt. Each chunk's hash is saved at broadcast. After a
    crash or receipt timeout the next loop confirms the pending receipt first and then sends only what is left.
  * No chunk is sent within 10 minutes of the quote deadline. If that leaves a partial deposit, 1Click refunds it to
    `BRIDGE_REFUND_TO` (recorded in `refundsOwed`); the unsent part stays in `pendingBnb`.
  * Verified on a BSC fork against a mock of 1Click that enforces the $1,000 minimum and FLEX_INPUT accumulation
    (2 BNB → 2 × 1 BNB; crash-resume 1.6 BNB → 0.8 + 0.8). Live `FLEX_INPUT` dry quotes for BNB→ZEC succeed
    (1.5 BNB → `minAmountIn` 1.485 BNB). Multi-deposit accumulation on the **real** 1Click has not been exercised
    with money yet — do one small supervised run (≈$1,100, two chunks) before relying on it.
* **Address checks.** The contracts only check the address *format*. The keeper also verifies the checksum
  (Base58Check for t1/t3, Bech32 for zs1, Bech32m for u1) before bridging.
* **1Click pays transparent addresses only.** For zs1/u1 recipients the keeper:
  1. quotes 1Click to the **forwarder's t-address**;
  2. registers a shield request with the forwarder;
  3. calls `bridgeOut`;
  4. attaches each `bridgeOut` chunk's BSC tx hash.

  The forwarder then sends to the shielded or unified address with the stamp memo
  `sprout-stamp:v1:<payoutId>:<bsc tx>`.
* `quoteRef = keccak256("sprout-bridge:v1:<chainId>:<lowercase depositAddress>")`, so the forwarder can recompute
  it from `BridgedOut` events.
* Every quote is saved, including the 1Click signature, **before** any value moves (`STATE_DIR/keeper-state.json`).

### Forwarder interface the keeper expects (zforward/ must implement it)

```
GET  /v1/info                    → { "tAddress": "t1…" }        (or set FORWARDER_TADDR)
POST /v1/requests                ← { quoteRef, source:"keeper", vault, recipient, depositAddress, expectedZat, minZat, deadline, bnbChunks }
POST /v1/requests/{quoteRef}/tx  ← { bscTxHash }      (called once per bridgeOut chunk)
Authorization: Bearer $FORWARDER_TOKEN
```

The forwarder must check every request against the on-chain `BridgedOut(vault, mode, bnbIn, depositAddress,
quoteRef, zcashAddress)` event before paying out. One quote may be funded by `bnbChunks` `BridgedOut` events with the
same `quoteRef`; the forwarder sums them.

### Known limits (read before going live)

* **1Click minimum.** On 2026-10-27, 1Click rejected BNB→ZEC quotes with *"Temporary swap limits: minimum swap amount
  is $1,000"*; a 1.5 BNB quote (≈$1,116) succeeded. While that limit holds, the ≈0.25 ZEC / 0.01 ZEC thresholds are
  effectively ≈$1,000 (≈1.35 BNB): the keeper detects the error, lets the pot grow, retries hourly and shows the reason
  in `/status`. Once a vault holds ≥ $1,000 the chunked flow above delivers it despite `MAX_BRIDGE`.
* **Refunds.** If 1Click refunds a bridge, the BNB goes to `BRIDGE_REFUND_TO` and not back to SproutPayouts, which has
  no `receive()` and no re-credit function. The keeper records the refund in `refundsOwed` (shown in `/status`) and
  logs an error. An operator has to return the funds by hand.

## Holder rewards fallback distributor (mode 2)

`SproutPayouts.settle` tries the coin's Flap dividend contract with `deposit(uint256)`. If that is not usable, the ZEC is
kept in `holderPool[vault]`. On each loop the keeper then works through these steps:

1. If `usableDividend(vault) != 0`, it calls `pushHolderPool(vault, pool)`.
2. Otherwise (`HOLDER_FALLBACK=auto|on`), when `pool ≥ HOLDER_EPOCH_MIN_ZEC`, at least one hour has passed and a
   random-minute jitter allows it, the keeper:
   * replays the token's `Transfer` logs from planting time (incremental, stored under `STATE_DIR/holders/`);
   * spot-checks the top 5 balances against `balanceOf`;
   * selects holders at or above `minimumShareBalance` (default 100,000 tokens);
   * excludes contracts (pools, Portal) but keeps EIP-7702-delegated EOAs;
   * splits the pool pro-rata;
   * builds an OpenZeppelin `StandardMerkleTree(["address","uint256"])`. Its leaf is the same as `SproutPayouts.claim`.
   * calls `publishHolderEpoch(vault, root, total)`.
3. Epochs whose `EPOCH_RECLAIM_DELAY` (90 days) has passed are reclaimed back into the vault's pool.

Proofs are served at `GET /claims/<vault>/<account>` and return `{ epoch, amount, proof }[]`. A claimant, or anyone
on their behalf, calls `SproutPayouts.claim(vault, epoch, account, amount, proof)`.

## HTTP

* `GET /healthz`: liveness check for fly. 200 while the process is up (also when idle / not configured); 503 only
  when a running keeper has not finished a loop for 45 min (`stale`). Separately, a watchdog exits the process if
  one loop runs longer than `WATCHDOG_SEC` (1800), so fly restarts it.
* **Stuck transactions.** Before every send the keeper compares its `latest` and `pending` nonces; while any tx is
  unmined it sends nothing new (no pile-up behind a stuck nonce) and `/status` shows `keeper.unminedTxs`.
* `GET /status`: full status with no secrets. It covers config, contracts, keeper balance and gas warnings, Roots pots,
  Payouts totals, open and recent bridges, refunds owed, warnings and the last 100 actions.
* `GET /claims/<vault>/<account>`: merkle proofs from the fallback distributor.

## Run locally

```powershell
cd keeper
npm install
npm run typecheck
npm run build
npm run check-abi                                   # compares src/abi.ts with ../contracts/abi/*.json
$env:BSC_RPC_URL="https://bsc-rpc.publicnode.com"; $env:SPROUT_FACTORY="0x…"; $env:DRY_RUN="true"; $env:KEEPER_ADDRESS="0x…"
npm start                                           # http://localhost:8080/status
node dist/cli/quote.js 1.5 t1… 0x<refundTo>         # live *dry* 1Click quote BNB→ZEC (nothing moves)
```

All settings are listed in `.env.example`.

## Deploy to fly.io (only after the contracts exist on BSC)

**Do not deploy before `SproutVaultFactory`, `SproutRoots` and `SproutPayouts` are deployed and both of these hold:**

* `Payouts.keeper()` and `Roots.keeper()` equal the keeper address;
* `Payouts.setFactory` has been called.

```powershell
$fly = "C:\Users\Administrator\tools\fly\flyctl.exe"
cd keeper
& $fly launch --no-deploy --copy-config --name sprout-keeper --region hkg
& $fly volumes create keeper_state --size 1 --region hkg -a sprout-keeper
& $fly secrets set -a sprout-keeper DRY_RUN=true KEEPER_PRIVATE_KEY=0x… BSC_RPC_URL="https://…,https://…" SPROUT_FACTORY=0x…
# optional: ONECLICK_JWT=…  FORWARDER_URL=…  FORWARDER_TOKEN=…  FORWARDER_TADDR=t1…  BRIDGE_REFUND_TO=0x…
& $fly deploy -a sprout-keeper
# check https://sprout-keeper.fly.dev/status; once the dry run is clean:
& $fly secrets set -a sprout-keeper DRY_RUN=false
```

Fund the keeper with a little BNB for gas (warning below 0.02 BNB). Use a dedicated key. The keeper never holds user
funds, but it chooses the 1Click deposit address for bridges, so treat that key as sensitive.
