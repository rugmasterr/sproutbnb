'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';
import { Stalks } from './brand';

export function NotFoundView() {
  const { t } = useI18n();
  return (
    <div className="container flex flex-col items-center py-24 text-center">
      <Stalks className="h-32 w-16 opacity-70" />
      <h1 className="mt-6 text-4xl font-semibold">{t('nf.title')}</h1>
      <p className="mt-2 text-muted">{t('nf.body')}</p>
      <Link href="/" className="btn-primary mt-6">
        {t('nf.home')}
      </Link>
    </div>
  );
}

export function ErrorView({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="container flex flex-col items-center py-24 text-center">
      <Stalks className="h-32 w-16 opacity-70" />
      <h1 className="mt-6 text-4xl font-semibold">{t('err.title')}</h1>
      <p className="mt-2 text-muted">{t('err.body')}</p>
      <div className="mt-6 flex gap-3">
        <button type="button" className="btn-primary" onClick={reset}>
          {t('ui.retry')}
        </button>
        <Link href="/" className="btn-ghost">
          {t('nf.home')}
        </Link>
      </div>
    </div>
  );
}