# Sprout (春笋) — core contracts

Foundry project for **Sprout**, the first Zcash-native launchpad & terminal on BNB Chain, built on Flap.
Every coin is a Flap **Tax Token V3** with a fixed 2.00% BNB tax, launched through Flap's
`VaultPortal.newTokenV6WithVault` with Sprout's vault factory. Everything the deployer earns is paid **in ZEC**.

Not affiliated with the Zcash Foundation, Electric Coin Co., Flap, Binance, BNB Chain, PancakeSwap or NEAR.
Nothing here is deployed yet, and none of it has been audited.

| Contract | Role |
|---|---|
| `SproutVaultFactory` | Flap vault factory (spec **v2.3**). One beacon-proxied `SproutVault` per coin, a registry (`getPlantings`, `vaultOf`, `isVault`), and launch validation. |
| `SproutVault` | Per-coin `VaultBaseV3` (native BNB). Splits tax revenue **25 / 25 / 10 / 40**. `flush()` is permissionless. |
| `SproutPayouts` | Shared. Turns each vault's 40% into ZEC: swaps on PancakeSwap V3 (modes 0/1/2) or bridges through NEAR Intents 1Click (modes 3/4). |
| `SproutRoots` | Shared. Rootstock 竹根 (buy & burn $SPROUT) and The Grove 竹林 (protocol-owned **$SPROUT/ZEC** PancakeSwap V2 liquidity, LP sent to dEaD). |
| `SproutTerminal` | Trades any Flap token through the Flap Portal for a 1% fee (0.25% → Roots, 0.75% → treasury). Can sell and cash out to Zcash in the same transaction. |

ABIs: `abi/{SproutVault,SproutVaultFactory,SproutRoots,SproutPayouts,SproutTerminal}.json`.
Chain addresses are picked by `block.chainid` (56 / 97) in `src/lib/SproutChain.sol`, the same way Flap's `VaultBase` does it.

## Money flow

```
trade on Flap ─ 2% tax ─► Flap TaxProcessor ─ dispatch() ─► SproutVault (mktBps = 10000)
                                   └─ integrator commission (commissionBps 300 observed) ─► SproutRoots (rootPot)

SproutVault.receive(): balance-delta, splits the new BNB
   25% lpPot    ─┐
   25% rootPot  ─┴─ flush() ─► SproutRoots.deposit(lp, root)
   10% opsPot   ─── flush() ─► factory.treasury()
   40% payeePot ─── flush() ─► SproutPayouts.deposit{value}(vault)
                                   ├─ mode 0 Me / 1 Wallet : settle()   BNB→ZEC (V3 0.25%) → payee (BEP-20 ZEC)
                                   ├─ mode 2 Holders       : settle()   BNB→ZEC → coin's Flap Dividend.deposit(uint256)
                                   ├─ mode 3 Zcash wallet  : bridgeOut() BNB → 1Click deposit addr → native ZEC
                                   └─ mode 4 Zcash Fdn.    : bridgeOut() same, to the foundation address (set once)
```

As a share of trading volume: 0.50% Grove · 0.50% Rootstock · 0.20% ops · 0.80% deployer's choice (in ZEC).
Flap takes its own protocol fees before the vault sees anything.

### vaultData

`abi.encode(uint8 mode, address payee, string zcashAddress)`

| mode | payee | zcashAddress | Launch params |
|---|---|---|---|
| 0 Me | ignored (set to creator) | ignored | `dividendToken = 0` |
| 1 Another wallet | required | ignored | `dividendToken = 0` |
| 2 Holders | must be 0 | ignored | **`dividendToken = ZEC`**, `dividendBps = 0` (tracker-only), `minimumShareBalance` e.g. 100,000e18 |
| 3 A Zcash wallet | must be 0 | required (`t1`/`t3`/`zs1`/`u1` format check) | `dividendToken = 0` |
| 4 Zcash Foundation | must be 0 | ignored | only after `payouts.setZcashFoundationAddress` |

`onBeforeLaunch` enforces: `TOKEN_TAXED_V3`, native quote, buy == sell == 200 bps, `mktBps == 10000`, `dividendBps == deflationBps == lpBps == 0`, and `dividendToken ∈ {0, ZEC}`.

## Verified on a BSC mainnet fork (2026-10-27)

- **Flap V3 Dividend ABI.** The live clone implementation `0xefbc2f91…61fa` has **no `deposit(address,uint256)`**
  (selector `0x47e7ef24` is absent). It does have **`deposit(uint256)`** (`0xb6b55f25`), which pulls `dividendToken()`
  from the caller with transferFrom and needs no permission. I checked this with a fork call from an unrelated EOA,
  which raised `totalDividendsDistributed()` by exactly the deposited amount. Other selectors present:
  `withdrawDividends()`, `withdrawableDividendOf(address)`, `distributeDividend(address[])`, `totalShares()`,
  `minimumShareBalance()`, `setShare`, `setDividendToken`, `emergencyWithdraw`; the owner is the Flap Portal.
