'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANG_COOKIE, translate, type Key, type Lang } from './dict';

export { LANG_COOKIE };
const LS_KEY = 'sprout.lang';

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key, vars?: Record<string, string | number>) => string;
};

const I18nCtx = createContext<Ctx | null>(null);

function persist(l: Lang) {
  try {
    localStorage.setItem(LS_KEY, l);
  } catch {
    /* storage blocked */
  }
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = l === 'zh' ? 'zh-CN' : 'en';
}

export function I18nProvider({ initial, hasCookie, children }: { initial: Lang; hasCookie: boolean; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);

  // First visit (no cookie): prefer localStorage, then the browser language.
  useEffect(() => {
    if (hasCookie) return;
    let next: Lang | null = null;
    try {
      const s = localStorage.getItem(LS_KEY);
      if (s === 'en' || s === 'zh') next = s;
    } catch {
      /* ignore */
    }
    if (!next) next = navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
    persist(next);
    if (next !== lang) setLangState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((l: Lang) => {
    persist(l);
    setLangState(l);
  }, []);

  const t = useCallback((k: Key, vars?: Record<string, string | number>) => translate(lang, k, vars), [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  const c = useContext(I18nCtx);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}
