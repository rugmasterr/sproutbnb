# Sprout (春笋) — build spec v2 (Zcash-native)

Sprout is **the first Zcash-native launchpad & terminal on BNB Chain**, built on **Flap** (flap.sh). It is the BNB
counterpart of Sapling (sapling.cash — "the first zcash-native launchpad & terminal" on Solana). Same product and
mechanics; **Zcash is the point**: users fund from a Zcash wallet, trades are denominated in ZEC, rewards and payouts
are paid in ZEC, the shared liquidity is **$SPROUT/ZEC**, coins can pay a Zcash wallet or donate to the Zcash
Foundation, and sells cash out to a Zcash wallet (optionally shielded). Original bamboo branding — never copy
Sapling's logo, artwork or copy verbatim.

- Name **Sprout** · 中文 **春笋** (雨后春笋 = springing up like bamboo shoots after rain). Token **$SPROUT**.
- Domain (not yet connected): **sproutbnb.cash**.
- Headline EN: "Every market. One Zcash wallet. Now on BNB Chain." ZH: "一个 Zcash 钱包，畅玩 BNB 链每一个市场。"
- Tagline EN: "Launch, trade, cash out — in ZEC." ZH: "发射、交易、提现——全程 ZEC。"
- Secondary: "Plant a coin. Grow the grove." / "种下一枚币，长成一片竹林。"
- Bilingual everywhere: English / 简体中文 toggle (site and trailer).

Not affiliated with the Zcash Foundation, Electric Coin Co., Flap, Binance, BNB Chain, PancakeSwap or NEAR — say so in the footer.

## Verified facts (checked on-chain / via API on 2026-10-27)

