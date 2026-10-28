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
    <div className="container py-8">
      <CoinView address={getAddress(params.address)} />
    </div>
  );
}
