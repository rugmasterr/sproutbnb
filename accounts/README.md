# Sprout Accounts — passkey smart accounts (春笋账户)

The "One Zcash wallet" half of Sprout. A user arriving with only a Zcash wallet gets a **Sprout Account**: a tiny smart
account on BNB Chain controlled by a **WebAuthn passkey** (Face ID / Touch ID / Windows Hello / security key).
ZEC sent from the user's Zcash wallet is swapped to BNB by NEAR Intents 1Click and delivered to this account's
address, which is known *before* the account is deployed. Every trade, launch or cash-out back to Zcash is a batch of
calls signed by the passkey and submitted by Sprout's relayer, who is repaid the exact gas in BNB inside the same tx.

> **Your passkey is the only key to your Sprout account.** There is no owner, admin, guardian, social recovery,
> key rotation or upgrade. If the passkey is lost, the funds in the account are lost. Use a **synced passkey**
> (iCloud Keychain, Google Password Manager, 1Password, Bitwarden …) and cash out to Zcash rather than parking funds.

## Contracts (`src/`)

| File | What |
|---|---|
| `SproutAccountFactory.sol` | Deploys accounts as EIP-1167 clones with CREATE2, `salt = keccak256(abi.encode(qx, qy))`. `getAddress(qx,qy)` (view), `createAccount(qx,qy)` (idempotent — returns the existing account), `createAccountAndExecute(...)` (first use in one tx). No owner, no fees. |
| `SproutAccount.sol` | P-256 owner key `(qx, qy)`, `nonce()`, `executeBatch(calls, deadline, gasFee, feeRecipient, sig)`, `getChallenge(...)`, `hashCalls(...)`, ERC-1271 `isValidSignature`, `receive()`. |
| `ISproutAccount.sol` | `Call`, `WebAuthnSig` structs, events, errors (the SPEC v2 interface). |
| `lib/WebAuthn.sol` | Assertion verification (design follows the audited Coinbase `webauthn-sol` / Daimo `WebAuthn.sol`; implemented here independently). |
| `lib/P256.sol` | P256VERIFY precompile wrapper (0x100) + low-s + on-curve check. |
| `lib/Base64Url.sol` | Unpadded base64url (matches `clientDataJSON.challenge`). |

### Signed message

```
challenge = keccak256(abi.encode(
    uint256 block.chainid, address account, uint256 nonce, uint256 deadline,
    uint256 gasFee, address feeRecipient, bytes32 keccak256(abi.encode(Call[] calls))))
```

The 32 raw bytes are passed as `publicKey.challenge` to `navigator.credentials.get()`. Binding chain id + account
address + nonce gives replay protection across chains, accounts and time; `deadline` (unix seconds, inclusive) bounds
how long a relayer may sit on a signature; `gasFee`/`feeRecipient` are signed so the relayer can't over-charge or
redirect the fee.

### Verification (`WebAuthn.verify`) — fails closed, never reverts on bad input

