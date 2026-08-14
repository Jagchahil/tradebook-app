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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE TWO STATEMENTS THE LICENCE REQUIRES, WORD FOR WORD.
//
// The executed licence (13 August 2026, TNA ref CAS-341311-V2P0M2) is stricter and more specific
// than the nine principles in the application, and these two are hard obligations rather than
// good practice:
//
//   Acknowledgement: "An acknowledgement in the form specified must appear in a prominent
//   location and in a form approved by the Licensor."
//
//   Restrictions (b): the Re-user "must state in a prominent location and in a form approved by
//   the Licensor that the Licensed Material only partially represents the activities of the
//   courts and tribunals".
//
// 🔴 THE FORM IS APPROVED BY THEM, SO IT IS COPIED EXACTLY AND NEVER EDITED. Not reworded, not
// re-punctuated, not shortened to fit a card.
//
// ⚠️ AND THE ACKNOWLEDGEMENT CONTAINS AN EN DASH, in the phrase "Open Justice", an en dash, then "Licence". The house writing
// rule forbids en dashes everywhere, and this is the one string in the product that is exempt,
// because the licence specifies the form. test/caselawgate.test.mjs asserts the dash is PRESENT,
// so a well meaning sweep that "fixes" it fails the build instead of quietly breaching the
// licence. Do not touch this string.
export const TNA_ACKNOWLEDGEMENT =
  'Crown copyright material reproduced by permission of The National Archives. '
  + 'The contents of the judgment can be used under the Open Justice \u2013 Licence.';

export const TNA_PARTIAL_REPRESENTATION =
  'Court judgments and tribunal decisions published on Find Case Law only partially represent '
  + 'the activities of the courts and tribunals.';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE PARTIES COME OUT BEFORE ANYTHING IS STORED. PERSONAL DATA IS NOT LICENSED AT ALL.
//
// The licence's Exclusions clause is explicit: this licence does not cover "personal data
// contained in the Licensed Material", and "this Licence is not a data sharing agreement for
// personal data" and "is not a processing agreement for personal data". So the party names in a
// tribunal decision are outside the grant entirely. They are not ours to hold under it.
//
// And Lekhio said so first. Principle 6 of the application, in Jag's own words: "We extract only
// the impersonal tax-treatment point and the citation. We do not store, enrich, index or infer
// personal data about any individual named in a decision."
//
// The code did the opposite until 14 August 2026. khoji/tribunal.mjs stored the GOV.UK title raw
// and 800 characters of catchwords raw, and a tribunal title IS the parties: "CATS NORTH SEA v
// HMRC". An appellant is very often a named individual.
//
// ⚠️ EVERYTHING ELSE IS KEPT, AND THAT IS THE POINT. The case reference, the neutral citation and
// the subject matter are what the human at the desk triages on, and none of them is personal data:
// they are the identifiers and the substance of a public record. What goes is the names.
//
// ⚠️ AND IT REFUSES RATHER THAN GUESSES. A company and a person cannot be told apart reliably by
// a regular expression, so BOTH SIDES of a "v" go, every time. Over removing a company name costs
// the desk nothing. Under removing a person's name is a breach.
const PARTY_MARKER = '[parties removed]';

// The token the reference hides behind while the names are removed. Digits only, wrapped in
// vertical bars, because the FIRST version used " REF0 " and the R is an [A-Z], so the party
// matcher started on the placeholder and ate the reference a second way.
const REF_OPEN = '|ref';
const REF_CLOSE = '|';

// A reference and a neutral citation are the IDENTIFIERS OF A PUBLIC RECORD, not personal data,
// and they are the only way the human at the desk can find the decision at all. The first version
// of this ate them: "UT-2024-000141 CATS NORTH SEA v HMRC" came back as the marker alone, because
// the party match began at the U of UT. So they are lifted out, the names are removed, and they
// are put back.
// \u26a0\ufe0f THE \\b GOES INSIDE THE ALTERNATION, NOT IN FRONT OF IT, AND THAT IS NOT A STYLE CHOICE.
// A leading \\b can never match before the `[` of a neutral citation, because a word boundary needs a
// word character on ONE side and the characters either side of that `[` are a space and a bracket.
// So for three days this branch was dead and NO neutral citation was protected at all. The suite
// said otherwise, because in its example the party match ran out before it reached the citation, so
// the citation survived by luck rather than by protection. It was found by running the stripper on
// the two rows actually in the record, where the luck did not hold and "[2026] UKUT 00300 (TCC)"
// came back as "[2026] UKUT 00300 (". A guard that passes for the wrong reason is not a guard.
const REFERENCES = /(?:\b(?:UT-\d{4}-\d+|TC\/?\d{4,})|\[\d{4}\]\s+[A-Z]+\s+\d+(?:\s+\([A-Z]+\))?)/g;

