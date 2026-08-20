// 🔴 THE LAW-WATCH TEST. Runs in the web repo's run-all; the file it tests runs on the mini.
//
// It proves three things:
//   1. compare() behaves, including the two cases that took us five days to learn: a republish is not
//      a change, and a silent text move is the one that matters.
//   2. Every watched source is on a LICENSED host. A watcher pointed at a source we may not scrape is
//      a legal problem, not a bug, and it fails the build.
//   3. 🔴 PARITY. khoji/lawwatch.mjs holds its own copy of the watched list (the mini cannot import
//      the web app's TypeScript), and this test FAILS if that copy drifts from lib/lawsources.ts.
//      A list kept in two places without a parity test is a list that will disagree with itself, and
//      the disagreement will be the one law we stopped watching.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  compare, isAllowed, dataUrlFor, watchedUrls, WATCHED_LEGAL,
  extractSignal, legislationToc, govukSignal, hostOf, textOf,
  MIN_SIGNAL_ITEMS, MIN_SIGNAL_CHARS,
} from './lawwatch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nkhoji-lawwatch: the law stays fresh, or the console says so');

// --- 1. compare() ---------------------------------------------------------------------------
const prev = { bodyHash: 'aaaa', version: 3 };

ok('FIRST SIGHT IS A BASELINE, NOT AN ALARM',
  compare(null, { bodyHash: 'aaaa', version: 3 }).verdict === 'baseline');

ok('an unchanged law says nothing at all',
  compare(prev, { bodyHash: 'aaaa', version: 3 }).verdict === 'unchanged');

ok('🔴 A REPUBLISH IS NOT A CHANGE. Same text, and we stay quiet.',
  compare(prev, { bodyHash: 'aaaa', version: 3 }).verdict === 'unchanged');

ok('🔴 A NEW REVISED VERSION is raised as revised, with a human-readable note',
  (() => { const r = compare(prev, { bodyHash: 'bbbb', version: 4 }); return r.verdict === 'revised' && /revised version/.test(r.note); })());

ok('🔴 THE FORTNIGHT PROBLEM, FOR THE LAW: the text moved and nothing announced it',
  (() => { const r = compare(prev, { bodyHash: 'bbbb', version: 3 }); return r.verdict === 'silent' && /somebody has to read it/i.test(r.note); })());

ok('...and a silent change is told apart from an announced one, because they need different reactions',
  compare(prev, { bodyHash: 'bbbb', version: 3 }).verdict !== compare(prev, { bodyHash: 'bbbb', version: 4 }).verdict);

// --- 2. licensing ---------------------------------------------------------------------------
ok('🔴 EVERY watched source is on a LICENSED host',
  WATCHED_LEGAL.every((w) => isAllowed(w.url)));

ok('...and an unlicensed host is correctly refused',
  !isAllowed('https://en.wikipedia.org/wiki/Employment_Rights_Act_1996')
  && !isAllowed('https://www.lawgazette.co.uk/'));

ok('legislation.gov.uk contents pages are hashed via the licensed /data.xml view, not the HTML furniture',
  dataUrlFor('https://www.legislation.gov.uk/ukpga/1996/18/contents') === 'https://www.legislation.gov.uk/ukpga/1996/18/contents/data.xml');

// --- 2b. 🔴 WE HASH THE LAW, NOT THE RESPONSE. Added 21 Aug 2026. --------------------------
//
// This watcher cried wolf on 13 to 24 of 24 sources every night for three weeks because it hashed
// the whole response. Two seconds apart, a gov.uk render differs by a csrf-token, a csp-nonce, the
// same nonce on a script tag and randomised element ids. These tests are the ones that would have
// caught it, so they are written against the exact bytes that moved.

ok('gov.uk goes to the CONTENT API, which has no csrf token and no nonce in it',
  dataUrlFor('https://www.gov.uk/hmrc-internal-manuals/business-income-manual')
    === 'https://www.gov.uk/api/content/hmrc-internal-manuals/business-income-manual');

ok('...and a trailing slash does not produce a double slash in the api path',
  dataUrlFor('https://www.gov.uk/national-minimum-wage-rates/')
    === 'https://www.gov.uk/api/content/national-minimum-wage-rates');

ok('legislation.gov.uk still goes to the licensed /data.xml view',
  dataUrlFor('https://www.legislation.gov.uk/ukpga/1996/18/contents')
    === 'https://www.legislation.gov.uk/ukpga/1996/18/contents/data.xml');

