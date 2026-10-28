/** Zcash feature constants (SPEC v2 "Verified facts"). Safe to import from server and client code. */

export const ONECLICK_BASE = 'https://1click.chaindefuser.com/v0';

/** Native ZEC on Zcash (transparent side only for 1Click), 8 decimals. */
export const ASSET_ZEC = 'nep141:zec.omft.near';
export const ZEC_DECIMALS = 8;
/** Native BNB on BSC, 18 decimals. */
export const ASSET_BNB = 'nep245:v2_1.omni.hot.tg:56_11111111111111111111';
export const BNB_DECIMALS = 18;

/** Default slippage for Sprout quotes, in basis points (1%). */
export const SLIPPAGE_BPS = 100;
/** Deadline after which 1Click starts refunding a ZEC deposit (~80 min, Zcash blocks are ~75s). */
export const DEPOSIT_DEADLINE_MIN = 80;
/** Deadline for BSC-side deposits (cash-out). BSC confirms in seconds, the tx is sent right away. */
export const CASHOUT_DEADLINE_MIN = 30;

/** Shielded forwarder limits (SPEC "User model"). */
export const SHIELD_MAX_PER_PAYOUT_ZEC = 100;
export const SHIELD_MAX_PER_DAY_ZEC = 1000;
export const SHIELD_MAX_PAYOUTS_PER_DAY = 2000;

/** Unauthenticated 1Click requests pay this on top (docs: resources/fees). */
export const ONECLICK_UNAUTH_FEE_BPS = 25;

export const env = {
  accountFactory: (process.env.NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY || '').trim(),
  /** Optional: SproutAccountFactory.implementation() — enables computing the address locally without an RPC call. */
  accountImpl: (process.env.NEXT_PUBLIC_SPROUT_ACCOUNT_IMPL || '').trim(),
  relayerUrl: (process.env.NEXT_PUBLIC_RELAYER_URL || '').trim().replace(/\/+$/, ''),
  forwarderTaddr: (process.env.NEXT_PUBLIC_FORWARDER_TADDR || '').trim(),
  terminal: (process.env.NEXT_PUBLIC_SPROUT_TERMINAL || '').trim(),
  /** Optional WebAuthn RP ID (registrable domain, e.g. "sproutbnb.cash") so www/apex share one passkey. */
  passkeyRpId: (process.env.NEXT_PUBLIC_PASSKEY_RP_ID || '').trim(),
};

export const ZCASH_EXPLORER_TX = (h: string) => `https://blockchair.com/zcash/transaction/${h}`;
export const ZCASH_EXPLORER_ADDR = (a: string) => `https://blockchair.com/zcash/address/${a}`;
