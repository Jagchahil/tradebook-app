// khoji/caselaw.mjs. WHAT A CASELAW ROW IS, SAID ONCE, SO EVERY READER AGREES WITH THE WRITER.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS FILE EXISTS BECAUSE A JUDGMENT IS NOT LIKE THE OTHER THINGS IN knowledge_items.
//
// Everything else in that table is a GOV.UK page: Crown copyright, Open Government Licence, ours
// to quote with attribution. A tax tribunal decision is not. Lekhio Ltd holds a Find Case Law
// transactional licence from The National Archives (ref CAS-341311-V2P0M2) and signed up to nine
// binding principles to get it. Three of them are enforced in code, and all three are about rows
// that came from a judgment:
//
//   A. A PERSON reviews every candidate change before it affects anything a user sees, and the
//      pipeline only ever FLAGS. It never asserts, and NOTHING MAY DECIDE FOR HIM. That includes
//      a language model quietly re-summarising the flag, and it especially includes a model
//      binning the flag so he never sees it at all.
//
//   B. NEVER reproduce, paraphrase, summarise or comment on a judgment TO A USER. Extract the tax
//      treatment point and the citation, link to the official record, and cite the underlying
//      legislation or HMRC guidance. Never the judgment's holding.
//
//   C. No personal data. A tribunal decision names the appellant in its title.
//
// ⚠️ THE MARKER IS A COLUMN VALUE, NOT A CODE PATH, and that is deliberate. The rows outlive any
// one script: tribunal.mjs writes them, watch.mjs reads them back on a later night, the team desk
// reads them a week after that, and lib/supabase.ts reads them from a different language. A
// predicate that lived in one of those files would be a rule the other three do not know. So the
// row carries its own nature in `source_name` and in `raw.tribunal`, and everything that touches
// the table asks THIS FILE what those mean.
//
// ⚠️ AND THE TYPESCRIPT SIDE HAS ITS OWN COPY ON PURPOSE. khoji is .mjs run under bare node on a
// Mac mini; lib/ is TypeScript compiled by Next. Neither can import the other. So
// lib/lawsources.ts declares the same constant, and test/caselawgate.test.mjs asserts the two are
// BYTE IDENTICAL by reading both files. Two copies with a test that fails when they drift is
// honest. One copy that only half the product can see is not.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The exact string tribunal.mjs writes into source_name. Everything keys off it.
// ⚠️ CHANGING THIS STRING ORPHANS EVERY ROW ALREADY IN THE TABLE, which would silently un-mark
// every judgment we have ever flagged. If it ever has to change, the migration changes the rows
// in the same commit.
export const CASELAW_SOURCE_NAME = 'Tax tribunal decision (GOV.UK, Open Government Licence)';

// Is this row derived from a judgment? Two independent marks, either is enough.
//
// source_name is what the database can filter on cheaply. raw.tribunal is what survives if
// somebody ever edits a display string. Asking for either means a row has to lose BOTH marks
// before it stops being treated as caselaw, and losing both takes a deliberate act.
export function isCaselawRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (String(row.source_name || '') === CASELAW_SOURCE_NAME) return true;
  const raw = row.raw;
  if (raw && typeof raw === 'object' && raw.tribunal === true) return true;
  // raw arrives as a json string from some drivers. A string that says it is a tribunal row is
  // still a tribunal row.
  if (typeof raw === 'string' && /"tribunal"\s*:\s*true/.test(raw)) return true;
  return false;
}

// The SQL that keeps caselaw rows OUT of a query, for the places that filter in the database
// rather than in JavaScript. Both marks again, so a row with either one is excluded.
//
// 🔴 USED BY khoji/watch.mjs's BACKLOG SELECT, AND THAT IS THE WHOLE POINT OF THIS FILE.
// Before 14 August 2026 that select read every `needs_distillation` row with no source filter at
// all. Tribunal rows sit in that queue by design, waiting for a person. So on any night with
// KHOJI_DISTILL on, a language model picked them up, rewrote the human authored summary that
// carried the judge's catchwords and the words "Nothing here is automatic", replaced the
// deliberate `confidence = null` with a score, and could move the row to 'dismissed' where no
// human would ever see it. Principle A and principle B, both broken, by a script that had never
// heard of either.
export const CASELAW_SQL_EXCLUSION =
  "(source_name is distinct from '" + CASELAW_SOURCE_NAME + "' and coalesce((raw->>'tribunal')::boolean, false) = false)";
