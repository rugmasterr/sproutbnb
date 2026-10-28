import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';

export const metadata: Metadata = { title: 'Risk' };

export default function Page() {
  return <DocPage page="risk" toc={false} />;
}