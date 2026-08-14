// KHOJI CHECKS THAT WHAT WE HOLD IS STILL WHAT THE COURT PUBLISHES.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE OBLIGATION, AND WHY NOTHING ELSE WE OWN CAN DISCHARGE IT.
//
// The Find Case Law licence (TNA ref CAS-341311-V2P0M2, signed 14 August 2026) obliges the Re-user
// to use the CURRENT version of the Licensed Material, and to REMOVE material that is no longer
// published or has been replaced.
//
// Every other watcher in this folder asks a forward question. diff asks whether today's number
// still matches ours. corpus asks whether today's sentence is still there. amend asks whether
// today's document moved. tribunal asks what is NEW. Not one of them ever looks back at a row it
// wrote a year ago and asks whether the thing it was written about is still there.
//
// So a decision could be withdrawn on appeal, or reissued with a correction, and the row would sit
// in the desk queue for the rest of the licence term saying a rule was at risk on the strength of a
// judgment that no longer exists. Nothing would say a word. That is not a small compliance chore.
// It is the same class of failure as the fortnight of being confidently wrong.
//
//   node caselawtakedown.mjs             one pass
//   node caselawtakedown.mjs --dry-run   check and report, write nothing
//   node caselawtakedown.mjs --restore   put back rows a wrong removal took, where the source is
//                                        still published. Add --dry-run to see what it would do.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 IT REDACTS. IT DOES NOT DELETE THE ROW, AND THAT IS DELIBERATE.
//
// Two reasons, and the second is the one that would bite.
//
// First, removing the licensed material IS the obligation. The obligation is about the material,
// not about our bookkeeping, and the material is the title and the catchwords.
//
// Second, source_url is the unique key that stops tribunal.mjs re-inserting a decision it has
// already seen. Hard delete the row and the very next nightly run finds the withdrawn decision in
// the search results, sees no conflict, and files it again. We would have built a job that removes
// licensed material at 05:20 and re-ingests it at 05:15 the following morning, and every run would
// report success. The tombstone is what makes the removal hold.
//
// It also means this job needs only UPDATE, which is all the grant khoji_writer has. A job that
// needed a new database privilege in order to honour a licence term would be a job that quietly
// stopped honouring it the first time the grant was missed.

import {
  CASELAW_SOURCE_NAME,
  CASELAW_SQL_EXCLUSION,
  holdsLicensedMaterial,
  isCaselawRow,
  publicationVerdict,
  REDACTED_SUMMARY,
  REDACTED_TITLE,
  REMOVED_AT_SOURCE,
  REVISED_SUMMARY,
  revisionVerdict,
  stripParties,
} from './caselaw.mjs';

const DRY = process.argv.includes('--dry-run');
const RESTORE = process.argv.includes('--restore');
const DB_URL = process.env.KHOJI_DB_URL || '';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';
const TIMEOUT_MS = 25000;
// GOV.UK's content API answers one question definitively: is this still published, and when was it
// last changed. It is the same publisher and the same licence as the search endpoint tribunal.mjs
// reads, so this is not a new source, it is the other end of one we already use.
const CONTENT = 'https://www.gov.uk/api/content';
// The same search endpoint tribunal.mjs files from. --restore re-derives the material through the
// SAME function the writer uses, so a restored row is byte identical to one freshly filed rather
// than a hand rebuilt approximation of it.
const SEARCH = 'https://www.gov.uk/api/search.json';

function log(...a) { console.log('[khoji:takedown]', ...a); }

// The path the content API wants, out of the row we stored. Never build this by string surgery on
// the assumption the URL is well formed: a row whose URL we cannot parse is BLIND, not gone.
export function contentPathFor(sourceUrl) {
  try {
    const u = new URL(sourceUrl);
    if (u.host.toLowerCase() !== 'www.gov.uk' && u.host.toLowerCase() !== 'gov.uk') return null;
    return u.pathname || null;
  } catch {
    return null;
  }
}

// 🔴 COMPARED LIKE WITH LIKE, AND THE FIRST VERSION DID NOT.
//
// It read `raw.source_updated_at || raw.published`, which is what tribunal.mjs took from the SEARCH
// endpoint's public_timestamp, and compared it against the CONTENT API's public_updated_at. Two
// different fields from two different endpoints. On the two rows in the record they happened to be
// the same instant expressed in different zones, so it looked fine, and the day they stopped
// agreeing every row would have read as revised.
//
// So the takedown job now compares only against a stamp IT took, from the endpoint IT reads. The
// first pass over any row is therefore a baseline, which is correct: we cannot call a decision
// revised against a version we never recorded.
export function recordedStamp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.content_api_updated_at || null;
}

