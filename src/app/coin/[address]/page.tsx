import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAddress, isAddress } from 'viem';
import { CoinView } from '@/components/CoinView';

type P = { params: { address: string } };

export function generateMetadata({ params }: P): Metadata {
  const a = params.address;
  return { title: isAddress(a) ? `Coin ${a.slice(0, 6)}…${a.slice(-4)}` : 'Coin' };
}

export default function Page({ params }: P) {
  if (!isAddress(params.address)) notFound();
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="ink-wash fade-mask-b pointer-events-none absolute inset-x-0 top-0 h-[520px]" />
      <div aria-hidden className="grid-bg fade-mask-b pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-60" />
      <div className="container relative py-8 sm:py-12">
        <CoinView address={getAddress(params.address)} />
      </div>
    </div>
  );
}
