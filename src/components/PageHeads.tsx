'use client';

import { useI18n } from '@/i18n/I18nProvider';
import { PageHead } from './ui';

type L = { en: string; zh: string };

/** Mono kickers above inner-page titles (visual only). */
const K: Record<'launch' | 'stats' | 'nodes' | 'term', L> = {
  launch: { en: 'Launchpad · Flap · BNB Chain', zh: '发射台 · Flap · BNB 链' },
  stats: { en: 'Protocol · Live data', zh: '协议 · 实时数据' },
  nodes: { en: 'Nodes · BNB Chain', zh: '竹节 · BNB 链' },
  term: { en: 'Terminal · Trade in ZEC', zh: '终端 · 以 ZEC 交易' },
};

function useKicker() {
  const { lang } = useI18n();
  return (k: keyof typeof K) => (lang === 'zh' ? K[k].zh : K[k].en);
}

export function LaunchHead() {
  const { t, lang } = useI18n();
  const k = useKicker();
  return <PageHead kicker={k('launch')} title={t('launch.title')} zh={lang === 'en' ? '种币' : undefined} sub={t('launch.sub')} />;
}

export function StatsHead() {
  const { t, lang } = useI18n();
  const k = useKicker();
  return <PageHead kicker={k('stats')} title={t('stats.title')} zh={lang === 'en' ? '数据' : undefined} sub={t('stats.sub')} />;
}

export function NodesHead() {
  const { t, lang } = useI18n();
  const k = useKicker();
  return <PageHead kicker={k('nodes')} title={t('nodes.title')} zh={lang === 'en' ? '竹节' : undefined} sub={t('nodes.sub')} />;
}

export function TerminalHead() {
  const { t, lang } = useI18n();
  const k = useKicker();
  return <PageHead kicker={k('term')} title={t('term.title')} zh={lang === 'en' ? '终端' : undefined} sub={t('term.sub')} />;
}
