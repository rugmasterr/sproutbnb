# Sprout shield forwarder (`zforward`) · 春笋

NEAR Intents 1Click can only deliver native ZEC to **transparent** Zcash addresses. To make Sprout's cash-outs and
Zcash-wallet payouts land **shielded**, 1Click pays this service's t-address. The service then forwards each payout to
the user's **Sapling (`zs1…`)** or **Unified (`u1…`)** address, with a stamp in the encrypted memo:

```
sprout-stamp:v1:<payoutId>:<bsc tx hash>
```

Limits (SPEC v2): **≤ 100 ZEC per payout, ≤ 1000 ZEC and ≤ 2000 payouts per rolling 24 h** across Sprout.
Funds are held only for the minutes it takes to sync, shield and send.

> Status: code complete, unit-tested against a mocked wallet. **The Zcash CLI integration has not been run against a
> real wallet or real ZEC.** Do not deploy until the "Before going live" checklist below is done. Not deployed.

## Zcash toolchain: zcash-devtool

| Candidate | Verdict |
|---|---|
| **zcash-devtool** (zcash/zcash-devtool, `zcash_client_backend` + `zcash_client_sqlite`) | **Chosen.** Same wallet core as Zashi. Talks to any lightwalletd over TLS (`-s zec.rocks:443`). NU6.3-aware: `shield` targets **Ironwood** after activation and payments to Orchard receivers become Ironwood outputs. Restores without interaction (phrase on stdin). `balance --json`. `send --memo` builds and broadcasts in one step. Sapling params are embedded (`LocalTxProver::bundled`), so nothing is downloaded at runtime. |
| zingo-cli (zingolib) | It works too: one-shot commands, `ZINGO_SEED` env, `quicksend`/`quickshield`. Not chosen because zingolib v7 (Oct 2026) puts a Nym-mixnet transport and online-consent model in front of ordinary indexer access ("nakednet" needs explicit flags), its wallet file format is still changing, and it has no JSON balance output. It is a reasonable fallback, and only `src/wallet/devtool.ts` would need a sibling adapter. |
| zallet | Rejected. It is a full-node wallet: it needs Zebra + Zaino, not a public lightwalletd. It is also alpha, and many RPCs are missing. |

