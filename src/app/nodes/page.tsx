import type { Metadata } from 'next';
import { NodesHead } from '@/components/PageHeads';
import { NodesView } from '@/components/NodesView';

export const metadata: Metadata = { title: 'Nodes' };

export default function Page() {
  return (
    <>
      <NodesHead />
      <div className="container py-8">
        <NodesView />
      </div>
    </>
  );
}