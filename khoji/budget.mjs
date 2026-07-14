// KHOJI: INSTANT. The Budget must be read in minutes, not the next morning.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// AT 12:21, 12:22 AND 12:24 YESTERDAY, THREE TAX MEASURES LANDED ON GOV.UK.
//
// Three minutes apart. Nobody announced them to us. They simply appeared, and the nightly watcher
// would have found them at 05:15 the following morning, seventeen hours later, which on a Budget day
// is a lifetime: it is the difference between a customer asking "what does the Budget mean for me"
// and getting an answer, and a customer asking and getting silence while every accountant on the
// internet has already posted a thread.
//
// This file is the fast loop. On a normal day it runs with the rest of the brain. On a Budget day it
// runs every couple of minutes, and the whole corpus lands while the Chancellor is still speaking.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// WHY TIINs, AND NOT THE BUDGET DOCUMENT ITSELF:
//
// A Tax Information and Impact Note is the ONLY document in UK tax that states its effective date
// EXPLICITLY, IN PROSE. Here is the live one, published yesterday, verbatim:
//
//     "Detailed proposal  Operative date  This measure will have effect from 6 April 2027."
//
// The Budget speech does not say that. The guidance pages do not say that: they simply change, one
// day, and if you were not watching the moment they changed you cannot tell WHEN the change bites.
// A TIIN tells you. And when a TIIN and a guidance page disagree, THE TIIN WINS, because the TIIN is
// what the legislation was drafted from.
//
// There are 824 of them and HMRC hands them over free, with the full text, from one search endpoint,
// and as far as I can tell nobody in this market reads them programmatically at all.
//
// ⚠️ AND THIS IS WHY TASK 28 HAD TO COME FIRST.
//
// A TIIN is a /government/publications/ document, which means it CAN be silently amended, and Budget
// TIINs are: Budget 2025's OOTLAR was edited five times in nine days. So every TIIN this file ingests
// is REGISTERED WITH THE AMENDMENT WATCHER (khoji_documents) on the way in. Reading the Budget fast
// and then never looking at it again would be the fortnight problem with the volume turned up: we
// would be first, and confidently wrong, in front of more people.
//
//   node budget.mjs              one pass
//   node budget.mjs --dry-run    fetch and parse only, write nothing
//   node budget.mjs --since=N    look back N days (default 2)

import { createHash } from 'node:crypto';

const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';
const TIMEOUT_MS = 25000;

const sinceArg = process.argv.find((a) => a.startsWith('--since='));
const SINCE_DAYS = sinceArg ? Number(sinceArg.split('=')[1]) : 2;

const SEARCH = 'https://www.gov.uk/api/search.json';
const COLLECTION = 'tax-information-and-impact-notes-tiins';

function log(...a) { console.log('[khoji:budget]', ...a); }

