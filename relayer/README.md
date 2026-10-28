# Sprout relayer (春笋 · passkey relayer)

People who come to Sprout with **only a Zcash wallet** have no BNB wallet. They fund a passkey **Sprout Account** on
BNB Chain by swapping ZEC through NEAR Intents 1Click, and from then on their passkey signs everything. This service
sends those signed batches to BNB Chain. The account pays the gas back inside the same transaction, at cost with no
markup. The service also registers **shielded cash-outs**: when a sale pays out to a shielded or unified Zcash address,
it tells Sprout's shield forwarder (`zforward/`) where to send the ZEC.

Stack: Node 22 (works on 20+), TypeScript, [Hono](https://hono.dev), viem, @noble/curves, @scure/base, zod. Fly.io app
`sprout-relayer` in region `hkg`. **Not deployed yet.**

## API

All big integers are decimal strings. Errors come back as `{ "error": "…" }` with a 4xx or 5xx status.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/healthz` | – | `{ ok, configured, chainId, relayer, accountFactory, missing[], shield{…} }` (always 200) |
| POST | `/quote-gas` | `{ account, qx?, qy?, calls:[{to,value,data}], deployed? }` | `{ gasFee, feeRecipient, deadline, nonce, deployed, gasLimit, gasPrice, method, balance }` |
| GET | `/quote-gas` | `?account=&qx=&qy=&calls=<json array>` | same |
| POST | `/relay` | `{ account, qx?, qy?, calls, deadline, gasFee, feeRecipient, sig:{authenticatorData, clientDataJSON, challengeIndex, typeIndex, r, s} }` | `{ txHash, id, status:"submitted", deployed, accountNonce }` |
| GET | `/tx/:hash` (alias `/relay/:id`) | – | `{ status: pending\|success\|failed, detail, txHash (current/mined), hashes[], replaced, error? }` |
| POST | `/shield-request` | `{ quoteRef, shieldedAddress, depositAddress, correlationId?, amountOutZec?, deadline?, account? }` | `{ ok, quoteRef, addressKind, verified, maxZec }` |

`qx`/`qy` (the passkey's P-256 public key) are **required while the account is not deployed** and optional after that,
because the relayer reads `owner()` from the account. The site client (`src/features/zcash/provider.tsx`) already
speaks this protocol: `quote-gas → computeChallenge → passkey → relay`.

### How /relay keeps the relayer safe

The relayer EOA pays gas up front and is only reimbursed if the batch succeeds, so a request has to pass these checks
before anything is broadcast:

1. Shape validation (`src/validate.ts`): addresses, hex, uint ranges, ≤ 16 calls, ≤ 48 KB of calldata, a body limit of 128 KB.
2. `feeRecipient` must equal the relayer address. The deadline must fall between now + 20 s and now + 1 h.
3. **It must be a genuine Sprout account.** `account` must equal `SproutAccountFactory.getAddress(qx, qy)`, read
   on-chain. If the account is already deployed, its `owner()` must equal `(qx, qy)`.
4. **Off-chain WebAuthn verification** (`src/webauthn.ts`, a port of `accounts/src/lib/WebAuthn.sol`). It checks low-s,
   `"type":"webauthn.get"`, the exact challenge (chain id, account, on-chain nonce, deadline, fee, recipient, calls),
   the UP and UV flags, and the P-256 signature. A stale or replayed request fails here with 401.
5. `eth_estimateGas` on the real transaction simulates it with the real signature. A revert comes back as 422 with
   the decoded reason, for example `call #1 failed: …`.
6. `gasFee ≥ estimate × gasPrice × (1 + RELAY_MIN_MARGIN_BPS)`. If it is lower the response is
   400 `fee-too-low` with the required amount.
7. **First use is one atomic transaction:** `factory.createAccountAndExecute(qx, qy, …)`. Deployment, execution and fee
   payment happen together, so the relayer never pays for a bare `createAccount` that nobody reimburses.
8. **The gas limit is bounded by the fee:** `gasLimit = min(estimate × 1.1 + 5k, gasFee / gasPrice, MAX_GAS_PER_TX)`,
   so even a batch that burns its whole gas limit costs the relayer at most `gasFee`. The exact transaction is then
   re-run with `eth_call` at that exact gas limit (catches gas-sensitive calls that pass `eth_estimateGas` but fail at
   a different limit).
9. Only one transaction can be in flight per account (otherwise 409). There are also a global cap on pending
   transactions, a gas cap per transaction, a gas price cap and a minimum relayer balance.
10. **Griefing guard.** A batch can pass simulation and still revert on-chain if state changes in between (for
    example the signer front-runs the relayer with the same signature from its own wallet). The relayer pays for
    those. An account with 3 on-chain reverts within an hour is paused, and so is a client IP with
    `IP_STRIKES_PER_HOUR` (5). Unreimbursed gas (reverts and cancellations) is summed over a rolling hour: above
    `REVERT_BUDGET_BNB_PER_HOUR` (0.01 BNB) only established accounts (on-chain nonce > 0) are served, and above
    twice the budget `/relay` returns 503 `{code:"revert-budget"}` until the window drains.

### How /quote-gas prices a batch before it is signed

The real `executeBatch` cannot be simulated without a signature. Instead, `eth_estimateGas` runs with a **state
override** that places `sim/SimAccount.sol` at the account address. It has the same ABI and runs the same calls and fee
payment, but skips verification. For an undeployed account the estimate runs through `createAccountAndExecute`.
`createAccount` sees code at the address and returns early. The quote adds `VERIFY_OVERHEAD_GAS` and, for the first
use, `DEPLOY_OVERHEAD_GAS`, then applies `QUOTE_MARGIN_BPS`. Both public BSC RPCs listed in SPEC were checked and
accept the override. If an RPC does not support it, the quote falls back to a conservative heuristic and reports
`method: "heuristic"`.

These are the numbers measured in the anvil e2e test (Osaka EVM, native P256VERIFY):

| Path | Actual gas used | Gas the quote assumed |
|---|---|---|
| Deploy + execute (2 calls) | 253,035 | 291,459 |
| Execute on a deployed account | ~95,200 | 108,777 |

BSC's RIP-7212 precompile costs 3,450 gas versus 6,900 for EIP-7951 on Osaka, so the real figures should come out slightly lower on BSC.

### Transaction management (`src/txmanager.ts`)

- Legacy (type 0) transactions. The gas price is `max(eth_gasPrice × (1+GAS_PRICE_BUMP_BPS), MIN_GAS_PRICE_GWEI)`.
  If it is above `MAX_GAS_PRICE_GWEI` the request gets a 503 (nothing is sent).
- A local nonce counter starts from the chain's `pending` count. A mutex serializes sends, and the counter resyncs
  from the chain on any send error (with one retry on nonce-too-low / already-known errors).
- A monitor runs every 6 s. A transaction still unmined after `STUCK_AFTER_SEC` is **re-broadcast at the same nonce** with
  the gas price raised by `REPLACE_BUMP_BPS` (or the network price, whichever is higher, never above the cap). A
  replacement never goes above `gasFee / estimate`, the price at which the signed fee still covers the expected gas.
  If the batch's signed deadline has already passed, or the network price has risen above what the fee covers (the tx
  would block every later relayer nonce), it is **cancelled** with a 0-value self-transfer instead (nothing executes;
  the client sees `failed` and can re-quote).
