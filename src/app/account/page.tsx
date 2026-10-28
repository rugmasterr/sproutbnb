import type { Metadata } from 'next';
import { AccountPage } from '@/features/zcash/pages/Account';

export const metadata: Metadata = {
  title: 'Sprout Account',
  description: 'Your passkey-controlled Sprout Account: balance in ZEC, deposits from Zcash, cash-outs back to Zcash.',
};

export default function Page() {
  return <AccountPage />;
}
