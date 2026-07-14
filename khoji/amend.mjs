// KHOJI: THE AMENDMENT WATCHER. The fortnight problem.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// BEING LATE IS RECOVERABLE. BEING CONFIDENTLY WRONG FOR TWO WEEKS IS NOT.
//
// Budget 2025's OOTLAR, the document that tells the country what the tax rates now are, was SILENTLY
// AMENDED FIVE TIMES IN NINE DAYS. The change notes read like this:
//
//     "Figures in paragraph 1.7 have been amended."
//
// No announcement. No new URL. No press notice. The page you read on Budget night and the page you
// read a fortnight later are different documents wearing the same address.
//
// diff.mjs, our constant differ, cannot see this. It checks whether the NUMBER on the page still
// equals the NUMBER in our engine. If HMRC changes a footnote, an effective date, a band boundary
// we do not extract, or a definition our extractor depends on, the number it reads is unchanged and
// the differ reports 62 of 62 agreed and the light stays green. It is not lying. It is answering the
// only question it was asked.
//
// This file asks a different question: HAS THE DOCUMENT CHANGED AT ALL, AND DID ANYONE SAY WHY?
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT I FOUND WHEN I ACTUALLY LOOKED, AND IT CHANGED THE DESIGN TWICE:
//
// 1. `details.change_history` is REAL and it is gold. On /government/publications/... documents,
//    HMRC records every amendment in its own words, with a timestamp. Live, right now, on the income
//    tax rates publication:
//
//        "The personal allowance rate for 2021 to 2022 has been CORRECTED to £12,570.
//         The basic tax rate ... has been CORRECTED to £37,700."
//
//    A silent correction of a published tax figure. That is exactly the event we are hunting, and
//    HMRC hands us the note. Nobody in this market reads it.
//
// 2. 🔴 BUT MOST OF THE PAGES WE DEPEND ON DO NOT HAVE IT.
//
//    /income-tax-rates is a mainstream `guide`. So are /vat-rates, /capital-allowances/...,
//    /tax-on-dividends. Guides carry NO change_history at all. The single most important page in our
//    whole corpus, the one the personal allowance and the basic rate band come off, has no amendment
//    log. So a watcher built only on change_history would be blind precisely where it matters most,
//    while reporting that it was watching.
//
//    Worse: /income-tax-rates says public_updated_at = 2024-11-07 and updated_at = 2026-05-28. The
//    public timestamp is eighteen months stale. GOV.UK moves `updated_at` on republish, for reasons
//    that have nothing to do with content. So `updated_at` alone is noise, and an alarm that fires
//    on noise is an alarm somebody mutes, and a muted alarm is worse than no alarm because we think
//    we have one. (cisGrossRate taught us that: a permanently broken check is an alarm that never
//    clears, and one everybody stops reading.)
//
// SO THE DETECTOR IS THE CONTENT ITSELF, and the Content API hands it over clean.
//
//    We hash the API's own body text: `details.body` plus every `details.parts[].body`. That is the
//    CONTENT, with none of the page furniture, no nav, no cookie banner, no ld+json blob, none of
//    the churn that made the old HTML hashing approach noisy. If that hash moves, the document
//    really changed. If it does not, a republish is just a republish, and we say nothing.
//
// THREE OUTCOMES, AND THE MIDDLE ONE IS THE WHOLE POINT:
//
//    AMENDED, WITH A NOTE     a new change_history entry. We know, and we know WHY, in HMRC's words.
//    🔴 AMENDED, WITH NO NOTE  the body changed and nobody logged a reason. THE FORTNIGHT PROBLEM.
//    UNCHANGED                 body hash identical. Say nothing, however much updated_at wobbles.
//
//   node amend.mjs             normal run
//   node amend.mjs --dry-run   fetch and compare only, write nothing, print a report

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';
const TIMEOUT_MS = 20000;

function log(...a) { console.log('[khoji:amend]', ...a); }

