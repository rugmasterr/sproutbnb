import type { Metadata } from 'next';
import { DocPage } from '@/components/DocPage';

export const metadata: Metadata = { title: 'Docs & FAQ' };

export default function Page() {
  return <DocPage page="docs" toc={true} />;
}