- State is kept in memory: one machine, `min_machines_running = 1`. After a restart `/tx/:hash` still answers from the RPC.

### /shield-request (shielded cash-out to Zcash)

1Click can only pay transparent Zcash addresses. For a shielded cash-out, the 1Click quote therefore pays the
**forwarder's t-address**, and this route tells the forwarder which shielded or unified address should receive that quote's ZEC:

- `quoteRef` must equal `keccak256(depositAddress)`, the value `SproutTerminal.sellAndBridge` / `SproutPayouts` emit.
- `shieldedAddress` has to be a mainnet **Sapling `zs1…`** (Bech32, 43 bytes) or a **Unified `u1…`** address with a
  Sapling or Orchard receiver. For unified addresses the relayer reverses F4Jumble, checks the HRP padding and parses
  the receivers. This is tested against the official ZIP 316 vectors. Transparent and TEX addresses are refused.
- With `SHIELD_VERIFY_QUOTE` on (the default), the relayer reads 1Click `GET /v0/status?depositAddress=…`. The quote's
  destination must be native ZEC (`nep141:zec.omft.near`) and its recipient must be the forwarder t-address (taken from
  `FORWARDER_TADDR`, or from the forwarder's `GET /v1/info`). The amount must be ≤ `SHIELD_MAX_ZEC` (100 ZEC per payout,
  per SPEC), and the quote must not be refunded or failed.