// ---------------------------------------------------------------------------------------------
// WHAT WE WATCH: every page a tax constant is READ OFF, taken from diff.mjs itself.
//
// ⚠️ IT IS DERIVED, NOT COPIED. Two lists of the same URLs will drift, and the one that drifts is
// always the one nobody is looking at. Add a constant to diff.mjs with a new source page and this
// watcher picks the page up on the next run, with no second edit and nothing to remember. That rule
// has been earned three separate times in this codebase, all of them over money.
// ---------------------------------------------------------------------------------------------
export function watchedPaths(differSource) {
  const urls = new Set();
  for (const m of differSource.matchAll(/url:\s*'(https:\/\/www\.gov\.uk\/[^']+)'/g)) {
    urls.add(m[1]);
  }
  return [...urls].sort();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE DOCUMENT IS THE UNIT. NOT THE URL WE HAPPEN TO SCRAPE.
//
// The first dry run against the real GOV.UK told me this, and nothing else would have:
//
//     d449ce0e  /capital-gains-tax/allowances
//     d449ce0e  /capital-gains-tax/rates                          <- IDENTICAL HASH
//     0f537a07  /register-for-vat
//     0f537a07  /register-for-vat/cancel-your-registration        <- IDENTICAL HASH
//     2fd180fd  /simpler-income-tax-simplified-expenses/vehicles
//     2fd180fd  /simpler-income-tax-simplified-expenses/working-from-home
//
// Three documents, six URLs. The differ scrapes two constants off two CHAPTERS of the same guide,
// so the same guide appeared twice in the watch list, was fetched twice, and would be stored twice.
//
// The day GOV.UK edits the capital gains guide, that raises TWO incidents for ONE amendment. Six of
// twenty-three would double up. And an alarm that fires twice for one event is an alarm somebody
// learns to skim, which is the one thing this file must never become. We have already killed one
// check in this system (cisGrossRate) for exactly that sin.
//
// So we group by DOCUMENT, fetch each once, store each once, and carry the list of pages we read off
// it, so the incident can say which constants are in the blast radius.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export function documents(webUrls) {
  const byDoc = new Map();
  for (const webUrl of webUrls) {
    const apiUrl = apiUrlFor(webUrl);
    if (!byDoc.has(apiUrl)) byDoc.set(apiUrl, { apiUrl, pages: [] });
    byDoc.get(apiUrl).pages.push(webUrl);
  }
  return [...byDoc.values()].sort((a, b) => a.apiUrl.localeCompare(b.apiUrl));
}

// GOV.UK's Content API lives at /api/content + the path, and it takes the path of the PARENT
// document. A guide chapter like /income-tax-rates/current-rates-and-allowances is served under
// /api/content/income-tax-rates, with the chapter as one of `details.parts`. So we take the first
// segment for guides. Publications keep their full path.
export function apiUrlFor(webUrl) {
  const p = new URL(webUrl).pathname.replace(/^\/+/, '');
  const segments = p.split('/');

  // /government/... and /guidance/... are whitehall documents. Their full path IS the document.
  if (segments[0] === 'government' || segments[0] === 'guidance') {
    return `https://www.gov.uk/api/content/${p}`;
  }

  // Everything else is mainstream. A trailing segment is a CHAPTER of a guide, not a document, and
  // asking the API for a chapter gets a 404. The document is the first segment.
  return `https://www.gov.uk/api/content/${segments[0]}`;
}

// THE CONTENT, AND ONLY THE CONTENT.
//
// The API gives us the body as HMRC wrote it. No navigation, no scripts, no ld+json, no cookie
// banner. This is why the hash is trustworthy where a hash of the rendered HTML was not.
export function bodyOf(doc) {
  const d = doc?.details || {};
  const parts = Array.isArray(d.parts) ? d.parts.map((p) => p.body || '') : [];
  const body = typeof d.body === 'string' ? d.body : '';
  return [body, ...parts].join('\n').replace(/\s+/g, ' ').trim();
}

