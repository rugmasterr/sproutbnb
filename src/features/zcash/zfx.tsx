'use client';

// Presentation-only primitives for the Zcash flows (stepper, QR frame, countdown, edge panels).
// No product logic lives here. Visual-only copy is bilingual inline ({ en, zh }).

import { useEffect, useState } from 'react';
import { StatusDot } from '@/components/fx';
import { useI18n } from '@/i18n/I18nProvider';

export type L = { en: string; zh: string };

/** Pick the current-language string from an inline { en, zh } pair. */
export function useL() {
  const { lang } = useI18n();
  return (x: L) => (lang === 'zh' ? x.zh : x.en);
}

export const ZC = {
  done: { en: 'done', zh: '已完成' },
  current: { en: 'in progress', zh: '进行中' },
  failed: { en: 'stopped', zh: '已中止' },
  flowAmount: { en: 'Amount', zh: '金额' },
  flowRefund: { en: 'Refund addr', zh: '退款地址' },
  flowConfirm: { en: 'Confirm', zh: '确认' },
  flowSend: { en: 'Send ZEC', zh: '发送 ZEC' },
  flowDest: { en: 'Destination', zh: '收款地址' },
  min: { en: 'min', zh: '分' },
  sec: { en: 'sec', zh: '秒' },
  scan: { en: 'Scan with your Zcash wallet', zh: '用 Zcash 钱包扫码' },
  live: { en: 'Live', zh: '实时' },
  quote: { en: 'Quote', zh: '报价' },
  note: { en: 'Note', zh: '提示' },
  warn: { en: 'Careful', zh: '注意' },
  ok: { en: 'Done', zh: '完成' },
  err: { en: 'Error', zh: '错误' },
} satisfies Record<string, L>;

// ------------------------------------------------------------------------------------------- stepper

type StepState = 'done' | 'now' | 'fail' | 'next';

/**
 * Numbered bamboo-node stepper. `current` = index of the active step (>= steps.length = all done).
 * Done nodes are green, the active one is yellow with a pulse, a failed one is red.
 */
