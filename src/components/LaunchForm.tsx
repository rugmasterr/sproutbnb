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
import { ACTIONS_ENABLED, CAN_LAUNCH, explorerTx, LAUNCH, ZEC_TOKEN } from '@/lib/config';
import { byteLen, fmtAmt, fmtNum } from '@/lib/format';
import { buildLaunchCall, findSalt } from '@/lib/launch';
import { errText } from '@/lib/trade';
import { useSiteConfig } from '@/lib/useApi';
import { ZecGlyph } from './brand';
import { useComingSoon } from './ComingSoon';
import { BambooBar, Kicker } from './fx';
import { useCopy } from './tradeCopy';
import { CoinImage, FeeDest, Notice, StageBadge } from './ui';

type Phase = { k: 'idle' } | { k: 'upload' } | { k: 'salt'; n: number } | { k: 'sign' } | { k: 'done'; tx: string; token: Address } | { k: 'error'; msg: string };

const SYMBOL_RE = /^[A-Za-z0-9]{1,10}$/;

export function LaunchForm() {
  const { t } = useI18n();
  const c = useCopy();
  const acct = useSproutAccount();
  const { zecToBnbWei, zecUsd } = useZec();
  const cfg = useSiteConfig();
  const notify = useComingSoon();
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
    // Actions off: the full form stays usable to look at, but planting only shows the notice.
    if (!ACTIONS_ENABLED) return notify();
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

  const disabled = ACTIONS_ENABLED && !CAN_LAUNCH;

  // Presentation only: how far along the launch pipeline we are (upload → …7777 search → sign → done).
  // A 4-hex-digit suffix takes ~65,536 tries on average, so the salt bar shows the chance it has been found by now.
  const saltFrac = phase.k === 'salt' ? 1 - Math.exp(-phase.n / 65_536) : 0;
  const pipe =
    phase.k === 'upload' ? 0.15 : phase.k === 'salt' ? (1 + saltFrac) / 3 : phase.k === 'sign' ? 2.5 / 3 : phase.k === 'done' ? 1 : 0;
  const showPipe = busy || phase.k === 'done';

  return (
    <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
      <form onSubmit={submit} className="min-w-0 space-y-6" noValidate>
        {disabled && <Notice tone="warn">{t('launch.offline')}</Notice>}
        <fieldset disabled={disabled || busy} className="min-w-0 space-y-6 disabled:opacity-80">
          {/* 01 — coin details */}
          <section className="box">
            <div className="box-h">
              <Kicker index={1}>{c('step1')}</Kicker>
              <span className="tag-muted">BEP-20 · Flap V3</span>
            </div>
            <div className="space-y-5 p-4 sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_170px]">
                <label className="block min-w-0">
                  <span className="label flex justify-between gap-2">
                    {t('launch.name')}
                    <span className={`num normal-case tracking-normal ${nameBytes > 32 ? 'text-down' : 'text-faint'}`}>
                      {t('launch.bytes', { n: nameBytes })}
                    </span>
                  </span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={64} required />
                </label>
                <label className="block min-w-0">
                  <span className="label">{t('launch.symbol')}</span>
                  <span className="relative block">
                    <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-accent">
                      $
                    </span>
                    <input
                      className="input-mono pl-7 uppercase"
                      value={symbol}
                      onChange={(e) => setSymbol(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase())}
                      required
                    />
                  </span>
                </label>
              </div>
              <label className="block">
                <span className="label">{t('launch.desc')}</span>
                <textarea className="input min-h-[96px] leading-relaxed" value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 1000))} />
              </label>
              <div>
                <span className="label">{t('launch.image')}</span>
                <div className="flex items-center gap-4 rounded-xl border border-dashed border-line-2 bg-black/20 p-3">
                  <CoinImage src={preview} symbol={symbol || '?'} size={64} />
                  <div className="min-w-0">
                    <label className="btn-ghost btn-sm cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-accent">
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
                    <p className="mt-1.5 font-mono text-[11px] text-faint">{t('launch.imageHint')}</p>
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
                    <span className="label truncate">
                      {t(k)} <span className="normal-case tracking-normal text-faint/80">({t('launch.optional')})</span>
                    </span>
                    <input className="input" value={v} placeholder={ph} onChange={(e) => set(e.target.value.slice(0, 200))} />
                  </label>
                ))}
              </div>
            </div>
          </section>

          {/* 02 — deployer's choice */}
          <section className="box">
            <div className="box-h">
              <Kicker index={2}>{c('step2')}</Kicker>
              <span className="tag-yellow">0.80% · ZEC</span>
            </div>
            <div className="space-y-3 p-4 sm:p-5">
              <p className="text-sm text-muted">{t('launch.choice')}</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {MODES.map((m) => {
                  const off = (m === 4 && !zfAddr) || (m === 2 && !holdersOk);
                  const on = mode === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => !off && setMode(m)}
                      aria-pressed={on}
                      aria-disabled={off}
                      className={`group relative min-w-0 overflow-hidden rounded-xl border p-3.5 text-left transition duration-200 ${
                        on
                          ? 'border-accent bg-accent/[0.07] shadow-[0_0_0_3px_rgb(var(--accent)/0.18),0_12px_36px_-14px_rgb(var(--accent)/0.55)]'
                          : 'border-line-2 bg-black/20 hover:border-accent/50 hover:bg-white/[0.02]'
                      } ${off ? 'cursor-not-allowed opacity-45' : ''}`}
                    >
                      <span
                        aria-hidden
                        className={`absolute right-3 top-3.5 grid h-4 w-4 place-items-center rounded-full border transition ${
                          on ? 'border-accent bg-accent' : 'border-line-2'
                        }`}
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-full bg-accent-fg" />}
                      </span>
                      <span className="mb-2 block font-mono text-[10px] text-faint">{String(m).padStart(2, '0')}</span>
                      <span className="flex items-center gap-2 pr-6 font-semibold tracking-[-0.015em]">
                        <ZecGlyph size={14} />
                        {t(`mode.${m}` as Key)}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">{t(`mode.${m}d` as Key)}</span>
                    </button>
                  );
                })}
              </div>
              {mode === 4 && zfAddr && (
                <Notice tone="ok">
                  <span className="break-all font-mono text-xs">{t('launch.zfOn', { addr: zfAddr })}</span>
                </Notice>
              )}
              {mode === 1 && (
                <label className="block pt-1">
                  <span className="label">{t('launch.payee')}</span>
                  <input className="input-mono" value={payee} placeholder="0x…" spellCheck={false} onChange={(e) => setPayee(e.target.value.trim())} />
                </label>
              )}
              {mode === 3 && <ZcashAddressInput value={zaddr} onChange={setZaddr} kinds={['t', 'shielded', 'unified']} label={t('launch.zcashAddr')} />}
              {mode === 2 && (
                <label className="block pt-1">
                  <span className="label">{t('launch.minHold')}</span>
                  <input className="input-mono num" inputMode="numeric" value={minHold} onChange={(e) => setMinHold(e.target.value.replace(/\D/g, ''))} />
                  <span className="mt-1.5 block text-xs text-faint">{t('launch.minHoldHint')}</span>
                </label>
              )}
            </div>
          </section>

          {/* 03 — first buy */}
          <section className="box">
            <div className="box-h">
              <Kicker index={3}>{c('step3')}</Kicker>
              <span className="tag-muted">{t('launch.optional')}</span>
            </div>
            <div className="space-y-2.5 p-4 sm:p-5">
              <label className="well block px-3.5 pb-3 pt-2.5 transition focus-within:border-accent/70">
                <span className="label mb-1 flex items-center gap-1.5">
                  <ZecGlyph size={12} />
                  {t('launch.firstBuy')}
                </span>
                <span className="flex items-baseline gap-2">
                  <input
                    className="num w-full min-w-0 bg-transparent font-mono text-2xl font-semibold text-fg outline-none placeholder:text-faint/60"
                    inputMode="decimal"
                    placeholder="0.0"
                    value={firstBuy}
                    onChange={(e) => setFirstBuy(e.target.value.replace(/[^\d.]/g, ''))}
                  />
                  <span className="shrink-0 font-mono text-xs font-semibold text-gold">ZEC</span>
                </span>
              </label>
              <p className="text-xs leading-relaxed text-faint">
                {t('launch.firstBuyHint', { bnb: firstBuyWei ? fmtAmt(Number(firstBuyWei) / 1e18) : '0' })}
                {!zecUsd && ` ${t('ui.zecRateMissing')}`}
              </p>
              {connected && acct.balanceWei !== undefined && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {t('ui.balance')}: <ZecAmount wei={acct.balanceWei} showBnb />
                  {acct.kind === 'passkey' && (
                    <button type="button" className="chip" onClick={() => setDepositOpen(true)}>
                      + {t('trade.deposit')}
                    </button>
                  )}
                </p>
              )}
            </div>
          </section>
        </fieldset>

        {touched && errors.length > 0 && (
          <Notice tone="err">
            <ul className="list-disc space-y-0.5 pl-4">
              {errors.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </Notice>
        )}

        {showPipe && (
          <div className="box p-4 sm:p-5" aria-live="polite">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="mono-label">{c('progressLabel')}</span>
              <span className="num font-mono text-[11px] text-muted">{Math.round(pipe * 100)}%</span>
            </div>
            <BambooBar value={pipe} segments={3} tone={phase.k === 'done' ? 'green' : 'yellow'} label={c('progressLabel')} />
            {phase.k === 'salt' && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="mono-label">{c('saltLabel')}</span>
                  <span className="num font-mono text-[11px] text-accent-hi">
                    {fmtNum(phase.n)} {c('tries')}
                  </span>
                </div>
                <BambooBar value={saltFrac} segments={12} label={c('saltLabel')} />
              </div>
            )}
          </div>
        )}

        {ACTIONS_ENABLED && !connected && !disabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line-2 bg-raised/60 p-4">
            <span className="text-sm text-muted">{t('launch.connect')}</span>
            <ConnectButton />
          </div>
        ) : (
          <button type="submit" data-action="launch" className="btn-primary btn-lg w-full" disabled={disabled || busy}>
            {busy ? (phase.k === 'upload' ? t('launch.stepUpload') : phase.k === 'salt' ? t('launch.stepSalt', { n: fmtNum(phase.n) }) : t('launch.stepSign')) : t('launch.submit')}
            {!busy && <span className="arr">→</span>}
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
        <div className="glass relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full glow-yellow" />
          <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
            <span className="kicker">
              <span aria-hidden className="status-dot" data-pulse="true" style={{ ['--dot' as string]: 'rgb(var(--accent))' }} />
              {c('livePreview')}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{t('launch.preview')}</span>
          </div>
          <div className="relative p-4 sm:p-5">
            <div className="card p-4">
              <div className="flex items-start gap-3">
                <CoinImage src={preview} symbol={symbol || '?'} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-semibold tracking-[-0.02em]">{name || '—'}</div>
                      <div className="mt-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-accent-hi">${symbol || '—'}</div>
                    </div>
                    <StageBadge stage="seed" />
                  </div>
                  <FeeDest mode={mode} className="mt-1.5" />
                </div>
              </div>
              {desc.trim() && <p className="mt-3 line-clamp-3 whitespace-pre-line text-xs leading-relaxed text-muted">{desc}</p>}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
                  <span>{t('coin.progress')}</span>
                  <span className="num">0%</span>
                </div>
                <BambooBar value={0} segments={5} label={t('coin.progress')} />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="tag-muted">BNB Chain</span>
              <span className="tag-muted">…7777</span>
              <span className="tag-yellow">{c('plant')} · 2.00%</span>
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
  const rows: { pct: string; w: number; label: string; cls: string }[] = [
    { pct: '0.50%', w: 25, label: t('home.splitLiq'), cls: 'bg-bamboo' },
    { pct: '0.50%', w: 25, label: t('home.splitRoot'), cls: 'bg-bamboo-deep' },
    { pct: '0.20%', w: 10, label: t('home.splitOps'), cls: 'bg-faint' },
    { pct: '0.80%', w: 40, label: `${t(`mode.${mode}` as Key)} · ${t(`fee.${mode}` as Key)}`, cls: 'bg-accent' },
  ];
  return (
    <div className="box">
      <div className="box-h">
        <span className="mono-label">{t('launch.breakdown')}</span>
        <span className="num font-mono text-xs font-semibold text-accent-hi">2.00%</span>
      </div>
      <div className="p-4 sm:p-5">
        <div className="flex h-2 gap-[3px] overflow-hidden" aria-hidden>
          {rows.map((r) => (
            <span key={r.label} className={`rounded-full ${r.cls}`} style={{ width: `${r.w}%` }} />
          ))}
        </div>
        <ul className="mt-4 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-3 text-sm">
              <span className={`h-2 w-4 shrink-0 rounded-full ${r.cls}`} />
              <span className="min-w-0 flex-1 text-muted">{r.label.replace(/^0\.\d\d% /, '')}</span>
              <span className="num font-mono text-[13px] font-semibold">{r.pct}</span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-line pt-2.5 text-sm font-semibold">
            <span>{t('coin.tax')}</span>
            <span className="num font-mono">2.00%</span>
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-faint">{t('launch.flapNote')}</p>
      </div>
    </div>
  );
}
