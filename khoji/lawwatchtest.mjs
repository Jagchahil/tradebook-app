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
import { compare, isAllowed, dataUrlFor, watchedUrls, WATCHED_LEGAL } from './lawwatch.mjs';

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

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
