// 🔴 THE FORTNIGHT PROBLEM. Tests for khoji/amend.mjs.
//
// It lives in khoji/ rather than tradebook-web/test/ for the same reason difftest.mjs does: THE SAME
// FILE RUNS ON THE MAC MINI, where there is no repo, and it must not be allowed to drift from what
// the mini actually executes. The web repo's runner picks it up so it is still in CI.
//
// What is being defended:
//
//   1. THE HEARTBEAT MUST NOT LIE. khoji_runs is the DIFFER's pulse and the console renders it as a
//      sentence about tax constants. If the amendment watcher writes into it unlabelled, the console
//      will one night say "23 of 23 constants matched" while the differ is dead and nothing has gone
//      near a constant. Third near miss in two days. Same shape every time: two writers, one signal.
//
//   2. FIRST SIGHT IS NOT AN AMENDMENT. Forty pages screaming on night one is how a team learns to
//      ignore the alarm on night two.
//
//   3. A REPUBLISH IS NOT A CHANGE. /income-tax-rates says public_updated_at 2024, updated_at 2026.
//      Wire the alarm to a timestamp and it cries wolf for ever.
//
//   4. A CHANGE WITH NO NOTE IS THE WHOLE POINT. That is the fortnight problem itself, and the
//      pages it will happen on are precisely the ones with no amendment log.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare, apiUrlFor, bodyOf, hashOf, changeHistoryOf, watchedPaths } from './amend.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nkhoji amendment watcher: the fortnight problem');

// ---------------------------------------------------------------------------------------------
// 1. THE COMPARISON. Everything hangs off this.
// ---------------------------------------------------------------------------------------------

const prev = { bodyHash: 'aaaa', changeCount: 3 };

ok('FIRST SIGHT IS A BASELINE, NOT AN ALARM',
  compare(null, { bodyHash: 'aaaa', changeCount: 3 }).verdict === 'baseline');

ok('an unchanged page says nothing at all',
  compare(prev, { bodyHash: 'aaaa', changeCount: 3 }).verdict === 'unchanged');

ok('🔴 A REPUBLISH IS NOT A CHANGE. Same body, moved timestamps, and we stay quiet.',
  // The alarm that cries wolf is the alarm that gets muted, and a muted alarm is worse than none
  // because we believe we have one. cisGrossRate taught us that the expensive way.
  compare(prev, {
    bodyHash: 'aaaa', changeCount: 3,
    publicUpdatedAt: '2026-07-14T00:00:00Z', updatedAt: '2026-07-14T00:00:00Z',
  }).verdict === 'unchanged');

ok('HMRC LOGGED AN AMENDMENT: we raise it, and we carry HER OWN WORDS',
  (() => {
    const r = compare(prev, {
      bodyHash: 'bbbb', changeCount: 4,
      latestNote: 'The personal allowance rate for 2021 to 2022 has been corrected to £12,570.',
    });
    return r.verdict === 'amended' && r.note.includes('corrected to £12,570');
  })());

ok('...even if the note is blank, we still say a change was logged',
  compare(prev, { bodyHash: 'bbbb', changeCount: 4, latestNote: null }).verdict === 'amended');

ok('🔴 THE FORTNIGHT PROBLEM ITSELF: the body changed and NOBODY LOGGED WHY',
  (() => {
    const r = compare(prev, { bodyHash: 'bbbb', changeCount: 3 });
    return r.verdict === 'silent' && /no amendment was logged/i.test(r.note);
  })());

ok('...and a silent amendment is told apart from a logged one, because they need different reactions',
  compare(prev, { bodyHash: 'bbbb', changeCount: 3 }).verdict
  !== compare(prev, { bodyHash: 'bbbb', changeCount: 4 }).verdict);

// ---------------------------------------------------------------------------------------------
// 2. THE HEARTBEAT MUST NOT LIE. The near miss.
// ---------------------------------------------------------------------------------------------

const amendSrc = readFileSync(path.join(HERE, 'amend.mjs'), 'utf8');
const code = amendSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

