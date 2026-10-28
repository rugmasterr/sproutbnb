import type { Metadata } from 'next';
import { MoveZecPage } from '@/features/zcash/pages/MoveZec';

export const metadata: Metadata = {
  title: 'Move ZEC',
  description: 'Bring ZEC in from your Zcash wallet, or send it back out — via NEAR Intents 1Click, tracked end to end.',
};

export default function Page() {
  return <MoveZecPage />;
}