- NEAR Intents **1Click API** (`https://1click.chaindefuser.com/v0`) supports native **ZEC on Zcash** (`nep141:zec.omft.near`, 8 decimals)
  ↔ **BNB on BSC** (`nep245:v2_1.omni.hot.tg:56_11111111111111111111`, 18 decimals), also USDT/USDC on BSC.
  **Zcash side is transparent-only** (t1/t3 addresses) — shielded delivery requires Sprout's own forwarder (see "Shield forwarder").
  Unauthenticated requests work but add 0.25%; optional partner JWT via env `ONECLICK_JWT` (header `X-API-Key`).
  Docs downloaded to `SCRATCH\neardocs\` (incl. full `openapi.yaml`).
- **Binance-Peg ZEC (BEP-20)** on BSC: `0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb`, 18 decimals. Liquidity: PancakeSwap **V3 ZEC/WBNB 0.25% pool** `0xbd0dbC5830d49ee8B3F068BFf495E891E015FD7C` (~158 ZEC), V3 1% pool `0x07e17913808cA2983b10181E589D800218D57cc7`; V2 ZEC/WBNB pair is tiny (do not route through V2).
  1Click does **not** list BEP-20 ZEC, so bridging to/from Zcash goes through **BNB** on BSC.
- Flap SwapRegistry says native→ZEC "insufficient liquidity" ⇒ Flap's *automatic* dividend cannot be ZEC. Use **tracker-only** dividend
  mode (`dividendBps=0`, `dividendToken=ZEC`) and push ZEC rewards ourselves (`dividend.deposit(token, amount)` per Flap docs —
  the exact ABI must be verified against a live Flap V3 token's dividend contract on a fork; if it can't be verified, fall back to a
  Sprout-run snapshot distributor like Sapling's: pot ≥ ~$25, ≥1h since last run, random minute, holders ≥ $20 pro-rata).
- BSC supports the **RIP-7212 P256VERIFY precompile at 0x100** (verified with the RIP test vector) ⇒ passkey accounts are cheap.
- **Zcash Foundation donation address: NOT verified.** The "Zcash Foundation" option ships disabled; the address is set later by the
  admin via `setZcashFoundationAddress` (one-time) and the UI only enables the option once set. Never hard-code a guessed address.

## Mechanics

Every coin is a real **Flap Tax Token V3** launched via Flap `VaultPortal.newTokenV6WithVault` with **Sprout's vault factory**,
quoted in BNB on Flap's bonding curve, graduating to PancakeSwap (V2 migrator). Fixed **2.00% buy/sell tax**. Flap takes its own
protocol fees (1% on the bonding curve; up to 0.3% tax-token protocol rate). Sprout adds no launch fee.

The 2.00% tax (BNB) is split by the coin's SproutVault — same split as Sapling:

| Share | EN / ZH | Destination |
|---|---|---|
| 0.50% | Liquidity / 流动性 — **The Grove 竹林** | Shared protocol-owned **$SPROUT/ZEC** PancakeSwap V2 pool; LP burned (0x…dEaD). Backs no individual coin. |
| 0.50% | Rootstock / 竹根 | Buys $SPROUT and burns it. |
| 0.20% | Sprout / 运营 | Operator treasury (keeper, relayer, indexer). |
| 0.80% | Deployer's choice / 部署者自选 — **paid in ZEC** | `mode` 0 **Me** (deployer) · 1 **Another wallet** · 2 **Holders** (ZEC rewards) · 3 **A Zcash wallet** (native ZEC to a t- or shielded/unified address; per zforward/README, since NU6.3 new shielded outputs for an Orchard-receiver u1 land in the Ironwood pool) · 4 **Zcash Foundation** (permanent donation, memo names the coin). |

Payouts in ZEC: modes 0/1 receive **BEP-20 ZEC** on BSC (or the payee may register a Zcash address to receive native ZEC instead —
optional, stretch). Mode 2 pays BEP-20 ZEC to holders. Modes 3/4 deliver **native ZEC on Zcash**: the payout pot (BNB) is bridged via
1Click when it reaches ≈0.25 ZEC, or after 7 days from ≈0.01 ZEC; each delivery costs ~1Click fee; the current payee can redirect
(handing over control); mode 4 is permanent. Integrator commission (Flap, ~3% of tax remainder at 2%) → SproutRoots rootstock.

Stages: **Seed 笋芽** (curve progress < 2%), **Shoot 春笋** (on the curve), **Grove 竹林** (graduated to PancakeSwap).
"About to graduate" = progress ≥ 70%. Sapling→Sprout names: Orchard→Grove 竹林, Rings→**Nodes 竹节** (public ledger),
Rootstock→Rootstock 竹根, Stamps→**Stamps 印章** (receipts in shielded memos), Move ZEC→**Move ZEC** (/zec).

## User model — "One Zcash wallet"

Two ways in:
1. **Zcash wallet (primary)** — user pastes their Zcash address (t-address for refunds; optional unified/shielded address for payouts)
   and creates a **Sprout Account**: a passkey-controlled smart account on BSC (WebAuthn P-256 verified by the 0x100 precompile),
   counterfactual CREATE2 address derived from the passkey public key. "Your passkey is the only key to your Sprout account."
   - **Bring ZEC in**: site requests a 1Click quote ZEC(Zcash) → BNB(BSC), recipient = Sprout Account, refundTo = user's t-address,
     shows a one-time deposit address + exact amount + deadline (~80 min before refunds start) + QR. Status polled via 1Click.
     Usually ~10 min. The account then holds BNB; the UI denominates everything in ZEC at live rate.
   - **Trade / launch**: the passkey signs; Sprout's **relayer** (fly.io) submits the transaction and is reimbursed in-tx from the
     account's BNB (gas only, no markup). Account does `executeBatch(calls)` → Flap Portal / VaultPortal / SproutTerminal.
   - **Cash out**: "Receive as native ZEC on Zcash" — sell → BNB → 1Click deposit on BSC (BNB→ZEC, recipient user's t-address)
     in the **same transaction** as the sale (only sent if the trade succeeds). "Shielded" option → recipient = Sprout shield
     forwarder's t-address with a payout record; the forwarder sends to the user's shielded/unified address with a **stamp** in the memo.
     Limits for shielded: ≤100 ZEC per payout, ≤1000 ZEC and ≤2000 payouts per day across Sprout.
2. **BNB wallet** — MetaMask / Binance Wallet / OKX / TokenPocket (injected). Same features, BNB in/out, plus "Move ZEC" bridging.

Privacy honesty: bridged/BEP-20 ZEC and everything on BSC is public. Only the shielded payout leg is private. Refund addresses are transparent.

## Chain constants (BSC 56 / testnet 97)

| Name | Mainnet | Testnet |
|---|---|---|
| Flap Portal | 0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0 | 0x5bEacaF7ABCbB3aB280e80D007FD31fcE26510e9 |
| Flap VaultPortal | 0x90497450f2a706f1951b5bdda52B4E5d16f34C06 | 0x027e3704fC5C16522e9393d04C60A3ac5c0d775f |
| Tax Token V3 impl (salt base, vanity `7777`) | 0x024f18294970B5c76c0691b87f138A0317156422 | 0xE6Ff967a887084c16D0fD71548CF709542cc1557 |
| Flap Guardian | 0x9e27098dcD8844bcc6287a557E0b4D09C86B8a4b | 0x76Fa8C526f8Bc27ba6958B76DeEf92a0dbE46950 |
| PancakeSwap V2 router / factory | 0x10ED43C718714eb63d5aA57B78B54704E256024E / 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73 | 0xD99D1c33F9fC3444f8101754aBC46c52416550D1 |
| PancakeSwap V3 SwapRouter / QuoterV2 / factory | 0x1b81D678ffb9C0263b24A97847620C99d213eB14 / 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997 / 0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865 | (verify) |
| WBNB | 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c | 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd |
| Binance-Peg ZEC | 0x1Ba42e5193dfA8B03D15dd1B86a3113bbBEF8Eeb | n/a (use a mock on testnet) |
| P256 precompile | 0x0000000000000000000000000000000000000100 | (verify) |
| Dead | 0x000000000000000000000000000000000000dEaD | |

Flap metadata upload: `https://funcs.flap.sh/api/upload` (GraphQL multipart `create(file, meta)` → CID). Salt: CREATE2 vanity
(deployer = Portal, EIP-1167 clone bytecode of Tax Token V3 impl), address must end with `7777`.

