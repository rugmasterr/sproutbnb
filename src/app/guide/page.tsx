import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';
import { ZcashGuideCard } from '@/components/DocExtras';

export const metadata: Metadata = { title: 'Start here' };

export default function Page() {
  return <DocPage page="guide" toc before={<ZcashGuideCard />} />;
}
