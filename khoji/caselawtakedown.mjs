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
} from './caselaw.mjs';

const DRY = process.argv.includes('--dry-run');
const DB_URL = process.env.KHOJI_DB_URL || '';
const UA = 'LekhioKhoji/1.0 (+https://lekhio.app)';
const TIMEOUT_MS = 25000;
// GOV.UK's content API answers one question definitively: is this still published, and when was it
// last changed. It is the same publisher and the same licence as the search endpoint tribunal.mjs
// reads, so this is not a new source, it is the other end of one we already use.
const CONTENT = 'https://www.gov.uk/api/content';

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

// What we recorded about the source's own version, if anything. Written into raw at ingest from
// public_timestamp. Rows written before this job existed have none, and get a baseline.
export function recordedStamp(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return raw.source_updated_at || raw.published || null;
}

export function currentStamp(doc) {
  if (!doc || typeof doc !== 'object') return null;
  return doc.public_updated_at || doc.updated_at || doc.first_published_at || null;
}

export function isWithdrawn(doc) {
  if (!doc || typeof doc !== 'object') return false;
  return Boolean(doc.withdrawn_notice);
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

async function main() {
  const started = Date.now();

  if (!DB_URL) {
    console.error('[khoji:takedown] fatal: KHOJI_DB_URL not set. Nothing was checked.');
    process.exit(1);
  }

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
                   'removal_reason', $5::text
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
          ],
        );
      });
      redacted += 1;
    } else if (verdict.action === 'stamp') {
      await withDb(async (db) => {
        await db.query(
          `update public.knowledge_items
             set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('source_updated_at', $2::text)
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