1. `0 < r < n`, `0 < s <= n/2` (**low-s enforced**; BSC's precompile itself accepts high-s — verified live).
2. `clientDataJSON[typeIndex:]` starts with `"type":"webauthn.get"`.
3. `clientDataJSON[challengeIndex:]` starts with `"challenge":"<base64url(challenge)>"` (closing quote included).
4. `authenticatorData.length >= 37`, flags **UP (0x01)** and **UV (0x04)** set.
5. `P256VERIFY(sha256(authenticatorData ‖ sha256(clientDataJSON)), r, s, qx, qy)` via precompile `0x100`.

Not checked (same as the reference libraries): origin, rpIdHash, signCount, crossOrigin. Passkeys are RP-scoped by the
authenticator; synced passkeys report signCount 0. There is no pure-Solidity fallback in production: on a chain without
the precompile every signature is rejected.

### executeBatch

`deadline` → challenge → verify → **nonce++ (before any external call)** → run calls in order (each with `value`,
any failure reverts all with `CallFailed(index, returnData)`) → pay `gasFee` to `feeRecipient`
(`InsufficientBalanceForFee` if the batch left too little BNB). Reentrancy lock on the whole function. Anyone may
submit; only the signed `feeRecipient` gets paid. `gasFee = 0` ⇒ `feeRecipient` may be `address(0)`.

ERC-1271: `isValidSignature(hash, abi.encode(WebAuthnSig))` with the domain-separated challenge
`keccak256(abi.encode(keccak256("SproutAccount.ERC1271(bytes32 hash)"), chainid, account, hash))`, so a 1271
signature can never be used as an `executeBatch` signature or vice-versa. Malformed signature bytes return
`0xffffffff` (decoding runs in a self-staticcall to `decodeWebAuthnSig`), never revert.

The clone has no ERC-721/1155 receiver hooks (Flap coins are ERC-20; not needed).

**Receiving BNB — 2300-gas stipend caveat.** The account is an EIP-1167 clone, so every call (including a plain
BNB transfer) DELEGATECALLs the implementation. If the implementation address is *cold* in that transaction, the
DELEGATECALL alone costs 2600 gas (EIP-2929), so a payer using Solidity `transfer`/`send` (2300-gas stipend) **fails**
to pay a Sprout account. Payers using `call{value:}` (Sprout's own contracts, Flap, OpenZeppelin `sendValue`) and EOA
transfers with a gas limit a few thousand above 21,000 (wallets' `eth_estimateGas` handles this) work. Inside `executeBatch` the implementation is already warm, so
WBNB `withdraw()` (which uses `transfer`) works — tested against the real BSC WBNB on a fork. A plain EOA transfer
with a hard 21,000 gas limit fails to ANY deployed contract, this one included; before deployment the counterfactual
address has no code and accepts anything. Check how 1Click delivers native BNB on BSC before relying on deliveries to
an already-deployed account (unverified here).

### Typical batches (built by the site, Zcash-first)

- **Bring ZEC in**: no on-chain action — the 1Click quote's `recipient` is `factory.getAddress(qx,qy)`; BNB just arrives.
- **Launch / buy**: `[VaultPortal.newTokenV6WithVault{value}(…)]` or `[Portal.swapExactInput{value}(…)]`.
- **Cash out to Zcash**: `[token.approve(terminal, amt), SproutTerminal.sellAndBridge(token, amt, minBnb, oneClickDeposit, quoteRef)]`
  — the BNB reaches the 1Click deposit address only if the sale succeeds (atomic batch).
- First use: relayer calls `factory.createAccountAndExecute(qx, qy, …)` (deploy + execute, ~264k gas for a 1-call batch).

## JS helper (`js/challenge.ts`)

Dependency-free except `viem`. Used by the site and the relayer (copy or import):

- `computeChallenge`, `hashCalls`, `erc1271Challenge`, `challengeBytes`, `base64url`
- `buildWebAuthnSig(credential.response, expectedChallenge)` — DER → (r,s), **low-s normalisation**, byte-offset
  discovery of `challengeIndex`/`typeIndex`, UP/UV + challenge sanity checks
- `encodeWebAuthnSig` (ERC-1271 bytes), `webAuthnSigToJson` / `parseWebAuthnSigJson` (relayer transport)
- `publicKeyFromSpki(response.getPublicKey())`, `publicKeyFromCoseKey(...)` (fallback)
- `computeAccountAddress({ factory, implementation, qx, qy })` — counterfactual CREATE2 address
- `SPROUT_ACCOUNT_ABI`, `SPROUT_ACCOUNT_FACTORY_ABI` (minimal); full ABIs in `abi/`

Registration must request ES256 only (`pubKeyCredParams: [{ type: 'public-key', alg: -7 }]`), `residentKey: 'required'`,
`userVerification: 'required'`. Pass `clientDataJSON` byte-for-byte; never re-serialise it.

`js/gen-fixture.ts` regenerates `test/fixtures/js-assertion.json` (Node crypto acting as authenticator, DER
signature deliberately high-s, Chrome-style clientDataJSON). `test/JsFixture.t.sol` verifies it on-chain, proving the
TS and Solidity agree. **After any change to the contracts' bytecode** run the fixture test once, take the logged
factory address and run `node js/gen-fixture.ts <address>` (from `accounts/js`).

## Build & test

PowerShell (Foundry at `C:\Users\Administrator\tools\foundry`; libs come from `../contracts/lib` via `remappings.txt`):

```powershell
cd accounts
$forge = "C:\Users\Administrator\tools\foundry\forge.exe"
& $forge build
& $forge test                                    # cancun EVM: tests etch a pure-Solidity P-256 verifier at 0x100
$env:FOUNDRY_PROFILE='osaka'; & $forge test; Remove-Item Env:FOUNDRY_PROFILE   # native EIP-7951 precompile in revm
& $forge test --fork-url https://bsc-rpc.publicnode.com --evm-version osaka     # BSC state + native precompile
```

The tests probe 0x100 with a real signature and only etch `test/utils/P256VerifierSolidity.sol` (test-only) when no
working precompile exists. Note forge's simulated EVM does not run BSC's own node precompile even on a fork; the real
BSC precompile was exercised separately with `eth_call` (see below) and by the deploy script's preflight.

Coverage: happy path (value + calldata calls, fee after execution), anyone-can-submit, bad challenge (nonce, calls,
fee, recipient, deadline, other chain, other account, ERC-1271-wrapped), wrong key, replay, expired deadline (inclusive
boundary), high-s, r/s out of range, missing UP / UV, `webauthn.create`, wrong/out-of-range indexes, tampered
clientDataJSON, short authenticatorData, insufficient balance for gasFee (atomic, nonce not consumed), zero/rejecting fee
recipient, failing call bubbling, reentrancy via a call and via the fee recipient (with a genuinely valid inner
signature), ERC-1271 (fuzzed keys), factory determinism/idempotency/invalid keys/init protection, counterfactual
funding, `createAccountAndExecute`, base64url (RFC vectors + fuzz vs OZ), RIP-7212 vector, verifier agreement fuzz.
`test/Adversarial.t.sol` adds: deadline/value binding, relayer fee inflation, replay across factories, front-run of
`createAccountAndExecute`, huge indexes, challenge-prefix (closing quote), alternate key order, authData extensions,
post-signing flag flips, wrong message construction, a fake 0x100 that returns empty / 2 / 64 bytes / reverts / has
no code (all fail closed; skipped under the osaka profile, where forge forbids etching a native precompile), malformed
ERC-1271 input, 1271 on implementation/other account/other chain, WBNB-style `transfer` inside a batch (mock + real
BSC WBNB on fork), and the cold-stipend limitation above.

## Deploy (operator only)

```powershell
& $forge script script/DeployAccounts.s.sol --rpc-url $env:BSC_RPC_URL                    # dry run
& $forge script script/DeployAccounts.s.sol --rpc-url $env:BSC_RPC_URL --broadcast --private-key <key>
```

Deploys the factory through the canonical CREATE2 deployer (salt `ACCOUNT_FACTORY_SALT`, default
`keccak256("sprout.accounts.v1")`), after asking the live node to run the RIP-7212 vector on 0x100. Then set
`NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY` and give the site/relayer `factory.implementation()`. **Not deployed yet.**
