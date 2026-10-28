/**
 * Environment → config. The service always starts; when the wallet env (ZCASH_SEED, WALLET_DIR, LIGHTWALLETD_URL)
 * or FORWARDER_TOKEN is missing it runs in **idle mode**: /healthz and /status answer, nothing touches a wallet,
 * request registration returns 503 "not configured".
 */
import { registerSecret } from './log.js'
import { isTransparent } from './zaddr.js'

export const ZAT_PER_ZEC = 100_000_000n

export interface Config {
  port: number
  host: string
  network: 'mainnet' | 'testnet'
  token?: string
  // wallet
  seed?: string
  birthday?: number
  walletDir?: string
  lightwalletd?: string
  devtoolBin: string
  devtoolConnection: string
  walletTimeoutMs: number
  /** Optional: t-address the operator expects the wallet to derive (sanity check against the seed). */
  expectedTaddr?: string
  // state
  stateFile: string
  // 1Click
  oneClickBase: string
  oneClickJwt?: string
  // BSC proof
  bscRpcUrl?: string
  terminalAddress?: `0x${string}`
  payoutsAddress?: `0x${string}`
  onchainProof: 'required' | 'off'
  /** REQUIRE_BOUND_QUOTEREF=1: CashOut payouts are only forwarded when quoteRef commits to the shielded address. */
  requireBoundQuoteRef: boolean
  /** ADMIN_TOKEN (>= 24 chars, distinct from FORWARDER_TOKEN): enables POST /v1/admin/requests/:quoteRef/requeue. */
  adminToken?: string
  // limits
  maxPayoutZat: bigint
  maxDailyZat: bigint
  maxDailyCount: number
  /**
   * Deducted from each payout to cover the shield + send ZIP-317 fees (default 0.0004 ZEC). ZIP-317: 5000 zat per
   * logical action, min 2 actions; a 1-UTXO shield is ~3 actions (15,000 zat), a shielded send ~2–4 (10,000–20,000).
   */
  feeReserveZat: bigint
  /** Shielded balance required above a payout before sending (the send fee comes out of the pool). */
  sendFeeHeadroomZat: bigint
  /** Smallest net payout worth sending; below this the request goes to manual review. */
  minPayoutZat: bigint
  // timing
  tickMs: number
  /** How long after the quote deadline an undelivered request is expired. */
  expireGraceMs: number
}

export interface ConfigStatus {
  walletConfigured: boolean
  apiConfigured: boolean
  proofConfigured: boolean
  missing: string[]
}

const s = (k: string) => {
  const v = process.env[k]
  return v && v.trim() ? v.trim() : undefined
}

function zec(k: string, def: string): bigint {
  const v = s(k) ?? def
  if (!/^\d+(\.\d{1,8})?$/.test(v)) throw new Error(`${k} must be a ZEC amount like 1.5`)
  const [w, f = ''] = v.split('.')
  return BigInt(w) * ZAT_PER_ZEC + BigInt(f.padEnd(8, '0'))
}

const addr = (k: string) => {
  const v = s(k)
  if (!v) return undefined
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new Error(`${k} must be a 0x… address`)
  return v.toLowerCase() as `0x${string}`
}

/** "zec.rocks:443", "https://zec.rocks:443", "zecrocks" → what zcash-devtool's `-s` accepts. */
export function normalizeServer(v?: string): string | undefined {
  if (!v) return undefined
  const t = v.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  if (t === 'zecrocks' || t === 'ywallet') return t
  return t
    .split(',')
    .map((x) => (/:\d+$/.test(x) ? x : `${x}:443`))
    .join(',')
}

