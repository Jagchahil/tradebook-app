// THE CERTIFICATE OF ERASURE. What we would have to be able to prove on the day we stop.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE OBLIGATION.
//
// The Find Case Law licence (TNA ref CAS-341311-V2P0M2, signed 14 August 2026) provides that on
// termination the Re-user must ERASE the Licensed Material and CERTIFY that erasure to the Licensor.
//
// A certificate is a statement of fact about a system, signed by a person. It is worthless if the
// person signing it is guessing, and on the day it is asked for, the person signing it will be Jag,
// under time pressure, possibly years after the last line of this was written, with no memory of
// where any of it ended up. That is exactly the moment to have already answered the question.
//
//   node caselawcertificate.mjs             count and report. Writes nothing. Safe any day.
//   node caselawcertificate.mjs --erase     remove the licensed material, then re-read and certify
//
// 🔴 THE CERTIFICATE IS PRINTED FROM A RE-READ, NEVER FROM WHAT THE ERASE STEP BELIEVES IT DID.
//
// This is the same rule that governs erasing a persona account, and it is the whole value of the
// file. An UPDATE that reports rowCount 2 is a claim. Selecting afterwards and finding nothing left
// is evidence. If the second read is not clean the certificate is NOT printed and the job exits
// non-zero, because a certificate that gets printed whatever happened is a lie with a letterhead.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ WHAT COUNTS AS LICENSED MATERIAL, AND WHAT HONESTLY DOES NOT.
//
// Being over broad here is cheap and being narrow is a breach, so anything arguable is IN. But the
// certificate has to be truthful in both directions, so each place is named with what it actually
// holds rather than swept into one number:
//
//   knowledge_items   HOLDS IT. The title and the catchwords are the judge's own words. This is the
//                     only place licensed material is stored in prose.
//   khoji_law         A SIXTEEN CHARACTER HASH of the Find Case Law landing page, and the URL. A
//                     hash is not the material and cannot be turned back into it. It is cleared
//                     anyway, because the row exists only because of that source and arguing about
//                     it on the day of termination is not a position worth defending.
//   khoji_runs        COUNTS ONLY. How many decisions were read on a given night. No material, and
//                     erasing our own operational history would destroy the audit trail that proves
//                     the removals happened. Enumerated and explicitly NOT erased, with the reason.
//   qa_cache          Cached answers to customers. No caselaw ever reaches one, because
//                     getRelevantKnowledge refuses caselaw rows at the query and again in code.
//                     Counted at zero on purpose: an empty count that is checked is worth more than
//                     an assumption that is not, and if it is ever not zero, something upstream has
//                     broken and this is where it surfaces.

import {
  CASELAW_SQL_EXCLUSION,
  holdsLicensedMaterial,
  isCaselawRow,
  REDACTED_SUMMARY,
  REDACTED_TITLE,
  REMOVED_AT_SOURCE,
  TNA_ACKNOWLEDGEMENT,
} from './caselaw.mjs';

const ERASE = process.argv.includes('--erase');
const DB_URL = process.env.KHOJI_DB_URL || '';
const LICENCE_REF = 'CAS-341311-V2P0M2';
const FCL_HOST = 'caselaw.nationalarchives.gov.uk';

function log(...a) { console.log('[khoji:certificate]', ...a); }

export const CASELAW_SQL_INCLUSION = 'not ' + CASELAW_SQL_EXCLUSION;

// Every place licensed material can live, named once, with what it holds and whether erasing it is
// part of the obligation. The certificate is generated from THIS, so a new store cannot be added to
// the product and left out of the certificate without somebody editing this list.
export const PLACES = [
  {
    table: 'knowledge_items',
    holds: 'prose',
    erase: true,
    note: 'The decision title and the judge\'s catchwords. The only prose store.',
  },
  {
    table: 'khoji_law',
    holds: 'hash',
    erase: true,
    note: 'A sixteen character body hash of the Find Case Law landing page. Not reversible. Cleared anyway.',
  },
  {
    table: 'khoji_runs',
    holds: 'counts',
    erase: false,
    note: 'How many decisions were checked on a given night. No material. Kept, because it is the audit trail that proves the removals happened.',
  },
  {
    table: 'qa_cache',
    holds: 'none',
    erase: false,
    note: 'Customer answers. No caselaw can reach one. Counted to prove it rather than assumed.',
  },
];