// A party name: a capitalised token, then up to seven more capitalised tokens or small connector
// words, so "The Commissioners for HMRC" and "CATS NORTH SEA LTD" both match and a whole
// paragraph does not.
// \u26a0\ufe0f THE CURLY APOSTROPHE IS IN THE CLASS BECAUSE THE COURTS USE IT. GOV.UK writes
// "HIS MAJESTY\u2019S REVENUE AND CUSTOMS" with U+2019, not with a typewriter quote, and without it the
// match stopped dead at MAJESTY and left \u2019S REVENUE AND CUSTOMS hanging off the marker. Found on a
// real stored row, not in a fixture.
const NAME_CHAR = "[A-Za-z0-9&.'\u2018\u2019()-]";
const PARTY = '[A-Z]' + NAME_CHAR + "*(?:\\s+(?:[A-Z]" + NAME_CHAR + "*|and|of|for|the|&)){0,7}";
// "A v B", "A -v- B", "A v. B".
const PARTIES_SRC = '\\b' + PARTY + '\\s+-?\\s*v\\.?\\s*-?\\s+' + PARTY;

// 🔴 IT OVER REMOVES ON PURPOSE, AND THAT IS THE RIGHT DIRECTION TO BE WRONG IN.
// A company and a person cannot be told apart by a regular expression, and in a run like
// "X v HMRC CAPITAL ALLOWANCES" nothing in the text says where the parties stop and the subject
// starts. Over removing costs the desk a few words of context it recovers in one click on the
// official record. Under removing is a breach of a licence that excludes personal data outright.
// The triage signal the desk actually reads is OURS anyway: the row leads with "RULE AT RISK",
// generated from our own watched list, never from the judge's words.
export function stripParties(text) {
  if (typeof text !== 'string' || !text) return '';
  const kept = [];
  const guarded = text.replace(REFERENCES, (m) => {
    kept.push(m);
    return REF_OPEN + (kept.length - 1) + REF_CLOSE;
  });
  // A fresh regex each call. A shared /g regex carries lastIndex between calls and would skip
  // every other input, which reads as flakiness rather than as a fault.
  const stripped = guarded.replace(new RegExp(PARTIES_SRC, 'g'), PARTY_MARKER);
  return stripped.replace(/\|ref(\d+)\|/g, (_, i) => kept[Number(i)] ?? '');
}

