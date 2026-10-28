// COPIED VERBATIM from accounts/js/challenge.ts (owned by the accounts agent). Keep in sync: re-copy, don't edit.
/**
 * Sprout passkey accounts — client helper (challenge.ts)
 * =====================================================
 *
 * Self-contained helper shared by the site (web-zcash) and the relayer. Only dependency: `viem`.
 * Copy this file as-is or import it. It mirrors `accounts/src/SproutAccount.sol` EXACTLY; if you change one,
 * change the other and re-run `forge test` (test/JsFixture.t.sol verifies a fixture produced by this file).
 *
 * Flow (browser):
 *   1. Registration: navigator.credentials.create(...)  ->  publicKeyFromSpki(resp.getPublicKey())  ->  {qx, qy}
 *      account = computeAccountAddress({ factory, implementation, qx, qy })   (counterfactual; fund it via 1Click)
 *   2. Signing a batch:
 *      const challenge = computeChallenge({ chainId, account, nonce, deadline, gasFee, feeRecipient, calls })
 *      const cred = await navigator.credentials.get({ publicKey: {
 *          challenge: challengeBytes(challenge), rpId: 'sproutbnb.cash', userVerification: 'required',
 *          allowCredentials: [{ type: 'public-key', id: credentialId }] } })
 *      const sig = buildWebAuthnSig(cred.response, challenge)      // DER -> (r, low-s), index discovery, checks
 *      POST relayer /relay { account, qx, qy, calls, deadline, gasFee, feeRecipient, sig }  (bigints as decimal strings)
 *   3. Relayer: simulate + submit `executeBatch(calls, deadline, gasFee, feeRecipient, sig)` on the account, or
 *      `factory.createAccountAndExecute(qx, qy, calls, ...)` when the account has no code yet.
 *
 * Challenge (SPEC v2):
 *   keccak256(abi.encode(uint256 chainid, address account, uint256 nonce, uint256 deadline, uint256 gasFee,
 *                        address feeRecipient, bytes32 keccak256(abi.encode(Call[] calls))))
 *   The 32 raw bytes are the WebAuthn challenge; the browser writes base64url(challenge) into clientDataJSON.
 *
 * SECURITY: the passkey is the ONLY key to a Sprout account. No recovery exists. Prefer synced passkeys.
 */
import {
  type Address,
  type Hex,
  bytesToHex,
  encodeAbiParameters,
  getAddress,
  getContractAddress,
  hexToBytes,
  keccak256,
  concatHex,
} from 'viem'

// ----------------------------------------------------------------------------------------------- constants

/** secp256r1 group order n and n/2 (low-s bound). */
export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
export const P256_N_DIV_2 = P256_N / 2n

/** WebAuthn authenticatorData flag bits (byte 32). */
export const FLAG_UP = 0x01
export const FLAG_UV = 0x04

/** keccak256("SproutAccount.ERC1271(bytes32 hash)") — matches SproutAccount.ERC1271_TYPEHASH. */
export const ERC1271_TYPEHASH = keccak256(new TextEncoder().encode('SproutAccount.ERC1271(bytes32 hash)'))

// ----------------------------------------------------------------------------------------------- types

export type Call = { to: Address; value: bigint; data: Hex }

/** Same field order as the Solidity struct `WebAuthnSig`. */
export type WebAuthnSig = {
  authenticatorData: Hex
  clientDataJSON: string
  challengeIndex: bigint
  typeIndex: bigint
  r: bigint
  s: bigint
}

/** ABI parameter descriptors (usable with viem encodeAbiParameters / contract writes). */
export const CALL_COMPONENTS = [
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'data', type: 'bytes' },
] as const

export const WEBAUTHN_SIG_COMPONENTS = [
  { name: 'authenticatorData', type: 'bytes' },
  { name: 'clientDataJSON', type: 'string' },
  { name: 'challengeIndex', type: 'uint256' },
  { name: 'typeIndex', type: 'uint256' },
  { name: 'r', type: 'uint256' },
  { name: 's', type: 'uint256' },
] as const

