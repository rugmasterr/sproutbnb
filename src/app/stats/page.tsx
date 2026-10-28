import type { Metadata } from 'next';
import { StatsHead } from '@/components/PageHeads';
import { StatsView } from '@/components/StatsView';

export const metadata: Metadata = { title: 'Stats' };

export default function Page() {
  return (
    <>
      <StatsHead />
      <div className="container py-8">
        <StatsView />
      </div>
    </>
  );
}