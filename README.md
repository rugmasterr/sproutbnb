# Sprout 春笋

**EN —** Sprout is a Zcash-native launchpad and trading terminal on BNB Chain, built on [Flap](https://flap.sh). You
bring ZEC in from a Zcash wallet (through NEAR Intents 1Click), get a passkey-controlled Sprout Account on BNB Chain,
and launch or trade Flap coins with everything shown in ZEC. Each coin's 2% tax pays out in ZEC: to the deployer, to
another wallet, to holders, to any Zcash address, or as a donation to the Zcash Foundation. It also grows a shared
$SPROUT/ZEC pool whose LP tokens are burned. Sales can cash out straight to a Zcash wallet, optionally to a shielded
address through Sprout's forwarder.

**中文 —** 春笋是 BNB 链上原生支持 Zcash 的发射平台与交易终端，基于 Flap 构建。用户通过 NEAR Intents 1Click 从 Zcash
钱包转入 ZEC，获得一个由通行密钥控制的春笋账户，在 BNB 链上发射或交易 Flap 代币，全程以 ZEC 计价。每枚代币 2% 的
税费以 ZEC 结算：可发给部署者、另一个钱包、持币者、任意 Zcash 地址，或捐赠给 Zcash 基金会；同时注入共享的
$SPROUT/ZEC 流动性池（LP 销毁）。卖出所得可直接提现到 Zcash 钱包，也可经春笋转发服务提现到屏蔽地址。

> **Status / 状态：** built and tested locally (unit tests, BSC mainnet fork tests, local end-to-end checks).
> **NOT deployed on-chain. NOT audited.** $SPROUT has not launched, and the domain sproutbnb.cash is not connected.
> Sprout is not affiliated with the Zcash Foundation, Electric Coin Co., Flap, Binance, BNB Chain, PancakeSwap or NEAR.
>
> 已在本地完成构建与测试（单元测试、BSC 主网分叉测试、本地端到端校验）。**尚未部署上链，未经审计。** $SPROUT 尚未发射，
> 域名尚未接入。春笋与 Zcash 基金会、ECC、Flap、币安、BNB Chain、PancakeSwap、NEAR 均无隶属关系。

`SPEC.md` is the authoritative spec (mechanics, addresses, contract interface).

---

## Architecture

```
  Zcash wallet (t-addr / zs1 / u1)                                     Zcash wallet (shielded)
        │  native ZEC                                                          ▲  ZEC + stamp memo
        ▼                                                                      │  sprout-stamp:v1:<id>:<bsc tx>
  ┌──────────────────────┐   quote / status   ┌──────────────────────┐   ┌────┴─────────────────┐
  │ NEAR Intents 1Click  │◄──────────────────►│  Site (Next.js,      │   │ zforward (fly.io,     │
  │ ZEC(Zcash) ⇄ BNB(BSC)│                    │  Vercel)  /api/*     │   │ internal-only)        │
  └───┬──────────────▲───┘                    │  passkey (WebAuthn)  │   │ zcash-devtool wallet  │
      │ BNB to       │ BNB to 1Click deposit  └──┬────────────┬──────┘   │ checks CashOut /      │
      │ account      │ (cash-out, same tx)       │ signed      │ shield   │ BridgedOut on BSC     │
      ▼              │                           │ batch       │ request  └────▲──────────▲───────┘
  ┌──────────────────┴──────────┐            ┌───▼────────────▼───┐  /v1/requests│          │ /v1/requests
  │ SproutAccount (passkey,     │◄───────────┤ relayer (fly.io)   ├──────────────┘          │ (modes 3/4)
  │ P-256 via 0x100 precompile) │ executeBatch│ pays gas, refunded │                         │
  └──────────────┬──────────────┘            │ in-tx (gasFee)     │                ┌────────┴────────┐
                 │ calls                     └────────────────────┘                │ keeper (fly.io) │
                 ▼                                                                 │ flush · settle  │
  ┌───────────────────────────────── BNB Chain ─────────────────────────────────┐ │ bridgeOut · runs │
  │ Flap Portal / VaultPortal ── Tax Token V3 (2% tax) ──► SproutVault (per coin) │◄┤ holder epochs   │
  │   SproutVaultFactory (Planted)        │ split 0.50 / 0.50 / 0.20 / 0.80       │ └─────────────────┘
  │   SproutRoots: $SPROUT/ZEC Grove (LP → dEaD) + Rootstock buy & burn           │
  │   SproutPayouts: BNB → BEP-20 ZEC (Pancake V3) or bridge to Zcash (1Click)    │
  │   SproutTerminal: trade any Flap token (1% fee), sellAndBridge / bridge       │
  └───────────────────────────────────────────────────────────────────────────────┘
```

## Components

| Path | What | Build / test |
|---|---|---|
| `contracts/` | Foundry: `SproutVaultFactory`, `SproutVault`, `SproutPayouts`, `SproutRoots`, `SproutTerminal`; ABIs in `abi/` | `forge build`, `forge test` (set `BSC_RPC_URL` to run the 5 mainnet-fork tests) |
| `accounts/` | Foundry: passkey `SproutAccount` + `SproutAccountFactory` (CREATE2 clones, WebAuthn P-256), `js/challenge.ts` | `forge test` (also `FOUNDRY_PROFILE=osaka`, `--fork-url`) |
| `/` (`src/`) | Next.js 14 site: home, launch, coin, terminal, stats, nodes, docs, `/zec`, `/account`, EN/中文 | `npm run build` |
| `src/features/zcash/` | Zcash module: 1Click deposit/cash-out, passkey accounts, Zcash address checks | part of the site build |
| `keeper/` | fly.io worker: flush vaults, settle payouts in ZEC, bridge modes 3/4 via 1Click, Roots runs, holder rewards | `npm run typecheck`, `npm run build`, `npm run check-abi` |
| `relayer/` | fly.io API: `/quote-gas`, `/relay`, `/tx/:id`, `/shield-request` | `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e` |
| `zforward/` | fly.io internal service: shield forwarder (t-address → zs1/u1 with stamp memo) | `npm run typecheck`, `npm run build`, `npm test` |
| `trailer/` | Remotion trailer; rendered files ship in `public/trailer/` | `npm run render` |
| `scripts/` | Cross-component checks (below) | — |

### Cross-component checks

```powershell
# every ABI fragment in site/keeper/relayer/zforward vs the compiled ABIs (run after forge build in both projects)
relayer\node_modules\.bin\tsx scripts\check-abis.mts
# site passkey module (fake WebCrypto authenticator) -> relayer parse/verify/encode -> fixture for the contracts
relayer\node_modules\.bin\tsx scripts\passkey-e2e.mts
cd accounts; forge test --match-contract BrowserE2E      # sends that exact relayer calldata to the real contracts
```

---

## Deploy runbook (nothing below has been done yet)

All commands assume PowerShell and Foundry on PATH. Use a hardware wallet or keystore (`--account`), never a raw key in
a shell history. Do it on testnet (chain 97, mock ZEC) first.

### 1. Core contracts — `contracts/`

```powershell
$env:BSC_RPC_URL="https://bsc-rpc.publicnode.com"
$env:SPROUT_OWNER="0x…"      # multisig: final owner of SproutRoots + SproutPayouts (default factory admin)
$env:SPROUT_KEEPER="0x…"     # the keeper's EOA (address of KEEPER_PRIVATE_KEY)
$env:SPROUT_TREASURY="0x…"   # ops treasury (0.20% share, 0.75% terminal fee)
# $env:SPROUT_ADMIN="0x…"    # optional separate factory admin
# $env:SPROUT_ZEC="0x…"      # testnet only: mock ZEC
forge script script/Deploy.s.sol --rpc-url $env:BSC_RPC_URL --broadcast --account <deployer> --sender <deployer>
```

The script prints `NEXT_PUBLIC_SPROUT_FACTORY / ROOTS / PAYOUTS / TERMINAL`. Verify the sources on BscScan. Flap
does not require you to register the factory. Getting it marked "verified" by Flap takes an audit by Flap's partner
(0.5 BNB per factory, per Flap's docs).

### 2. Passkey accounts — `accounts/`

```powershell
forge script script/DeployAccounts.s.sol --rpc-url $env:BSC_RPC_URL --broadcast --account <deployer> --sender <deployer>
```

Before deploying, the script checks the live 0x100 P-256 precompile against the RIP-7212 test vector. It prints the
factory and implementation, which go into `NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY` and `NEXT_PUBLIC_SPROUT_ACCOUNT_IMPL`.

### 3. Launch $SPROUT

```powershell
$env:SPROUT_FACTORY="0x…"; $env:SPROUT_ROOTS="0x…"; $env:SPROUT_TREASURY="0x…"
$env:SPROUT_META="<CID from https://funcs.flap.sh/api/upload>"
# optional: $env:SPROUT_FIRST_BUY_WEI, $env:SPROUT_SALT_SEED
forge script script/LaunchSprout.s.sol --rpc-url $env:BSC_RPC_URL --broadcast --account <deployer> --sender <deployer>
cast send <SproutRoots> "setSprout(address)" <SPROUT token> --account <owner>     # owner (multisig), once
```

Set the **Zcash Foundation** address only after verifying it from an official Zcash Foundation source:
`cast send <SproutPayouts> "setZcashFoundationAddress(string)" "<address>"` (owner, **once**, can't be changed).
Until then the site keeps the Foundation option disabled.

### 4. Site — Vercel

Import the repo (root directory `/`, framework Next.js) and set the variables from `.env.example`: the contract
addresses from steps 1–3, `NEXT_PUBLIC_RELAYER_URL`, `NEXT_PUBLIC_FORWARDER_TADDR`, `NEXT_PUBLIC_PASSKEY_RP_ID`,
and optionally `BSC_RPC_URL` and `ONECLICK_JWT`. Mark the last two Sensitive. `NEXT_PUBLIC_*` values are baked in at
build time, so redeploy after changing them.

### 5. Services — fly.io (`fly deploy` from each folder)

```powershell
cd zforward; fly launch --no-deploy --copy-config; fly volumes create zforward_data --size 3 --region hkg
fly secrets set ZCASH_SEED="…" ZCASH_BIRTHDAY=… FORWARDER_TOKEN="…" FORWARDER_TADDR="t1…" BSC_RPC_URL="…" SPROUT_TERMINAL=0x… SPROUT_PAYOUTS=0x…
fly deploy --ha=false            # exactly one machine; internal-only (no public service)

cd ..\relayer; fly launch --no-deploy --copy-config
fly secrets set RELAYER_PRIVATE_KEY="0x…" BSC_RPC_URL="…" SPROUT_ACCOUNT_FACTORY=0x… FORWARDER_URL=http://sprout-zforward.internal:8080 FORWARDER_TOKEN="…"
fly deploy --ha=false            # one machine: nonces and limits are in memory

cd ..\keeper; fly launch --no-deploy --copy-config; fly volumes create keeper_state --size 1
fly secrets set KEEPER_PRIVATE_KEY="0x…" BSC_RPC_URL="…" SPROUT_FACTORY=0x… FORWARDER_URL=http://sprout-zforward.internal:8080 FORWARDER_TOKEN="…"
fly deploy --ha=false            # start with DRY_RUN=true, then set DRY_RUN=false
```

Each service's README covers all its variables, and so does its `.env.example`. With variables missing, every
service idles in a "not configured" mode and still answers `/healthz`. Check that the volume names in each
`fly.toml` match before creating volumes.

### 6. DNS

Point `sproutbnb.cash` and `www.sproutbnb.cash` at Vercel (A/ALIAS + CNAME, as Vercel's domain screen shows). If the
relayer gets a custom domain (e.g. `relay.sproutbnb.cash`), add it with `fly certs add` and update
`NEXT_PUBLIC_RELAYER_URL`. The relayer's `ALLOWED_ORIGINS` already defaults to the two site origins.

### What the operator must provide

| Item | Used by | Notes |
|---|---|---|
| Deployer key with BNB | steps 1–3 | gas for 6 contracts, plus the $SPROUT first buy |
| Owner multisig address | `SPROUT_OWNER` | owns Roots and Payouts; one-time setters |
| Keeper key (EOA) + a little BNB | keeper | must equal `SproutRoots.keeper()` and `SproutPayouts.keeper()`; trusted for `settle`/`bridgeOut` minimums and holder snapshots |
| Relayer key (EOA) + a little BNB | relayer | pays gas up front and is reimbursed in each transaction |
| Zcash seed for a new, dedicated hot wallet + birthday height | zforward | only holds funds for minutes; keep about 0.01 ZEC shielded as a fee float |
| Verified Zcash Foundation donation address | `setZcashFoundationAddress` (once) | **must** come from an official Zcash Foundation source; never guess |
| Optional 1Click partner key (JWT) | site, keeper, relayer, zforward (`ONECLICK_JWT`) | without it 1Click adds 0.25% per swap |
| Shared `FORWARDER_TOKEN` (≥ 24 random chars) | relayer, keeper, zforward | optional separate `ADMIN_TOKEN` for zforward |
| Domain DNS for sproutbnb.cash | Vercel | see step 6 |
| Flap metadata CID for $SPROUT | `SPROUT_META` | upload logo and metadata via funcs.flap.sh |

---

## Known gaps before going live

- **Bringing ZEC in is blocked upstream for now.** As of 2026-10-27, 1Click refuses to quote ZEC → any BSC asset
  ("Quoting for this pair is not available"), and every swap has a temporary $1,000 minimum. Cashing out (BNB → ZEC)
  quotes fine. The site shows the live route status.
- **No real-money run yet.** Test end to end with small amounts: a 1Click delivery of BNB to a deployed SproutAccount,
  1Click detecting deposits sent from a contract, the keeper's multi-chunk `FLEX_INPUT` bridges, and every zforward
  item in its README checklist (real zcash-devtool output, Ironwood sends, fees).
- **Docker images were never built** (no Docker on the build machine).
- **1Click refunds of keeper bridges** go to `BRIDGE_REFUND_TO`, and an operator has to return them by hand. Payouts has no re-credit path.
- **Trust:** the keeper sets slippage minimums and holder snapshots, and the relayer can quote any `gasFee` (the
  user signs it, so cap or display it in the UI). Zcash address checks on-chain cover format only; the site, relayer
  and zforward check checksums.
- **Not audited.**