- A coin launched with `dividendToken = ZEC` and `dividendBps = 0` gets a Dividend contract whose `dividendToken() == ZEC`.
  After `settle()`, holders see `withdrawableDividendOf > 0`, and `withdrawDividends()` pays them real BEP-20 ZEC
  (see `test_fork_mode2_holdersRewardedInZecViaFlapDividend`).
- **Holder-rewards decision.** The primary path is a ZEC deposit into the coin's own Flap Dividend contract (verified).
  The fallback distributor is *also* implemented: if the Dividend contract does not track ZEC, has no shares yet, or
  the deposit fails, the ZEC goes into `holderPool[vault]`. The keeper can then `pushHolderPool` once shares exist, or
  `publishHolderEpoch(vault, merkleRoot, total)` from a holder snapshot, after which holders `claim`. Unclaimed ZEC
  goes back to the same pool after 90 days, never to the owner or keeper.
- `liquidityRun` worked on a fork while the coin was still on the bonding curve. It created the $SPROUT/ZEC V2 pair and
  burned the LP. Integrator commission (`commissionBps = 300`) reached Roots on dispatch.

## Trust model

| Who | Can | Cannot |
|---|---|---|
| Factory `admin` | rotate `treasury`, hand over admin | touch vault funds, change splits, upgrade vaults |
| Flap **Guardian** | upgrade the vault beacon; rotate treasury; `setPayee` / `setZcashAddress` / `transferControl` on any vault; always keeper on Roots and Payouts | — (Flap's mandate: this access can't be revoked, and no function revokes it) |
| Payee (modes 0/1) | redirect future ZEC payouts (`setPayee` / `transferControl`) | anything else |
| Controller (mode 3, initially the creator) | change the Zcash address, hand over control | — |
| Roots/Payouts `owner` | set keeper; Roots `setSprout` once; Payouts `setFactory` once and `setZcashFoundationAddress` **once**; testnet-only mock ZEC once | withdraw BNB or tokens (no such function exists) |
| Keeper | choose timing and slippage bounds (`minZecOut` / `minSproutOut`, must be non-zero) for settle / burnRun / liquidityRun; choose the 1Click deposit address for `bridgeOut` | exceed caps (Roots: 0.5 BNB and 300 s per action; Payouts: 1 BNB per `bridgeOut`); send ZEC anywhere except the payee, the Dividend contract or merkle claimants |
| Anyone | `flush()`, `sync()`, `claim()` with a valid proof | — |

**Trusting the keeper with the 1Click deposit address.** `bridgeOut` sends BNB to whatever address the keeper got
from a 1Click quote. The contract can't check on-chain that this address really delivers ZEC to the vault's Zcash
address. A compromised keeper could misdirect up to `MAX_BRIDGE` (1 BNB) per call, limited only by the pending BNB of
mode-3/4 vaults. Every call emits `BridgedOut(vault, mode, bnb, depositAddress, quoteRef, zcashAddress)`, so anyone can
check each deposit address against 1Click `/v0/status`. Rotate the keeper with `setKeeper` if something looks wrong.
The same applies to `sellAndBridge` in the terminal, except that there the *user's own client* picks the deposit
address. `SproutTerminal.bridge(depositAddress, quoteRef)` (payable, no fee, added during integration) does the same for
BNB the caller already holds: it forwards `msg.value` and emits the same `CashOut` event. The site uses it for "Move
ZEC" sends and after coin-page Portal sales, so every cash-out — and in particular every shielded one, which zforward
only pays after finding the `CashOut` on-chain — can be proven.

**Other notes**
- Zcash addresses only get a format check (prefix, length, alphabet). The frontend and keeper must also verify the
  checksum. The 1Click Zcash leg is transparent-only, so shielded / unified destinations go through Sprout's forwarder.
- The Zcash Foundation address ships **unset**. Mode 4 stays unavailable until the owner sets a verified address.
  Never guess it.
