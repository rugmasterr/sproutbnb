'use client';

import { useCallback } from 'react';
import { useI18n } from '@/i18n/I18nProvider';
import { zdict, type ZKey } from './i18n';

/** Zcash-module translator. Reads only `lang` from the site's I18n provider. */
export function useZT() {
  const { lang } = useI18n();
  const t = useCallback(
    (k: ZKey, vars?: Record<string, string | number>) => {
      let s: string = (zdict[lang] ?? zdict.en)[k] ?? zdict.en[k] ?? k;
      if (vars) for (const [n, v] of Object.entries(vars)) s = s.split(`{${n}}`).join(String(v));
      return s;
    },
    [lang],
  );
  return { t, lang };
}
