'use client';

import { useCallback } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

/**
 * Visual-only labels for the trading surfaces (kickers, table headers, section names).
 * Kept here instead of dict.ts so the redesign does not touch i18n keys.
 */
const COPY = {
  market: { en: 'Market', zh: '行情' },
  overview: { en: 'Overview', zh: '概览' },
  trade: { en: 'Trade', zh: '交易' },
  token: { en: 'Token', zh: '代币' },
  chart: { en: 'Price · recent trades', zh: '价格 · 近期成交' },
  chartEmpty: { en: 'The line draws itself as trades land on-chain.', zh: '链上有成交后，这里会画出价格走势。' },
  trades: { en: 'trades', zh: '笔成交' },
  live: { en: 'Live', zh: '实时' },
  onchain: { en: 'On-chain', zh: '链上数据' },
  links: { en: 'Elsewhere', zh: '外部链接' },
  stage: { en: 'Stage', zh: '阶段' },
  side: { en: 'Side', zh: '方向' },
  amount: { en: 'Amount', zh: '数量' },
  trader: { en: 'Trader', zh: '交易者' },
  time: { en: 'Time', zh: '时间' },
  coin: { en: 'Coin', zh: '币' },
  // launch
  step1: { en: 'Coin details', zh: '币的信息' },
  step2: { en: 'Deployer’s choice', zh: '部署者选项' },
  step3: { en: 'First buy', zh: '首笔买入' },
  livePreview: { en: 'Live preview', zh: '实时预览' },
  plant: { en: 'Plant', zh: '种下' },
  progressLabel: { en: 'Launch progress', zh: '发币进度' },
  saltLabel: { en: 'Vanity …7777 search', zh: '…7777 靓号搜索' },
  tries: { en: 'tries', zh: '次尝试' },
  selected: { en: 'Selected', zh: '已选' },
  // terminal
  command: { en: 'Load contract', zh: '载入合约' },
  guardKicker: { en: 'Guard', zh: '安全检查' },
  check: { en: 'Check', zh: '检查项' },
  value: { en: 'Value', zh: '数值' },
  pass: { en: 'Pass', zh: '通过' },
  blocked: { en: 'Blocked', zh: '已拦截' },
  // stats
  network: { en: 'Network', zh: '全网' },
  revenueFlow: { en: 'Revenue flow', zh: '收入去向' },
  modes: { en: 'Modes', zh: '模式' },
  roots: { en: 'Roots', zh: '竹根' },
  leaderboard: { en: 'Leaderboard', zh: '排行榜' },
  rank: { en: 'Rank', zh: '排名' },
  fees: { en: 'Tax revenue', zh: '税收' },
  // nodes
  ledger: { en: 'Ledger', zh: '账本' },
  event: { en: 'Event', zh: '事件' },
  detail: { en: 'Detail', zh: '详情' },
  source: { en: 'Source', zh: '来源合约' },
  tx: { en: 'Tx', zh: '交易哈希' },
  events: { en: 'events', zh: '条记录' },
  block: { en: 'Block', zh: '区块' },
} as const;

export type CopyKey = keyof typeof COPY;

export function useCopy() {
  const { lang } = useI18n();
  return useCallback((k: CopyKey) => COPY[k][lang === 'zh' ? 'zh' : 'en'], [lang]);
}