export function NodeStepper({ steps, current, failed = false, label, className = '' }: { steps: string[]; current: number; failed?: boolean; label: string; className?: string }) {
  const l = useL();
  const n = steps.length;
  return (
    <ol className={`grid ${className}`} style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-label={label}>
      {steps.map((s, i) => {
        const st: StepState = i < current ? 'done' : i === current ? (failed ? 'fail' : 'now') : 'next';
        const node =
          st === 'done'
            ? 'border-bamboo bg-bamboo text-[#04140a] shadow-[0_0_14px_rgb(var(--bamboo)/0.45)]'
            : st === 'now'
              ? 'border-accent bg-accent/15 text-accent-hi shadow-[0_0_16px_rgb(var(--accent)/0.55)]'
              : st === 'fail'
                ? 'border-down bg-down/15 text-down'
                : 'border-line-2 bg-bg text-faint';
        return (
          <li key={s + i} className="relative min-w-0 pr-1.5" aria-current={st === 'now' ? 'step' : undefined}>
            {i < n - 1 && (
              <span aria-hidden className="absolute left-[2.6rem] right-1.5 top-[10px] h-px bg-line-2">
                <span
                  className="block h-full bg-gradient-to-r from-bamboo to-bamboo-hi shadow-[0_0_8px_rgb(var(--bamboo)/0.6)] transition-[width] duration-700 ease-out"
                  style={{ width: i < current ? '100%' : '0%' }}
                />
              </span>
            )}
            <span className={`relative inline-flex h-[21px] w-9 items-center justify-center rounded-full border-[1.5px] font-mono text-[10px] font-semibold num ${node}`}>
              {st === 'done' ? (
                <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden>
                  <path d="M2.2 6.4l2.4 2.4L9.8 3.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                String(i + 1).padStart(2, '0')
              )}
              {st === 'now' && <StatusDot tone="yellow" className="absolute -right-1 -top-1" />}
            </span>
            <span
              className={`mt-2 block break-words pr-1 font-mono text-[10px] font-medium uppercase leading-[1.35] tracking-[0.07em] [overflow-wrap:anywhere] ${
                st === 'now' ? 'text-accent' : st === 'done' ? 'text-bamboo-hi' : st === 'fail' ? 'text-down' : 'text-faint'
              }`}
            >
              {s}
            </span>
            <span className="sr-only">
              {' '}
              ({st === 'done' ? l(ZC.done) : st === 'now' ? l(ZC.current) : st === 'fail' ? l(ZC.failed) : ''})
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ------------------------------------------------------------------------------------------- QR frame

/** Scanner-style frame: yellow corner brackets, soft glow, light plate behind the code for scanability. */
export function QrFrame({ children, caption }: { children: React.ReactNode; caption?: string }) {
  const c = 'absolute h-5 w-5 border-accent';
  return (
    <figure className="flex shrink-0 flex-col items-center">
      <div className="relative p-3">
        <div aria-hidden className="glow-yellow pointer-events-none absolute -inset-6 rounded-full opacity-80" />
        <span aria-hidden className={`${c} left-0 top-0 rounded-tl-lg border-l-2 border-t-2`} />
        <span aria-hidden className={`${c} right-0 top-0 rounded-tr-lg border-r-2 border-t-2`} />
        <span aria-hidden className={`${c} bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2`} />
        <span aria-hidden className={`${c} bottom-0 right-0 rounded-br-lg border-b-2 border-r-2`} />
        <div className="relative rounded-xl bg-[#F2F0E8] p-3 shadow-[0_0_0_1px_rgb(var(--accent)/0.35),0_18px_60px_-18px_rgb(var(--accent)/0.7)]">{children}</div>
      </div>
      {caption && <figcaption className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{caption}</figcaption>}
    </figure>
  );
}

// ------------------------------------------------------------------------------------------- countdown

/** Big mono MM:SS countdown with a segmented "stalk" showing time left. Red under 10 minutes. */
export function BigCountdown({ to, from, label, expiredText }: { to: string | number; from?: number; label: string; expiredText: string }) {
  const l = useL();
  const target = typeof to === 'number' ? to : Date.parse(to);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!Number.isFinite(target)) return null;
  const left = Math.max(0, Math.floor((target - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  const low = left < 600;
  const total = from && target > from ? (target - from) / 1000 : 0;
  const frac = total ? Math.max(0, Math.min(1, left / total)) : null;
  const segs = 12;
  return (
    <div className="well relative overflow-hidden px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label">{label}</span>
        <StatusDot tone={left === 0 ? 'muted' : low ? 'red' : 'yellow'} />
      </div>
      {left === 0 ? (
        <div className="mt-2 font-mono text-2xl font-semibold text-down">{expiredText}</div>
      ) : (
        <div className={`mt-1.5 flex items-end gap-1.5 font-mono font-semibold num ${low ? 'text-down' : 'text-fg'}`} aria-live="off" role="timer">
          <span className="text-[2.6rem] leading-none tracking-[-0.04em]">{String(m).padStart(2, '0')}</span>
          <span className="pb-1 text-[11px] font-medium uppercase text-faint">{l(ZC.min)}</span>
          <span className={`text-[2.6rem] leading-none ${low ? 'text-down/60' : 'text-accent'}`} aria-hidden>
            :
          </span>
          <span className="text-[2.6rem] leading-none tracking-[-0.04em]">{String(s).padStart(2, '0')}</span>
          <span className="pb-1 text-[11px] font-medium uppercase text-faint">{l(ZC.sec)}</span>
        </div>
      )}
      {frac !== null && (
        <div className="mt-3 flex h-1 gap-[3px]" aria-hidden>
          {Array.from({ length: segs }, (_, i) => {
            const f = Math.max(0, Math.min(1, frac * segs - i));
            return (
              <span key={i} className="relative flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <span className={`absolute inset-y-0 left-0 rounded-full ${low ? 'bg-down' : 'bg-gradient-to-r from-accent-deep to-accent-hi'}`} style={{ width: `${f * 100}%` }} />
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------- panels

/** Hairline row: label left, value right (mono numbers). */
export function KV({ k, v, className = '' }: { k: React.ReactNode; v: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-2 text-sm ${className}`}>
      <span className="min-w-0 text-muted">{k}</span>
      <span className="num min-w-0 truncate text-right">{v}</span>
    </div>
  );
}

/** Section kicker with a zero-padded index: "01 — TITLE". */
export function IndexKicker({ i, children, tone = 'accent' }: { i?: number; children: React.ReactNode; tone?: 'accent' | 'green' | 'muted' }) {
  const c = tone === 'green' ? 'text-bamboo' : tone === 'muted' ? 'text-faint' : 'text-accent';
  return (
    <span className={`kicker ${c}`}>
      {i !== undefined && <span className="opacity-60">{String(i).padStart(2, '0')}</span>}
      {i !== undefined && <span aria-hidden className="h-px w-4 bg-current opacity-40" />}
      <span>{children}</span>
    </span>
  );
}