Sprout's own contracts are **not deployed yet**. Everything reads addresses from env and renders an honest pre-launch state when unset:
`NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_SPROUT_FACTORY`, `NEXT_PUBLIC_SPROUT_ROOTS`, `NEXT_PUBLIC_SPROUT_PAYOUTS`,
`NEXT_PUBLIC_SPROUT_TERMINAL`, `NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY`, `NEXT_PUBLIC_SPROUT_TOKEN`, `NEXT_PUBLIC_RELAYER_URL`,
`NEXT_PUBLIC_FORWARDER_TADDR`, `BSC_RPC_URL`, `ONECLICK_JWT` (server, optional). Optional extras and every service's
variables are documented in `.env.example`, `keeper/.env.example`, `relayer/.env.example`, `zforward/.env.example`.

Reference material: Flap docs `SCRATCH\flapdocs\`, NEAR Intents docs `SCRATCH\neardocs\`, Flap example repo `C:\fx`,
Flap interfaces already in `contracts/src/flap/`. SCRATCH = `C:\Users\ADMINI~1\AppData\Local\Temp\2\claude\C--Users-Administrator-Desktop-projects-sproutbnb\7caebb61-d440-4f47-857c-3e824b48de64\scratchpad`.

## Contract interface (authoritative — all other components code against exactly this)

```solidity
// ---------- SproutVaultFactory (VaultFactoryBaseV2, factorySpecVersion "v2.3") ----------
struct Planting { address token; address vault; address creator; uint8 mode; uint64 plantedAt; }
constructor(address admin, address roots, address payouts, address treasury);
function newVault(address taxToken, address quoteToken, address creator, bytes calldata vaultData) external returns (address); // VaultPortal only
// vaultData = abi.encode(uint8 mode, address payee, string zcashAddress)
//   mode 0 ME: payee := creator; 1 WALLET: payee != 0; 2 HOLDERS: payee 0; 3 ZCASH_WALLET: zcashAddress required (t1/t3/zs/u1 prefix, len checks);
//   4 ZCASH_FOUNDATION: requires payouts.zcashFoundationAddress() set, zcashAddress ignored.
function isQuoteTokenSupported(address quoteToken) external view returns (bool); // only address(0)
function plantingsLength() external view returns (uint256);
function getPlantings(uint256 offset, uint256 limit) external view returns (Planting[] memory);
function vaultOf(address token) external view returns (address);
function roots() external view returns (address);
function payouts() external view returns (address);
function treasury() external view returns (address);
function admin() external view returns (address);
function beacon() external view returns (address);
function setTreasury(address) external;  // admin or Guardian
function setAdmin(address) external;     // admin
function upgradeVaultImplementation(address) external; // Guardian only
event Planted(address indexed token, address indexed vault, address indexed creator, uint8 mode, address payee, string zcashAddress);
// _validateBeforeLaunch: TOKEN_TAXED_V3, quote native, buy==sell==200, vaultBps==10000, dividendBps==0, deflationBps==0, lpBps==0,
// dividendToken ∈ {address(0), ZEC}. (Holders mode launches with dividendToken = ZEC, tracker-only.)