// Does this text still name parties? The guard tests behaviour rather than the shape of a regular
// expression, on a fresh regex for the lastIndex reason above.
export function namesParties(text) {
  if (typeof text !== 'string' || !text) return false;
  const withoutMarkers = text.split(PARTY_MARKER).join(' ');
  const withoutRefs = withoutMarkers.replace(REFERENCES, ' ');
  return new RegExp(PARTIES_SRC).test(withoutRefs);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE LICENCE OBLIGATIONS THAT OUTLIVE THE INGEST.
//
// Signing the licence bought a right and took on four duties. Two of them are not about what we
// write, they are about what we go on holding after we wrote it, and code that only runs at ingest
// can never discharge either:
//
//   TERM. "The Re-user must use the current version of the Licensed Material and must remove any
//   Licensed Material that is no longer published or has been replaced."
//
//   TERMINATION. On termination the Re-user must certify erasure of the Licensed Material.
//
// So the shapes both jobs share live here, once, and both call them. If the redaction that the
// takedown job performs and the redaction the certificate counts as done ever drifted apart, the
// certificate would certify something that had not happened, which is the worst failure available
// in this file.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

// What a row looks like once the licensed material is out of it. The source_url STAYS.
//
// 🔴 AND KEEPING THE URL IS A DECISION, NOT AN OVERSIGHT. GOV.UK builds a decision's slug out of
// the case name, so the address of a public record contains the parties. It stays for three
// reasons and each one is load bearing: it is the published locator of a public record rather than
// material drawn from the record, it is our unique key so a withdrawn decision cannot be silently
// re-ingested on the next run, and the takedown check cannot re-ask a question about a decision it
// has no address for. It never reaches a customer. getRelevantKnowledge refuses caselaw rows at the
// query AND again in code, and test/caselawgate.test.mjs proves both.
export const REMOVED_AT_SOURCE = 'removed_at_source';

export const REDACTED_TITLE = 'Tribunal decision withdrawn at source. Licensed material removed.';
export const REDACTED_SUMMARY = [
  'This decision is no longer published by the source, or has been replaced.',
  '',
  'The licensed material that was held against this record has been removed under the terms of the',
  'Find Case Law licence. Nothing was decided about any rule on the strength of it.',
].join('\n');

export const REVISED_SUMMARY = [
  'The source has published a revised version of this decision since we recorded it.',
  '',
  'The licensed material we were holding was the superseded version, so it has been removed rather',
  'than shown. Read the current decision at the source before deciding anything.',
].join('\n');

// Does this row still hold licensed material? The certificate counts with this and the takedown job
// clears until this is false, so neither can believe something the other has not done.
export function holdsLicensedMaterial(row) {
  if (!row) return false;
  if (!isCaselawRow(row)) return false;
  const title = String(row.title ?? '');
  const summary = String(row.summary ?? '');
  if (title === REDACTED_TITLE && (summary === REDACTED_SUMMARY || summary === REVISED_SUMMARY)) return false;
  return title.length > 0 || summary.length > 0;
}

// A first sight is a baseline, not an alarm. The same rule khoji/lawwatch.mjs holds: we cannot call
// a decision revised against a version stamp we never took.
export function revisionVerdict(recordedStamp, currentStamp) {
  if (!currentStamp) return 'unknown';
  if (!recordedStamp) return 'baseline';
  const a = new Date(recordedStamp).getTime();
  const b = new Date(currentStamp).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 'unknown';
  return b > a ? 'revised' : 'current';
}

// 🔴 THE ONLY THREE ANSWERS THAT MAY REMOVE ANYTHING, AND A NETWORK FAULT IS NOT ONE OF THEM.
//
// A timeout is not "no longer published". A 500 is not "no longer published". DNS falling over on
// the mini at five in the morning is not "no longer published". If a bad night could quietly empty
// the record, the licence obligation would have become a way to lose the desk's work, so the fault
// cases return 'blind' and the caller is required to do nothing at all with them.
export function publicationVerdict({ status, withdrawn, networkError }) {
  if (networkError) return 'blind';
  if (status === 404 || status === 410) return 'gone';
  if (typeof status !== 'number' || status < 200 || status >= 300) return 'blind';
  if (withdrawn) return 'gone';
  return 'published';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHICH SOURCE IS UNDER WHICH LICENCE. ONE LIST, AND EVERY OBLIGATION HANGS OFF IT.
//
// 🔴 THE MISMATCH THIS EXISTS TO MAKE IMPOSSIBLE.
//
// On 14 August 2026 we signed a Find Case Law licence whose stated purpose is monitoring Find Case
// Law, and the watcher we actually run reads GOV.UK. That is not a breach. It is two publishers of
// the same kind of material under two different licences, and the reasoning for reading GOV.UK is
// at the top of khoji/tribunal.mjs and still correct. It is a mismatch, and the danger in a
// mismatch is never the day you notice it. It is the day somebody points a watcher at the other
// host because it has better coverage, ships it, and inherits four obligations nobody told them
// about, because the obligations were written down in a document and not in the code.
//
// So the licence is a property of the HOST, the obligations are a property of the LICENCE, and
// test/caselawgate.test.mjs holds the product to them. Point anything at Find Case Law and the
// acknowledgement, the partial representation statement, the takedown job and the certificate all
// become mandatory that same commit, or the build goes red.
//
// ⚠️ TODAY: caselaw.nationalarchives.gov.uk is read by khoji/lawwatch.mjs, which hashes the landing
// page and stores SIXTEEN CHARACTERS OF SHA-256 and nothing else. No Licensed Material is retained
// from that host. The licence is exercised as a read, which is free under the Open Justice Licence
// anyway, and the transactional licence is what would let us move the watcher onto their API and
// their full record. That is a decision to take on purpose, not to drift into.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

export const OGL = 'Open Government Licence v3.0';
export const FCL_LICENCE = 'Find Case Law transactional licence, TNA ref CAS-341311-V2P0M2';

export const SOURCE_LICENCES = [
  { host: 'legislation.gov.uk', licence: OGL, acknowledgement: false },
  { host: 'www.legislation.gov.uk', licence: OGL, acknowledgement: false },
  { host: 'gov.uk', licence: OGL, acknowledgement: false },
  { host: 'www.gov.uk', licence: OGL, acknowledgement: false },
  // The only host in the product that carries obligations beyond attribution.
  { host: 'caselaw.nationalarchives.gov.uk', licence: FCL_LICENCE, acknowledgement: true },
];

// The one list of hosts anything may read. khoji/lawwatch.mjs and lib/lawsources.ts both take it
// from here rather than keeping their own, because a host that is allowed in one list and unknown
// to the other is a host being read under no licence at all.
export const ALLOWED_HOSTS = SOURCE_LICENCES.map((s) => s.host);

export function licenceFor(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    return SOURCE_LICENCES.find((s) => s.host === host) || null;
  } catch {
    return null;
  }
}

// Does reading this URL put us under the acknowledgement obligation? The suite asks this of every
// host in the registry, and where the answer is yes it requires the statements to be RENDERED, not
// merely declared. A constant nobody prints discharges nothing.
export function acknowledgementRequiredFor(url) {
  const l = licenceFor(url);
  return Boolean(l && l.acknowledgement);
}
