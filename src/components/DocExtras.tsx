'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { ZecGlyph } from './brand';
import { StatusDot } from './fx';

export function ZcashGuideCard() {
  const { t } = useI18n();
  return (
    <Link
      href="/guide/zcash"
      className="group relative mb-10 flex items-center gap-4 overflow-hidden rounded-2xl border border-gold/30 p-4 transition duration-300 ease-out hover:-translate-y-0.5 hover:border-gold/60 sm:p-5"
      style={{ background: 'radial-gradient(120% 160% at 0% 0%, rgb(var(--gold) / 0.16), transparent 55%), rgb(var(--raised) / 0.9)' }}
    >
      <span aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-0 opacity-50" />
      <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 shadow-[0_0_24px_-4px_rgb(var(--gold)/0.6)]">
        <ZecGlyph size={24} />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block font-semibold tracking-[-0.02em] text-fg">{t('home.ctaZcashShort')}</span>
        <span className="mt-0.5 block text-sm leading-5 text-muted">{t('home.how1')}</span>
      </span>
      <span aria-hidden className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-2 font-mono text-muted transition group-hover:border-gold/60 group-hover:text-gold">
        →
      </span>
    </Link>
  );
}

/** The trailer is embedded only when the file exists at build/request time; a load error hides it too. */
export function Trailer({ hasPoster }: { hasPoster: boolean }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <figure className="mb-12">
      <div className="relative">
        <div aria-hidden className="glow-yellow pointer-events-none absolute -inset-y-8 inset-x-0 opacity-70" />
        <div className="relative overflow-hidden rounded-2xl border border-line-2 bg-black shadow-[0_40px_100px_-40px_rgb(var(--accent)/0.5)]">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
          <video
            className="aspect-video w-full"
            controls
            preload="metadata"
            playsInline
            poster={hasPoster ? '/trailer/poster.jpg' : undefined}
            onError={() => setFailed(true)}
          >
            <source src="/trailer/sprout-trailer.mp4" type="video/mp4" onError={() => setFailed(true)} />
          </video>
        </div>
      </div>
      <figcaption className="mt-3 flex items-center gap-2 font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
        <StatusDot tone="yellow" pulse={false} />
        {t('docs.trailer')}
      </figcaption>
    </figure>
  );
}