Pinned build: `zcash/zcash-devtool` @ `0b3436bb8d235c67cd36b800cb45a7b1b489c415` (main, 2026-10-17), `cargo build --release --locked`,
Rust image `rust:1.94-bookworm` (the crate's MSRV is 1.89).

Upstream says zcash-devtool is "not written with security in mind" and that its CLI may change without notice. We
mitigate this in four ways: we pin the commit, keep only a small float in the wallet, enforce hard limits, use a
crash-safe state machine, and require the operator to run the verification checklist at every version bump.

**Ironwood (NU6.3, block 3,428,143, July 2026).** Orchard now only accepts withdrawals. Unified addresses did not change:
an Orchard receiver in a `u1…` address is the route into Ironwood, and an NU6.3-aware wallet creates the Ironwood output.
Sapling (`zs1…`) is unchanged. The forwarder therefore accepts `zs1…` addresses and any `u1…` address that has a
Sapling or Orchard receiver.

### CLI commands the adapter uses (`src/wallet/devtool.ts`)

| Purpose | Command |
|---|---|
| Restore wallet from seed (first boot) | `zcash-devtool wallet -w $WALLET_DIR restore-mnemonic --name sprout-zforward -i <identity> -n main --birthday $ZCASH_BIRTHDAY -s zec.rocks:443 --connection direct` (phrase on **stdin**) |
| Get the t-address | `… list-addresses --receiver transparent` → `Receiver(transparent): t1…` |
| Sync (also refreshes transparent UTXOs) | `… sync -s zec.rocks:443 --connection direct` |
| Balances | `… balance --json` → `{total, sapling_spendable, orchard_spendable, ironwood_spendable, transparent_spendable, chain_tip_height}` |
| Incoming / outgoing txs + memos | `… list-tx` (text: txid, `Mined:`, `Amount:`, `Memo:`) |
| Shield t → Ironwood | `… shield -i <identity> -s …` |
| Send with memo | `… send -i <identity> --address <zs1/u1> --value <zat> --memo "sprout-stamp:v1:…" -s …` |

**Fees (ZIP-317).** 5,000 zat per logical action, minimum 2 actions. A 1-UTXO shield costs about 15,000 zat. A shielded
send costs 10,000–20,000 zat. The wallet pays these fees from its own pool. Each payout is reduced by
`FEE_RESERVE_ZEC` (default 0.0004 ZEC) to cover them, and a send waits until shielded spendable ≥ payout +
`SEND_FEE_HEADROOM_ZEC`. **Keep a small shielded float, about 0.01 ZEC, in the wallet** so that rounding never blocks the queue.

## How a payout flows

1. **Register.** The relayer (cash-out: `POST /shield-request` → here) or the keeper (mode 3/4 vault paying a `zs1`/`u1` address)
   sends `POST /v1/requests` *before* the BSC tx. The 1Click quote's recipient must be this service's t-address.
2. **1Click.** The matcher polls `GET {ONECLICK_BASE}/status?depositAddress=…` and checks:
   `quoteResponse.quoteRequest.recipient` = our t-address, `destinationAsset` = `nep141:zec.omft.near`. It stops on
   `REFUNDED`/`FAILED`. On `SUCCESS` it takes `swapDetails.amountOut` (zatoshis), `swapDetails.destinationChainTxHashes[0]`
   (the Zcash txid paying us) and `swapDetails.originChainTxHashes[0]` (the BSC tx that will be stamped).
3. **Match.** The wallet syncs and the Zcash txid is looked up in `list-tx` (either byte order). The tx must be mined. If 1Click gives no
   destination hash, the matcher falls back to an exact amount among unclaimed mined incoming txs after the request
   was created. If several swaps share one tx, their amounts must not exceed what the tx paid.
4. **Proof.** The BSC receipt must contain `CashOut(trader, bnbOut, depositAddress, quoteRef)` from `SPROUT_TERMINAL` or
   `BridgedOut(vault, mode, bnbIn, depositAddress, quoteRef, zcashAddress)` from `SPROUT_PAYOUTS`, with matching
   depositAddress and quoteRef. For `BridgedOut`, the on-chain `zcashAddress` must also equal the registered address,
   so the keeper is not trusted blindly. quoteRef is treated as opaque bytes32. The site/relayer derive it as
   `keccak256(depositAddress)` and the keeper as `keccak256("sprout-bridge:v1:<chainId>:<deposit>")`. The proof only requires
   that the event and the registration agree.
5. **Limits.** A payout over 100 ZEC goes to `manual_review`. When the 24 h window is full, the payout waits until the window frees.
6. **Shield, then send.** Spendable transparent funds are shielded, and once that confirms, payouts are sent FIFO with the stamp memo.
7. **Confirm.** The forward tx is tracked until it is mined (`confirmed`). If it expires unmined, it goes to `manual_review`.

**Double-pay protection.** State is persisted as `sending`, together with the 24 h reservation, *before* the irreversible
`send`. If that save fails, nothing is sent. The wallet's `list-tx` includes the unmined txs it created.
- **Send returns an error.** The forwarder looks for the stamp in the wallet and also compares the wallet's txids with a
  snapshot taken just before the send. If the stamp is there, *or any new tx appeared*, the payout goes to `manual_review`
  and keeps its reservation. Only when the wallet is provably unchanged is the reservation released and the send retried
  (at most 3 times).
- **Process dies mid-send.** A request found in `sending` at the next tick is `sent` if its stamp is in the wallet.
  Otherwise it goes to `manual_review`. It is **never retried automatically**, because "no visible stamp" does not prove that
  nothing was broadcast.
- **Re-queue.** An operator re-queues a request with `POST /v1/admin/requests/:quoteRef/requeue {"confirmNotSent":true}`
  using `ADMIN_TOKEN`. Limits and the BSC proof apply again.

**Matching hardening.**
- A deposit address can be registered only once.
- Credit already given to earlier requests from the same Zcash tx counts against that tx's value.
- 1Click `SUCCESS` must name our t-address as recipient.
- 1Click's origin BSC hash wins over an API-attached one.
- Txs the wallet created itself (known `Fee paid`) are never treated as incoming deliveries.
- The amount fallback only considers txs mined after registration (minus 10 blocks).

**Upstream `format_zec` sign bug.** At the pinned commit, `src/ui.rs` negates only the whole-ZEC part, so `list-tx` prints
−0.5 ZEC as `0.50000000 ZEC`. The parser forces the delta of wallet-created txs negative, and matching never relies on
that sign.

**Binding quoteRef (recommended).** `quoteRef = keccak256(utf8("sprout-shield:v1:" + lower(depositAddress) + ":" + shieldedAddress))`.
The legacy cash-out quoteRef, `keccak256(depositAddress)`, only binds the shielded address first-come. Today that
registration comes through the relayer's *public* `/shield-request`, so if a user's registration is ever missing
(for example, the site failed after the tx was sent), anyone who reads the deposit address from the `CashOut` event can
register it to their own address. With the binding quoteRef, the user's signed `sellAndBridge` commits to the
destination. `REQUIRE_BOUND_QUOTEREF=1` enforces this for `CashOut` payouts. The site (`src/features/zcash/cashout.tsx`)
now sends the binding quoteRef for every shielded cash-out, the relayer accepts it, and `fly.toml` turns the check on.
(The env default stays off for local testing.) `BridgedOut` is already bound by its on-chain `zcashAddress`.
Every site cash-out now emits `CashOut`: sales use `SproutTerminal.sellAndBridge`, and plain BNB (Move ZEC, or a
coin-page Portal sale) goes through the fee-free `SproutTerminal.bridge(depositAddress, quoteRef)`.

## HTTP API

The service is internal-only (fly 6PN): `http://sprout-zforward.internal:8080`. Every route except `/healthz` and `/status`
needs `Authorization: Bearer $FORWARDER_TOKEN`.

| Method | Path | Body / result |
|---|---|---|
| GET | `/healthz` | `{ok, mode}`. Mode is `idle`, `starting`, `active` or `paused`. |
| GET | `/status` | mode, sync, balances (zat), owed, counts per status, limits + 24 h usage. No user addresses. |
| GET | `/v1/info` | `{tAddress, network, mode, limits}`. The relayer and keeper read the t-address here. |
| POST | `/requests` · `/v1/requests` | `{quoteRef, depositAddress, shieldedAddress \| recipient, expectedZatoshi \| expectedZat?, minZat?, deadline?, source?, vault?, bscTxHash?}` → `201` created · `200` idempotent re-send · `400` invalid / > 100 ZEC · `409` quoteRef bound to another address · `429` daily window full · `503` idle/paused |
| GET | `/requests/:quoteRef` · `/v1/requests/:quoteRef` | the request record (status, amounts, txids, stamp) |
| POST | `/v1/requests/:quoteRef/tx` | `{bscTxHash}`. The keeper attaches its bridge tx (otherwise the hash is taken from 1Click). The hash 1Click reports overrides it. Rejected once the request is verified. |
| POST | `/v1/admin/requests/:quoteRef/requeue` | `{confirmNotSent: true, note?}`. **Bearer `ADMIN_TOKEN`**, not FORWARDER_TOKEN. Returns 404 when `ADMIN_TOKEN` is unset. Accepts only `manual_review` requests that have a verified incoming tx. |

Statuses: `registered → delivered → received → sending → sent → confirmed`. Terminal statuses are `refunded`, `failed`, `expired`, `rejected`.
`manual_review` means the funds are in the wallet and a human must decide.

## Configuration

| Env | Default | |
|---|---|---|
| `ZCASH_SEED` | — | **secret.** 24-word BIP-39 phrase of the forwarder wallet. Used for wallet restore and passed only on the CLI's stdin. |
| `ZCASH_BIRTHDAY` | — | Block height at which the wallet was created. Without it, the restore scans from Sapling activation (hours). |
| `WALLET_DIR` | `/data/wallet` | zcash-devtool wallet dir on the volume |
| `LIGHTWALLETD_URL` | `zec.rocks:443` | `host:port[,host:port]` or `zecrocks`. Alternatives: `na.zec.rocks:443`, `ap.zec.rocks:443`, `eu.zec.rocks:443`. |
| `FORWARDER_TOKEN` | — | **secret**, ≥ 24 chars, shared with relayer + keeper |
| `FORWARDER_TADDR` | — | expected t-address. If the wallet derives a different one, the service pauses (wrong seed guard). |
| `BSC_RPC_URL`, `SPROUT_TERMINAL`, `SPROUT_PAYOUTS` | — | On-chain proof. Required unless `ONCHAIN_PROOF=off`, which is for testing only and refuses to start on mainnet with `NODE_ENV=production` unless `ALLOW_NO_PROOF=1`. |
| `REQUIRE_BOUND_QUOTEREF` | off | `1` = `CashOut` payouts must use the binding quoteRef (see above) |
| `ADMIN_TOKEN` | — | **secret**, ≥ 24 chars, must differ from FORWARDER_TOKEN. Enables the admin re-queue route. Never give it to the relayer or keeper. |
| `ONECLICK_BASE`, `ONECLICK_JWT` | public API / — | 1Click status |
| `MAX_PAYOUT_ZEC`, `MAX_DAILY_ZEC`, `MAX_DAILY_PAYOUTS` | 100 / 1000 / 2000 | limits |
| `FEE_RESERVE_ZEC`, `SEND_FEE_HEADROOM_ZEC`, `MIN_PAYOUT_ZEC` | 0.0004 / 0.0002 / 0.0005 | fees |
| `PAUSE_SENDS=1` | — | kill switch: keep matching and shielding, send nothing |
| `STATE_FILE` | `/data/zforward-state.json` | JSON state, written atomically (tmp + fsync + rename) |

**Idle mode.** If `ZCASH_SEED`, `WALLET_DIR`, `LIGHTWALLETD_URL` or `FORWARDER_TOKEN` is missing, the service still serves
`/healthz` and `/status`, lists what is missing, never starts a wallet process, and answers 503 to registrations.

## Security

- **Seed only in fly secrets** (`fly secrets set ZCASH_SEED=…`). It is passed on stdin, never in argv or the child env, and redacted
  from logs. zcash-devtool also stores the mnemonic age-encrypted in the wallet DB. The age identity file sits on the same
  volume, so treat the volume as key material: do not snapshot it anywhere less trusted.
- **Dedicated wallet.** Generate a fresh seed for the forwarder only, and never reuse a personal or treasury seed. Write down the
  birthday height.
- **Minimal float.** Funds normally stay minutes. Sweep any surplus (fees reserved but not spent, unattributed deposits) to
  cold storage periodically.
- **No public surface.** fly.toml has no service block, so the app is reachable only on the org's private network. Every
  mutating call is still bearer-authenticated, and the token is compared in constant time.
- **Trust minimisation.** A payout needs four things to agree: an authenticated registration, 1Click confirming that the quote pays *our*
  t-address in native ZEC, the wallet seeing the funds mined, and a Sprout contract event on BSC with the same quoteRef + deposit
  address (plus the same Zcash address for keeper payouts).
- **Hard limits** apply per payout and over a rolling 24 h window. Anything over them goes to human review instead of being sent.
- **Single machine.** One volume and one wallet. Never scale past 1 machine.
- Privacy honesty: the 1Click leg to the forwarder's t-address is public. Only the forward leg (amount, recipient, memo) is
  shielded. Timing between the two is observable.

## Deploy (do not run yet)

```sh
fly apps create sprout-zforward
fly volumes create zforward_data --region hkg --size 3
fly secrets set -a sprout-zforward ZCASH_SEED="…24 words…" ZCASH_BIRTHDAY=… FORWARDER_TOKEN=… FORWARDER_TADDR=t1… \
  BSC_RPC_URL=… SPROUT_TERMINAL=0x… SPROUT_PAYOUTS=0x…
fly deploy -a sprout-zforward        # builds zcash-devtool from source: expect a long first build
```
Relayer + keeper: `FORWARDER_URL=http://sprout-zforward.internal:8080`, the same `FORWARDER_TOKEN`, and
`FORWARDER_TADDR`/`NEXT_PUBLIC_FORWARDER_TADDR` = the wallet's t-address (from `/v1/info`).

## Before going live: operator checklist (not yet done)

None of these steps has been executed. Do all of them on the pinned build, using a fresh wallet and small amounts:

1. **Build.** `docker build .` succeeds. `zcash-devtool --help` and `zcash-devtool wallet --help` list `restore-mnemonic`,
   `list-addresses`, `sync`, `balance`, `list-tx`, `shield`, `send`. Then confirm the flags with
   `zcash-devtool wallet send --help`: `-i`, `--address`, `--value`, `--memo`, `-s`, `--connection`.
2. **Restore.** Run with a fresh seed and birthday. The marker `/data/.zforward-restored` exists, `GET /v1/info` returns a `t1…`,
   and that address equals the one Zashi/YWallet derives from the same seed (account 0, transparent receiver).
3. **Output formats.** `balance --json` has the keys above. Compare the `list-tx` text with `parseListTx`, which was
   checked against `list_tx.rs` and `ui.rs` source but never against real output:
   - txid lines are bare 64-hex.
   - `Mined: <height>` or `Unmined`/`Expired`.
   - `Amount:` (sign bug for |x| < 1 ZEC).
   - `Fee paid: <x> ZEC` for the wallet's own txs, and **`Unknown` for the incoming 1Click tx**. Self-detection depends
     on this. If an incoming tx shows a known fee, deliveries will not match and will sit in `delivered`.
   - `Memo: <Debug of Memo>` contains the stamp text.
4. **Transparent receive.** Send 0.01 ZEC from another wallet to the t-address. After `sync`, `transparent_spendable` shows it
   and `list-tx` lists the txid with a positive `Amount`.
5. **Shield → Ironwood.** `shield` succeeds, `ironwood_spendable` rises after confirmations, and the fee matches ZIP-317.
6. **Send with memo.** Send to a Zashi `u1…` (Orchard receiver) and to a `zs1…`. The recipient wallet shows the full stamp
   memo, and the forwarder's `list-tx` shows the stamp on the unmined tx, which is required for double-pay protection.
7. **1Click end to end.** Run a real small BNB→ZEC quote with `recipient` = forwarder t-address. Confirm that
   `swapDetails.destinationChainTxHashes[0].hash` equals the txid that `list-tx` prints, or its byte-reverse (both are matched),
   and that `swapDetails.amountOut` equals the received zatoshis.
8. **Crash test.** Kill the machine during a send (`PAUSE_SENDS` off, small amount). After the restart, no second payment is made.
9. **Proof.** With deployed contracts, a real `sellAndBridge` produces a `CashOut` that the forwarder accepts, and a
   forged registration with an unrelated tx is rejected.
10. Set `FORWARDER_TADDR`, fund the shielded float (about 0.01 ZEC), and watch `/status` through the first real payouts.

## Develop

```sh
npm install
npm run typecheck
npm test          # 38 unit tests: validation, address parsing, limits, CLI-output parsing (incl. format_zec sign bug), BSC proof, engine (mock wallet, adversarial matching, crash/double-send cases), HTTP API (incl. admin route)
npm run build
node dist/index.js   # with no env → idle mode
```