// ---------- SproutVault (VaultBaseV3 native-only, beacon proxy, Initializable, ReentrancyGuard) ----------
function taxToken() external view returns (address);
function factory() external view returns (address);
function mode() external view returns (uint8);
function payee() external view returns (address);            // modes 0/1
function zcashAddress() external view returns (string memory); // mode 3 (and 4 mirrors foundation address)
function lpPot() external view returns (uint256);
function rootPot() external view returns (uint256);
function opsPot() external view returns (uint256);
function payeePot() external view returns (uint256);
function stats() external view returns (uint256 received, uint256 toLiquidity, uint256 toRootstock, uint256 toOps, uint256 toPayee, uint256 pending);
function sync() external;
function flush() external;  // permissionless: lp+root → SproutRoots.deposit, ops → treasury, payee BNB → SproutPayouts.deposit{value}(address(this))
function setPayee(address newPayee) external;             // mode 0/1: current payee or Guardian
function setZcashAddress(string calldata addr) external;  // mode 3: current controller (creator / last setter) or Guardian
function controller() external view returns (address);    // who may redirect (mode 3: creator, transferable)
function transferControl(address to) external;
receive() external payable;  // lightweight, balance-delta, split 25/25/10/40
event Revenue(uint256 amount);
event Flushed(uint256 toLiquidity, uint256 toRootstock, uint256 toOps, uint256 toPayee);
event PayeeChanged(address indexed previousPayee, address indexed newPayee);
event ZcashAddressChanged(string previous, string next);

// ---------- SproutPayouts (single shared contract; owner + keeper; Guardian always keeper) ----------
constructor(address owner, address keeper);
function deposit(address vault) external payable;   // vaults only (factory-registered); credits pending BNB for that vault
function pendingBnb(address vault) external view returns (uint256);
function zcashFoundationAddress() external view returns (string memory);
function setZcashFoundationAddress(string calldata addr) external; // owner, ONCE
// modes 0/1/2: keeper converts BNB→BEP-20 ZEC on PancakeSwap V3 (WBNB/ZEC 0.25% pool) with minZecOut, then
//   mode 0/1: transfer ZEC to payee; mode 2: deposit ZEC into the token's Flap dividend contract (tracker-only) — or the fallback distributor.
function settle(address vault, uint256 bnbAmount, uint256 minZecOut) external; // keeper/Guardian
// modes 3/4: keeper bridges BNB to Zcash via a 1Click quote: sends BNB to the 1Click deposit address on BSC.
function bridgeOut(address vault, uint256 bnbAmount, address oneClickDepositAddress, bytes32 quoteRef) external; // keeper/Guardian; cap MAX_BRIDGE (1 BNB) per call
function MAX_BRIDGE() external view returns (uint256);
function totals() external view returns (uint256 zecToPayees, uint256 zecToHolders, uint256 bnbBridgedToZcash, uint256 bnbBridgedToFoundation);
event Settled(address indexed vault, uint8 mode, uint256 bnbIn, uint256 zecOut, address to);
event BridgedOut(address indexed vault, uint8 mode, uint256 bnbIn, address depositAddress, bytes32 quoteRef, string zcashAddress);

