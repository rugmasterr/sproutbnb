'use client';

import { useI18n } from '@/i18n/I18nProvider';

/**
 * Headline with a softer second phrase. The second phrase is kept together (never split mid-phrase,
 * which matters for Chinese), and no ASCII space is inserted after a full-width comma.
 */
export function TwoLine({ a, b, block = false }: { a: string; b: string; block?: boolean }) {
  const { lang } = useI18n();
  return (
    <>
      <span className={lang === 'zh' ? 'inline-block' : undefined}>{a}</span>
      {lang === 'zh' || block ? '' : ' '}
      <span className={`soft ${block ? 'block' : 'inline-block'}`}>{b}</span>
    </>
  );
}
