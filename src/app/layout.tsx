import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter, Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';
import { cookies } from 'next/headers';
import './globals.css';
import { Providers } from '@/components/Providers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { LANG_COOKIE } from '@/i18n/dict';
import { SITE_URL } from '@/lib/config';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', display: 'swap', axes: ['opsz', 'SOFT'] });
const ui = Inter({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });
// CJK fonts are only *used* when lang="zh-CN" (see globals.css); files load lazily by unicode-range.
const notoSerif = Noto_Serif_SC({
  weight: ['500', '700'],
  subsets: ['latin'],
  variable: '--font-noto-serif-sc',
  display: 'swap',
  preload: false,
});
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
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0B1510' },
    { media: '(prefers-color-scheme: light)', color: '#F4EEDC' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = cookies();
  const langCookie = jar.get(LANG_COOKIE)?.value;
  const lang = langCookie === 'zh' ? 'zh' : 'en';
  const theme = jar.get('sprout_theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html
      lang={lang === 'zh' ? 'zh-CN' : 'en'}
      data-theme={theme}
      className={`${display.variable} ${ui.variable} ${notoSerif.variable} ${notoSans.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen">
        <Providers lang={lang} hasLangCookie={Boolean(langCookie)}>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main id="main" className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