export function currentStamp(doc) {
  if (!doc || typeof doc !== 'object') return null;
  return doc.public_updated_at || doc.updated_at || doc.first_published_at || null;
}

// 🔴 THIS FUNCTION REDACTED TWO LIVE DECISIONS ON 14 AUGUST 2026, AND THE REASON IS ONE PAIR OF
// BRACES.
//
// It was `Boolean(doc.withdrawn_notice)`. GOV.UK's content API returns `withdrawn_notice: {}`, AN
// EMPTY OBJECT, for content that is not withdrawn, and `Boolean({})` is `true` in JavaScript. So
// every live page on GOV.UK read as withdrawn. Not some. Every one. The job removed licensed
// material from both rows in the record on its first real run and reported success.
//
// It was proved by a control rather than by reading the code: /vat-rates, a page that has never
// been withdrawn in its life, came back `withdrawn=true`. That is why the run controls below exist.
// A verdict function that has never been shown a known-good answer is not a verdict function, it is
// a hope.
export function isWithdrawn(doc) {
  if (!doc || typeof doc !== 'object') return false;
  const w = doc.withdrawn_notice;
  if (!w || typeof w !== 'object' || Array.isArray(w)) return false;
  // A real withdrawal carries a date and an explanation. An empty object carries neither.
  if (typeof w.withdrawn_at === 'string' && w.withdrawn_at.trim() !== '') return true;
  return typeof w.explanation === 'string' && w.explanation.trim() !== '';
}

