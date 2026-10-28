import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';

export const metadata: Metadata = { title: 'Roadmap' };

export default function Page() {
  return <DocPage page="roadmap" toc={false} />;
}