export function hashOf(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export function changeHistoryOf(doc) {
  const ch = doc?.details?.change_history;
  return Array.isArray(ch) ? ch : [];
}

// ---------------------------------------------------------------------------------------------
// THE COMPARISON. Everything hangs off this, so it is a pure function and it is tested.
// ---------------------------------------------------------------------------------------------
export function compare(previous, now) {
  // FIRST SIGHT IS NOT AN AMENDMENT. A new page is a baseline, not an alarm. Raising one here would
  // mean every page screams the first night the watcher runs, and forty screaming pages on night one
  // is how a team learns to ignore the thing on night two.
  if (!previous) {
    return { verdict: 'baseline', note: null };
  }

  const grew = now.changeCount > previous.changeCount;
  const moved = now.bodyHash !== previous.bodyHash;

  // 1. HMRC TOLD US. The best case, and the one nobody in this market is listening for.
  if (grew) {
    return {
      verdict: 'amended',
      note: now.latestNote || 'HMRC logged an amendment but left the note blank.',
    };
  }

  // 2. 🔴 THE FORTNIGHT PROBLEM. The document changed and nobody wrote it down.
  //
  // This is the case that cost us the whole exercise. The number our differ reads may be unchanged,
  // so the differ says green; the page was quietly edited, so we are working from a document that no
  // longer exists; and there is no note anywhere to tell us. A human has to go and look.
  if (moved) {
    return {
      verdict: 'silent',
      note: 'The text of this page CHANGED and no amendment was logged. Somebody has to read it.',
    };
  }

  // 3. Nothing. And note what we do NOT do here: we do not raise anything because `updated_at`
  //    moved. GOV.UK republishes pages for its own reasons. The body is what matters, and the body
  //    is the same. An alarm that fires on a republish gets muted, and then it is not an alarm.
  return { verdict: 'unchanged', note: null };
}

// ---------------------------------------------------------------------------------------------

async function fetchDoc(apiUrl) {
  const res = await fetch(apiUrl, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// `pg` is imported LAZILY, at the point of use, exactly as diff.mjs does it.
//
// Not a style choice. It means the pure functions above (compare, apiUrlFor, bodyOf, hashOf) can be
// imported and tested anywhere, including in CI on a machine with no node_modules and no database.
// A comparison rule that can only be exercised on the Mac mini is a comparison rule that is not
// really tested, and this one decides whether we notice that a tax page was rewritten under us.
async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

// The incident, on the SAME RAILS as the differ: knowledge_items, keyed by a url that carries the
// hash, so the same amendment does not raise twice, and a fresh one always does.
//
// ⚠️ KEYED ON THE DOCUMENT, NOT ON A PAGE. Six of our twenty-three watched URLs are chapters of three
// shared guides. Key this on the page and one edit to the capital gains guide raises two identical
// incidents, and an alarm that fires twice for one event is an alarm somebody learns to skim.
function incidentKey(row) {
  return `${row.apiUrl}#amend-${row.bodyHash}`;
}

async function main() {
  const started = Date.now();

  const differSource = readFileSync(path.join(HERE, 'diff.mjs'), 'utf8');
  const pages = watchedPaths(differSource);

  // THE DOCUMENT IS THE UNIT. 23 scraped pages collapse to 20 real GOV.UK documents, because three
  // guides are each read twice for two different constants. One fetch, one row, one alarm.
  const docs = documents(pages);
  log(`${pages.length} pages the differ reads, which are ${docs.length} GOV.UK documents. Watching the documents.`);

  const seen = [];
  const failed = [];

  for (const { apiUrl, pages: onIt } of docs) {
    const webUrl = onIt[0];
    try {
      const doc = await fetchDoc(apiUrl);
      const ch = changeHistoryOf(doc);
      seen.push({
        webUrl,
        pages: onIt,
        apiUrl,
        contentId: doc.content_id || null,
        schema: doc.schema_name || null,
        bodyHash: hashOf(bodyOf(doc)),
        changeCount: ch.length,
        latestNote: ch[0]?.note || null,
        latestChangeAt: ch[0]?.public_timestamp || null,
        publicUpdatedAt: doc.public_updated_at || null,
        updatedAt: doc.updated_at || null,
      });
    } catch (e) {
      // ⚠️ A PAGE WE COULD NOT READ IS NOT A PAGE THAT DID NOT CHANGE.
      //
      // It is the same rule as the differ's `blind` state, and the same rule as a null read in the
      // circumstances table: NOT KNOWING IS NOT THE SAME AS BEING FINE. It is counted, it is
      // reported, and if it persists the health check will say so out loud.
      failed.push({ webUrl: apiUrl, error: e.message });
      log(`COULD NOT READ ${apiUrl}: ${e.message}`);
    }
  }

  if (DRY) {
    // ⚠️ A RUN THAT READ NOTHING IS NOT A RUN, AND IT MUST NOT PRINT A REASSURING SENTENCE.
    //
    // The first version of this block ended with "0 of 0 pages have NO amendment log at all", which
    // is arithmetically true and reads like a clean bill of health, on a run that reached GOV.UK
    // zero times. That is the exact shape of the bug that killed this brain for five days, and of
    // the console bug that rendered a crashed differ as "0 of 0 matched, every one matched" in
    // GREEN. It found me again inside my own progress report. It gets a hard stop, not a footnote.
    if (seen.length === 0) {
      console.error(`\n🔴 READ NOTHING. All ${docs.length} documents failed. This is not a clean run, it is a BLIND one.`);
      console.error('   NOT KNOWING IS NOT THE SAME AS BEING FINE.');
      process.exit(1);
    }

    log(`dry run. read ${seen.length} documents, failed ${failed.length}. Nothing written.`);
    for (const r of seen) {
      const also = r.pages.length > 1 ? `  (+${r.pages.length - 1} more chapter${r.pages.length > 2 ? 's' : ''})` : '';
      log(`  ${String(r.schema).padEnd(18)} ch=${String(r.changeCount).padStart(2)} ${r.bodyHash} ${r.apiUrl.replace('https://www.gov.uk/api/content/', '/')}${also}`);
    }

    // The finding that shaped this file, printed every dry run so it cannot be forgotten.
    const noLog = seen.filter((r) => r.changeCount === 0);
    log(`\n⚠️ ${noLog.length} of ${seen.length} pages we read have NO amendment log at all.`);
    log('   For those, the body hash is the ONLY way we can ever know they changed.');
    return;
  }

  if (!DB_URL) {
    // Exit LOUD. The house disease: a watcher that cannot reach its database and exits 0 is a
    // watcher that reports success while checking nothing, and this brain has already sat dead for
    // five days that way while launchd said everything was fine.
    console.error('[khoji:amend] fatal: KHOJI_DB_URL not set. Nothing was compared against the record.');
    process.exit(1);
  }

  const raised = [];

  await withDb(async (db) => {
    for (const row of seen) {
      const { rows } = await db.query(
        'select body_hash, change_count from public.khoji_documents where api_url = $1',
        [row.apiUrl],
      );
      const previous = rows[0]
        ? { bodyHash: rows[0].body_hash, changeCount: Number(rows[0].change_count) }
        : null;

      const { verdict, note } = compare(previous, row);

      if (verdict === 'amended' || verdict === 'silent') {
        raised.push({ ...row, verdict, note });
        await db.query(
          `insert into public.knowledge_items
             (source_url, source_name, title, summary, affects, confidence, engine_impact, status, raw, distilled_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
           on conflict (source_url) do nothing`,
          [
            incidentKey(row),
            'Khoji amendment watcher',
            verdict === 'silent'
              ? `🔴 SILENTLY AMENDED: ${row.webUrl}`
              : `AMENDED: ${row.webUrl}`,
            [
              note,
              '',
              `Document: ${row.webUrl}`,
              `Type: ${row.schema}`,
              // THE BLAST RADIUS. One guide can carry several constants, read off several chapters.
              // Say which, so whoever opens this at 7am knows what to go and check.
              `The differ reads ${row.pages.length} page${row.pages.length > 1 ? 's' : ''} off this document:`,
              ...row.pages.map((u) => `  . ${u}`),
              row.latestChangeAt ? `HMRC logged it at: ${row.latestChangeAt}` : 'HMRC logged nothing.',
              '',
              // Say plainly what this is and what it is NOT, because a reader at 7am needs to know
              // in one line whether a number is wrong or whether a document merely moved.
              'This does NOT mean a tax constant is wrong. diff.mjs checks the numbers and it runs',
              'separately. This means the DOCUMENT those numbers are read off has changed, which the',
              'number check cannot see: a new band, a moved effective date, a footnote that makes our',
              'reading of it wrong. Somebody has to read the page.',
            ].join('\n'),
            'the tax engine, and therefore every user',
            null,          // No model guessed this and no model interpreted it. It is a hash.
            false,         // Not proven engine impact. It is a prompt to LOOK, not a verdict.
            'needs_distillation',
            {
              url: row.webUrl,
              verdict,
              schema: row.schema,
              bodyHash: row.bodyHash,
              changeCount: row.changeCount,
              latestNote: row.latestNote,
              latestChangeAt: row.latestChangeAt,
            },
          ],
        );
      }

      // The new state becomes the record. AFTER the incident is written, never before: if the insert
      // throws, we must NOT have already forgotten what the page used to look like, or the amendment
      // is lost for ever and the next run compares new against new and finds peace.
      await db.query(
        `insert into public.khoji_documents
           (api_url, web_url, content_id, schema_name, body_hash, change_count,
            latest_note, latest_change_at, public_updated_at, updated_at, last_seen_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (api_url) do update set
           web_url = excluded.web_url,
           content_id = excluded.content_id,
           schema_name = excluded.schema_name,
           body_hash = excluded.body_hash,
           change_count = excluded.change_count,
           latest_note = excluded.latest_note,
           latest_change_at = excluded.latest_change_at,
           public_updated_at = excluded.public_updated_at,
           updated_at = excluded.updated_at,
           last_seen_at = now()`,
        [row.apiUrl, row.webUrl, row.contentId, row.schema, row.bodyHash, row.changeCount,
          row.latestNote, row.latestChangeAt, row.publicUpdatedAt, row.updatedAt],
      );
    }

    // THE HEARTBEAT. A row EVERY run, whether or not anything was wrong.
    //
    // The differ learned this the hard way: a watcher that only writes when something is broken is
    // indistinguishable, from the database, from a watcher that has died. Silence must never read as
    // health. And `checked` is the field that matters: a run that read zero pages is not a run.
    //
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    // ⚠️ `kind` IS NOT A TIDY-UP. IT IS THE ONLY THING STOPPING THE HEARTBEAT FROM LYING AGAIN.
    //
    // khoji_runs is the DIFFER's pulse. lib/brain.ts reads the newest row and renders a sentence to
    // a human being: "62 of 62 constants matched." It does not know or care who wrote the row.
    //
    // So the first version of this file wrote its run into khoji_runs with no discriminator, and the
    // console would have read: "23 of 23 constants matched" on a night when the differ was DEAD and
    // the only thing that ran was a watcher that checked no constants whatsoever. A green light,
    // sourced from a run that never looked at a single number.
    //
    // That is the third time the heartbeat has nearly lied in two days: once when a crashed differ
    // rendered as "0 of 0 matched, every one matched", once when a crash-looping differ would have
    // held the clock green for ever, and now this. The disease is always the same shape: TWO WRITERS
    // OVER ONE SIGNAL, and the reader believing whichever spoke last.
    //
    // kind='amend' keeps the two pulses apart. brain.ts reads kind='differ' and nothing else.
    // ═══════════════════════════════════════════════════════════════════════════════════════════
    await db.query(
      `insert into public.khoji_runs
         (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
       values ('amend',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        null,
        docs.length,
        seen.length,                              // documents actually READ
        seen.length - raised.length,              // pages unchanged
        raised.filter((r) => r.verdict === 'silent').length,   // the fortnight problem, counted
        failed.length,                            // could not read: blind, not fine
        failed.map((f) => f.webUrl),
        Date.now() - started,
        failed.length === 0,
      ],
    );
  });

  log(`read ${seen.length} of ${docs.length} documents. ${raised.length} amended, ${failed.length} unreadable.`);
  for (const r of raised) {
    log(`  ${r.verdict === 'silent' ? '🔴 SILENT' : '   noted '} ${r.webUrl}`);
    if (r.note) log(`            ${r.note.slice(0, 110)}`);
  }
}

// Only run when invoked directly, so the test can import the pure functions above without firing a
// hundred requests at GOV.UK.
if (process.argv[1] && process.argv[1].endsWith('amend.mjs')) {
  main().catch(async (e) => {
    console.error('[khoji:amend] FAILED:', e.message);
    // A run that died still says so out loud. A silent absence and a loud failure look identical
    // from the database if only the healthy path writes, and only one of them is survivable.
    if (DB_URL && !DRY) {
      try {
        await withDb((db) => db.query(
          `insert into public.khoji_runs
             (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
           values ('amend', null, 0, 0, 0, 0, 0, '{}', null, false)`,
        ));
      } catch { /* if we cannot write the failure, the heartbeat goes stale and the light reddens anyway */ }
    }
    process.exit(1);
  });
}