/** Minimal ABIs for the calls the site/relayer need (full ABIs: accounts/abi/*.json). */
export const SPROUT_ACCOUNT_ABI = [
  {
    type: 'function', name: 'executeBatch', stateMutability: 'nonpayable', outputs: [],
    inputs: [
      { name: 'calls', type: 'tuple[]', components: CALL_COMPONENTS },
      { name: 'deadline', type: 'uint256' },
      { name: 'gasFee', type: 'uint256' },
      { name: 'feeRecipient', type: 'address' },
      { name: 'sig', type: 'tuple', components: WEBAUTHN_SIG_COMPONENTS },
    ],
  },
  { type: 'function', name: 'nonce', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  {
    type: 'function', name: 'owner', stateMutability: 'view', inputs: [],
    outputs: [{ name: 'qx', type: 'bytes32' }, { name: 'qy', type: 'bytes32' }],
  },
] as const

export const SPROUT_ACCOUNT_FACTORY_ABI = [
  { type: 'function', name: 'implementation', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  {
    type: 'function', name: 'getAddress', stateMutability: 'view',
    inputs: [{ name: 'qx', type: 'bytes32' }, { name: 'qy', type: 'bytes32' }], outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function', name: 'createAccount', stateMutability: 'nonpayable',
    inputs: [{ name: 'qx', type: 'bytes32' }, { name: 'qy', type: 'bytes32' }], outputs: [{ name: 'account', type: 'address' }],
  },
  {
    type: 'function', name: 'createAccountAndExecute', stateMutability: 'nonpayable',
    inputs: [
      { name: 'qx', type: 'bytes32' },
      { name: 'qy', type: 'bytes32' },
      { name: 'calls', type: 'tuple[]', components: CALL_COMPONENTS },
      { name: 'deadline', type: 'uint256' },
      { name: 'gasFee', type: 'uint256' },
      { name: 'feeRecipient', type: 'address' },
      { name: 'sig', type: 'tuple', components: WEBAUTHN_SIG_COMPONENTS },
    ],
    outputs: [{ name: 'account', type: 'address' }],
  },
] as const

// ----------------------------------------------------------------------------------------------- challenge

/** keccak256(abi.encode(Call[] calls)) — equals SproutAccount.hashCalls(calls). */
export function hashCalls(calls: readonly Call[]): Hex {
  return keccak256(encodeAbiParameters([{ type: 'tuple[]', components: CALL_COMPONENTS }], [calls.map((c) => ({ to: getAddress(c.to), value: BigInt(c.value), data: c.data }))]))
}

/** The 32-byte challenge the passkey must sign for SproutAccount.executeBatch. */
export function computeChallenge(p: {
  chainId: bigint | number
  account: Address
  nonce: bigint
  deadline: bigint
  gasFee: bigint
  feeRecipient: Address
  calls: readonly Call[]
}): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'uint256' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' },
        { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' },
      ],
      [BigInt(p.chainId), getAddress(p.account), p.nonce, p.deadline, p.gasFee, getAddress(p.feeRecipient), hashCalls(p.calls)],
    ),
  )
}

/** Challenge for ERC-1271 (`isValidSignature(hash, abi.encode(sig))`) — domain-separated from executeBatch. */
export function erc1271Challenge(p: { chainId: bigint | number; account: Address; hash: Hex }): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }],
      [ERC1271_TYPEHASH, BigInt(p.chainId), getAddress(p.account), p.hash],
    ),
  )
}

/** Raw challenge bytes to pass as `publicKey.challenge` to navigator.credentials.get(). */
export function challengeBytes(challenge: Hex): Uint8Array {
  const b = hexToBytes(challenge)
  if (b.length !== 32) throw new Error('challenge must be 32 bytes')
  return b
}

/** RFC 4648 §5 base64url without padding (what browsers put in clientDataJSON.challenge). */
export function base64url(bytes: Uint8Array): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  let out = ''
  let i = 0
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + A[(n >> 6) & 63] + A[n & 63]
  }
  const rem = bytes.length - i
  if (rem === 1) {
    const n = bytes[i] << 16
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63]
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8)
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + A[(n >> 6) & 63]
  }
  return out
}

// ----------------------------------------------------------------------------------------------- signature

