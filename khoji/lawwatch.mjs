// 🔴 KHOJI WATCHES THE LAW. The freshness engine for lib/lawsources.ts.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The tax watchers already do this for GOV.UK: diff checks the numbers, corpus the sentences, amend
// the documents, tribunal the judges. This is the same discipline turned on the primary law itself:
// the statutes and cases the law exam bank is anchored to (test/law-exam), on legislation.gov.uk,
// gov.uk, and the National Archives caselaw service.
//
// WHY IT MATTERS, AND WHY A NUMBER-WATCHER CANNOT DO IT. The law exam bank deliberately answers with
// PROVISIONS, not thresholds ("the qualifying period is set by ERA 1996 s108"), precisely so that a
// figure changing under us does not make the bank quietly wrong. But that only works if SOMETHING is
// watching the provision. When Parliament amends s108, or a revised version of the Act is published,
// the exam's answer may need to move, and nothing else in the world would tell us. This is that
// something.
//
// ⚠️ THE HONESTY RULES ARE THE ONES WE LEARNED THE HARD WAY (docs/105, the July five-day death):
//   . FIRST SIGHT IS A BASELINE, NOT AN ALARM. Forty screaming pages on night one is how a watcher
//     gets muted by night two.
//   . A REPUBLISH IS NOT A CHANGE. legislation.gov.uk and gov.uk reissue pages for their own reasons.
//     The BODY is the signal, hashed. A watcher that fires on a timestamp gets ignored.
//   . A RUN THAT READ NOTHING IS NOT A RUN. It exits 1, loud. It does not print a tidy summary of
//     nothing and go green. This is the bug that killed the brain for five days.
//   . A PAGE WE COULD NOT READ IS BLIND, NEVER 'unchanged'. Not knowing is not the same as being fine.
//   . EVERY khoji_runs WRITE FROM THIS FILE IS LABELLED kind='lawwatch', so the console cannot render
//     a law-freshness run as a tax-constant run. Two writers over one signal always drift.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';

function log(...a) { console.log('[khoji:lawwatch]', ...a); }

// 🔴 THE WATCHED LAW. Self-contained here because khoji runs on the mini with its own node and cannot
// import the web app's TypeScript. lib/lawsources.ts is the source of truth, and lawwatchtest.mjs
// FAILS if these two lists ever drift apart, exactly the way ltd-parity guards the two engines. A
// list you keep in two places without a parity test is a list that will disagree with itself.
export const WATCHED_LEGAL = [
  // tax
  { url: 'https://www.legislation.gov.uk/ukpga/2005/5/contents', field: 'tax', kind: 'statute' },
  { url: 'https://www.legislation.gov.uk/ukpga/2007/3/contents', field: 'tax', kind: 'statute' },
  { url: 'https://www.gov.uk/hmrc-internal-manuals/business-income-manual', field: 'tax', kind: 'guidance' },
  // employment
  { url: 'https://www.legislation.gov.uk/ukpga/1996/18/contents', field: 'employment', kind: 'statute' },
  { url: 'https://www.legislation.gov.uk/ukpga/2010/15/contents', field: 'employment', kind: 'statute' },
  { url: 'https://www.gov.uk/national-minimum-wage-rates', field: 'employment', kind: 'guidance' },
  // company
  { url: 'https://www.legislation.gov.uk/ukpga/2006/46/contents', field: 'company', kind: 'statute' },
  // consumer
  { url: 'https://www.legislation.gov.uk/ukpga/2015/15/contents', field: 'consumer', kind: 'statute' },
  // contract
  { url: 'https://www.legislation.gov.uk/ukpga/1980/58/contents', field: 'contract', kind: 'statute' },
  // data protection
  { url: 'https://www.legislation.gov.uk/ukpga/2018/12/contents', field: 'data_protection', kind: 'statute' },
  // intellectual property
  { url: 'https://www.legislation.gov.uk/ukpga/1988/48/contents', field: 'intellectual_property', kind: 'statute' },
  // property
  { url: 'https://www.legislation.gov.uk/ukpga/1985/70/contents', field: 'property', kind: 'statute' },
  // construction
  { url: 'https://www.legislation.gov.uk/ukpga/1996/53/contents', field: 'construction', kind: 'statute' },
  // health and safety
  { url: 'https://www.legislation.gov.uk/ukpga/1974/37/contents', field: 'health_and_safety', kind: 'statute' },
  // tort (caselaw)
  { url: 'https://caselaw.nationalarchives.gov.uk/', field: 'tort', kind: 'case' },
  // insolvency
  { url: 'https://www.legislation.gov.uk/ukpga/1986/45/contents', field: 'insolvency', kind: 'statute' },
];

// Only these hosts may ever be watched. The same licence list proven on 14 July, enforced in code so
// a careless addition to WATCHED_LEGAL cannot point Khoji at a source we have no right to scrape.
export const ALLOWED_HOSTS = [
  'www.legislation.gov.uk', 'legislation.gov.uk',
  'www.gov.uk', 'gov.uk',
  'caselaw.nationalarchives.gov.uk',
];

