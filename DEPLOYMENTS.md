# Sprout deployments — BNB Chain mainnet (56)

Deployed 2026-10-29. Sources verified on Sourcify.

| Contract | Address |
|---|---|
| SproutVaultFactory | `0xF3500a45BBF87Fcf7D1bB76D066434D9608F45C7` (block 130382385) |
| SproutVault beacon | `0x899aFa680D032dfcf3768A9198F811e9e77f6b6B` |
| SproutRoots | `0x31899b1e09af6a9644BC36E97358C0eE8f9D0082` |
| SproutPayouts | `0xf52728A7695cb3D9eE95FC284bB80BD79303AbDd` |
| SproutTerminal | `0x95F755f46190A3EeC869002966f4c36369D7c877` |
| SproutAccountFactory | `0x7EfaCA913261818226E004124d0bF4299B59aa1e` |
| SproutAccount implementation | `0x39D8d1bD21A26b6CbB78C9C817Cf152A0dF6267C` |

| Role | Address |
|---|---|
| Owner of Roots + Payouts, factory admin (currently the deployer) | `0x22094F6A0d313eA49b1928a99b2177e6FB1628E7` |
| Treasury | `0x8F3b1dBDbe0D8AFf4Cce6db97b2d638fe97073F3` |
| Keeper | `0x4Cae44e360AEAfbec8248ef4dC2C788DA238739B` |
| Relayer | `0xf7BA4e64F09BDD0ed80907F835E192c72F844B2D` |
| Reserved future owner | `0x421ab8E45A942C2D508Fa6a9477db42A7411b41a` |

Services (fly.io, region sin): `https://sproutbnb-relayer.fly.dev`, `https://sproutbnb-keeper.fly.dev` (live, DRY_RUN=false).
Not deployed: zforward (shielded cash-out) — needs a Zcash hot-wallet seed and ~0.01 ZEC.

## After $SPROUT is launched

To route fees correctly, launch $SPROUT through `SproutVaultFactory` (the site's launch page does this) with payout
mode "Another wallet" → treasury. Then the owner calls:

```
cast send 0x31899b1e09af6a9644BC36E97358C0eE8f9D0082 "setSprout(address)" <SPROUT token> --account sprout-deployer
```

and set `NEXT_PUBLIC_SPROUT_TOKEN` in Vercel, then redeploy.
