'use client';

import { ErrorView } from '@/components/ErrorViews';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView reset={reset} digest={error?.digest} />;
}