const CLML = `<Contents>
  <ContentsItem IdURI="http://www.legislation.gov.uk/id/ukpga/1996/18/section/1">
    <ContentsNumber>1</ContentsNumber><ContentsTitle>Meaning of employee</ContentsTitle></ContentsItem>
  <ContentsItem IdURI="http://www.legislation.gov.uk/id/ukpga/1996/18/section/108">
    <ContentsNumber>108</ContentsNumber><ContentsTitle>Qualifying period of employment</ContentsTitle></ContentsItem>
  <ContentsItem IdURI="http://www.legislation.gov.uk/id/ukpga/1996/18/section/230">
    <ContentsNumber>230</ContentsNumber><ContentsTitle>Employees and workers</ContentsTitle></ContentsItem>
</Contents>`;

ok('🔴 the legislation signal is the PROVISION LIST, and s108 is in it',
  /section\/108/.test(legislationToc(CLML)) && /Qualifying period/.test(legislationToc(CLML)));

ok('🔴 reserialising the SAME provisions does not move the signal',
  legislationToc(CLML) === legislationToc(CLML.replace(/\n\s+/g, ' ').replace(/> </g, '><')));

ok('🔴 ...but a provision actually moving DOES move it',
  legislationToc(CLML) !== legislationToc(CLML.replace('108', '109')));

const GOVUK = JSON.stringify({
  title: 'Business Income Manual',
  updated_at: '2026-08-20T18:00:00Z',
  public_updated_at: '2026-08-14T18:51:23Z',
  details: {
    child_section_groups: [{ title: 'Contents', child_sections: [
      { title: 'BIM37910 Wholly and exclusively' }, { title: 'BIM42701 Bad and doubtful debts' },
      { title: 'BIM46351 Pre trading expenditure' }, { title: 'BIM45000 Specific deductions' },
      { title: 'BIM31000 Computing the amount to assess' },
    ] }],
  },
});

ok('🔴 the gov.uk signal carries the section codes',
  /BIM42701/.test(govukSignal(GOVUK)) && /Pre trading/.test(govukSignal(GOVUK)));

ok('🔴 A REPUBLISH IS NOT A CHANGE: updated_at moving does not move the signal',
  govukSignal(GOVUK) === govukSignal(GOVUK.replace('2026-08-20T18:00:00Z', '2026-08-21T04:00:00Z')));

ok('🔴 ...nor does public_updated_at, which is the one that moved under us',
  govukSignal(GOVUK) === govukSignal(GOVUK.replace('2026-08-14T18:51:23Z', '2026-08-21T09:00:00Z')));

ok('🔴 ...but a section appearing DOES move it',
  govukSignal(GOVUK) !== govukSignal(GOVUK.replace('BIM45000', 'BIM45001')));

// 🔴 THE FAILURE THAT WOULD BE WORSE THAN THE NOISE. If an extractor stops matching, every source
// yields the same empty signal, every hash agrees, and the watcher goes serenely green forever.
ok('🔴 AN UNREADABLE SHAPE IS null, NOT AN EMPTY SIGNAL. Blind, never unchanged.',
  legislationToc('<html>a redesign</html>') === null
  && govukSignal('<!doctype html><p>not json</p>') === null
  && govukSignal('{"details":{}}') === null);

ok('...and a thin response is refused rather than believed',
  legislationToc('<Contents><ContentsItem IdURI="x"/></Contents>') === null && MIN_SIGNAL_ITEMS >= 5);

// 🔴 gov.uk has TWO shapes and requiring an item count left one of them silently unwatched. The
// national minimum wage page is ONE long body, not a list of section titles, and it read BLIND.
const GUIDE = JSON.stringify({
  title: 'National Minimum Wage and National Living Wage rates',
  public_updated_at: '2026-08-14T18:51:23Z',
  details: { body: '<h2 class="gem-c-heading">Current rates</h2><p>These rates are for the National '
    + 'Living Wage for those aged 21 and over, and the National Minimum Wage for those under 21 and '
    + 'apprentices. Rates change every April, and the apprentice rate applies to apprentices aged '
    + 'under 19 or in the first year of their apprenticeship.</p>' },
});

ok('🔴 AN ORDINARY GUIDE IS ONE LONG BODY, and a character floor keeps it watched',
  govukSignal(GUIDE) !== null && /National Living Wage/.test(govukSignal(GUIDE)) && MIN_SIGNAL_CHARS >= 200);

ok('🔴 MARKUP IS NOT THE LAW. A class name changing does not move the signal.',
  govukSignal(GUIDE) === govukSignal(GUIDE.replace('gem-c-heading', 'gem-c-heading govuk-!-mt-4')));

