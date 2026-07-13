// EVERY CITATION, CHECKED AGAINST THE LIVE PAGE, RIGHT NOW.
//
//   node scripts/verify-citations.mjs
//
// ---------------------------------------------------------------------------------------------
// WHY THIS EXISTS
//
// Khoji checks these quotes against GOV.UK every night. If a quote is off by one character, or if
// it spans two bullet points and therefore is not a sentence that exists on the page at all, the
// nightly check screams FOREVER. And an alarm that always screams is an alarm somebody mutes, and a
// muted alarm is worse than no alarm because it looks like cover.
//
// So a citation is not "added" when someone types it into rulesources.ts. It is added when this
// script says the words are really on the page.
//
// IT USES THE SAME NORMALISER KHOJI USES. That is the whole point. Checking with a different
// normaliser would prove that the quote matches something, but not that it matches the thing that
// will actually be checked at 3am.
//
// THE SPACE THAT HTML STRIPPING INVENTS. `<a>simplified expenses</a>.` comes out of stripTags as
// "simplified expenses ." with a space before the full stop. A quote copied CORRECTLY off the page
// says "simplified expenses." and never matches. That is not hypothetical: it is exactly how the
// `car` citation failed on its first live run. So we strip that space, in both.

import { RULE_SOURCES } from '../lib/rulesources.ts';

const UA = 'Lekhio/1.0 (+https://lekhio.app; knowledge check)';

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

// Khoji's normalise, character for character. If this ever drifts from khoji/corpus.mjs, this
// script becomes a liar, and it is the one thing standing between us and a permanently screaming
// alarm. Keep them the same.
function normalise(s) {
  return (s || '')
    .replace(/[‘’ʼ']/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/ /g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .trim();
}

// When a quote does not match, say WHERE it stopped matching. "Not found" is useless; the longest
// prefix that IS on the page tells you instantly whether you mistyped a word, hit a curly quote, or
// quoted something that was never a sentence.
function whereItDiverges(pageText, quote) {
  let lo = 0;
  let hi = quote.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (pageText.includes(quote.slice(0, mid))) lo = mid;
    else hi = mid - 1;
  }
  const matched = quote.slice(0, lo);
  const at = pageText.indexOf(matched);
  const theirs = at >= 0 ? pageText.slice(at, at + Math.min(quote.length + 60, 260)) : '';
  return { matched, theirs };
}

const cache = new Map();
async function page(url) {
  if (cache.has(url)) return cache.get(url);
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const text = normalise(stripTags(await res.text()));
  cache.set(url, text);
  return text;
}

const results = [];

for (const [key, sources] of Object.entries(RULE_SOURCES)) {
  for (const s of sources) {
    let ok = false;
    let detail = '';
    try {
      const text = await page(s.url);
      const q = normalise(s.quote);
      ok = text.includes(q);
      if (!ok) {
        const { matched, theirs } = whereItDiverges(text, q);
        detail =
          `\n      matched up to: "...${matched.slice(-70)}"` +
          `\n      HMRC actually: "${theirs.slice(0, 170)}..."`;
      }
    } catch (e) {
      detail = `  (${e.message})`;
    }
    results.push({ key, code: s.code, ok, detail });
    console.log(`  ${ok ? 'ON THE PAGE ✓' : 'NOT FOUND   ✗'}  ${key.padEnd(18)} ${s.code}${detail}`);
  }
}

const bad = results.filter((r) => !r.ok);
console.log('\n===============================================');
if (bad.length === 0) {
  console.log(`ALL ${results.length} CITATIONS ARE REALLY ON THE PAGE. Khoji will not cry wolf.`);
  process.exitCode = 0;
} else {
  console.log(`🔴 ${bad.length} of ${results.length} QUOTES ARE NOT ON THE PAGE:`);
  for (const b of bad) console.log(`   - ${b.key} (${b.code})`);
  console.log('\nDO NOT SHIP THESE. A quote that is not on the page is a citation we invented, and an');
  console.log('invented citation is strictly worse than none. Fix the quote or DELETE it.');
  process.exitCode = 1;
}
console.log('===============================================');
