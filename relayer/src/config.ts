/**
 * Environment configuration. Every value is optional: when the core trio (BSC_RPC_URL, RELAYER_PRIVATE_KEY,
 * SPROUT_ACCOUNT_FACTORY) is missing the service starts in an idle "not configured" mode - /healthz answers, /relay and
 * /quote-gas return 503. The shield-request route has its own pair (FORWARDER_URL, FORWARDER_TOKEN).
 */
import { type Address, type Hex, getAddress, isAddress } from 'viem'

export type Config = {
  port: number
  chainId: number
  rpcUrl?: string
  privateKey?: Hex
  accountFactory?: Address
  /** Missing core env names (empty => relaying is configured). */
  missing: string[]
  /** Errors in provided env values (bad key format etc.) - treated like missing, reported on /healthz. */
  invalid: string[]

  allowedOrigins: string[]
  /** Which proxy header carries the client IP: 'fly' (Fly-Client-IP, set by Fly's edge), 'xff' (right-most
   *  X-Forwarded-For entry) or 'off' (socket address). Defaults to 'fly' only when running on Fly (FLY_APP_NAME). */
  trustProxy: 'fly' | 'xff' | 'off'

  // griefing guard: BNB the relayer may lose to on-chain reverts / cancellations per rolling hour
  revertBudgetWei: bigint
  ipStrikeLimit: number
  rlQuoteGlobal: number
  rlRelayGlobal: number

  // gas policy
  maxGasPriceWei: bigint
  minGasPriceWei: bigint
  gasPriceBumpBps: number // added on top of eth_gasPrice when sending (e.g. 1000 = +10%)
  quoteMarginBps: number // margin baked into /quote-gas
  relayMinMarginBps: number // minimum margin over the fresh estimate required by /relay
  verifyOverheadGas: bigint
  deployOverheadGas: bigint
  maxGasPerTx: bigint
  maxCalls: number
  maxCalldataBytes: number
  deadlineMinSec: number
  deadlineMaxSec: number
  deadlineSuggestSec: number
  minRelayerBalanceWei: bigint

  // tx management
  stuckAfterMs: number
  replaceBumpBps: number
  maxPendingTxs: number
  monitorIntervalMs: number

  // rate limits (requests per minute)
  rlRelayPerIp: number
  rlRelayPerAccount: number
  rlQuotePerIp: number
  rlShieldPerIp: number
  rlReadPerIp: number

  // Zcash shield forwarder
  forwarderUrl?: string
  forwarderToken?: string
  forwarderRequestPath: string
  forwarderTaddr?: string
  oneClickBase: string
  oneClickJwt?: string
  shieldVerifyQuote: boolean
  shieldMaxZats: bigint
}

// No `*.vercel.app` by default: anyone can host a page there. Add your preview domain explicitly via ALLOWED_ORIGINS.
const DEFAULT_ORIGINS = ['https://sproutbnb.cash', 'https://www.sproutbnb.cash', 'http://localhost:3000']

function num(env: NodeJS.ProcessEnv, k: string, d: number): number {
  const v = env[k]
  if (v === undefined || v.trim() === '') return d
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) throw new Error(`${k} must be a non-negative number`)
  return n
}

