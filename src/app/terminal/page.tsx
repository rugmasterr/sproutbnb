import type { Metadata } from 'next';
import { Suspense } from 'react';
import { TerminalHead } from '@/components/PageHeads';
import { TerminalView } from '@/components/TerminalView';

export const metadata: Metadata = { title: 'Terminal' };

export default function Page() {
  return (
    <>
      <TerminalHead />
      <div className="container py-8">
        <Suspense fallback={<div className="skeleton h-40 w-full" />}>
          <TerminalView />
        </Suspense>
      </div>
    </>
  );
}