// ---------- SproutRoots (shared liquidity + buy&burn; owner + keeper; Guardian always keeper) ----------
constructor(address owner, address keeper);
function sprout() external view returns (address);
function setSprout(address token) external;     // owner, once
function setKeeper(address keeper) external;    // owner
function deposit(uint256 lpAmount, uint256 rootAmount) external payable;
receive() external payable;                     // → rootPot (Flap commission, terminal fee share, dust refunds)
function lpPot() external view returns (uint256);
function rootPot() external view returns (uint256);
function MAX_DRAW() external view returns (uint256);      // 0.5 ether (BNB)
function MIN_INTERVAL() external view returns (uint256);  // 300
function lastBurnAt() external view returns (uint256);
function lastLiquidityAt() external view returns (uint256);
function burnRun(uint256 amount, uint256 minSproutOut) external; // buy $SPROUT via Flap Portal.swapExactInput → dEaD
function liquidityRun(uint256 amount, uint256 minZecOut, uint256 minSproutOut) external;
//   half BNB → ZEC (Pancake V3), half → $SPROUT (Flap Portal), addLiquidity($SPROUT, ZEC) on Pancake V2, LP → dEaD. Atomic.
function grovePair() external view returns (address);  // $SPROUT/ZEC V2 pair (0 until first run)
function totals() external view returns (uint256 sproutBurned, uint256 bnbBurnSpent, uint256 bnbToLiquidity, uint256 zecToLiquidity, uint256 lpBurned);
event Deposited(address indexed from, uint256 lpAmount, uint256 rootAmount);
event BurnRun(uint256 bnbIn, uint256 sproutBurned);
event LiquidityRun(uint256 bnbIn, uint256 zecIn, uint256 sproutIn, uint256 lpBurned);

// ---------- SproutTerminal (trade any Flap token, 1% fee on the BNB side: 0.25% → Roots rootstock, 0.75% → treasury) ----------
constructor(address roots, address treasury);
function buy(address token, uint256 minOut, address recipient) external payable returns (uint256 out);  // via Flap Portal.swapExactInput
function sell(address token, uint256 amountIn, uint256 minBnbOut, address recipient) external returns (uint256 bnbOut); // pulls token (approve)
function sellAndBridge(address token, uint256 amountIn, uint256 minBnbOut, address oneClickDepositAddress, bytes32 quoteRef) external returns (uint256 bnbOut); // cash out to Zcash in the same tx
function bridge(address oneClickDepositAddress, bytes32 quoteRef) external payable; // (added in integration) fee-free: forward msg.value BNB + emit CashOut — Move ZEC sends and coin-page Portal sales, so every cash-out is provable on-chain
// quoteRef: transparent cash-out = keccak256(depositAddress); shielded cash-out = keccak256(utf8("sprout-shield:v1:" + lower(depositAddress) + ":" + shieldedAddress))
//           (binding: the user's signed tx commits to the shielded destination); keeper bridgeOut = keccak256(utf8("sprout-bridge:v1:<chainId>:" + lower(depositAddress)))
function FEE_BPS() external view returns (uint256); // 100
// Guard: refuse tokens whose Flap state is Invalid, or whose buy/sell tax > 500 bps (5%). Sprout coins (factory.vaultOf != 0) trade fee-free
// through the terminal? — NO: Sprout coins are traded directly via Portal on the coin page (no terminal fee); terminal is for any Flap token.
event TerminalTrade(address indexed trader, address indexed token, bool isBuy, uint256 bnbAmount, uint256 tokenAmount, uint256 fee);
event CashOut(address indexed trader, uint256 bnbOut, address depositAddress, bytes32 quoteRef);