- A quoteRef binds to exactly one shielded address. A different address for the same quoteRef gets 409.
- The request is forwarded as `POST {FORWARDER_URL}/v1/requests` with the header `Authorization: Bearer FORWARDER_TOKEN`
  and the body `{ v, source:"relayer", kind:"cashout", quoteRef, depositAddress, recipient, shieldedAddress, expectedZat,
  minZat, deadline, addressKind, receivers, account, correlationId, verified, … }`. This matches the
  `keeper/src/forwarder.ts` request shape. The forwarder pays out only after it sees the on-chain `CashOut` event with that quoteRef.

Privacy: everything on BSC is public, including the quoteRef and the deposit address. Only the forwarder's final shielded
leg is private.

## Configuration

These are all environment variables (`fly secrets` for the secret ones). If any of the three core variables is missing,
the service runs in **idle mode**: `/healthz` returns 200 with `configured:false` and `missing[]`, and `/relay`,
`/quote-gas` and `/tx` return 503 `{code:"not-configured"}`. The service also stays idle if the RPC reports the wrong
chain id or if the factory address has no code.

| Var | Default | |
|---|---|---|
| `BSC_RPC_URL` | – | **core** e.g. `https://bsc-rpc.publicnode.com` (a private RPC is recommended in production) |
| `RELAYER_PRIVATE_KEY` | – | **core** hot EOA, 32-byte hex. Keep only a small BNB float on it |
| `SPROUT_ACCOUNT_FACTORY` | – | **core** SproutAccountFactory address (`NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY` is also accepted) |
| `CHAIN_ID` | 56 | 97 = BSC testnet |
| `ALLOWED_ORIGINS` | `https://sproutbnb.cash,https://www.sproutbnb.cash,http://localhost:3000` | CORS allow-list (`*` wildcards supported, e.g. `https://sprout-*.vercel.app`; never use bare `*.vercel.app`). POSTs from other browser origins get 403 |
| `MAX_GAS_PRICE_GWEI` / `MIN_GAS_PRICE_GWEI` / `GAS_PRICE_BUMP_BPS` | 3 / 0.05 / 0 | |
| `QUOTE_MARGIN_BPS` / `RELAY_MIN_MARGIN_BPS` | 1500 / 500 | |
| `VERIFY_OVERHEAD_GAS` / `DEPLOY_OVERHEAD_GAS` / `MAX_GAS_PER_TX` | 65000 / 150000 / 4000000 | |
| `MAX_CALLS` / `MAX_CALLDATA_BYTES` | 16 / 48000 | |
| `DEADLINE_MIN_SEC` / `DEADLINE_MAX_SEC` / `DEADLINE_SUGGEST_SEC` | 20 / 3600 / 600 | |
| `MIN_RELAYER_BALANCE_BNB` | 0.005 | |
| `STUCK_AFTER_SEC` / `REPLACE_BUMP_BPS` / `MAX_PENDING_TXS` / `MONITOR_INTERVAL_SEC` | 45 / 2500 / 24 / 6 | |
| `RL_RELAY_PER_IP` / `RL_RELAY_PER_ACCOUNT` / `RL_QUOTE_PER_IP` / `RL_SHIELD_PER_IP` / `RL_READ_PER_IP` | 12 / 6 / 60 / 10 / 240 | requests per minute (in memory) |
| `RL_QUOTE_GLOBAL` / `RL_RELAY_GLOBAL` | 600 / 240 | per minute across all clients (protects the RPC quota) |
| `REVERT_BUDGET_BNB_PER_HOUR` / `IP_STRIKES_PER_HOUR` | 0.01 / 5 | griefing guard, see above |
| `TRUST_PROXY` | `fly` on Fly (`FLY_APP_NAME` set), else `off` | `fly`: client IP from `Fly-Client-IP`; `xff`: right-most `X-Forwarded-For` entry; `off`: socket address. Headers are never trusted in `off` mode (they are client-controlled) |
| `FORWARDER_URL` / `FORWARDER_TOKEN` | – | shield forwarder base URL and shared secret (both are required for `/shield-request`) |
| `FORWARDER_TADDR` | – | the forwarder's t-address (`NEXT_PUBLIC_FORWARDER_TADDR` is also accepted). If unset, it is read from `/v1/info` |
| `FORWARDER_REQUEST_PATH` | `/v1/requests` | |
| `SHIELD_VERIFY_QUOTE` / `SHIELD_MAX_ZEC` | on / 100 | |
| `ONECLICK_BASE` / `ONECLICK_JWT` | `https://1click.chaindefuser.com/v0` / – | the JWT is sent as `X-API-Key` |