- `addLiquidity` uses `amountMin = 0`, but `liquidityRun` first checks the Grove pair's reserve price against the
  price implied by the run's own two keeper-quoted buys and reverts with `GrovePriceOutOfRange` if they differ by more
  than `MAX_GROVE_DEVIATION_BPS` (5%). This stops a skewed or attacker-pre-created $SPROUT/ZEC pair from absorbing
  protocol liquidity at a bad ratio. The first deposit (no reserves yet) uses only this run's ZEC, so it prices the
  Grove exactly at the two buys. The router takes only the pool-ratio part: leftover ZEC stays in `zecReserve` and
  leftover $SPROUT is burned. Keeper: on `GrovePriceOutOfRange`, wait for arbitrage or use a smaller amount (while
  $SPROUT is early on the bonding curve, a run's own buy moves the curve price).
- SproutVault and SproutVaultFactory revert with literal bilingual strings (Flap UI rule 004), not custom errors. The
  Flap base contract's `OnlyVaultPortal` / `ZeroAddress` errors remain as Flap defines them.
- vaultData: modes 3 and 4 ignore `payee` (stored as 0); mode 2 rejects a non-zero payee; mode 0 always uses the creator.
- Terminal guard accepts only Flap status Tradable (1) or DEX (4). On a partial fill, the 1% fee is charged only on the
  BNB actually spent, and the rest is refunded.
- Tax-token effects are measured by balance deltas everywhere (Portal buys, pair transfers, terminal sells).
- `SproutTerminal` has no admin, holds nothing between transactions, and refuses stray BNB.

## Build & test

```powershell
# libraries (contracts/lib is git-ignored)
forge install foundry-rs/forge-std@v1.14.0 OpenZeppelin/openzeppelin-contracts@v4.9.6 `
  OpenZeppelin/openzeppelin-contracts-upgradeable@v4.9.6 --no-git

forge build
forge test -vv                                    # unit tests; fork suite is skipped

$env:BSC_RPC_URL = "https://bsc-rpc.publicnode.com"   # or https://bsc-dataseed.bnbchain.org
forge test --match-path "test/fork/*" -vv         # real Flap Portal / VaultPortal / TaxProcessor / Dividend / Pancake V3
```

The fork suite (`test/fork/SproutFork.t.sol`) does the following:
- finds a `…7777` salt by CREATE2 prediction (deployer = Portal, EIP-1167 clone of the Tax Token V3 impl);
- launches real coins through `VaultPortal.newTokenV6WithVault` with this factory;
- buys and sells on the curve, then calls `ITaxProcessor.dispatch()` and flushes;
- settles against the real WBNB/ZEC 0.25% V3 pool with a QuoterV2 bound, pays holders through the Flap Dividend contract,
  and bridges out;
- runs burnRun and liquidityRun on a real coin;
- trades through the terminal, on our coin and on a third-party Flap token.

Public RPCs only serve recent state, so a fork test that runs for a long time can hit "archive" errors. If that
happens, re-run it or switch RPC.

Regenerate ABIs: `forge inspect <Contract> abi --json > abi/<Contract>.json`.

## Deploy

```powershell
$env:SPROUT_OWNER="0x…"      # multisig: final owner of Roots + Payouts (also default factory admin)
$env:SPROUT_KEEPER="0x…"     # keeper EOA used by /keeper
$env:SPROUT_TREASURY="0x…"   # ops treasury
# $env:SPROUT_ADMIN="0x…"    # optional factory admin
# $env:SPROUT_ZEC="0x…"      # testnet only: mock ZEC
forge script script/Deploy.s.sol --rpc-url $env:BSC_RPC_URL --broadcast --account <keystore> --sender <addr>
```

`Deploy.s.sol` deploys Roots, Payouts, Factory and Terminal. It wires `payouts.setFactory(factory)` (plus mock ZEC on
testnet), then hands Roots and Payouts ownership to `SPROUT_OWNER`. It prints the `NEXT_PUBLIC_SPROUT_*` values.

Then launch **$SPROUT itself** as a Sprout coin (mode 1, payee = treasury, commission → Roots):

```powershell
$env:SPROUT_FACTORY="0x…"; $env:SPROUT_ROOTS="0x…"; $env:SPROUT_META="<CID from funcs.flap.sh/api/upload>"
forge script script/LaunchSprout.s.sol --rpc-url $env:BSC_RPC_URL --broadcast --account <keystore> --sender <addr>
cast send <roots> "setSprout(address)" <token> --account <owner>      # owner, once
```

Later, after verifying it from an official Zcash Foundation source, call
`payouts.setZcashFoundationAddress("<t-address>")` (owner, once) to enable mode 4.

## Layout

```
src/   SproutVault · SproutVaultFactory · SproutPayouts · SproutRoots · SproutTerminal
       lib/ SproutChain (addresses) · ZcashAddress (format check) · ZecSwap (BNB→ZEC V3)
       interfaces/ · flap/ (Flap interfaces & bases, unmodified)
test/  unit tests with mocks (chain 97) · fork/ BSC mainnet suite · Deploy.t.sol
script/ Deploy.s.sol · LaunchSprout.s.sol
abi/   exported ABIs
```
