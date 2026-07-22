// The go live calendar (pure logic in lib/calendar.ts). Run: node test/calendar.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'cal-'));
writeFileSync(path.join(stage, 'housestyle.ts'), readFileSync(path.join(lib, 'housestyle.ts'), 'utf8'));
const fix = (s) => s.replace("from './housestyle'", "from './housestyle.ts'");
writeFileSync(path.join(stage, 'calendar.ts'), fix(readFileSync(path.join(lib, 'calendar.ts'), 'utf8')));
const C = await import(pathToFileURL(path.join(stage, 'calendar.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

// A Wednesday, 2026-07-22, 08:00 UTC. Weekdays only by default.
const from = '2026-07-22T08:00:00.000Z';

console.log('\n=== slot enumeration follows the cadence ===\n');
const one = C.enumerateSlots(from, 3);
ok('default cadence yields the asked number of slots', one.length === 3);
ok('first default slot is 09:00 UTC same day', one[0] === '2026-07-22T09:00:00.000Z');
ok('one a day steps to the next weekday', one[1] === '2026-07-23T09:00:00.000Z' && one[2] === '2026-07-24T09:00:00.000Z');

const wk = C.enumerateSlots('2026-07-24T08:00:00.000Z', 3); // Friday -> next is Monday 27th
ok('the weekend is skipped', wk[0] === '2026-07-24T09:00:00.000Z' && wk[1] === '2026-07-27T09:00:00.000Z');

const twoADay = C.enumerateSlots(from, 3, { perDay: 2, firstHour: 9, gapHours: 6 });
ok('two a day lands 09:00 and 15:00', twoADay[0].endsWith('T09:00:00.000Z') && twoADay[1].endsWith('T15:00:00.000Z'));
ok('two a day rolls to the next day for the third', twoADay[2] === '2026-07-23T09:00:00.000Z');

console.log('\n=== a slot before fromISO is never handed out ===\n');
const late = C.enumerateSlots('2026-07-22T12:00:00.000Z', 1); // past 09:00, so first slot is next day
ok('a passed hour today is skipped', late[0] === '2026-07-23T09:00:00.000Z');

console.log('\n=== nextFreeSlot avoids a taken slot ===\n');
const taken = ['2026-07-22T09:00:00.000Z', '2026-07-23T09:00:00.000Z'];
ok('next free slot skips the two booked days', C.nextFreeSlot(taken, from) === '2026-07-24T09:00:00.000Z');
ok('with nothing booked it is the first slot', C.nextFreeSlot([], from) === '2026-07-22T09:00:00.000Z');

console.log('\n=== planCalendar books a slate in order ===\n');
const book = C.planCalendar(['a', 'b', 'c'], from);
ok('one booking per asset, in order', book.length === 3 && book[0].asset_id === 'a' && book[2].asset_id === 'c');
ok('bookings step across days', book[0].when === '2026-07-22T09:00:00.000Z' && book[1].when === '2026-07-23T09:00:00.000Z');

console.log('\n=== captions are tuned per platform and dash free ===\n');
const base = 'Filing your tax is the easy bit. Claiming what you are owed is the money. Text it. It is in your Lekhio. Free for 14 days, no card.';
const ttk = C.captionFor(base, 'tiktok');
const li = C.captionFor(base, 'linkedin');
ok('tiktok caption stays within budget', ttk.length <= 150);
ok('tiktok caption carries hashtags', ttk.includes('#trades'));
ok('linkedin caption carries its own tags', li.includes('#tradespeople'));
ok('no forbidden dash survives a dashed base', !/[–—−]/.test(C.captionFor('Now — later. A range 5 - 10.', 'instagram')));
ok('facebook has no hashtag tail by design', !C.captionFor(base, 'facebook').includes('#'));

console.log('\n=== platformCaptions covers every platform on the asset ===\n');
const caps = C.platformCaptions({ caption: base, platforms: ['tiktok', 'instagram', 'youtube'] });
ok('one caption per platform', Object.keys(caps).length === 3 && caps.tiktok && caps.instagram && caps.youtube);

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
