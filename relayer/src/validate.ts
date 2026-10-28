/**
 * Request shape validation for the public endpoints. Pure (no RPC) so it is unit-testable.
 * JSON bigints arrive as decimal strings (the site uses webAuthnSigToJson / value.toString()); plain JSON numbers are
 * accepted only when they are safe integers.
 */
import { z } from 'zod'
import { type Address, type Hex, getAddress, isAddress, keccak256, toBytes } from 'viem'
import type { Call, WebAuthnSig } from './challenge.js'
import { P256_N } from './challenge.js'
import { zcashAddressInfo } from './zcash.js'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

const UINT256_MAX = (1n << 256n) - 1n

const uint = (max: bigint = UINT256_MAX) =>
  z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      if (typeof v === 'number') {
        if (!Number.isSafeInteger(v) || v < 0) {
          ctx.addIssue({ code: 'custom', message: 'must be a non-negative integer (send large values as decimal strings)' })
          return z.NEVER
        }
        return BigInt(v)
      }
      const t = v.trim()
      if (!/^(0|[1-9][0-9]{0,77})$/.test(t) && !/^0x[0-9a-fA-F]{1,64}$/.test(t)) {
        ctx.addIssue({ code: 'custom', message: 'must be a decimal (or 0x hex) unsigned integer string' })
        return z.NEVER
      }
      const b = BigInt(t)
      if (b > max) {
        ctx.addIssue({ code: 'custom', message: 'out of range' })
        return z.NEVER
      }
      return b
    })

const address = z.string().transform((v, ctx) => {
  const t = v.trim()
  if (!isAddress(t, { strict: false })) {
    ctx.addIssue({ code: 'custom', message: 'not an EVM address' })
    return z.NEVER
  }
  return getAddress(t) as Address
})

const bytes32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be 0x + 64 hex chars')
  .transform((v) => v.toLowerCase() as Hex)

const hexBytes = (maxBytes: number) =>
  z
    .string()
    .regex(/^0x([0-9a-fA-F]{2})*$/, 'must be 0x-prefixed even-length hex')
    .refine((v) => (v.length - 2) / 2 <= maxBytes, `at most ${maxBytes} bytes`)
    .transform((v) => v.toLowerCase() as Hex)

export const callSchema = (maxData: number) =>
  z.object({
    to: address,
    value: uint().default(0n),
    data: hexBytes(maxData).default('0x'),
  })

export const sigSchema = z.object({
  authenticatorData: hexBytes(1024).refine((v) => (v.length - 2) / 2 >= 37, 'authenticatorData must be >= 37 bytes'),
  clientDataJSON: z.string().min(40).max(2048),
  challengeIndex: uint(2048n),
  typeIndex: uint(2048n),
  r: uint(P256_N - 1n).refine((v) => v > 0n, 'r must be > 0'),
  s: uint(P256_N - 1n).refine((v) => v > 0n, 's must be > 0'),
})

export type Limits = { maxCalls: number; maxCalldataBytes: number }

export function quoteSchema(l: Limits) {
  return z.object({
    account: address,
    qx: bytes32.optional(),
    qy: bytes32.optional(),
    calls: z.array(callSchema(l.maxCalldataBytes)).min(1).max(l.maxCalls),
    deployed: z.boolean().optional(),
  })
}

export function relaySchema(l: Limits) {
  return z.object({
    account: address,
    qx: bytes32.optional(),
    qy: bytes32.optional(),
    calls: z.array(callSchema(l.maxCalldataBytes)).min(1).max(l.maxCalls),
    deadline: uint((1n << 64n) - 1n),
    gasFee: uint(10n ** 21n), // 1000 BNB — anything above is certainly a client bug
    feeRecipient: address,
    sig: sigSchema,
  })
}

export type QuoteRequest = {
  account: Address
  qx?: Hex
  qy?: Hex
  calls: Call[]
  deployed?: boolean
}

export type RelayRequest = {
  account: Address
  qx?: Hex
  qy?: Hex
  calls: Call[]
  deadline: bigint
  gasFee: bigint
  feeRecipient: Address
  sig: WebAuthnSig
}

