'use client';

import { useCoins, useStats, useTrades } from '@/lib/useApi';
import { FeeSplit } from './home/FeeSplit';
import { LaunchCta, Roadmap } from './home/Finale';
import { Hero } from './home/Hero';
import { HowItWorks } from './home/HowItWorks';
import { LiveBand } from './home/LiveBand';
import { Market } from './home/Market';
import { Protocol } from './home/Protocol';

export function Home() {
  const coins = useCoins();
  const stats = useStats();
  const all = coins.data?.coins ?? [];
  const configured = coins.data?.configured ?? true;
  const trades = useTrades(undefined, configured);
  const tradeList = trades.data?.trades ?? [];

  return (
    <>
      <Hero />
      <LiveBand trades={tradeList} coins={all} />
      <HowItWorks />
      <FeeSplit />
      <Protocol stats={stats.data} loading={stats.isLoading} />
      <Market
        data={coins.data}
        loading={coins.isLoading}
        onRetry={() => coins.refetch()}
        trades={tradeList}
        tradesLoading={configured && trades.isLoading}
      />
      <Roadmap />
      <LaunchCta />
    </>
  );
}
