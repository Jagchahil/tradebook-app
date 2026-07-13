import type { MetadataRoute } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const BASE = APP_URL || 'https://tradebook-app-five.vercel.app';

// Tell crawlers what to index and where the sitemap is. Keep the funnel/account
// and API paths out of the index; everything marketing/tool is fair game.
//
// Until the real domain is set (NEXT_PUBLIC_APP_URL, i.e. lekhio.app), we are on
// the temporary Vercel URL. Block ALL indexing so search engines never index the
// temp host and split the SEO equity before the real domain goes live. The moment
// NEXT_PUBLIC_APP_URL is set, normal indexing rules apply automatically.
export default function robots(): MetadataRoute.Robots {
  if (!APP_URL) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // /share/ is somebody's actual books behind a signed link. It carries a
      // noindex header too, but a crawler should never be following one at all.
      //
      // /team is the internal dashboard. It is behind a magic link to an address that must already
      // be in team_members, so a crawler could not read it anyway. But an internal tool that turns
      // up in a Google result is an invitation, and there is no reason to send one.
      disallow: ['/api/', '/start', '/early-access', '/invoice/', '/hmrc/', '/share/', '/accountant/', '/team'],
    },
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
