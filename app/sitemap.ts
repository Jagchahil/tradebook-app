import type { MetadataRoute } from 'next';
import { TRADES } from '../lib/trades';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';

// Public marketing + free-tool routes. The /for/[trade] long-tail pages are added
// from the single TRADES source so this never drifts out of sync with the pages.
const ROUTES = [
  '',
  'product',
  'how-mtd-works',
  'compare',
  'pricing',
  'tax-calculator',
  'cis-calculator',
  'invoice-generator',
  'can-i-claim',
  'file-your-tax-return',
  'register-your-business',
  'resources',
  'security',
  'privacy',
  'terms',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = ROUTES.map((r) => ({
    url: r ? `${BASE}/${r}` : BASE,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: r === '' ? 1 : 0.7,
  }));
  const trades: MetadataRoute.Sitemap = TRADES.map((t) => ({
    url: `${BASE}/for/${t.slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));
  return [...pages, ...trades];
}
