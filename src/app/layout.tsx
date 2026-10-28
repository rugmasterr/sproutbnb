import type { Metadata, Viewport } from 'next';
import { Noto_Sans_SC } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { cookies } from 'next/headers';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { Grain } from '@/components/fx/Grain';
import { LANG_COOKIE } from '@/i18n/dict';
import { SITE_URL } from '@/lib/config';

// Latin: Geist (--font-geist-sans) + Geist Mono (--font-geist-mono).
// CJK: Noto Sans SC, always in the stack after Geist so Han glyphs (春笋 etc.) render well in both
// languages; Google's unicode-range slices mean only the glyphs on the page are downloaded.
const notoSans = Noto_Sans_SC({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-noto-sans-sc',
  display: 'swap',
  preload: false,
});

const title = 'Sprout 春笋 — the Zcash-native launchpad & terminal on BNB Chain';
const description =
  'Every market. One Zcash wallet. Now on BNB Chain. Fund from a Zcash wallet, launch and trade Flap coins in ZEC, earn ZEC, and cash out to Zcash. 一个 Zcash 钱包，畅玩 BNB 链每一个市场。';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: title, template: '%s · Sprout 春笋' },
  description,
  applicationName: 'Sprout',
  openGraph: { type: 'website', title, description, siteName: 'Sprout 春笋', url: SITE_URL },
  twitter: { card: 'summary_large_image', title, description },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#07080A',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = cookies();
  const langCookie = jar.get(LANG_COOKIE)?.value;
  const lang = langCookie === 'zh' ? 'zh' : 'en';
  return (
    <html
      lang={lang === 'zh' ? 'zh-CN' : 'en'}
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable} ${notoSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <Grain />
        <Providers lang={lang} hasLangCookie={Boolean(langCookie)}>
          <div className="relative z-[2] flex min-h-screen flex-col">
            <Header />
            <main id="main" className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