export function loadConfig(): Config {
  const seed = s('ZCASH_SEED')
  const token = s('FORWARDER_TOKEN')
  const jwt = s('ONECLICK_JWT')
  const rpc = s('BSC_RPC_URL')
  registerSecret(seed)
  registerSecret(token)
  registerSecret(jwt)
  const admin = s('ADMIN_TOKEN')
  registerSecret(admin)
  if (s('ONCHAIN_PROOF') === 'off' && s('NODE_ENV') === 'production' && s('ZCASH_NETWORK') !== 'testnet' && s('ALLOW_NO_PROOF') !== '1') {
    // Without the BSC proof, any holder of FORWARDER_TOKEN (i.e. anything the public relayer forwards) can steer payouts.
    throw new Error('ONCHAIN_PROOF=off is refused on mainnet production (set ALLOW_NO_PROOF=1 to override deliberately)')
  }
  if (rpc && /[?&/][A-Za-z0-9_-]{20,}/.test(rpc)) registerSecret(rpc)
  const network = s('ZCASH_NETWORK') === 'testnet' ? 'testnet' : 'mainnet'
  const expectedTaddr = s('FORWARDER_TADDR')
  if (expectedTaddr && !isTransparent(expectedTaddr, network)) throw new Error('FORWARDER_TADDR must be a transparent t-address')
  const bd = s('ZCASH_BIRTHDAY')
  return {
    port: Number(s('PORT') ?? 8080),
    host: s('HOST') ?? '::',
    network,
    token: token && token.length >= 24 ? token : undefined,
    seed,
    birthday: bd ? Number(bd) : undefined,
    walletDir: s('WALLET_DIR'),
    lightwalletd: normalizeServer(s('LIGHTWALLETD_URL')),
    devtoolBin: s('ZCASH_DEVTOOL_BIN') ?? 'zcash-devtool',
    devtoolConnection: s('ZCASH_CONNECTION') ?? 'direct',
    walletTimeoutMs: Number(s('WALLET_TIMEOUT_MS') ?? 15 * 60_000),
    expectedTaddr,
    stateFile: s('STATE_FILE') ?? (s('WALLET_DIR') ? `${s('WALLET_DIR')}/../zforward-state.json` : './zforward-state.json'),
    oneClickBase: (s('ONECLICK_BASE') ?? 'https://1click.chaindefuser.com/v0').replace(/\/+$/, ''),
    oneClickJwt: jwt,
    bscRpcUrl: rpc,
    terminalAddress: addr('SPROUT_TERMINAL') ?? addr('NEXT_PUBLIC_SPROUT_TERMINAL'),
    payoutsAddress: addr('SPROUT_PAYOUTS') ?? addr('NEXT_PUBLIC_SPROUT_PAYOUTS'),
    onchainProof: s('ONCHAIN_PROOF') === 'off' ? 'off' : 'required',
    requireBoundQuoteRef: s('REQUIRE_BOUND_QUOTEREF') === '1',
    adminToken: admin && admin.length >= 24 && admin !== token ? admin : undefined,
    maxPayoutZat: zec('MAX_PAYOUT_ZEC', '100'),
    maxDailyZat: zec('MAX_DAILY_ZEC', '1000'),
    maxDailyCount: Number(s('MAX_DAILY_PAYOUTS') ?? 2000),
    feeReserveZat: zec('FEE_RESERVE_ZEC', '0.0004'),
    sendFeeHeadroomZat: zec('SEND_FEE_HEADROOM_ZEC', '0.0002'),
    minPayoutZat: zec('MIN_PAYOUT_ZEC', '0.0005'),
    tickMs: Number(s('TICK_MS') ?? 30_000),
    expireGraceMs: Number(s('EXPIRE_GRACE_MS') ?? 24 * 3600_000),
  }
}

export function configStatus(c: Config): ConfigStatus {
  const missing: string[] = []
  if (!c.seed) missing.push('ZCASH_SEED')
  if (!c.walletDir) missing.push('WALLET_DIR')
  if (!c.lightwalletd) missing.push('LIGHTWALLETD_URL')
  if (!c.token) missing.push('FORWARDER_TOKEN (>= 24 chars)')
  const proofConfigured = c.onchainProof === 'off' || (!!c.bscRpcUrl && !!(c.terminalAddress || c.payoutsAddress))
  if (!proofConfigured) missing.push('BSC_RPC_URL + SPROUT_TERMINAL/SPROUT_PAYOUTS (or ONCHAIN_PROOF=off)')
  return {
    walletConfigured: !!(c.seed && c.walletDir && c.lightwalletd),
    apiConfigured: !!c.token,
    proofConfigured,
    missing,
  }
}