ok('...but the rate wording changing DOES move it',
  govukSignal(GUIDE) !== govukSignal(GUIDE.replace('aged 21 and over', 'aged 20 and over')));

ok('textOf strips tags and squashes whitespace, and leaves plain text alone',
  textOf('<p>a   b</p>') === 'a b' && textOf('  plain  ') === 'plain');

ok('🔴 an INDEX PAGE cannot be watched for a silent law change, and says so with null',
  extractSignal('https://caselaw.nationalarchives.gov.uk/', '<html>newest judgments</html>') === null);

ok('extractSignal routes by host',
  hostOf('https://www.gov.uk/x') === 'www.gov.uk'
  && extractSignal('https://www.legislation.gov.uk/ukpga/1996/18/contents', CLML) === legislationToc(CLML));

// --- 3. 🔴 PARITY with lib/lawsources.ts -----------------------------------------------------
// The mini's list and the web app's list are the SAME law or one of them is lying. Load lawsources
// from whichever layout we are in (sibling in Cowork, subdir in the deploy repo). A test that only
// runs in one of the two places it is meant to run is not a test, it is a local habit.
async function loadLawSources() {
  const candidates = [
    path.resolve(HERE, '../tradebook-web/lib/lawsources.ts'), // Cowork: khoji is a sibling
    path.resolve(HERE, '../lib/lawsources.ts'),               // deploy repo: khoji is inside
  ];
  for (const c of candidates) {
    try { return await import(`${pathToFileURL(c).href}?t=${Date.now()}`); } catch { /* try next */ }
  }
  return null;
}

const LS = await loadLawSources();
ok('lib/lawsources.ts was found in one of the two layouts',
  LS !== null && typeof LS.watchedLegalUrls === 'function');

if (LS) {
  const registry = new Set(LS.watchedLegalUrls());
  const watcher = new Set(watchedUrls());
  const missingFromWatcher = [...registry].filter((u) => !watcher.has(u));
  const extraInWatcher = [...watcher].filter((u) => !registry.has(u));

  ok('🔴 THE WATCHER WATCHES EXACTLY WHAT THE REGISTRY DECLARES. No law is silently dropped.',
    missingFromWatcher.length === 0 && extraInWatcher.length === 0);

  if (missingFromWatcher.length) console.log('    in lawsources but NOT watched:', missingFromWatcher.join(', '));
  if (extraInWatcher.length) console.log('    watched but NOT in lawsources:', extraInWatcher.join(', '));

  // And every registry host must itself be licensed, checked independently of the watcher's own list.
  ok('every source the registry declares is on a licensed host',
    LS.watchedLegalUrls().every((u) => isAllowed(u)));
}

// --- 4. 🔴 IT ACTUALLY PERSISTS. The test that would have caught the stub. ---------------------
//
// The first version of main() fetched, hashed, and wrote NOTHING: the DB line was a comment. The
// parity tests above were all green while the watcher lit nothing, because they only exercise the
// pure functions. So this asserts, against the SOURCE (comments stripped, or a comment describing
// the write would pass for the write), that main() really does persist.
const src = readFileSync(path.resolve(HERE, 'lawwatch.mjs'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

ok('🔴 lawwatch WRITES per-source freshness to khoji_law (not a comment, real SQL)',
  /insert into public\.khoji_law/.test(src) && /on conflict \(url\) do update/.test(src));

ok('🔴 ...and writes a kind=\'lawwatch\' heartbeat to khoji_runs EVERY run',
  /insert into public\.khoji_runs/.test(src) && /'lawwatch'/.test(src));

ok('...and it opens a real db connection (withDb / pg), so those inserts can actually run',
  /async function withDb/.test(src) && /import\('pg'\)/.test(src));

// And the console must READ that freshness, or the nodes stay dim no matter what lawwatch writes.
const brainRoute = path.resolve(HERE, '../tradebook-web/app/api/team/brain/route.ts');
const brainRouteAlt = path.resolve(HERE, '../app/api/team/brain/route.ts');
let routeSrc = '';
try { routeSrc = readFileSync(brainRoute, 'utf8'); } catch { try { routeSrc = readFileSync(brainRouteAlt, 'utf8'); } catch { /* not present in this layout */ } }
if (routeSrc) {
  ok('🔴 THE CONSOLE FEEDS LAW FRESHNESS INTO THE CONSTELLATION (readLawFreshness -> buildBrainMap)',
    /readLawFreshness/.test(routeSrc) && /law:/.test(routeSrc));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
