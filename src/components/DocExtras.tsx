'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { ZecGlyph } from './brand';

export function ZcashGuideCard() {
  const { t } = useI18n();
  return (
    <Link href="/guide/zcash" className="card card-hover not-prose mb-8 flex items-center gap-4 p-4 no-underline">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold/15">
        <ZecGlyph size={22} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-fg">{t('home.ctaZcashShort')}</span>
        <span className="block text-sm text-muted">{t('home.how1')}</span>
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
    <figure className="not-prose mb-10">
      <div className="overflow-hidden rounded-2xl border border-line bg-black">
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
      <figcaption className="mt-2 text-xs text-faint">{t('docs.trailer')}</figcaption>
    </figure>
  );
}
