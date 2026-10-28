import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';

export const metadata: Metadata = { title: 'Terms' };

export default function Page() {
  return <DocPage page="terms" toc={false} />;
}