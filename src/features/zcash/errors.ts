import type { ZKey } from './i18n';
import { QuoteError } from './oneclick';
import { friendlyPasskeyError } from './passkey/webauthn';

const CODES: Record<string, ZKey> = {
  'accounts-not-live': 'err.notLive',
  'relayer-not-configured': 'err.relayerOff',
  'bad-refund': 'err.badRefund',
  'bad-payout': 'err.badPayout',
  'bad-taddr': 'err.badRefund',
  'bad-shielded': 'err.badPayout',
  'shielded-unavailable': 'co.shieldedOff',
  'shielded-limit': 'err.shieldLimit',
  'shield-register-failed': 'err.shieldRegister',
  'no-deposit-address': 'err.noDeposit',
  'not-connected': 'err.notConnected',
  'recover-failed': 'err.recover',
  'wrong-passkey': 'err.wrongPasskey',
  'passkey-not-es256': 'err.es256',
  'relay-no-hash': 'err.relay',
  'relay-failed': 'err.relay',
  relayer: 'err.relay',
  rpc: 'err.rpc',
  busy: 'err.busy',
};

/** Map any thrown value to a translated message key (+ optional raw detail to show small). */
export function errInfo(e: unknown): { key: ZKey; detail?: string; vars?: Record<string, string | number> } {
  if (e instanceof QuoteError) {
    if (e.minUsd) return { key: 'err.minUsd', vars: { usd: e.minUsd.toLocaleString('en-US') }, detail: e.message };
    if (/not available/i.test(e.message)) return { key: 'err.pairUnavailable', detail: e.message };
    if (e.status === 429) return { key: 'err.rate' };
    return { key: 'err.quote', detail: e.message };
  }
  const code = (e as { code?: string })?.code || (e as Error)?.message || '';
  const withDetail = code === 'relayer' || code === 'relay-failed' || code === 'shield-register-failed';
  if (CODES[code]) return { key: CODES[code], detail: withDetail && (e as Error).message !== code ? (e as Error).message : undefined };
  const pk = friendlyPasskeyError(e);
  if (pk === 'cancelled') return { key: 'err.cancelled' };
  if (pk === 'unsupported') return { key: 'err.unsupported' };
  if (pk === 'security') return { key: 'err.security' };
  if (pk === 'exists') return { key: 'err.exists' };
  const msg = (e as { shortMessage?: string; message?: string })?.shortMessage || (e as Error)?.message || String(e);
  if (/user rejected|denied/i.test(msg)) return { key: 'err.cancelled' };
  return { key: 'err.generic', detail: msg.slice(0, 200) };
}
