import type { Metadata } from 'next';
import { NodesHead } from '@/components/PageHeads';
import { NodesView } from '@/components/NodesView';

export const metadata: Metadata = { title: 'Nodes' };

export default function Page() {
  return (
    <>
      <NodesHead />
      <div className="container py-10 sm:py-14">
        <NodesView />
      </div>
    </>
  );
}