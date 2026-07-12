// Offline self test for Khoji's pure parsing (no network, no database). Proves the
// Atom parser, the page-change detector and the slug helper work, so you can trust
// the watcher before pointing it at the live feeds. Run: node selftest.mjs

import { parseAtom, pageItem, stripTags, slug } from './watch.mjs';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}`); } };

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>HMRC</title>
  <entry>
    <title>Rates and thresholds for employers 2027 to 2028</title>
    <link rel="alternate" href="https://www.gov.uk/guidance/rates-2027-2028"/>
    <updated>2026-11-26T09:30:00Z</updated>
    <summary>New National Insurance thresholds take effect from 6 April 2027.</summary>
    <id>tag:gov.uk,2026:/guidance/rates-2027-2028</id>
  </entry>
  <entry>
    <title><![CDATA[Making Tax Digital: what's changing]]></title>
    <link href="https://www.gov.uk/guidance/mtd-changes"/>
    <published>2026-10-01T00:00:00Z</published>
    <content>MTD for Income Tax mandation from April 2027.</content>
  </entry>
</feed>`;

const items = parseAtom(atom, 'HMRC latest');
ok('parses two entries', items.length === 2);
ok('first title read', items[0].title === 'Rates and thresholds for employers 2027 to 2028');
ok('first link from href', items[0].source_url === 'https://www.gov.uk/guidance/rates-2027-2028');
ok('published date carried', items[0].published === '2026-11-26T09:30:00Z');
ok('summary stripped and carried', /National Insurance thresholds/.test(items[0].raw.summary));
ok('CDATA title decoded', items[1].title === "Making Tax Digital: what's changing");
ok('second link from href', items[1].source_url === 'https://www.gov.uk/guidance/mtd-changes');
ok('source name tagged', items[0].source_name === 'HMRC latest');

// A malformed entry must not sink the whole feed.
const messy = atom.replace('</feed>', '<entry><title>broken</entry></feed>');
ok('malformed entry is skipped, good ones kept', parseAtom(messy, 'x').length >= 2);

// Page change detection: same content dedupes, changed content is a new row.
const a = pageItem('https://www.gov.uk/vat', 'VAT', '<html><title>VAT</title><body>threshold 90000</body></html>');
const aSame = pageItem('https://www.gov.uk/vat', 'VAT', '<html><title>VAT</title><body>threshold 90000</body></html>');
const aDiff = pageItem('https://www.gov.uk/vat', 'VAT', '<html><title>VAT</title><body>threshold 95000</body></html>');
ok('page url carries a content hash', /#[0-9a-f]{12}$/.test(a.source_url));
ok('identical page gives identical key (dedupes)', a.source_url === aSame.source_url);
ok('changed page gives a new key', a.source_url !== aDiff.source_url);
ok('page keeps the clean base url in raw', a.raw.url === 'https://www.gov.uk/vat');

ok('stripTags removes markup and entities', stripTags('<b>a &amp; b</b>') === 'a & b');
ok('slug is filesystem safe', slug('Rates & Thresholds 2027/28!') === 'rates-thresholds-2027-28');

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
