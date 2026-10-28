'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/I18nProvider';
import type { Key } from '@/i18n/dict';
import { Mark, Stalks } from './brand';
import { HeroCanvas, Kicker, Rise, Scramble, StatusDot } from './fx';

type L = { en: string; zh: string };

const C = {
  nfKicker: { en: 'Error 404 · Route not found', zh: '错误 404 · 页面未找到' },
  errKicker: { en: 'Runtime error · Nothing sent on-chain', zh: '运行错误 · 未发送任何交易' },
  try: { en: 'Try instead', zh: '可以试试' },
  ref: { en: 'Reference', zh: '错误编号' },
  nfStatus: { en: 'node missing on this stalk', zh: '这根竹子上没有这一节' },
  errStatus: { en: 'segment snapped while rendering', zh: '渲染时折断了一节' },
} satisfies Record<string, L>;

const SUGGEST: { href: string; k: Key }[] = [
  { href: '/', k: 'nav.coins' },
  { href: '/terminal', k: 'nav.terminal' },
  { href: '/docs', k: 'nav.docs' },
  { href: '/zec', k: 'nav.moveZec' },
];

/** Terminal-style status card: request line, response line, suggestions. */
function Console({ lines, children }: { lines: React.ReactNode[]; children?: React.ReactNode }) {
  return (
    <div className="glass relative mt-10 w-full max-w-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2">
          <Mark size={18} />
          <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">sprout · bnb chain</span>
        </span>
        <span aria-hidden className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-line-2" />
          <span className="h-2 w-2 rounded-full bg-line-2" />
          <span className="h-2 w-2 rounded-full bg-accent/80" />
        </span>
      </div>
      <div className="space-y-1.5 px-4 py-4 font-mono text-[12.5px] leading-6">{lines}</div>
      {children}
    </div>
  );
}

export function NotFoundView() {
  const { t, lang } = useI18n();
  const l = (x: L) => (lang === 'zh' ? x.zh : x.en);
  const path = usePathname() || '/';
  return (
    <section className="relative overflow-hidden border-b border-line">
      <HeroCanvas className="absolute inset-0" density={0.75} seed={404} />
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/10" />
      <div className="container relative flex min-h-[78vh] flex-col justify-center py-16 sm:py-24">
        <Rise d={0}>
          <Kicker pill>
            <StatusDot tone="red" />
            {l(C.nfKicker)}
          </Kicker>
        </Rise>
        <Rise d={1} className="mt-6">
          <span className="stat-value block !text-[clamp(5.5rem,17vw,11.5rem)] !leading-[0.85]" aria-hidden>
            <Scramble text="404" trigger="mount" duration={1100} />
          </span>
        </Rise>
        <h1 className="h1 mt-5 max-w-[16ch]">
          <Rise as="span" d={2} className="block">
            {t('nf.title')}
          </Rise>
        </h1>
        <Rise d={3}>
          <p className="lede mt-4">{t('nf.body')}</p>
        </Rise>
        <Rise d={4} className="mt-8 flex flex-wrap gap-3">
          <Link href="/" className="btn-primary btn-lg">
            {t('nf.home')} <span className="arr">→</span>
          </Link>
          <Link href="/docs" className="btn-ghost btn-lg">
            {t('nav.docs')}
          </Link>
        </Rise>
        <Rise d={5}>
          <Console
            lines={[
              <div key="1" className="flex min-w-0 gap-2">
                <span className="text-accent">GET</span>
                <span className="min-w-0 break-all text-fg">{path}</span>
              </div>,
              <div key="2" className="flex min-w-0 flex-wrap gap-x-2">
                <span className="text-down">404</span>
                <span className="text-muted">NOT_FOUND</span>
                <span className="text-faint"># {l(C.nfStatus)}</span>
              </div>,
            ]}
          >
            <div className="border-t border-line px-4 py-3">
              <div className="mono-label mb-2">{l(C.try)}</div>
              <div className="flex flex-wrap gap-2">
                {SUGGEST.map((s) => (
                  <Link key={s.href} href={s.href} className="chip">
                    <span className="text-faint">{s.href}</span> {t(s.k)}
                  </Link>
                ))}
              </div>
            </div>
          </Console>
        </Rise>
      </div>
    </section>
  );
}

export function ErrorView({ reset, digest }: { reset: () => void; digest?: string }) {
  const { t, lang } = useI18n();
  const l = (x: L) => (lang === 'zh' ? x.zh : x.en);
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-70" />
      <div aria-hidden className="ink-wash pointer-events-none absolute inset-0" />
      <Stalks className="pointer-events-none absolute -right-6 bottom-0 hidden h-[110%] w-56 opacity-60 md:block" />
      <div className="container relative flex min-h-[70vh] flex-col justify-center py-16 sm:py-24">
        <Rise d={0}>
          <Kicker pill>
            <StatusDot tone="red" />
            {l(C.errKicker)}
          </Kicker>
        </Rise>
        <Rise d={1} className="mt-6">
          <span className="stat-value block !text-[clamp(4.5rem,14vw,9rem)] !leading-[0.85]" aria-hidden>
            <Scramble text="ERR" trigger="mount" duration={1100} />
          </span>
        </Rise>
        <h1 className="h1 mt-5 max-w-[16ch]">
          <Rise as="span" d={2} className="block">
            {t('err.title')}
          </Rise>
        </h1>
        <Rise d={3}>
          <p className="lede mt-4">{t('err.body')}</p>
        </Rise>
        <Rise d={4} className="mt-8 flex flex-wrap gap-3">
          <button type="button" className="btn-primary btn-lg" onClick={reset}>
            {t('ui.retry')} <span className="arr">↻</span>
          </button>
          <Link href="/" className="btn-ghost btn-lg">
            {t('nf.home')}
          </Link>
        </Rise>
        <Rise d={5}>
          <Console
            lines={[
              <div key="1" className="flex min-w-0 flex-wrap gap-x-2">
                <span className="text-down">ERR</span>
                <span className="text-muted">RENDER</span>
                <span className="text-faint"># {l(C.errStatus)}</span>
              </div>,
              ...(digest
                ? [
                    <div key="2" className="flex min-w-0 gap-2">
                      <span className="text-accent">{l(C.ref)}</span>
                      <span className="min-w-0 break-all text-fg">{digest}</span>
                    </div>,
                  ]
                : []),
            ]}
          />
        </Rise>
      </div>
    </section>
  );
}
