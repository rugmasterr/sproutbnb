/**
 * Browser WebAuthn helpers for Sprout Accounts (client only).
 * Registration: ES256 only, discoverable credential preferred, user verification required, rpId = current hostname.
 */
import type { Hex } from 'viem';
import { env } from '../constants';
import { base64url, buildWebAuthnSig, challengeBytes, publicKeyFromCoseKey, publicKeyFromSpki, type WebAuthnSig } from './challenge';
import { recoverCandidates, webauthnDigest } from './p256';

export type StoredPasskey = {
  v: 1;
  credentialId: string; // base64url
  qx: Hex;
  qy: Hex;
  address: `0x${string}`;
  rpId: string;
  createdAt: number;
  zcashRefundAddress?: string;
  zcashPayoutAddress?: string;
  /** Signed out on this device; the record is kept so the next sign-in can target this credential. */
  signedOut?: boolean;
};

const LS_KEY = 'sprout.passkey.v1';
const LS_ADDRS = 'sprout.zaddrs.v1'; // { [accountAddressLower]: { refund, payout } } survives sign-out

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

export function loadPasskey(): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as StoredPasskey;
    if (j && j.v === 1 && j.credentialId && j.qx && j.qy && j.address) return j;
  } catch {
    /* storage blocked or corrupt */
  }
  return null;
}

export function savePasskey(p: StoredPasskey | null) {
  try {
    if (p) localStorage.setItem(LS_KEY, JSON.stringify(p));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* storage blocked */
  }
}

type AddrBook = Record<string, { refund?: string; payout?: string }>;
export function loadZcashAddrs(account: string): { refund?: string; payout?: string } {
  try {
    const b = JSON.parse(localStorage.getItem(LS_ADDRS) || '{}') as AddrBook;
    return b[account.toLowerCase()] || {};
  } catch {
    return {};
  }
}
export function saveZcashAddrs(account: string, v: { refund?: string; payout?: string }) {
  try {
    const b = JSON.parse(localStorage.getItem(LS_ADDRS) || '{}') as AddrBook;
    b[account.toLowerCase()] = { ...b[account.toLowerCase()], ...v };
    localStorage.setItem(LS_ADDRS, JSON.stringify(b));
  } catch {
    /* storage blocked */
  }
}

export function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/**
 * WebAuthn RP ID. Passkeys are bound to it, so `www.` and the apex must agree: NEXT_PUBLIC_PASSKEY_RP_ID (e.g.
 * "sproutbnb.cash") is used whenever the page is on that domain or a subdomain of it; otherwise the hostname.
 */
export function passkeyRpId(): string {
  const host = window.location.hostname;
  const want = env.passkeyRpId.toLowerCase();
  return want && (host === want || host.endsWith(`.${want}`)) ? want : host;
}
const rpId = passkeyRpId;

/** Create a new passkey and return its credential id + P-256 public key. */
export async function createPasskey(label: string): Promise<{ credentialId: string; qx: Hex; qy: Hex; rpId: string }> {
  if (!passkeySupported()) throw new Error('passkey-unsupported');
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Sprout', id: rpId() },
      user: { id: rand(16), name: label, displayName: label },
      challenge: rand(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 only — the account verifies P-256
      authenticatorSelection: { residentKey: 'preferred', requireResidentKey: false, userVerification: 'required' },
      attestation: 'none',
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey-cancelled');
  const resp = cred.response as AuthenticatorAttestationResponse;
  let key: { qx: Hex; qy: Hex } | null = null;
  try {
    const spki = typeof resp.getPublicKey === 'function' ? resp.getPublicKey() : null;
    if (spki) key = publicKeyFromSpki(spki);
  } catch {
    key = null;
  }
  if (!key) {
    // Fallback: find the COSE EC2 key inside the attestation object (authData.attestedCredentialData).
    key = publicKeyFromCoseKey(new Uint8Array(resp.attestationObject));
  }
  if (typeof resp.getPublicKeyAlgorithm === 'function' && resp.getPublicKeyAlgorithm() !== -7) {
    throw new Error('passkey-not-es256');
  }
  return { credentialId: base64url(new Uint8Array(cred.rawId)), ...key, rpId: rpId() };
}

type Assertion = { credentialId: string; response: AuthenticatorAssertionResponse };

/** Copy into a plain ArrayBuffer-backed view (DOM BufferSource typing). */
const own = (u: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(u);

async function getAssertion(challenge: Uint8Array, credentialId?: string): Promise<Assertion> {
  if (!passkeySupported()) throw new Error('passkey-unsupported');
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: own(challenge),
      rpId: rpId(),
      userVerification: 'required',
      timeout: 120_000,
      allowCredentials: credentialId ? [{ type: 'public-key', id: own(fromB64url(credentialId)) }] : [],
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('passkey-cancelled');
  return { credentialId: base64url(new Uint8Array(cred.rawId)), response: cred.response as AuthenticatorAssertionResponse };
}

/** Sign a SproutAccount challenge (32 bytes) with the stored credential. */
export async function signChallenge(challenge: Hex, credentialId: string): Promise<WebAuthnSig> {
  const a = await getAssertion(challengeBytes(challenge), credentialId);
  return buildWebAuthnSig(a.response, challenge);
}

/**
 * Discoverable sign-in: one assertion over a random challenge, then recover the (≤2) candidate public keys from the
 * signature. The caller disambiguates (on-chain lookup, or a second assertion via `recoverWithSecondAssertion`).
 */
export async function discoverPasskey(): Promise<{ credentialId: string; candidates: { qx: Hex; qy: Hex }[] }> {
  const a = await getAssertion(rand(32));
  return { credentialId: a.credentialId, candidates: candidatesFrom(a.response) };
}

/** User-verified presence check with a known credential; returns the credential id the authenticator used. */
export async function assertPresence(credentialId: string): Promise<string> {
  const a = await getAssertion(rand(32), credentialId);
  return a.credentialId;
}

export async function secondAssertionCandidates(credentialId: string): Promise<{ qx: Hex; qy: Hex }[]> {
  const a = await getAssertion(rand(32), credentialId);
  return candidatesFrom(a.response);
}

function candidatesFrom(resp: AuthenticatorAssertionResponse) {
  // buildWebAuthnSig parses DER; the challenge check is skipped (random challenge). Use the raw (un-normalised) s:
  // recovery works for either s, since (r, n-s) recovers the negated-R candidate set — both sets are tried.
  const sig = buildWebAuthnSig(resp);
  const e = webauthnDigest(new Uint8Array(resp.authenticatorData), new Uint8Array(resp.clientDataJSON));
  return recoverCandidates(e, sig.r, sig.s);
}

export function friendlyPasskeyError(e: unknown): string {
  const name = (e as { name?: string })?.name || '';
  const msg = (e as { message?: string })?.message || String(e);
  if (name === 'NotAllowedError' || msg === 'passkey-cancelled') return 'cancelled';
  if (name === 'InvalidStateError') return 'exists';
  if (name === 'SecurityError') return 'security';
  if (msg === 'passkey-unsupported' || name === 'NotSupportedError') return 'unsupported';
  return 'other';
}
