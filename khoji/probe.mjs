import { stripTags } from './watch.mjs';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';

async function text(url) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  return { status: r.status, t: r.ok ? stripTags(await r.text()) : '' };
}

// 1. The 101-hours row. The other two rows matched, so the table is there and only its LAST row is
//    worded in a way I guessed wrong. Print the whole table.
{
  const { status, t } = await text('https://www.gov.uk/simpler-income-tax-simplified-expenses/working-from-home');
  console.log(`=== working-from-home  HTTP ${status}`);
  const i = t.search(/Hours of business use|25/);
  console.log('  ' + t.slice(i - 60, i + 300).replace(/\s+/g, ' ').trim());
}

// 2. The BADR lifetime limit. If this sub-page has no £ figure either, then we assert £1,000,000 in
//    a man's capital gains calculation and CANNOT POINT AT THE SENTENCE THAT SAYS SO. That is not a
//    scraping problem. That is a number in a tax return with no source.
{
  const { status, t } = await text('https://www.gov.uk/business-asset-disposal-relief/work-out-your-tax');
  console.log(`\n=== badr/work-out-your-tax  HTTP ${status}`);
  const amounts = [...new Set([...t.matchAll(/£[\d,]+(?:\s*million)?/g)].map((m) => m[0]))];
  console.log('  £ figures: ' + (amounts.join('  ') || '(NONE)'));
  for (const m of t.matchAll(/lifetime/gi)) {
    console.log('  ... ' + t.slice(Math.max(0, m.index - 150), m.index + 120).replace(/\s+/g, ' ').trim());
    break;
  }
}