// ---------- Passkey accounts (separate Foundry project /accounts) ----------
// SproutAccountFactory: createAccount(bytes32 qx, bytes32 qy) returns (address); getAddress(bytes32 qx, bytes32 qy) view returns (address)
// SproutAccount: owner key (qx,qy) P-256; nonce(); executeBatch(Call[] calls, uint256 deadline, uint256 gasFee, address feeRecipient, WebAuthnSig sig)
//   struct Call { address to; uint256 value; bytes data; }
//   struct WebAuthnSig { bytes authenticatorData; string clientDataJSON; uint256 challengeIndex; uint256 typeIndex; uint256 r; uint256 s; }
//   challenge = keccak256(abi.encode(chainid, account, nonce, deadline, gasFee, feeRecipient, keccak256(abi.encode(calls)))) base64url in clientDataJSON
//   verified with P256VERIFY precompile 0x100 (low-s enforced). Pays gasFee to feeRecipient (relayer) after executing. receive() accepts BNB.
//   Optional recovery: none (passkey is the only key) — say so clearly in docs, recommend synced passkeys.
```

### Launch call (frontend / account batch)
`VaultPortal.newTokenV6WithVault{value: firstBuyWei}(params)`: name, symbol, meta (CID), dexThresh=FOUR_FIFTHS(1), salt (7777),
migratorType=V2_MIGRATOR(1), quoteToken=0x0, quoteAmt=firstBuyWei, permitData=0x, extensionID=0x0, extensionData=0x, dexId=0,
lpFeeProfile=0, buyTaxRate=200, sellTaxRate=200, taxDuration=3153600000, antiFarmerDuration=86400, mktBps=10000, deflationBps=0,
dividendBps=0, lpBps=0, minimumShareBalance (holders mode; default 100,000e18 tokens, else 0), dividendToken (ZEC for holders mode,
else 0x0), commissionReceiver=SproutRoots, tokenVersion=TOKEN_TAXED_V3(6), vaultFactory=SproutVaultFactory,
vaultData=abi.encode(uint8 mode, address payee, string zcashAddress). The first buy can be paid in ZEC (account BNB from a ZEC deposit).

### Trading
Coin page: Flap `Portal.swapExactInput` (curve or DEX) + `quoteExactInput` (non-view → eth_call/simulate); state via `getTokenV8Safe`.
Terminal: `SproutTerminal`. Feed: Portal events `TokenBought/TokenSold(uint256 ts,address token,address trader,uint256 amount,uint256 eth,uint256 fee,uint256 postPrice)` (not indexed).

## Off-chain services (fly.io) — all must idle gracefully ("not configured") when env is missing
- **keeper/** — flush vaults, Roots burnRun/liquidityRun, Payouts settle (V3 QuoterV2 for minOut), bridgeOut via 1Click quotes
  (thresholds: 0.25 ZEC, or 7 days from 0.01 ZEC), holder-reward runs (if fallback distributor), /healthz /status.
- **relayer/** — passkey relayer: POST /relay {account, calls, deadline, gasFee, sig} → simulate, submit, return tx hash; /quote-gas;
  rate limits; deploys account on first use (factory createAccount in same flow). Also proxies 1Click quote/status for the site if useful.
- **zforward/** — shield forwarder: a Zcash light wallet (e.g. zingo-cli or zcash-devtool against a public lightwalletd such as
  zec.rocks:443) that receives native ZEC from 1Click on its t-address(es) and forwards to users' shielded/unified addresses with a
  stamp memo (`sprout-stamp:v1:<payoutId>:<bsc tx hash>`), enforcing the shielded limits. Payout requests come from on-chain
  `CashOut`/`BridgedOut` events whose quoteRef maps to a recorded request. Holds funds only minutes.

## Repo layout
`/` Next.js 14 site (Vercel) · `/contracts` Foundry (core) · `/accounts` Foundry (passkey accounts; reuse ../contracts/lib via remappings)
· `/keeper` · `/relayer` · `/zforward` · `/trailer` (Remotion) · `/public/brand/sprout-mark.svg` logo · `SPEC.md` (this).
Foundry: `C:\Users\Administrator\tools\foundry\forge.exe`. Libs in `contracts/lib` (git-ignored; forge-std v1.14.0, OZ 4.9.6, OZ-upgradeable 4.9.6).

## Brand
Bamboo / Chinese ink, original, with a **Zcash gold** accent (Zcash's yellow `#F4B728` used sparingly next to bamboo greens —
"gold coin in a bamboo grove"). Palette: bamboo-900 `#0E2A1B`, bamboo-700 `#1F6B43`, bamboo-500 `#2F8F57`, shoot-300 `#7CC36E`,
leaf-200 `#A8DC7A`, paper `#F4EEDC`, ink `#141613`, soil `#6B4F2A`, seal-red `#C8402F`, zec-gold `#F4B728`. Dark default (`#0B1510`).
Fonts: display Fraunces/Cormorant; UI Inter; CJK Noto Serif SC + Noto Sans SC. Motifs: bamboo node rings, stalk dividers, ink wash,
red seal 春笋. Do not use the official Zcash logo as our logo; a small "ZEC" ticker chip / generic Ⓩ-style coin glyph is fine.
Social links: one config file, empty strings, hidden when empty.