function gweiToWei(g: number): bigint {
  // up to 9 decimals of gwei
  const [i, f = ''] = g.toFixed(9).split('.')
  return BigInt(i) * 1_000_000_000n + BigInt((f + '000000000').slice(0, 9))
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const missing: string[] = []
  const invalid: string[] = []
  const s = (k: string) => {
    const v = env[k]?.trim()
    return v ? v : undefined
  }

  const rpcUrl = s('BSC_RPC_URL')
  if (!rpcUrl) missing.push('BSC_RPC_URL')
  else if (!/^https?:\/\//.test(rpcUrl)) invalid.push('BSC_RPC_URL (must be http(s))')

  let privateKey: Hex | undefined
  const pk = s('RELAYER_PRIVATE_KEY')
  if (!pk) missing.push('RELAYER_PRIVATE_KEY')
  else {
    const h = (pk.startsWith('0x') ? pk : `0x${pk}`) as Hex
    if (/^0x[0-9a-fA-F]{64}$/.test(h)) privateKey = h
    else invalid.push('RELAYER_PRIVATE_KEY (must be 32-byte hex)')
  }

  let accountFactory: Address | undefined
  const f = s('SPROUT_ACCOUNT_FACTORY') ?? s('NEXT_PUBLIC_SPROUT_ACCOUNT_FACTORY')
  if (!f) missing.push('SPROUT_ACCOUNT_FACTORY')
  else if (isAddress(f, { strict: false })) accountFactory = getAddress(f)
  else invalid.push('SPROUT_ACCOUNT_FACTORY (not an address)')

  const allowedOrigins = (s('ALLOWED_ORIGINS') ?? DEFAULT_ORIGINS.join(','))
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

  const forwarderUrl = s('FORWARDER_URL')?.replace(/\/+$/, '')
  const forwarderTaddr = s('FORWARDER_TADDR') ?? s('NEXT_PUBLIC_FORWARDER_TADDR')

  return {
    port: num(env, 'PORT', 8080),
    chainId: num(env, 'CHAIN_ID', 56),
    rpcUrl,
    privateKey,
    accountFactory,
    missing,
    invalid,
    allowedOrigins,
    trustProxy: (() => {
      const v = (s('TRUST_PROXY') ?? (s('FLY_APP_NAME') ? 'fly' : 'off')).toLowerCase()
      return v === 'xff' ? 'xff' : v === 'fly' || v === 'on' ? 'fly' : 'off'
    })(),
    revertBudgetWei: gweiToWei(num(env, 'REVERT_BUDGET_BNB_PER_HOUR', 0.01) * 1e9),
    ipStrikeLimit: num(env, 'IP_STRIKES_PER_HOUR', 5),
    rlQuoteGlobal: num(env, 'RL_QUOTE_GLOBAL', 600),
    rlRelayGlobal: num(env, 'RL_RELAY_GLOBAL', 240),

    maxGasPriceWei: gweiToWei(num(env, 'MAX_GAS_PRICE_GWEI', 3)),
    minGasPriceWei: gweiToWei(num(env, 'MIN_GAS_PRICE_GWEI', 0.05)),
    gasPriceBumpBps: num(env, 'GAS_PRICE_BUMP_BPS', 0),
    quoteMarginBps: num(env, 'QUOTE_MARGIN_BPS', 1500),
    relayMinMarginBps: num(env, 'RELAY_MIN_MARGIN_BPS', 500),
    verifyOverheadGas: BigInt(num(env, 'VERIFY_OVERHEAD_GAS', 65_000)),
    deployOverheadGas: BigInt(num(env, 'DEPLOY_OVERHEAD_GAS', 150_000)),
    maxGasPerTx: BigInt(num(env, 'MAX_GAS_PER_TX', 4_000_000)),
    maxCalls: num(env, 'MAX_CALLS', 16),
    maxCalldataBytes: num(env, 'MAX_CALLDATA_BYTES', 48_000),
    deadlineMinSec: num(env, 'DEADLINE_MIN_SEC', 20),
    deadlineMaxSec: num(env, 'DEADLINE_MAX_SEC', 3600),
    deadlineSuggestSec: num(env, 'DEADLINE_SUGGEST_SEC', 600),
    minRelayerBalanceWei: gweiToWei(num(env, 'MIN_RELAYER_BALANCE_BNB', 0.005) * 1e9),

    stuckAfterMs: num(env, 'STUCK_AFTER_SEC', 45) * 1000,
    replaceBumpBps: num(env, 'REPLACE_BUMP_BPS', 2500),
    maxPendingTxs: num(env, 'MAX_PENDING_TXS', 24),
    monitorIntervalMs: num(env, 'MONITOR_INTERVAL_SEC', 6) * 1000,

    rlRelayPerIp: num(env, 'RL_RELAY_PER_IP', 12),
    rlRelayPerAccount: num(env, 'RL_RELAY_PER_ACCOUNT', 6),
    rlQuotePerIp: num(env, 'RL_QUOTE_PER_IP', 60),
    rlShieldPerIp: num(env, 'RL_SHIELD_PER_IP', 10),
    rlReadPerIp: num(env, 'RL_READ_PER_IP', 240),

    forwarderUrl: forwarderUrl && /^https?:\/\//.test(forwarderUrl) ? forwarderUrl : undefined,
    forwarderToken: s('FORWARDER_TOKEN'),
    forwarderRequestPath: s('FORWARDER_REQUEST_PATH') ?? '/v1/requests',
    forwarderTaddr,
    oneClickBase: (s('ONECLICK_BASE') ?? 'https://1click.chaindefuser.com/v0').replace(/\/+$/, ''),
    oneClickJwt: s('ONECLICK_JWT'),
    shieldVerifyQuote: (s('SHIELD_VERIFY_QUOTE') ?? 'on') !== 'off',
    shieldMaxZats: BigInt(Math.round(num(env, 'SHIELD_MAX_ZEC', 100) * 1e8)),
  }
}

export const isRelayConfigured = (c: Config) =>
  c.missing.length === 0 && c.invalid.length === 0 && !!c.rpcUrl && !!c.privateKey && !!c.accountFactory

export const isShieldConfigured = (c: Config) => !!c.forwarderUrl && !!c.forwarderToken