function formatIssues(e: z.ZodError): string {
  return e.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
    .join('; ')
}

function checkPair(r: { qx?: Hex; qy?: Hex }) {
  if ((r.qx === undefined) !== (r.qy === undefined)) throw new HttpError(400, 'qx and qy must be given together')
}

function checkTotalCalldata(calls: Call[], max: number) {
  const total = calls.reduce((n, c) => n + (c.data.length - 2) / 2, 0)
  if (total > max) throw new HttpError(413, `calls carry ${total} bytes of calldata (max ${max})`)
}

export function parseQuote(body: unknown, l: Limits): QuoteRequest {
  const r = quoteSchema(l).safeParse(body)
  if (!r.success) throw new HttpError(400, `invalid request: ${formatIssues(r.error)}`)
  checkPair(r.data)
  checkTotalCalldata(r.data.calls, l.maxCalldataBytes)
  return r.data
}

export function parseRelay(body: unknown, l: Limits): RelayRequest {
  const r = relaySchema(l).safeParse(body)
  if (!r.success) throw new HttpError(400, `invalid request: ${formatIssues(r.error)}`)
  checkPair(r.data)
  checkTotalCalldata(r.data.calls, l.maxCalldataBytes)
  return r.data
}

// ------------------------------------------------------------------------------------------------ shield request

export const shieldSchema = z.object({
  quoteRef: bytes32,
  shieldedAddress: z.string().trim().min(10).max(2048),
  depositAddress: address,
  // optional context the site sends (forwarded verbatim after validation)
  correlationId: z.string().max(128).optional(),
  amountOutZec: z.string().max(40).optional(),
  deadline: z.string().max(64).optional(),
  account: address.optional(),
})

export type ShieldRequest = z.output<typeof shieldSchema> & { addressKind: 'sapling' | 'unified'; receivers?: string[] }

/** quoteRef convention shared with the site and contracts: keccak256(20 address bytes of the 1Click BSC deposit address). */
export const quoteRefOf = (depositAddress: Address): Hex => keccak256(getAddress(depositAddress))

/**
 * Binding quoteRef the site uses for shielded cash-outs (same formula as zforward/src/validate.ts shieldQuoteRef and
 * src/features/zcash/cashout.tsx shieldQuoteRefOf): the user's signed CashOut commits to the shielded destination.
 */
export const shieldQuoteRefOf = (depositAddress: Address, shieldedAddress: string): Hex =>
  keccak256(toBytes(`sprout-shield:v1:${depositAddress.toLowerCase()}:${shieldedAddress.trim()}`))

export function parseShield(body: unknown): ShieldRequest {
  const r = shieldSchema.safeParse(body)
  if (!r.success) throw new HttpError(400, `invalid request: ${formatIssues(r.error)}`)
  const d = r.data
  const q = d.quoteRef.toLowerCase()
  if (q !== shieldQuoteRefOf(d.depositAddress, d.shieldedAddress) && q !== quoteRefOf(d.depositAddress)) {
    throw new HttpError(
      400,
      'quoteRef must equal keccak256("sprout-shield:v1:" + lower(depositAddress) + ":" + shieldedAddress) (or the legacy keccak256(depositAddress))',
    )
  }
  const info = zcashAddressInfo(d.shieldedAddress)
  if (!info.valid) throw new HttpError(400, `shieldedAddress: ${info.reason}`)
  if (info.kind === 'transparent') {
    throw new HttpError(400, 'shieldedAddress is a transparent (t-) address — cash out to it directly, no forwarder needed')
  }
  if (info.kind === 'tex') throw new HttpError(400, 'shieldedAddress is a TEX (transparent-source-only) address, not shielded')
  if (info.network !== 'mainnet') throw new HttpError(400, 'shieldedAddress is not a Zcash mainnet address')
  if (info.kind === 'unified' && !info.hasShieldedReceiver) {
    throw new HttpError(400, 'unified address has no shielded (Sapling/Orchard) receiver')
  }
  return { ...d, addressKind: info.kind, receivers: info.receivers }
}