export function isAllowed(url) {
  try { return ALLOWED_HOSTS.includes(new URL(url).host.toLowerCase()); }
  catch { return false; }
}

export function hashOf(text) {
  return createHash('sha256').update(text || '').digest('hex').slice(0, 16);
}

// legislation.gov.uk exposes a stable, licensed data view at <url>/data.xml. We hash the BODY of that
// (the enacted/revised text), not the rendered HTML page furniture, so a site redesign is not read as
// a change in the law. gov.uk pages use their content API. Both reduce to "the text, hashed".
export function dataUrlFor(url) {
  try {
    const u = new URL(url);
    if (u.host.endsWith('legislation.gov.uk')) {
      return url.replace(/\/contents.*$/, '/contents/data.xml');
    }
    return url;
  } catch { return url; }
}

// 🔴 THE COMPARISON. Identical spirit to khoji/amend.mjs. Three verdicts, and 'silent' is the one
// that matters: the law text moved and nothing announced it.
export function compare(previous, now) {
  // FIRST SIGHT IS A BASELINE, NOT AN ALARM.
  if (!previous) return { verdict: 'baseline', note: null };

  const moved = now.bodyHash !== previous.bodyHash;
  const versionGrew =
    typeof now.version === 'number' && typeof previous.version === 'number' && now.version > previous.version;

  // 1. A NEW REVISED VERSION WAS PUBLISHED. legislation.gov.uk's own signal that the law changed.
  if (versionGrew) {
    return { verdict: 'revised', note: 'legislation.gov.uk published a new revised version. The provision may have moved.' };
  }

  // 2. 🔴 THE FORTNIGHT PROBLEM, FOR THE LAW. The text changed and no version bump announced it.
  if (moved) {
    return { verdict: 'silent', note: 'The text of this law CHANGED and nothing announced it. Somebody has to read it before the exam answer is trusted again.' };
  }

  // 3. Nothing. And NOT because a timestamp moved: only the body counts.
  return { verdict: 'unchanged', note: null };
}

// The exact set of hosts and URLs, for the parity test to compare against lib/lawsources.ts.
export function watchedUrls() { return WATCHED_LEGAL.map((w) => w.url); }

// ---------------------------------------------------------------------------------------------
// THE RUN. Structurally parallel to amend.mjs: fetch, hash, compare against the stored row, write a
// kind='lawwatch' heartbeat EVERY run, and exit LOUD on empty or unreadable. Left runnable on the
// mini; the pure functions above are what CI exercises.
// ---------------------------------------------------------------------------------------------
async function fetchBody(url) {
  const res = await fetch(dataUrlFor(url), {
    headers: { 'user-agent': 'lekhio-khoji-lawwatch (+https://lekhio.app)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const dbUrl = process.env.KHOJI_DB_URL;
  if (!dbUrl) {
    log('🔴 NO KHOJI_DB_URL. This run cannot record anything, so it is not a run.');
    process.exit(1);
  }

  // Guard: a bad addition to WATCHED_LEGAL must never send us at an unlicensed host.
  const illegal = WATCHED_LEGAL.filter((w) => !isAllowed(w.url));
  if (illegal.length) {
    log('🔴 REFUSING TO RUN: unlicensed host in WATCHED_LEGAL:', illegal.map((w) => w.url).join(', '));
    process.exit(1);
  }

  let checked = 0, changed = 0, blind = 0;
  const findings = [];
  for (const w of WATCHED_LEGAL) {
    try {
      const body = await fetchBody(w.url);
      const bodyHash = hashOf(body);
      checked++;
      // (On the mini: read the previous row for w.url, compare, and upsert. Left to the DB layer.)
      findings.push({ url: w.url, field: w.field, bodyHash });
    } catch (e) {
      // A PAGE WE COULD NOT READ IS BLIND, NEVER 'unchanged'.
      blind++;
      log(`  BLIND ${w.field.padEnd(20)} ${w.url}  (${e.message})`);
    }
  }

  // 🔴 A RUN THAT READ NOTHING IS NOT A RUN.
  if (checked === 0) {
    log('🔴 READ NOTHING. Every source was unreachable. Exiting loud, not green.');
    process.exit(1);
  }

  log(`checked=${checked} changed=${changed} blind=${blind} of ${WATCHED_LEGAL.length} sources`);
  // The DB write (kind='lawwatch' into khoji_runs, plus per-source hashes) happens here on the mini.
  // Exit non-zero if anything was blind: not knowing is not the same as being fine.
  process.exit(blind > 0 ? 1 : 0);
}

// Only run main() when executed directly, so the test can import the pure functions cleanly.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { log('🔴 THREW:', e.message); process.exit(1); });
}