/** Parse an ASN.1 DER ECDSA signature (SEQUENCE { INTEGER r, INTEGER s }) as returned by WebAuthn. */
export function parseDerSignature(der: Uint8Array): { r: bigint; s: bigint } {
  let p = 0
  const fail = (m: string): never => {
    throw new Error(`bad DER signature: ${m}`)
  }
  const readLen = (): number => {
    let len = der[p++]
    if (len === undefined) fail('truncated')
    if (len & 0x80) {
      const nBytes = len & 0x7f
      if (nBytes === 0 || nBytes > 2) fail('length')
      len = 0
      for (let k = 0; k < nBytes; k++) len = (len << 8) | der[p++]
    }
    return len
  }
  const readInt = (): bigint => {
    if (der[p++] !== 0x02) fail('expected INTEGER')
    const len = readLen()
    if (len === 0 || p + len > der.length) fail('int length')
    const v = der.subarray(p, p + len)
    p += len
    return v.length ? BigInt(bytesToHex(v)) : 0n
  }
  if (der[p++] !== 0x30) fail('expected SEQUENCE')
  const seqLen = readLen()
  if (p + seqLen !== der.length) fail('sequence length')
  const r = readInt()
  const s = readInt()
  if (p !== der.length) fail('trailing bytes')
  if (r <= 0n || r >= P256_N || s <= 0n || s >= P256_N) fail('scalar out of range')
  return { r, s }
}

/** Low-s normalisation: the contract rejects s > n/2 (both (r,s) and (r,n-s) are valid ECDSA; we keep the low one). */
export function normalizeS(s: bigint): bigint {
  return s > P256_N_DIV_2 ? P256_N - s : s
}

/** Byte offset of `needle` in `haystack` (both UTF-8 bytes), or -1. */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer
    return i
  }
  return -1
}

/**
 * Find the byte offsets the contract needs inside clientDataJSON:
 *   typeIndex      -> `"type":"webauthn.get"`
 *   challengeIndex -> `"challenge":"`
 * Offsets are BYTE offsets of the UTF-8 encoding (the contract indexes bytes, not JS string code units).
 */
export function findClientDataIndices(clientDataJSON: string | Uint8Array): { challengeIndex: bigint; typeIndex: bigint } {
  const enc = new TextEncoder()
  const bytes = typeof clientDataJSON === 'string' ? enc.encode(clientDataJSON) : clientDataJSON
  const typeIndex = indexOfBytes(bytes, enc.encode('"type":"webauthn.get"'))
  const challengeIndex = indexOfBytes(bytes, enc.encode('"challenge":"'))
  if (typeIndex < 0) throw new Error('clientDataJSON: "type":"webauthn.get" not found')
  if (challengeIndex < 0) throw new Error('clientDataJSON: "challenge" not found')
  return { challengeIndex: BigInt(challengeIndex), typeIndex: BigInt(typeIndex) }
}

type BufferLike = ArrayBuffer | ArrayBufferView | Uint8Array
function toBytes(b: BufferLike): Uint8Array {
  if (b instanceof Uint8Array) return b
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  return new Uint8Array(b)
}

/**
 * Turn a browser assertion (`PublicKeyCredential.response` from navigator.credentials.get) into the on-chain struct.
 * If `expectedChallenge` is given, checks the embedded challenge matches (catches stale/mismatched signing early).
 * Also checks UP+UV flags (the contract requires both — request `userVerification: 'required'`).
 */
export function buildWebAuthnSig(
  response: { authenticatorData: BufferLike; clientDataJSON: BufferLike; signature: BufferLike },
  expectedChallenge?: Hex,
): WebAuthnSig {
  const authData = toBytes(response.authenticatorData)
  const cdjBytes = toBytes(response.clientDataJSON)
  if (authData.length < 37) throw new Error('authenticatorData too short')
  const flags = authData[32]
  if (!(flags & FLAG_UP)) throw new Error('authenticator did not report user presence (UP)')
  if (!(flags & FLAG_UV)) throw new Error('authenticator did not report user verification (UV) — use userVerification: "required"')

  const clientDataJSON = new TextDecoder('utf-8', { fatal: true }).decode(cdjBytes)
  const { challengeIndex, typeIndex } = findClientDataIndices(cdjBytes)

  if (expectedChallenge) {
    const want = `"challenge":"${base64url(challengeBytes(expectedChallenge))}"`
    const got = new TextDecoder().decode(cdjBytes.subarray(Number(challengeIndex), Number(challengeIndex) + want.length))
    if (got !== want) throw new Error('clientDataJSON challenge does not match the expected challenge')
  }

  const { r, s } = parseDerSignature(toBytes(response.signature))
  return { authenticatorData: bytesToHex(authData), clientDataJSON, challengeIndex, typeIndex, r, s: normalizeS(s) }
}

