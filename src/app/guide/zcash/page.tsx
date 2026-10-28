import type { Metadata } from 'next';
import { GuideZcashPage } from '@/features/zcash/pages/GuideZcash';

export const metadata: Metadata = {
  title: 'Start with your Zcash wallet',
  description: 'Step by step: a Zcash wallet, a refund address, a passkey Sprout Account, funding with ZEC, trading, and cashing out to Zcash.',
};

export default function Page() {
  return <GuideZcashPage />;
}
