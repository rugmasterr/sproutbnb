import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

const ROUTES = ['', '/launch', '/stats', '/terminal', '/nodes', '/docs', '/about', '/guide', '/guide/zcash', '/zec', '/roadmap', '/risk', '/terms'];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map((r) => ({ url: `${SITE_URL}${r}`, changeFrequency: 'weekly', priority: r === '' ? 1 : 0.6 }));
}