// ---------------------------------------------------------------------------------------------
// 🔴 THE OPERATIVE DATE. The whole reason this file exists.
// ---------------------------------------------------------------------------------------------
//
// Every TIIN carries a section headed "Operative date", and under it, a sentence in English. The
// phrasings vary and they matter:
//
//     "This measure will have effect from 6 April 2027."
//     "The measure will have effect on and after 1 April 2026."
//     "This measure has effect for disposals made on or after 30 October 2024."
//     "These changes will take effect from 6 April 2026."
//
// ⚠️ AND WE TAKE THE DATE AFTER THE HEADING, NOT THE FIRST DATE IN THE DOCUMENT.
//
// The first date in the cryptoasset TIIN published yesterday is "5 July 2022", the opening of a call
// for evidence four years ago. The document is thick with dates: consultations, previous Budgets, the
// date it was announced. A regex that grabs the first date it sees would have filed a measure taking
// effect in APRIL 2027 as though it were already four years old, and phase() would have called it
// IN FORCE, and Rakha would have answered from it. Today.
//
// So: find the heading. Read the sentence under it. Nothing else in the document counts.
export function operativeDate(text) {
  if (!text) return null;

  const i = text.search(/operative date/i);
  if (i < 0) return null;

  // Take a window after the heading. Long enough for the sentence, short enough that we cannot
  // wander into "Current law" and pick up the date some Act was passed in 1992.
  const window = text.slice(i, i + 400);

  const m = window.match(
    /(?:have|has|takes?|taking)\s+effect\s+(?:for[^.]*?)?(?:from|on and after|on or after|on)\s+(\d{1,2}\s+\w+\s+\d{4})/i,
  )
    // Some TIINs skip the verb: "Operative date: 6 April 2027."
    || window.match(/operative date[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i);

  if (!m) return null;

  const d = new Date(m[1] + ' UTC');
  if (Number.isNaN(d.getTime())) return null;

  return d.toISOString().slice(0, 10);   // YYYY-MM-DD, which is what knowledge_items wants
}

// What the measure is actually ABOUT, in HMRC's own opening line. Not a summary we generated: the
// sentence HMRC wrote to describe its own measure. A paraphrase would be one more thing that can be
// wrong, and it would be wrong in the one place a man is most likely to believe us.
export function gist(text, fallback = '') {
  if (!text) return fallback;
  const first = text.trim().split(/\n\s*\n/)[0] || '';
  return first.trim().slice(0, 600) || fallback;
}

// ---------------------------------------------------------------------------------------------

async function search(count = 100) {
  const url = new URL(SEARCH);
  url.searchParams.set('filter_document_collections', COLLECTION);
  url.searchParams.set('order', '-public_timestamp');
  url.searchParams.set('count', String(count));
  // indexable_content is the FULL TEXT, in the same call. One request gets the measure, its date and
  // its wording. There is no second fetch, which is exactly why this can run every two minutes.
  url.searchParams.set('fields', 'title,link,public_timestamp,description,indexable_content');

  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return { results: json.results || [], total: json.total ?? 0 };
}

export function isRecent(publicTimestamp, sinceDays, now = new Date()) {
  if (!publicTimestamp) return false;
  const t = new Date(publicTimestamp);
  if (Number.isNaN(t.getTime())) return false;
  return (now.getTime() - t.getTime()) / 86_400_000 <= sinceDays;
}

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

const WEB = (link) => `https://www.gov.uk${link}`;
const API = (link) => `https://www.gov.uk/api/content${link}`;

async function main() {
  const started = Date.now();

  const { results, total } = await search();
  log(`${total} TIINs on GOV.UK. Looking at the newest ${results.length}, keeping anything from the last ${SINCE_DAYS} day(s).`);

  const fresh = results.filter((r) => isRecent(r.public_timestamp, SINCE_DAYS));

  const measures = fresh.map((r) => {
    const effective = operativeDate(r.indexable_content);
    return {
      title: r.title,
      link: r.link,
      published: r.public_timestamp,
      effective,                                  // null when the TIIN does not state one
      summary: gist(r.indexable_content, r.description || ''),
      bodyHash: createHash('sha256').update(r.indexable_content || '').digest('hex').slice(0, 16),
    };
  });

  if (DRY) {
    // ⚠️ A RUN THAT READ NOTHING IS NOT A RUN. Same rule as the amendment watcher, and it caught me
    // there too: a tidy summary of nothing reads exactly like a clean bill of health.
    if (results.length === 0) {
      console.error('\n🔴 THE SEARCH RETURNED NOTHING AT ALL. That is not "no Budget today", it is a BLIND run.');
      process.exit(1);
    }
    log(`dry run. ${fresh.length} measure(s) in the window. Nothing written.`);
    for (const m of measures) {
      log(`  ${m.effective ? `effective ${m.effective}` : 'NO OPERATIVE DATE '}  ${m.title}`);
    }
    const dated = measures.filter((m) => m.effective).length;
    log(`\n${dated} of ${measures.length} stated an operative date in prose. That is the number no other source gives us.`);
    return;
  }

  if (!DB_URL) {
    console.error('[khoji:budget] fatal: KHOJI_DB_URL not set. Nothing was read into the record.');
    process.exit(1);
  }

  let filed = 0;

  await withDb(async (db) => {
    for (const m of measures) {
      // THE KNOWLEDGE ROW. effective_date is the payload, and it is the join with everything else:
      // lib/brain.ts phase() reads it and decides whether this measure is THE LAW or merely COMING,
      // and app/api/ask never lets a model do that arithmetic for itself.
      const r = await db.query(
        `insert into public.knowledge_items
           (source_url, source_name, title, summary, effective_date, affects, confidence, engine_impact, status, raw, distilled_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (source_url) do nothing`,
        [
          WEB(m.link),
          'HMRC Tax Information and Impact Note',
          m.title,
          m.summary,
          m.effective,
          'the tax engine, and therefore every user',
          // No model read this. The date came out of HMRC's own "Operative date" heading with a
          // regex, and the summary is HMRC's own opening paragraph, unrewritten. There is nothing
          // here for a model to have been confident about.
          null,
          false,
          'needs_distillation',
          { tiin: true, published: m.published, effective: m.effective, bodyHash: m.bodyHash },
        ],
      );
      if (r.rowCount > 0) filed += 1;

      // 🔴 AND REGISTER IT WITH THE AMENDMENT WATCHER, ON THE WAY IN.
      //
      // A TIIN is a /government/publications/ document, so it CAN be silently amended, and Budget
      // documents ARE: OOTLAR was edited five times in nine days. Reading the Budget fast and then
      // never looking at it again is the fortnight problem with the volume turned up. We would be
      // first, and confidently wrong, in front of more people than usual.
      //
      // This is the seam between task 20 and task 28, and it is the reason 28 had to be built first.
      await db.query(
        `insert into public.khoji_documents
           (api_url, web_url, schema_name, body_hash, change_count, last_seen_at)
         values ($1,$2,'tiin',$3,0,now())
         on conflict (api_url) do nothing`,
        [API(m.link), WEB(m.link), m.bodyHash],
      );
    }

    // The heartbeat. A row EVERY run, labelled, so it can never be mistaken for the differ's pulse.
    await db.query(
      `insert into public.khoji_runs
         (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
       values ('budget', null, $1, $2, $3, 0, 0, '{}', $4, true)`,
      [total, measures.length, filed, Date.now() - started],
    );
  });

  log(`${measures.length} measure(s) in the window, ${filed} new. Each one registered with the amendment watcher.`);
  for (const m of measures.filter((x) => x.effective)) {
    log(`  from ${m.effective}: ${m.title}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('budget.mjs')) {
  main().catch(async (e) => {
    console.error('[khoji:budget] FAILED:', e.message);
    if (DB_URL && !DRY) {
      try {
        await withDb((db) => db.query(
          `insert into public.khoji_runs
             (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
           values ('budget', null, 0, 0, 0, 0, 0, '{}', null, false)`,
        ));
      } catch { /* the heartbeat goes stale and the light reddens on its own */ }
    }
    process.exit(1);
  });
}
