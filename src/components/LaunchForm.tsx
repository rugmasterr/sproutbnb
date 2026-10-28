'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isAddress, type Address } from 'viem';
import {
  ConnectButton,
  DepositZecDialog,
  ZcashAddressInput,
  ZecAmount,
  isValidZcashAddress,
  useSproutAccount,
  useZec,
} from '@/features/zcash';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { MODES, type Mode } from '@/lib/abi/sprout';
import { CAN_LAUNCH, explorerTx, LAUNCH, ZEC_TOKEN } from '@/lib/config';
import { byteLen, fmtAmt, fmtNum } from '@/lib/format';
import { buildLaunchCall, findSalt } from '@/lib/launch';
import { errText } from '@/lib/trade';
import { useSiteConfig } from '@/lib/useApi';
import { ZecGlyph } from './brand';
import { CoinImage, FeeDest, Notice, PrelaunchBanner } from './ui';

type Phase = { k: 'idle' } | { k: 'upload' } | { k: 'salt'; n: number } | { k: 'sign' } | { k: 'done'; tx: string; token: Address } | { k: 'error'; msg: string };

const SYMBOL_RE = /^[A-Za-z0-9]{1,10}$/;

export function LaunchForm() {
  const { t } = useI18n();
  const acct = useSproutAccount();
  const { zecToBnbWei, zecUsd } = useZec();
  const cfg = useSiteConfig();
  const zfAddr = cfg.data?.zcashFoundationAddress ?? null;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [desc, setDesc] = useState('');
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [firstBuy, setFirstBuy] = useState('');
  const [mode, setMode] = useState<Mode>(ZEC_TOKEN ? 2 : 0);
  const [payee, setPayee] = useState('');
  const [zaddr, setZaddr] = useState('');
  const [minHold, setMinHold] = useState(String(LAUNCH.defaultMinShare));
  const [phase, setPhase] = useState<Phase>({ k: 'idle' });
  const [touched, setTouched] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const u = URL.createObjectURL(file);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  useEffect(() => () => abort.current?.abort(), []);

  // Prefill the Zcash payout address from the Sprout Account when available.
  useEffect(() => {
    if (!zaddr && acct.zcashPayoutAddress) setZaddr(acct.zcashPayoutAddress);
  }, [acct.zcashPayoutAddress, zaddr]);

  const nameBytes = byteLen(name);
  const fbZec = Number(firstBuy || '0');
  const firstBuyWei = firstBuy.trim() ? zecToBnbWei(fbZec) : 0n;
  const holdersOk = Boolean(ZEC_TOKEN);

  const errors = useMemo(() => {
    const e: Key[] = [];
    if (!name.trim() || nameBytes > 32) e.push('launch.errName');
    if (!SYMBOL_RE.test(symbol)) e.push('launch.errSymbol');
    if (!file) e.push('launch.errImage');
    if (mode === 1 && !isAddress(payee.trim())) e.push('launch.errPayee');
    if (mode === 3 && !isValidZcashAddress(zaddr)) e.push('launch.errZcash');
    if (mode === 2 && !(Number(minHold) >= LAUNCH.minMinShare)) e.push('launch.errMinHold');
    if (mode === 4 && !zfAddr) e.push('launch.errZf');
    if (firstBuy.trim() && (!(fbZec >= 0) || firstBuyWei === null)) e.push('trade.needRate');
    if (firstBuyWei && acct.balanceWei !== undefined && firstBuyWei > acct.balanceWei) e.push('trade.insufficient');
    return e;
  }, [name, nameBytes, symbol, file, mode, payee, zaddr, minHold, zfAddr, firstBuy, fbZec, firstBuyWei, acct.balanceWei]);

  const busy = phase.k === 'upload' || phase.k === 'salt' || phase.k === 'sign';
  const connected = acct.kind !== 'none' && Boolean(acct.address);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (errors.length || !connected || !CAN_LAUNCH || busy) return;
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    try {
      setPhase({ k: 'upload' });
      const fd = new FormData();
      fd.append('file', file!);
      fd.append('description', desc);
      fd.append('website', website);
      fd.append('twitter', twitter);
      fd.append('telegram', telegram);
      if (acct.address) fd.append('creator', acct.address);
      const up = await fetch('/api/upload', { method: 'POST', body: fd, signal: ac.signal });
      const uj = (await up.json().catch(() => ({}))) as { ok?: boolean; cid?: string; error?: string };
      if (!up.ok || !uj.cid) throw new Error(uj.error || `upload failed (${up.status})`);

      setPhase({ k: 'salt', n: 0 });
      const { salt, address } = await findSalt((n) => setPhase({ k: 'salt', n }), ac.signal);

      setPhase({ k: 'sign' });
      const call = buildLaunchCall({
        name: name.trim(),
        symbol: symbol.trim(),
        metaCid: uj.cid,
        salt,
        firstBuyWei: firstBuyWei ?? 0n,
        mode,
        payee: mode === 1 ? (payee.trim() as Address) : null,
        zcashAddress: zaddr,
        minHoldTokens: Number(minHold),
      });
      const tx = await acct.executeBatch([call]);
      setPhase({ k: 'done', tx, token: address });
    } catch (err) {
      if (ac.signal.aborted) return;
      setPhase({ k: 'error', msg: errText(err) });
    }
  }

  const disabled = !CAN_LAUNCH;

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form onSubmit={submit} className="min-w-0 space-y-6" noValidate>
        {disabled && <PrelaunchBanner text={t('pre.launchDisabled')} />}
        <fieldset disabled={disabled || busy} className="space-y-5 disabled:opacity-80">
          <div className="card space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <label className="block">
                <span className="label flex justify-between">
                  {t('launch.name')}
                  <span className={`normal-case tracking-normal ${nameBytes > 32 ? 'text-down' : 'text-faint'}`}>
                    {t('launch.bytes', { n: nameBytes })}
                  </span>
                </span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
              </label>
              <label className="block">
                <span className="label">{t('launch.symbol')}</span>
                <input
                  className="input uppercase"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase())}
                  required
                />
              </label>
            </div>
            <label className="block">
              <span className="label">{t('launch.desc')}</span>
              <textarea className="input min-h-[88px]" value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 1000))} />
            </label>
            <div>
              <span className="label">{t('launch.image')}</span>
              <div className="flex items-center gap-4">
                <CoinImage src={preview} symbol={symbol || '?'} size={64} />
                <div className="min-w-0">
                  <label className="btn-ghost cursor-pointer">
                    {t('launch.imagePick')}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      className="sr-only"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setFile(f && f.size <= 5 * 1024 * 1024 ? f : null);
                      }}
                    />
                  </label>
                  <p className="mt-1 text-xs text-faint">{t('launch.imageHint')}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ['launch.website', website, setWebsite, 'https://'],
                  ['launch.twitter', twitter, setTwitter, '@handle'],
                  ['launch.telegram', telegram, setTelegram, 't.me/…'],
                ] as const
              ).map(([k, v, set, ph]) => (
                <label key={k} className="block min-w-0">
                  <span className="label">
                    {t(k)} <span className="normal-case tracking-normal text-faint">({t('launch.optional')})</span>
                  </span>
                  <input className="input" value={v} placeholder={ph} onChange={(e) => set(e.target.value.slice(0, 200))} />
                </label>
              ))}
            </div>
          </div>

          <div className="card space-y-3 p-5">
            <span className="label">{t('launch.choice')}</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODES.map((m) => {
                const off = (m === 4 && !zfAddr) || (m === 2 && !holdersOk);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => !off && setMode(m)}
                    aria-pressed={mode === m}
                    aria-disabled={off}
                    className={`rounded-xl border p-3 text-left transition ${
                      mode === m ? 'border-gold/70 bg-gold/10' : 'border-line hover:border-accent/50'
                    } ${off ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      <ZecGlyph size={14} />
                      {t(`mode.${m}` as Key)}
                    </div>
                    <p className="mt-1 text-xs text-muted">{t(`mode.${m}d` as Key)}</p>
                  </button>
                );
              })}
            </div>
            {!zfAddr && <Notice tone="warn">{t('launch.zfDisabled')}</Notice>}
            {mode === 4 && zfAddr && (
              <Notice tone="ok">
                <span className="break-all font-mono text-xs">{t('launch.zfOn', { addr: zfAddr })}</span>
              </Notice>
            )}
            {mode === 1 && (
              <label className="block">
                <span className="label">{t('launch.payee')}</span>
                <input className="input font-mono" value={payee} placeholder="0x…" spellCheck={false} onChange={(e) => setPayee(e.target.value.trim())} />
              </label>
            )}
            {mode === 3 && <ZcashAddressInput value={zaddr} onChange={setZaddr} kinds={['t', 'shielded', 'unified']} label={t('launch.zcashAddr')} />}
            {mode === 2 && (
              <label className="block">
                <span className="label">{t('launch.minHold')}</span>
                <input className="input num" inputMode="numeric" value={minHold} onChange={(e) => setMinHold(e.target.value.replace(/\D/g, ''))} />
                <span className="mt-1 block text-xs text-faint">{t('launch.minHoldHint')}</span>
              </label>
            )}
          </div>

          <div className="card space-y-2 p-5">
            <label className="block">
              <span className="label flex items-center gap-1.5">
                <ZecGlyph size={12} />
                {t('launch.firstBuy')}
              </span>
              <input className="input num" inputMode="decimal" placeholder="0.0" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value.replace(/[^\d.]/g, ''))} />
            </label>
            <p className="text-xs text-faint">
              {t('launch.firstBuyHint', { bnb: firstBuyWei ? fmtAmt(Number(firstBuyWei) / 1e18) : '0' })}
              {!zecUsd && ` ${t('ui.zecRateMissing')}`}
            </p>
            {connected && acct.balanceWei !== undefined && (
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                {t('ui.balance')}: <ZecAmount wei={acct.balanceWei} showBnb />
                {acct.kind === 'passkey' && (
                  <button type="button" className="chip" onClick={() => setDepositOpen(true)}>
                    {t('trade.deposit')}
                  </button>
                )}
              </p>
            )}
          </div>
        </fieldset>

        {touched && errors.length > 0 && (
          <Notice tone="err">
            <ul className="list-disc pl-4">
              {errors.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </Notice>
        )}

        {!connected && !disabled ? (
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="text-sm text-muted">{t('launch.connect')}</span>
            <ConnectButton />
          </div>
        ) : (
          <button type="submit" className="btn-seal w-full py-3 text-base" disabled={disabled || busy}>
            {busy ? (phase.k === 'upload' ? t('launch.stepUpload') : phase.k === 'salt' ? t('launch.stepSalt', { n: fmtNum(phase.n) }) : t('launch.stepSign')) : t('launch.submit')}
          </button>
        )}
        {phase.k === 'error' && <Notice tone="err">{phase.msg}</Notice>}
        {phase.k === 'done' && (
          <Notice tone="ok">
            <div className="font-semibold">{t('launch.done')}</div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm">
              <a className="link" href={explorerTx(phase.tx)} target="_blank" rel="noopener noreferrer">
                {t('trade.viewTx')}
              </a>
              <Link className="link" href={`/coin/${phase.token}`}>
                {t('launch.viewCoin')}
              </Link>
            </div>
          </Notice>
        )}
      </form>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="card p-5">
          <span className="label">{t('launch.preview')}</span>
          <div className="flex items-center gap-3">
            <CoinImage src={preview} symbol={symbol || '?'} size={56} />
            <div className="min-w-0">
              <div className="truncate font-semibold">{name || '—'}</div>
              <div className="text-xs text-muted">${symbol || '—'}</div>
              <FeeDest mode={mode} className="mt-1" />
            </div>
          </div>
        </div>
        <FeeBreakdown mode={mode} />
      </aside>
      <DepositZecDialog open={depositOpen} onClose={() => setDepositOpen(false)} />
    </div>
  );
}

export function FeeBreakdown({ mode }: { mode: Mode | number }) {
  const { t } = useI18n();
  const rows: { pct: string; label: string; cls: string }[] = [
    { pct: '0.50%', label: t('home.splitLiq'), cls: 'bg-bamboo-500' },
    { pct: '0.50%', label: t('home.splitRoot'), cls: 'bg-seal' },
    { pct: '0.20%', label: t('home.splitOps'), cls: 'bg-soil' },
    { pct: '0.80%', label: `${t(`mode.${mode}` as Key)} · ${t(`fee.${mode}` as Key)}`, cls: 'bg-gold' },
  ];
  return (
    <div className="card p-5">
      <span className="label">{t('launch.breakdown')}</span>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.cls}`} />
            <span className="min-w-0 flex-1 text-muted">{r.label.replace(/^0\.\d\d% /, '')}</span>
            <span className="num font-semibold">{r.pct}</span>
          </li>
        ))}
        <li className="flex items-center justify-between border-t border-line pt-2.5 text-sm font-semibold">
          <span>{t('coin.tax')}</span>
          <span className="num">2.00%</span>
        </li>
      </ul>
      <p className="mt-3 text-xs text-faint">{t('launch.flapNote')}</p>
    </div>
  );
}