// 🔴 THE WHOLE DECISION, IN ONE PURE FUNCTION, SO IT CAN BE MADE TO FAIL WITHOUT A NETWORK.
//
// Everything above this is plumbing and everything below it is SQL. This is the part that decides
// whether licensed material comes out of the record, and it takes no client, opens no socket, and
// reads no clock. That is the only reason the sabotage pass can prove that a 500 never removes
// anything: it can call this directly with a 500 and watch it refuse.
export function decide({ status, withdrawn, networkError, recorded, current }) {
  const published = publicationVerdict({ status, withdrawn, networkError });
  if (published === 'blind') return { action: 'none', reason: 'blind' };
  if (published === 'gone') return { action: 'redact', reason: 'gone' };

  const revision = revisionVerdict(recorded, current);
  if (revision === 'revised') return { action: 'redact', reason: 'revised' };
  // 'baseline' and 'unknown' both mean we have nothing to compare against. Recording the stamp is
  // the correct response to that, and removing material is not.
  if (revision === 'baseline' || revision === 'unknown') return { action: 'stamp', reason: revision };
  return { action: 'none', reason: 'current' };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE RUN CONTROLS. NOTHING IS REMOVED UNTIL THESE TWO PASS.
//
// This is the same discipline the sabotage harness holds: a no-op control that must stay green, or
// the runner is only detecting that something moved. It was in every test file in this repo and it
// was not in the one place that removes data from production.
//
// Two questions, asked of the live endpoint on every run, before a single row is judged:
//
//   1. Does a page we KNOW is published come back as published? If not, the endpoint has moved, or
//      changed shape, or is behind a block page, and every 404 this run produces is meaningless.
//   2. Does a path we KNOW does not exist come back as gone? If not, the endpoint is answering 200
//      to everything and a real withdrawal would never be noticed.
//
// If either fails, the entire run is blind. Nothing is removed, nothing is stamped, and the job
// exits loud. Being unable to check is not the same as there being nothing to find.
//
// The live control is what caught the withdrawn_notice defect. It is not decoration.
export const CONTROL_LIVE = '/vat-rates';
export const CONTROL_ABSENT = '/lekhio-takedown-control-no-such-page';

// Pure, so the sabotage pass can fail it without a network.
export function controlsVerdict({ live, absent }) {
  const reasons = [];
  if (live.published !== 'published') {
    reasons.push(`a page we know is published came back ${live.published}`);
  }
  if (live.withdrawn) {
    reasons.push('a page we know is not withdrawn came back withdrawn');
  }
  if (absent.published !== 'gone') {
    reasons.push(`a path we know does not exist came back ${absent.published}`);
  }
  return { ok: reasons.length === 0, reasons };
}

async function readDoc(path) {
  try {
    const res = await fetch(CONTENT + path, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404 || res.status === 410) return { status: res.status, doc: null };
    if (!res.ok) return { status: res.status, doc: null };
    return { status: res.status, doc: await res.json() };
  } catch (e) {
    return { status: 0, networkError: true, error: String(e && e.message ? e.message : e) };
  }
}

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

// Every caselaw row, by the SAME test the rest of the product uses. Written as the negation of the
// shared exclusion so this job and getRelevantKnowledge can never disagree about what a caselaw row
// is. One of them refuses these rows and the other one is responsible for them, and a drift between
// the two definitions would mean rows nobody owns.
export const CASELAW_SQL_INCLUSION = 'not ' + CASELAW_SQL_EXCLUSION;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// --restore. PUTTING BACK WHAT A WRONG REMOVAL TOOK.
//
// 🔴 IT EXISTS BECAUSE THE FIRST REAL RUN OF THIS JOB WAS WRONG, and a job that can only destroy is
// a job you cannot afford to be wrong with. On 14 August 2026 the withdrawn_notice defect redacted
// two live decisions. The material was still on GOV.UK the whole time, so it is re-fetchable, and
// the row kept its source_url, which is what makes the address survivable.
//
// It restores ONLY where the source says the decision is currently published. A row genuinely taken
// down at source stays redacted, because putting that one back would be the actual breach.
//
// ⚠️ AND IT RE-DERIVES THROUGH stripParties, THE SAME CALL THE WRITER USES. A restored row must be
// what tribunal.mjs would file today, not a hand rebuilt approximation of it that quietly keeps the
// parties in because whoever wrote the restore forgot that step.
async function searchByLink(link) {
  const u = new URL(SEARCH);
  u.searchParams.set('filter_link', link);
  u.searchParams.set('fields', 'title,link,public_timestamp,indexable_content');
  const res = await fetch(u, {
    headers: { 'user-agent': UA, accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const hit = (json.results || []).find((r) => r.link === link);
  return hit || null;
}

// The rebuilt title and summary, from OUR watched rules plus the judge's catchwords, both stripped.
// touches comes out of the row's own raw, because that was our triage and it did not change.
export function rebuild(hit, touches) {
  const rules = (touches || []).join(', ') || 'a rule we assert';
  return {
    title: `⚖️ MAY AFFECT: ${rules}. ${stripParties(hit.title)}`,
    catchwords: stripParties((hit.indexable_content || '').replace(/\s+/g, ' ').trim()).slice(0, 800),
  };
}

export function restoredSummary(rules, catchwords) {
  return [
    'A tribunal has decided a case that touches a rule we assert. A judgment can reverse a tax',
    'answer without HMRC changing a single page, and no other watcher we own can see it.',
    '',
    ...rules.map((r) => `RULE AT RISK: ${r}.`),
    '',
    'The judge\'s own catchwords:',
    catchwords,
    '',
    'Read the decision before changing anything. Nothing here is automatic.',
    '',
    'Restored after an incorrect removal on 14 August 2026. The source was published throughout.',
  ].join('\n');
}

async function restore() {
  const rows = await withDb(async (db) => {
    const r = await db.query(
      "select source_url, source_name, title, summary, status, raw from public.knowledge_items"
      + ' where ' + CASELAW_SQL_INCLUSION
      + " and raw->>'removal_reason' is not null order by created_at asc",
    );
    return r.rows;
  });

  log(`${rows.length} redacted caselaw row(s) to consider.`);
  if (rows.length === 0) { log('Nothing was ever removed. Nothing to restore.'); process.exit(0); }

  // 🔴 THE CONTROLS RUN HERE TOO, AND THIS IS NOT SYMMETRY FOR ITS OWN SAKE.
  // The takedown pass fails towards removing something it should have kept. This one fails the other
  // way: if the endpoint wrongly reports a genuinely withdrawn decision as published, restore puts
  // Licensed Material back that we are obliged not to hold, which is the actual breach rather than a
  // recoverable mistake. So the same two questions are asked before anything is put back.
  const okLive = await readDoc(CONTROL_LIVE);
  const okAbsent = await readDoc(CONTROL_ABSENT);
  const guard = controlsVerdict({
    live: {
      published: publicationVerdict({ status: okLive.status, networkError: okLive.networkError }),
      withdrawn: isWithdrawn(okLive.doc),
    },
    absent: {
      published: publicationVerdict({ status: okAbsent.status, networkError: okAbsent.networkError }),
    },
  });
  if (!guard.ok) {
    console.error('\n🔴 THE RUN CONTROLS FAILED. NOTHING HAS BEEN RESTORED.');
    for (const r of guard.reasons) console.error(`   . ${r}`);
    console.error('\n   Putting material back on the strength of an endpoint that is not answering');
    console.error('   properly would be the breach itself, not a recoverable mistake.');
    process.exit(1);
  }
  log('run controls green.');

  let restored = 0, left = 0, blind = 0;
  for (const row of rows) {
    const path = contentPathFor(row.source_url);
    if (!path) { blind += 1; log(`  ⚠️  unreadable url, left alone  ${row.source_url}`); continue; }

    const res = await readDoc(path);
    const published = publicationVerdict({
      status: res.status, withdrawn: isWithdrawn(res.doc), networkError: res.networkError,
    });

    if (published === 'blind') { blind += 1; log(`  ⚠️  could not read the source, left alone  ${row.source_url}`); continue; }
    if (published === 'gone') { left += 1; log(`  .   genuinely gone at source, stays redacted  ${row.source_url}`); continue; }

    const hit = await searchByLink(path);
    if (!hit) { blind += 1; log(`  ⚠️  published but not in the search index, left alone  ${row.source_url}`); continue; }

    const rules = Array.isArray(row.raw && row.raw.touches) ? row.raw.touches : [];
    const { title, catchwords } = rebuild(hit, rules);
    const status = (row.raw && row.raw.status_before_removal) || 'needs_distillation';

    if (DRY) { restored += 1; log(`  ↩︎  would restore as "${status}"  ${row.source_url}`); continue; }

    await withDb(async (db) => {
      await db.query(
        `update public.knowledge_items
           set title = $2, summary = $3, status = $4,
               raw = (coalesce(raw, '{}'::jsonb)
                      - 'removal_reason' - 'licensed_material_removed_at' - 'status_before_removal')
                     || jsonb_build_object('restored_at', now()::text)
         where source_url = $1`,
        [row.source_url, title, restoredSummary(rules, catchwords), status],
      );
    });
    restored += 1;
    log(`  ↩︎  restored as "${status}"  ${row.source_url}`);
  }

  log(`${restored} restored, ${left} left redacted because the source really is gone, ${blind} unreadable.${DRY ? ' (dry run, nothing written)' : ''}`);
  process.exit(blind > 0 ? 1 : 0);
}

async function main() {
  const started = Date.now();

  if (!DB_URL) {
    console.error('[khoji:takedown] fatal: KHOJI_DB_URL not set. Nothing was checked.');
    process.exit(1);
  }

  if (RESTORE) { await restore(); return; }

  const rows = await withDb(async (db) => {
    const r = await db.query(
      'select source_url, source_name, title, summary, status, raw from public.knowledge_items'
      + ' where ' + CASELAW_SQL_INCLUSION + ' order by created_at asc',
    );
    return r.rows;
  });

  log(`${rows.length} caselaw row(s) in the record.`);
  if (rows.length === 0) {
    log('Nothing to check. That is a real answer, not a failure.');
    process.exit(0);
  }

  // 🔴 THE CONTROLS RUN BEFORE ANY ROW IS JUDGED.
  const liveRes = await readDoc(CONTROL_LIVE);
  const absentRes = await readDoc(CONTROL_ABSENT);
  const controls = controlsVerdict({
    live: {
      published: publicationVerdict({ status: liveRes.status, networkError: liveRes.networkError }),
      withdrawn: isWithdrawn(liveRes.doc),
    },
    absent: {
      published: publicationVerdict({ status: absentRes.status, networkError: absentRes.networkError }),
    },
  });

  if (!controls.ok) {
    console.error('\n🔴 THE RUN CONTROLS FAILED. NOTHING HAS BEEN TOUCHED.');
    for (const r of controls.reasons) console.error(`   . ${r}`);
    console.error('\n   The endpoint has moved, changed shape, or is answering something other than');
    console.error('   what it used to. Every verdict this run could produce would be meaningless, so');
    console.error('   no verdict has been acted on. This is the check that was missing on 14 August');
    console.error('   2026, when withdrawn_notice came back as an empty object, Boolean({}) was true,');
    console.error('   and two live decisions were redacted.');
    process.exit(1);
  }
  log('run controls green: a live page reads published and not withdrawn, an absent path reads gone.');

  let redacted = 0, stamped = 0, current = 0, blind = 0;
  const outcomes = [];

  for (const row of rows) {
    // Belt and braces. The SQL should never hand us a non caselaw row, and if it ever does this job
    // must not touch it, because redacting somebody else's row is not a licence obligation.
    if (!isCaselawRow(row)) { continue; }

    const already = !holdsLicensedMaterial(row);
    const path = contentPathFor(row.source_url);
    if (!path) {
      blind += 1;
      outcomes.push({ url: row.source_url, action: 'none', reason: 'unreadable url' });
      continue;
    }

    const res = await readDoc(path);
    const verdict = decide({
      status: res.status,
      withdrawn: isWithdrawn(res.doc),
      networkError: res.networkError,
      recorded: recordedStamp(row.raw),
      current: currentStamp(res.doc),
    });

    if (verdict.reason === 'blind') { blind += 1; }
    outcomes.push({ url: row.source_url, action: verdict.action, reason: verdict.reason });

    if (DRY) continue;

    if (verdict.action === 'redact') {
      // A row already redacted is left exactly as it is. Rewriting it every night would churn the
      // desk and hide the date the removal actually happened.
      if (already) { redacted += 1; continue; }
      await withDb(async (db) => {
        await db.query(
          `update public.knowledge_items
             set title = $2,
                 summary = $3,
                 status = $4,
                 raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
                   'licensed_material_removed_at', now()::text,
                   'removal_reason', $5::text,
                   -- 🔴 WHAT THIS ROW WAS BEFORE WE TOUCHED IT, so a wrong removal can be undone.
                   -- The first version did not record it, and when the withdrawn_notice defect
                   -- redacted two live decisions there was nothing in the row saying they had been
                   -- 'reviewed'. A destructive step that keeps no note of what it destroyed is a
                   -- destructive step you cannot walk back.
                   'status_before_removal', $6::text
                 )
           where source_url = $1`,
          [
            row.source_url,
            REDACTED_TITLE,
            verdict.reason === 'revised' ? REVISED_SUMMARY : REDACTED_SUMMARY,
            // A revised decision goes back to the human queue, because somebody has to read the
            // current version. A withdrawn one is finished, and saying so is the honest status.
            verdict.reason === 'revised' ? 'needs_distillation' : REMOVED_AT_SOURCE,
            verdict.reason,
            row.status || 'needs_distillation',
          ],
        );
      });
      redacted += 1;
    } else if (verdict.action === 'stamp') {
      await withDb(async (db) => {
        await db.query(
          `update public.knowledge_items
             set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('content_api_updated_at', $2::text)
           where source_url = $1`,
          [row.source_url, currentStamp(res.doc) || ''],
        );
      });
      stamped += 1;
    } else if (verdict.reason === 'current') {
      current += 1;
    }
  }

  for (const o of outcomes) {
    const mark = o.action === 'redact' ? '🔴' : o.reason === 'blind' || o.reason === 'unreadable url' ? '⚠️ ' : '  ';
    log(`  ${mark} ${o.action} (${o.reason})  ${o.url}`);
  }

  if (!DRY) {
    await withDb(async (db) => {
      await db.query(
        `insert into public.khoji_runs
           (kind, tax_year, published, checked, agreed, drifted, blind, unwatched, duration_ms, ok)
         values ('caselawtakedown', null, $1, $2, $3, $4, $5, '{}', $6, $7)`,
        [rows.length, rows.length - blind, current, redacted, blind, Date.now() - started, blind === 0],
      );
    });
  }

  log(
    `${rows.length} checked. ${redacted} redacted, ${stamped} baselined, ${current} unchanged, `
    + `${blind} unreadable.${DRY ? ' (dry run, nothing written)' : ''}`,
  );

  // 🔴 A ROW WE COULD NOT READ IS NOT A ROW THAT IS FINE. Exit loud, the same rule lawwatch holds.
  // We are obliged to remove material that is no longer published, and "we could not tell" is not
  // evidence that it still is.
  process.exit(blind > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[khoji:takedown] fatal:', e && e.message ? e.message : e);
    process.exit(1);
  });
}

export { CASELAW_SOURCE_NAME };
