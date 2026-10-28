import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
// Docs/learn copy lives in src/content/pages.ts (written separately). Fall back to a stub so the
// site always builds, even when that file is not present yet.
const pagesReal = path.join(root, 'src/content/pages.ts');
const pagesStub = path.join(root, 'src/lib/pages.stub.ts');
const pagesModule = existsSync(pagesReal) ? pagesReal : pagesStub;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: { dirs: ['src'] },
  webpack(config) {
    config.resolve.alias = { ...(config.resolve.alias || {}), '@sprout/pages': pagesModule };
    // Optional deps pulled in by wallet libs that we never use (no WalletConnect / RN storage).
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      'pino-pretty': false,
      lokijs: false,
      encoding: false,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

export default nextConfig;
