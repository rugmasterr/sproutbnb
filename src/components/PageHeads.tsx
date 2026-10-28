'use client';

import { useI18n } from '@/i18n/I18nProvider';
import { PageHead } from './ui';

export function LaunchHead() {
  const { t, lang } = useI18n();
  return <PageHead title={t('launch.title')} zh={lang === 'en' ? '种币' : undefined} sub={t('launch.sub')} />;
}

export function StatsHead() {
  const { t, lang } = useI18n();
  return <PageHead title={t('stats.title')} zh={lang === 'en' ? '数据' : undefined} sub={t('stats.sub')} />;
}

export function NodesHead() {
  const { t, lang } = useI18n();
  return <PageHead title={t('nodes.title')} zh={lang === 'en' ? '竹节' : undefined} sub={t('nodes.sub')} />;
}

export function TerminalHead() {
  const { t, lang } = useI18n();
  return <PageHead title={t('term.title')} zh={lang === 'en' ? '终端' : undefined} sub={t('term.sub')} />;
}