CORS is not authentication (any non-browser client can call the API). The security of `/relay` comes from the passkey
signature and the checks above. Error messages and logs strip URLs, so an RPC URL with an embedded API key is never echoed.
`/shield-request` neither logs nor forwards the client IP, so the IP is never stored next to a shielded destination.

## Develop and test

```powershell
npm install
npm run typecheck
npm test            # unit tests: validation, WebCrypto P-256 sign→encode→verify round trip, accounts fixture,
                    # ZIP 316 F4Jumble + unified-address vectors, CORS/rate limits/idle mode, shield-request flow (mocked 1Click + forwarder)
npm run test:e2e    # anvil --hardfork osaka + real SproutAccountFactory bytecode from ../accounts/out:
                    # quote → sign → relay (deploy+execute) → relay (deployed), replay/fee/revert errors,
                    # stuck-tx replacement and deadline cancellation
npm run build && npm start   # PORT=8080
```

`src/challenge.ts` is a verbatim copy of `accounts/js/challenge.ts`, because the Docker build context is `relayer/`
only. `test/abi.test.ts` fails if the two files diverge or if the ABI fragments drift from `accounts/abi/*.json`.
`src/simBytecode.ts` is generated: run `forge build` in `sim/` and then `node scripts/gen-sim.mjs`.

## Deploy to fly.io (not done yet)

```powershell
$fly = "C:\Users\Administrator\tools\fly\flyctl.exe"
cd relayer
& $fly apps create sprout-relayer            # once
& $fly secrets set --app sprout-relayer `
    BSC_RPC_URL=https://<private-bsc-rpc> `
    RELAYER_PRIVATE_KEY=0x<fresh hot key> `
    SPROUT_ACCOUNT_FACTORY=0x<deployed SproutAccountFactory> `
    FORWARDER_URL=https://<zforward host> FORWARDER_TOKEN=<long random> FORWARDER_TADDR=t1<forwarder t-address>
& $fly deploy --app sprout-relayer --ha=false   # ONE machine (the default creates two, which would race on the
                                                # relayer's nonce); health check GET /healthz
& $fly scale count 1 --app sprout-relayer       # keep exactly one: nonce + rate-limit state live in memory
curl https://sprout-relayer.fly.dev/healthz
```

Then send a small BNB float to the relayer address shown in `/healthz` (for example 0.05 BNB; each relay is reimbursed
in-tx), and set `NEXT_PUBLIC_RELAYER_URL=https://sprout-relayer.fly.dev` on the site. Before the factory is deployed the
service can go live in idle mode, and the site will show "relayer not configured".

The config is `fly.toml`: app `sprout-relayer`, region `hkg`, port 8080, `force_https`, `auto_stop_machines = "off"`,
`min_machines_running = 1`, health check `/healthz`.

## Known limits

- Rate limits, the per-account in-flight lock and quoteRef bindings are kept in memory. Run exactly one machine.
  Scaling out would need shared state such as Redis.
- Gas overhead constants were measured on anvil (Osaka). Re-check them on BSC after the first real relays (the logs
  show the `gasUsed` of every tx).
- No recovery exists for Sprout accounts. The passkey is the only key, and the relayer cannot move funds.
