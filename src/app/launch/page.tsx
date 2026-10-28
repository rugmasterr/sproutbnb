import type { Metadata } from 'next';
import { LaunchHead } from '@/components/PageHeads';
import { LaunchForm } from '@/components/LaunchForm';

export const metadata: Metadata = { title: 'Launch a coin' };

export default function Page() {
  return (
    <>
      <LaunchHead />
      <div className="container py-10">
        <LaunchForm />
      </div>
    </>
  );
}