async function withDb(fn) {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

// ---------------------------------------------------------------------------------------------
// THE COUNT. Pure where it can be, so the sabotage pass can make it lie without a database.
// ---------------------------------------------------------------------------------------------

// How many of these rows still hold licensed material? Counted with the SAME predicate the takedown
// job clears against, so the certificate cannot certify a state the takedown job never reaches.
export function countHolding(rows) {
  return (rows || []).filter((r) => isCaselawRow(r) && holdsLicensedMaterial(r)).length;
}

// The certificate refuses to exist unless every erasable place reads zero. There is no partial
// certificate and no "mostly erased".
// ⚠️ A MISSING COUNT IS NOT A ZERO, AND `?? 0` SAID IT WAS.
// The first version read `(tally[p.table] ?? 0) === 0`, so a tally that had failed to count a place
// at all certified that place as erased. On the one day this function is ever used in anger, a
// query that threw and left its key unset would have printed a clean certificate. The count must be
// present and it must be a number.
export function isClean(tally) {
  if (!tally || typeof tally !== 'object') return false;
  return PLACES.filter((p) => p.erase).every((p) => tally[p.table] === 0);
}

export function certificateText({ tally, when, ref = LICENCE_REF }) {
  const lines = [];
  lines.push('CERTIFICATE OF ERASURE');
  lines.push('');
  lines.push(`Licence: The National Archives, Find Case Law transactional licence, ref ${ref}.`);
  lines.push('Licensee: Lekhio Ltd.');
  lines.push(`Generated: ${when}`);
  lines.push('');
  lines.push('Lekhio Ltd certifies that the Licensed Material has been erased from every store in');
  lines.push('which it was held. The counts below were read back AFTER the erasure ran, from the');
  lines.push('database itself, and not from what the erasure reported it had done.');
  lines.push('');
  for (const p of PLACES) {
    const n = tally[p.table] ?? 0;
    const verdict = p.erase ? (n === 0 ? 'ERASED, zero remaining' : `${n} REMAINING`) : 'not erasable, see note';
    lines.push(`  ${p.table}`);
    lines.push(`    holds:   ${p.holds}`);
    lines.push(`    counted: ${n}`);
    lines.push(`    status:  ${verdict}`);
    lines.push(`    note:    ${p.note}`);
  }
  lines.push('');
  lines.push('The source URL of a decision is retained as a tombstone where one existed. It is the');
  lines.push('published locator of a public record rather than material drawn from the record, and');
  lines.push('it is what prevents a withdrawn decision being re-ingested by a later run.');
  lines.push('');
  lines.push(TNA_ACKNOWLEDGEMENT);
  lines.push('');
  lines.push('Signed ......................................  Date ....................');
  lines.push('For and on behalf of Lekhio Ltd');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------

async function tallyFrom(db) {
  const tally = {};

  const ki = await db.query(
    'select source_url, source_name, title, summary, raw from public.knowledge_items where '
    + CASELAW_SQL_INCLUSION,
  );
  tally.knowledge_items = countHolding(ki.rows);
  tally._knowledge_items_total = ki.rows.length;

  // Counted on the HASH being present, not on the row existing, because the erasure below clears
  // the hash rather than dropping the row. Same reasoning as the takedown tombstone: an UPDATE is
  // all the grant khoji_writer has, and an obligation that needs a database privilege nobody
  // remembered to grant is an obligation that quietly stops being honoured.
  const law = await db.query(
    "select count(*)::int as n from public.khoji_law where url ilike $1 and coalesce(body_hash, '') <> ''",
    ['%' + FCL_HOST + '%'],
  );
  tally.khoji_law = law.rows[0]?.n ?? 0;

  const runs = await db.query(
    "select count(*)::int as n from public.khoji_runs where kind in ('tribunal','caselawtakedown')",
  );
  tally.khoji_runs = runs.rows[0]?.n ?? 0;

  // 🔴 THIS ONE IS A LEAK DETECTOR, NOT A COUNT. If a cached customer answer ever mentions a
  // tribunal decision, the filter in getRelevantKnowledge has failed and a judgment has reached a
  // user, which is the thing the whole caselaw gate exists to prevent. It surfaces here because
  // this is the one job that looks at every store at once.
  // ⚠️ IT DISCOVERS THE COLUMNS RATHER THAN GUESSING ONE. The first version hard coded `answer`,
  // that column is not called `answer` here, the query threw, and the whole check reported a quiet
  // minus one that nothing acted on. A leak detector that cannot find the thing it is meant to be
  // reading is not a leak detector, and reporting that as a number was the wrong shape entirely.
  const cols = await db.query(
    "select column_name from information_schema.columns"
    + " where table_schema = 'public' and table_name = 'qa_cache'"
    + " and data_type in ('text','character varying')",
  );
  const textCols = cols.rows.map((r) => r.column_name);
  if (textCols.length === 0) {
    tally.qa_cache = null;
    tally._qa_cache_note = 'no text columns found on qa_cache, so nothing could be searched';
  } else {
    const where = textCols
      .map((c) => `("${c}" ilike '%tribunal decision%' or "${c}" ilike '%UKUT%' or "${c}" ilike '%UKFTT%')`)
      .join(' or ');
    const qa = await db.query(`select count(*)::int as n from public.qa_cache where ${where}`);
    tally.qa_cache = qa.rows[0]?.n ?? 0;
    tally._qa_cache_note = `searched ${textCols.length} text column(s): ${textCols.join(', ')}`;
  }

  return tally;
}

async function main() {
  if (!DB_URL) {
    console.error('[khoji:certificate] fatal: KHOJI_DB_URL not set. Nothing was counted.');
    process.exit(1);
  }

  const before = await withDb(tallyFrom);

  log('BEFORE');
  for (const p of PLACES) log(`  ${p.table.padEnd(18)} ${before[p.table] === null ? 'COULD NOT COUNT' : before[p.table]}`);
  log(`  (${before._knowledge_items_total} caselaw row(s) in total, of which ${before.knowledge_items} still hold material)`);
  if (before._qa_cache_note) log(`  qa_cache: ${before._qa_cache_note}`);

  // 🔴 A CHECK THAT COULD NOT RUN IS NOT A CHECK THAT PASSED. It reported a quiet minus one and
  // carried on, which is the same failure shape as the empty withdrawn_notice: a value that is not
  // an answer being treated as one.
  if (before.qa_cache === null) {
    console.error('\n🔴 THE LEAK DETECTOR COULD NOT RUN. It has not told you the cache is clean.');
    console.error('   ' + (before._qa_cache_note || 'no reason recorded'));
    process.exit(1);
  }

  if (before.qa_cache > 0) {
    console.error('\n🔴 A CACHED CUSTOMER ANSWER MENTIONS A TRIBUNAL DECISION.');
    console.error('   That is not a certificate problem. The caselaw filter has failed and a judgment');
    console.error('   has reached a user. Stop and read test/caselawgate.test.mjs section A.');
    process.exit(2);
  }

  if (!ERASE) {
    log('');
    log('Count only. Nothing was written. Run with --erase to erase and certify.');
    log(isClean(before)
      ? 'Nothing is currently held. A certificate would be issuable today.'
      : 'Licensed material is held. That is correct while the licence is live.');
    process.exit(0);
  }

  log('');
  log('ERASING.');

  await withDb(async (db) => {
    await db.query(
      `update public.knowledge_items
         set title = $1,
             summary = $2,
             status = $3,
             raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
               'licensed_material_removed_at', now()::text,
               'removal_reason', 'licence_terminated'
             )
       where ` + CASELAW_SQL_INCLUSION,
      [REDACTED_TITLE, REDACTED_SUMMARY, REMOVED_AT_SOURCE],
    );
    await db.query(
      "update public.khoji_law set body_hash = '', verdict = 'erased' where url ilike $1",
      ['%' + FCL_HOST + '%'],
    );
  });

  // 🔴 THE RE-READ. A fresh connection, a fresh query, and the certificate is built from THIS.
  const after = await withDb(tallyFrom);

  log('AFTER');
  for (const p of PLACES) log(`  ${p.table.padEnd(18)} ${after[p.table]}`);

  if (!isClean(after)) {
    console.error('\n🔴 THE RE-READ IS NOT CLEAN. NO CERTIFICATE HAS BEEN PRINTED.');
    console.error('   Licensed material is still held after the erasure ran. Do not sign anything.');
    process.exit(1);
  }

  const when = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  console.log('');
  console.log(certificateText({ tally: after, when }));
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[khoji:certificate] fatal:', e && e.message ? e.message : e);
    process.exit(1);
  });
}