ok('🔴 EVERY khoji_runs WRITE FROM THIS FILE IS LABELLED kind=amend',
  // Not one of them may go in unlabelled. brain.ts reads khoji_runs and tells a human "62 of 62
  // constants matched". An unlabelled row from a watcher that checked ZERO constants would render
  // as exactly that sentence, and it would be a lie sourced from a true number.
  (code.match(/insert into public\.khoji_runs/g) || []).length
    === (code.match(/\(kind,[\s\S]{0,200}?'amend'/g) || []).length);

ok('...including the one written when the run DIES',
  // A run that died still says so out loud. A silent absence and a loud failure look identical from
  // the database if only the healthy path writes, and only one of them is survivable.
  /values \('amend', null, 0, 0, 0, 0, 0/.test(code));

ok('a run that could not reach the database EXITS LOUD, it does not exit 0',
  // The house disease. This brain sat dead for five days while launchd reported success every
  // morning, because a stray character made it exit 0 having written nothing.
  /KHOJI_DB_URL not set[\s\S]{0,120}?process\.exit\(1\)/.test(code));

ok('🔴 A RUN THAT READ NOTHING EXITS 1. It does not print a tidy summary of nothing.',
  // The first version of the dry run report ended with "0 of 0 pages have NO amendment log at all"
  // on a run that reached GOV.UK zero times. Arithmetically true, reads like a clean bill of health.
  // It is the same disease that killed this brain for five days and the same one that rendered a
  // crashed differ as "0 of 0 matched, every one matched" in green. It found me inside my own
  // progress report. NOT KNOWING IS NOT THE SAME AS BEING FINE.
  /seen\.length === 0[\s\S]{0,400}?process\.exit\(1\)/.test(code));

ok('a page we could not read is counted as BLIND, never as unchanged',
  // NOT KNOWING IS NOT THE SAME AS BEING FINE. The same rule as the differ's blind state and as a
  // null read of the circumstances table.
  /blind[\s\S]{0,400}?failed\.length/.test(code) || /failed\.length,\s*\/\/ could not read/.test(code));

// ---------------------------------------------------------------------------------------------
// 3. THE WATCHED LIST IS DERIVED FROM THE DIFFER, NEVER COPIED.
// ---------------------------------------------------------------------------------------------

const differSrc = readFileSync(path.join(HERE, 'diff.mjs'), 'utf8');
const pages = watchedPaths(differSrc);

ok('every page a tax constant is read off is watched for amendment. All of them, automatically.',
  pages.length >= 20 && pages.every((u) => u.startsWith('https://www.gov.uk/')));

ok('🔴 THE LIST IS DERIVED FROM diff.mjs, so it can never fall behind it',
  // Two lists of the same URLs will drift, and the one that drifts is the one nobody is looking at.
  // Add a constant with a new source page and this watcher picks it up with no second edit.
  /watchedPaths\(differSource\)/.test(code) && /readFileSync\(path\.join\(HERE, 'diff\.mjs'\)/.test(code));

ok('income-tax-rates is in there, because that is where the personal allowance comes from',
  pages.includes('https://www.gov.uk/income-tax-rates'));

// ---------------------------------------------------------------------------------------------
// 4. THE API PATH. A guide chapter is not a document.
// ---------------------------------------------------------------------------------------------

ok('a mainstream guide resolves to its DOCUMENT, not to the chapter we happen to scrape',
  // /api/content/capital-gains-tax/allowances is a 404. The document is /api/content/capital-gains-tax
  // and the chapter is one of its `parts`. Get this wrong and every guide reads as unreadable, and
  // the watcher reports itself blind on the pages that matter most.
  apiUrlFor('https://www.gov.uk/capital-gains-tax/allowances')
    === 'https://www.gov.uk/api/content/capital-gains-tax'
  && apiUrlFor('https://www.gov.uk/income-tax-rates')
    === 'https://www.gov.uk/api/content/income-tax-rates');

ok('a whitehall publication keeps its FULL path, because the whole path is the document',
  apiUrlFor('https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027')
    === 'https://www.gov.uk/api/content/guidance/rates-and-thresholds-for-employers-2026-to-2027');

// ---------------------------------------------------------------------------------------------
// 5. THE HASH IS OVER THE CONTENT, AND THE CONTENT ONLY.
// ---------------------------------------------------------------------------------------------

const guide = { details: { parts: [{ body: '<p>Allowance is £12,570.</p>' }, { body: '<p>Old rates.</p>' }] } };
const publication = { details: { body: '<p>Rates for 2026.</p>', change_history: [{ note: 'Corrected.', public_timestamp: '2026-04-05T23:15:04Z' }] } };

ok('a GUIDE hashes all of its parts, because the content lives in the parts',
  bodyOf(guide).includes('12,570') && bodyOf(guide).includes('Old rates'));

ok('a PUBLICATION hashes its body',
  bodyOf(publication).includes('Rates for 2026'));

ok('the same content always gives the same hash, and different content never does',
  hashOf(bodyOf(guide)) === hashOf(bodyOf(guide))
  && hashOf(bodyOf(guide)) !== hashOf(bodyOf(publication)));

ok('whitespace churn does NOT move the hash. Reformatting is not an amendment.',
  hashOf(bodyOf({ details: { body: '<p>a</p>\n\n   <p>b</p>' } }))
  === hashOf(bodyOf({ details: { body: '<p>a</p> <p>b</p>' } })));

ok('a document with NO change history reads as zero entries, not as a crash',
  // Which is most of them, and it is the entire reason body_hash exists.
  changeHistoryOf(guide).length === 0 && changeHistoryOf(publication).length === 1);

ok('a page with no amendment log can STILL be caught changing',
  // 🔴 THE POINT OF THE WHOLE FILE. /income-tax-rates is a guide. It has no change_history and never
  // will. If the only detector were HMRC's own log, the personal allowance page would be invisible
  // to us for ever, while the watcher cheerfully reported that it was watching it.
  compare({ bodyHash: 'old', changeCount: 0 }, { bodyHash: 'new', changeCount: 0 }).verdict === 'silent');

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
