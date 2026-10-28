'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { I18nProvider } from '@/i18n/I18nProvider';
import type { Lang } from '@/i18n/dict';
import { wagmiConfig } from '@/lib/wagmi';
import { ZcashProvider } from '@/features/zcash';

export function Providers({ lang, hasLangCookie, children }: { lang: Lang; hasLangCookie: boolean; children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <I18nProvider initial={lang} hasCookie={hasLangCookie}>
          <ZcashProvider>{children}</ZcashProvider>
        </I18nProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