/** abi.encode(WebAuthnSig) — the `signature` argument for SproutAccount.isValidSignature (ERC-1271). */
export function encodeWebAuthnSig(sig: WebAuthnSig): Hex {
  return encodeAbiParameters([{ type: 'tuple', components: WEBAUTHN_SIG_COMPONENTS }], [sig])
}

/** JSON-safe form (bigints -> decimal strings) for POSTing to the relayer; `parseWebAuthnSigJson` reverses it. */
export function webAuthnSigToJson(sig: WebAuthnSig) {
  return { ...sig, challengeIndex: sig.challengeIndex.toString(), typeIndex: sig.typeIndex.toString(), r: sig.r.toString(), s: sig.s.toString() }
}
export function parseWebAuthnSigJson(j: {
  authenticatorData: string; clientDataJSON: string; challengeIndex: string | number; typeIndex: string | number; r: string; s: string
}): WebAuthnSig {
  return {
    authenticatorData: j.authenticatorData as Hex,
    clientDataJSON: j.clientDataJSON,
    challengeIndex: BigInt(j.challengeIndex),
    typeIndex: BigInt(j.typeIndex),
    r: BigInt(j.r),
    s: BigInt(j.s),
  }
}

// ----------------------------------------------------------------------------------------------- public key

const toHex32 = (b: Uint8Array): Hex => bytesToHex(b, { size: 32 })

/**
 * P-256 public key from SubjectPublicKeyInfo DER (`AuthenticatorAttestationResponse.getPublicKey()`), 91 bytes:
 * 3059 3013 0607 2a8648ce3d0201 0608 2a8648ce3d030107 0342 00 04 <x:32> <y:32>
 */
export function publicKeyFromSpki(spki: BufferLike): { qx: Hex; qy: Hex } {
  const b = toBytes(spki)
  const PREFIX = '3059301306072a8648ce3d020106082a8648ce3d030107034200'
  if (b.length !== 91 || bytesToHex(b.subarray(0, 26)).slice(2) !== PREFIX || b[26] !== 0x04) {
    throw new Error('not an uncompressed P-256 SPKI public key (is the credential ES256 / alg -7?)')
  }
  return { qx: toHex32(b.subarray(27, 59)), qy: toHex32(b.subarray(59, 91)) }
}

/**
 * Fallback: P-256 key from a COSE_Key (EC2, alg ES256) — e.g. the credentialPublicKey inside attestation authData
 * when getPublicKey() is unavailable. Locates the -2 (x) and -3 (y) 32-byte bstr entries: 21 58 20 <x> 22 58 20 <y>.
 */
export function publicKeyFromCoseKey(cose: BufferLike): { qx: Hex; qy: Hex } {
  const b = toBytes(cose)
  const ix = indexOfBytes(b, new Uint8Array([0x21, 0x58, 0x20]))
  const iy = indexOfBytes(b, new Uint8Array([0x22, 0x58, 0x20]))
  if (ix < 0 || iy < 0 || ix + 35 > b.length || iy + 35 > b.length) throw new Error('COSE key: x/y not found')
  return { qx: toHex32(b.subarray(ix + 3, ix + 35)), qy: toHex32(b.subarray(iy + 3, iy + 35)) }
}

// ----------------------------------------------------------------------------------------------- address

/** CREATE2 salt used by SproutAccountFactory: keccak256(abi.encode(qx, qy)). */
export function accountSalt(qx: Hex, qy: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'bytes32' }], [qx, qy]))
}

/** EIP-1167 minimal-proxy init code (OpenZeppelin Clones, 55 bytes) for `implementation`. */
export function cloneInitCode(implementation: Address): Hex {
  return concatHex(['0x3d602d80600a3d3981f3363d3d373d3d3d363d73', implementation.toLowerCase() as Hex, '0x5af43d82803e903d91602b57fd5bf3'])
}

/**
 * Counterfactual Sprout Account address — equals SproutAccountFactory.getAddress(qx, qy).
 * `implementation` = factory.implementation() (immutable; read it once and put it in config/env).
 */
export function computeAccountAddress(p: { factory: Address; implementation: Address; qx: Hex; qy: Hex }): Address {
  return getAddress(
    getContractAddress({ opcode: 'CREATE2', from: p.factory, salt: accountSalt(p.qx, p.qy), bytecode: cloneInitCode(p.implementation) }),
  )
}
