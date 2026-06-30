import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://tradebook-app-five.vercel.app';

// Tell crawlers what to index and where the sitemap is. Keep the funnel/account
// and API paths out of the index; everything marketing/tool is fair game.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/start', '/early-access', '/invoice/', '/hmrc/'],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
