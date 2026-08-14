// SABOTAGE THE FIND CASE LAW LICENCE GUARDS. A guard that passes is not evidence until you have
// made it fail.
//
//   node test/sabotage-caselaw.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Each sabotage below reintroduces ONE way a judgment could reach a customer, or be judged and
// binned by a language model instead of by a person, on a scratch copy of the repo.
// test/caselawgate.test.mjs has to go RED. A sabotage that stays green is a hole in the guard.
//
// 🔴 THE FIRST TWO ARE THE DEFECTS THAT WERE ACTUALLY LIVE ON 14 AUGUST 2026, restored exactly.
// If either of those ever stays green again, the licence is unenforced and nobody will know.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-caselaw-'));
  for (const d of ['lib', 'test', 'app', 'khoji']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return dir;
}

function runSuite(dir) {
  try {
    const out = execFileSync('node', [path.join(dir, 'test/caselawgate.test.mjs')], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed\./.test(out), out };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 90)}`);
  writeFileSync(p, s.split(from).join(to));
};

// Written as escapes on purpose. This file is itself inside the sweep it is testing, and a
// literal dash here would make the sweep fail on the sabotage runner rather than on the code.
const EM_DASH = '\u2014';
const EN_DASH = '\u2013';

let applied = 0, held = 0, holes = 0, broken = 0;

function sabotage(name, mutate, expectRed = true) {
  const dir = scratch();
  try {
    mutate(dir);
    applied += 1;
  } catch (e) {
    broken += 1;
    process.stdout.write(`  BROKEN SABOTAGE (anchor gone, NOT a pass)  ${name}\n    ${e.message}\n`);
    rmSync(dir, { recursive: true, force: true });
    return;
  }
  const { red } = runSuite(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red === expectRed) {
    held += 1;
  } else {
    holes += 1;
    process.stdout.write(
      expectRed
        ? `  HOLE (sabotage stayed GREEN)  ${name}\n`
        : `  HOLE (no-op control went RED)  ${name}\n`,
    );
  }
}

process.stdout.write('\nsabotaging the find case law licence guards\n');

// ── THE TWO DEFECTS THAT WERE LIVE. Restored exactly as they shipped. ────────────────────────

sabotage('🔴 LIVE DEFECT 1: the backlog distiller reads every queued row again, judgments included', (d) =>
  edit(d, 'khoji/watch.mjs',
    '"select id, source_url, source_name, title, raw from public.knowledge_items"\n        + " where status = \'needs_distillation\' and " + CASELAW_SQL_EXCLUSION\n        + \' order by created_at asc limit $1\',',
    '"select id, source_url, source_name, title, raw from public.knowledge_items where status = \'needs_distillation\' order by created_at asc limit $1",'));

sabotage('🔴 LIVE DEFECT 2: a judgment reaches the prompt that answers a customer', (d) =>
  edit(d, 'lib/supabase.ts',
    "      + CASELAW_NOT_FILTER +\n", '      +\n'));

// ── PRINCIPLE A. A person reviews every candidate. ──────────────────────────────────────────

sabotage('🔴 a model can bin a judgment again', (d) =>
  edit(d, 'khoji/distill.mjs',
    "  if (isCaselawRow(item)) return 'needs_distillation';",
    '  void isCaselawRow;'));

sabotage('a judgment is marked distilled, as though a model had judged it', (d) =>
  edit(d, 'khoji/distill.mjs',
    "  if (isCaselawRow(item)) return 'needs_distillation';",
    "  if (isCaselawRow(item)) return 'distilled';"));

sabotage('the marker stops recognising a row marked only in raw', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    '  const raw = row.raw;\n  if (raw && typeof raw === \'object\' && raw.tribunal === true) return true;',
    '  const raw = row.raw;\n  void raw;'));

sabotage('the marker stops recognising a raw that arrived as a json string', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "  if (typeof raw === 'string' && /\"tribunal\"\\s*:\\s*true/.test(raw)) return true;",
    '  void 0;'));

sabotage('🔴 the tribunal watcher grows a model and starts judging', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    'async function main() {',
    'async function judgeIt() { return distill({}); }\n\nasync function main() {'));

// ── PRINCIPLE B. A judgment never reaches a user. ───────────────────────────────────────────

sabotage('🔴 the code level refusal is dropped, leaving only the database filter', (d) =>
  edit(d, 'lib/supabase.ts',
    '      ? rows.filter((r) => r && r.summary && r.source_url && !isCaselawKnowledgeRow(r)).slice(0, limit)',
    '      ? rows.filter((r) => r && r.summary && r.source_url).slice(0, limit)'));

sabotage('the columns needed to recognise a judgment stop being selected', (d) =>
  edit(d, 'lib/supabase.ts',
    '&select=title,summary,source_url,effective_date,source_name,raw&order=',
    '&select=title,summary,source_url,effective_date&order='));

sabotage('🔴 a customer lane starts querying knowledge_items itself', (d) =>
  edit(d, 'app/api/ask/route.ts',
    'export async function POST(',
    "const ROGUE = 'knowledge_items?status=eq.reviewed';\nvoid ROGUE;\n\nexport async function POST("));

sabotage('🔴 the two languages drift on what a caselaw row is', (d) =>
  edit(d, 'lib/lawsources.ts',
    "export const CASELAW_SOURCE_NAME = 'Tax tribunal decision (GOV.UK, Open Government Licence)';",
    "export const CASELAW_SOURCE_NAME = 'Tax tribunal decision';"));

sabotage('the writer stops using the shared constant, so writer and readers can drift', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    '          CASELAW_SOURCE_NAME,',
    "          'Tax tribunal decision (GOV.UK, Open Government Licence)',"));

// ── PRINCIPLE C. Never fetched, never hosted, never indexed. ─────────────────────────────────

sabotage('🔴 the tribunal watcher starts fetching the judgment PDF', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    'const SEARCH =',
    'const fetchJudgment = (u) => fetch(u + ".pdf");\nvoid fetchJudgment;\nconst SEARCH ='));

sabotage('🔴 the tribunal watcher reaches for the Find Case Law API', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    'const SEARCH =',
    "const FCL = 'https://caselaw.nationalarchives.gov.uk/search';\nvoid FCL;\nconst SEARCH ="));

sabotage('the law watcher starts storing the body of a record', (d) =>
  edit(d, 'khoji/lawwatch.mjs',
    'hashOf(body)',
    'body'));

sabotage('🔴 a public JSON endpoint is built from knowledge_items', (d) =>
  edit(d, 'app/rules.json/route.ts',
    'export function GET() {',
    "const FEED = 'knowledge_items?select=*';\nvoid FEED;\n\nexport function GET() {"));

// ── THE LICENCE'S OWN TERMS. Signed 14 August 2026. ─────────────────────────────────────────

sabotage('🔴 the acknowledgement is reworded, so it stops being the Licensor approved form', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "'Crown copyright material reproduced by permission of The National Archives. '",
    "'Crown copyright material used with permission of The National Archives. '"));

sabotage('🔴 somebody FIXES the en dash in the acknowledgement, breaching the approved form', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    'Open Justice \\u2013 Licence',
    'Open Justice Licence'));

sabotage('the partial representation statement stops saying what the licence requires', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    'only partially represent ',
    'fully represent '));

sabotage('🔴 the two languages drift on the acknowledgement', (d) =>
  edit(d, 'lib/lawsources.ts',
    "  + 'The contents of the judgment can be used under the Open Justice \\u2013 Licence.';",
    "  + 'The contents of the judgment can be used under the Open Justice Licence.';"));

// ── PERSONAL DATA. Excluded from the licence outright. ──────────────────────────────────────

sabotage('🔴 THE WRITER STORES THE TITLE RAW AGAIN, party names and all', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    'title: stripParties(r.title),',
    'title: r.title,'));

sabotage('🔴 THE WRITER STORES THE CATCHWORDS RAW AGAIN', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    "catchwords: stripParties((r.indexable_content || '').replace(/\\s+/g, ' ').trim()).slice(0, 800),",
    "catchwords: (r.indexable_content || '').replace(/\\s+/g, ' ').trim().slice(0, 800),"));

sabotage('the party stripper stops removing a hyphenated -v- name', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "const PARTIES_SRC = '\\\\b' + PARTY + '\\\\s+-?\\\\s*v\\\\.?\\\\s*-?\\\\s+' + PARTY;",
    "const PARTIES_SRC = '\\\\b' + PARTY + '\\\\s+v\\\\s+' + PARTY;"));

sabotage('🔴 the case reference stops being protected, so the desk cannot find the decision', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    '  const guarded = text.replace(REFERENCES, (m) => {',
    '  const guarded = text.replace(/$^/, (m) => {'));

sabotage('the detector becomes stateful again, so it answers differently every other call', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "  return new RegExp(PARTIES_SRC).test(withoutRefs);",
    "  return SHARED_PARTIES.test(withoutRefs);"));

// ── THE SUITE ITSELF CANNOT VANISH. ─────────────────────────────────────────────────────────

sabotage('🔴 the caselaw definition file is deleted', (d) => {
  rmSync(path.join(d, 'khoji/caselaw.mjs'));
});

// ── THE HOUSE DASH RULE, ACROSS THE WHOLE PIPELINE. Widened 14 August 2026. ─────────────
//
// The sweep was pointed at two files and passed for weeks while an em dash sat in the title
// tribunal.mjs writes into the desk queue. These prove it now sees the rest of the pipeline.

sabotage('🔴 THE ORIGINAL DEFECT: an em dash goes back into the desk queue title', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    "join(', ')}. ${h.title}",
    "join(', ')} " + EM_DASH + " ${h.title}"));

sabotage('🔴 an em dash appears in a watch.mjs comment', (d) =>
  edit(d, 'khoji/watch.mjs',
    'service availability". Every one marked',
    'service availability" ' + EM_DASH + ' every one marked'));

sabotage('🔴 an en dash appears in lawsources', (d) =>
  edit(d, 'lib/lawsources.ts',
    '// Must match CASELAW_SOURCE_NAME in khoji/caselaw.mjs exactly.',
    '// Must match CASELAW_SOURCE_NAME ' + EN_DASH + ' in khoji/caselaw.mjs exactly.'));

sabotage('🔴 THE SWEEP IS NARROWED BACK to the two files the fix created', (d) =>
  edit(d, 'test/caselawgate.test.mjs',
    "    'khoji/tribunal.mjs': srcTribunal,\n",
    ''));

// ── F. THE TAKEDOWN AND CURRENT VERSION TERM. ───────────────────────────────────────────────
//
// 🔴 THE FOUR THAT MATTER MOST ARE THE ONES WHERE A BAD NIGHT REMOVES THE DESK'S WORK. If a
// timeout, a 500 or a rate limit could empty the record, the licence obligation would have become a
// way to lose everything, quietly, at five in the morning, reporting success.

sabotage('🔴 A 500 IS TREATED AS "no longer published", so a bad night empties the record', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "  if (typeof status !== 'number' || status < 200 || status >= 300) return 'blind';",
    "  if (typeof status !== 'number' || status < 200 || status >= 300) return 'gone';"));

sabotage('🔴 THE NETWORK ERROR CHECK IS DROPPED, so a thrown fetch removes material', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "  if (networkError) return 'blind';\n",
    ''));

sabotage('🔴 A FIRST SIGHT IS CALLED A REVISION, so the first run redacts the whole record', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    "  if (!recordedStamp) return 'baseline';",
    "  if (!recordedStamp) return 'revised';"));

sabotage('🔴 SOMEBODY TIDIES UP THE TOMBSTONE, so tribunal.mjs re-ingests it the next morning', (d) =>
  edit(d, 'khoji/caselawtakedown.mjs',
    '      redacted += 1;\n    } else if (verdict.action === ',
    "      await withDb(async (db) => {\n"
    + "        await db.query('delete from public.knowledge_items where source_url = $1', [row.source_url]);\n"
    + '      });\n'
    + '      redacted += 1;\n    } else if (verdict.action === '));

sabotage('🔴 tribunal.mjs stops stamping the source version, so the job can only ever baseline', (d) =>
  edit(d, 'khoji/tribunal.mjs',
    '            source_updated_at: h.published,\n',
    ''));

// 🔴 THIS ONE WAS A HOLE ON THE FIRST PASS AND IT IS THE REASON THE GUARD CHANGED. Commenting
// the line out leaves the string `node caselawtakedown.mjs` sitting in the file, and the guard was
// reading the raw file. It now reads through a shell comment stripper.
sabotage('🔴 THE NIGHTLY RUN STOPS CALLING IT, commented out so the string is still there', (d) =>
  edit(d, 'khoji/run.sh',
    'node caselawtakedown.mjs "$@"',
    '# node caselawtakedown.mjs "$@"'));

sabotage('🔴 the nightly run deletes the call outright', (d) =>
  edit(d, 'khoji/run.sh',
    'node caselawtakedown.mjs "$@" >> logs/khoji.log 2>&1\ntakedown_rc=$?\n',
    ''));

sabotage('🔴 the takedown exit code is swallowed, so a blind night reports success', (d) =>
  edit(d, 'khoji/run.sh',
    'if [ "$takedown_rc" -ne 0 ]; then exit "$takedown_rc"; fi',
    ''));

sabotage('🔴 a row it could not read stops making the run exit loud', (d) =>
  edit(d, 'khoji/caselawtakedown.mjs',
    'process.exit(blind > 0 ? 1 : 0);',
    'process.exit(0);'));

sabotage('the host check on the URL is dropped, so it asks gov.uk about somebody else\'s page', (d) =>
  edit(d, 'khoji/caselawtakedown.mjs',
    "    if (u.host.toLowerCase() !== 'www.gov.uk' && u.host.toLowerCase() !== 'gov.uk') return null;\n",
    ''));

sabotage('the job writes its own idea of what a caselaw row is instead of the shared one', (d) =>
  edit(d, 'khoji/caselawtakedown.mjs',
    "export const CASELAW_SQL_INCLUSION = 'not ' + CASELAW_SQL_EXCLUSION;",
    "export const CASELAW_SQL_INCLUSION = \"source_name like '%tribunal%'\";"));

// ── G. THE CERTIFICATE OF ERASURE. ──────────────────────────────────────────────────────────
//
// 🔴 A CERTIFICATE THAT PRINTS WHATEVER HAPPENED IS A LIE WITH A LETTERHEAD.

sabotage('🔴 A MISSING COUNT GOES BACK TO READING AS ZERO, so an unrun query certifies as erased', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    '  return PLACES.filter((p) => p.erase).every((p) => tally[p.table] === 0);',
    '  return PLACES.filter((p) => p.erase).every((p) => (tally[p.table] ?? 0) === 0);'));

sabotage('🔴 THE CERTIFICATE IS BUILT FROM THE COUNT TAKEN BEFORE THE ERASURE', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    'certificateText({ tally: after, when })',
    'certificateText({ tally: before, when })'));

sabotage('🔴 THE REFUSAL IS REMOVED, so it certifies over the top of material still held', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    '  if (!isClean(after)) {',
    '  if (false) {'));

sabotage('🔴 a redacted row is counted as still holding material, so it can never certify clean', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    '  if (title === REDACTED_TITLE && (summary === REDACTED_SUMMARY || summary === REVISED_SUMMARY)) return false;\n',
    ''));

sabotage('🔴 the audit trail is marked erasable, destroying the proof the removals happened', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    "    table: 'khoji_runs',\n    holds: 'counts',\n    erase: false,",
    "    table: 'khoji_runs',\n    holds: 'counts',\n    erase: true,"));

sabotage('🔴 the leak detector stops stopping, so a judgment reaching a customer is only logged', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    '    process.exit(2);',
    '    // carry on regardless'));

sabotage('a place stops carrying the note that says what it holds', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    "    note: 'A sixteen character body hash of the Find Case Law landing page. Not reversible. Cleared anyway.',",
    "    note: 'hash',"));

// ── H. THE TWO STATEMENTS ARE RENDERED, NOT MERELY DECLARED. ────────────────────────────────
//
// ⚠️ EACH OF THESE LEAVES THE IMPORT IN PLACE. An import is not a rendering, and a guard that
// anchored on the import would stay green over a page that had stopped printing the words.

sabotage('🔴 THE ACKNOWLEDGEMENT ELEMENT IS DELETED FROM /terms, leaving the import behind', (d) =>
  edit(d, 'app/terms/page.tsx',
    '        <p style={para}>{TNA_ACKNOWLEDGEMENT}</p>\n',
    ''));

sabotage('🔴 the partial representation element is deleted from /terms', (d) =>
  edit(d, 'app/terms/page.tsx',
    '        <p style={para}>{TNA_PARTIAL_REPRESENTATION}</p>\n',
    ''));

sabotage('🔴 THE ACKNOWLEDGEMENT ELEMENT IS DELETED FROM THE DESK, where the material is shown', (d) =>
  edit(d, 'app/team/knowledge/page.tsx',
    '        <p style={{ ...T.small, marginTop: 6 }}>{TNA_ACKNOWLEDGEMENT}</p>\n',
    ''));

sabotage('🔴 the desk stops rendering the partial representation statement', (d) =>
  edit(d, 'app/team/knowledge/page.tsx',
    '        <p style={{ ...T.small, marginTop: 6 }}>{TNA_PARTIAL_REPRESENTATION}</p>\n',
    ''));

sabotage('🔴 SOMEBODY RETYPES THE WORDS instead of using the constant, and they can now drift', (d) =>
  edit(d, 'app/terms/page.tsx',
    '<p style={para}>{TNA_ACKNOWLEDGEMENT}</p>',
    '<p style={para}>Crown copyright material reproduced by permission of The National Archives.</p>'));

sabotage('🔴 the public copy starts reading a session, so only a customer can see it', (d) =>
  edit(d, 'app/terms/page.tsx',
    'export default function TermsPage() {',
    'export default function TermsPage() {\n  const user = sessionUser();'));

// ── I. WHICH SOURCE IS UNDER WHICH LICENCE. ─────────────────────────────────────────────────

sabotage('🔴 the TypeScript registry loses a host the .mjs side still allows', (d) =>
  edit(d, 'lib/lawsources.ts',
    "  { host: 'gov.uk', licence: OGL, acknowledgement: false },\n",
    ''));

sabotage('🔴 THE TWO SIDES DISAGREE ABOUT WHICH HOST NEEDS AN ACKNOWLEDGEMENT', (d) =>
  edit(d, 'lib/lawsources.ts',
    "  { host: 'caselaw.nationalarchives.gov.uk', licence: FCL_LICENCE, acknowledgement: true },",
    "  { host: 'caselaw.nationalarchives.gov.uk', licence: FCL_LICENCE, acknowledgement: false },"));

sabotage('🔴 lawwatch goes back to keeping its own copy of the licensed host list', (d) =>
  edit(d, 'khoji/lawwatch.mjs',
    'export const ALLOWED_HOSTS = LICENSED_HOSTS;',
    "export const ALLOWED_HOSTS = [\n  'www.legislation.gov.uk', 'legislation.gov.uk',\n  'www.gov.uk', 'gov.uk',\n  'caselaw.nationalarchives.gov.uk',\n];"));

sabotage('🔴 lib/lawsources goes back to keeping its own copy of the allowlist', (d) =>
  edit(d, 'lib/lawsources.ts',
    'export const ALLOWED_SOURCE_HOSTS: readonly string[] = SOURCE_LICENCES.map((s) => s.host);',
    "export const ALLOWED_SOURCE_HOSTS: readonly string[] = [\n  'www.gov.uk', 'gov.uk',\n];"));

sabotage('🔴 LAWWATCH STARTS KEEPING THE BODY OF THE FIND CASE LAW PAGE, not just a hash', (d) =>
  edit(d, 'khoji/lawwatch.mjs',
    'body_hash = excluded.body_hash,',
    'body_hash = excluded.body_hash, body_text = excluded.body_text,'));

// ── THE DASH SWEEP FOLLOWS THE FIX INTO ITS NEW FILES. ──────────────────────────────────────

sabotage('🔴 an em dash appears in the takedown job', (d) =>
  edit(d, 'khoji/caselawtakedown.mjs',
    '// KHOJI CHECKS THAT WHAT WE HOLD IS STILL WHAT THE COURT PUBLISHES.',
    '// KHOJI CHECKS ' + EM_DASH + ' that what we hold is still what the court publishes.'));

sabotage('🔴 an en dash appears on the terms page', (d) =>
  edit(d, 'app/terms/page.tsx',
    '<h2 style={heading}>Where our legal information comes from</h2>',
    '<h2 style={heading}>Where our legal information ' + EN_DASH + ' comes from</h2>'));

// ── NO-OP CONTROLS. These must stay GREEN, or this runner only detects that a file moved. ────

sabotage('NO-OP: a comment word changes in the caselaw definition', (d) =>
  edit(d, 'khoji/caselaw.mjs',
    '// The exact string tribunal.mjs writes into source_name.',
    '// The precise string tribunal.mjs writes into source_name.'), false);

sabotage('NO-OP: whitespace changes in distill', (d) =>
  edit(d, 'khoji/distill.mjs',
    "export function triageStatus(item, d) {",
    "export function triageStatus(item, d) {\n"), false);

sabotage('NO-OP: a comment word changes in lawsources', (d) =>
  edit(d, 'lib/lawsources.ts',
    '// Must match CASELAW_SOURCE_NAME in khoji/caselaw.mjs exactly.',
    '// Must equal CASELAW_SOURCE_NAME in khoji/caselaw.mjs exactly.'), false);

sabotage('NO-OP: a comment word changes in the takedown job', (d) =>
  edit(d, 'khoji/caselawtakedown.mjs',
    '// Every other watcher in this folder asks a forward question.',
    '// Every other watcher in this folder asks a forwards question.'), false);

sabotage('NO-OP: a comment word changes in the certificate', (d) =>
  edit(d, 'khoji/caselawcertificate.mjs',
    '// THE COUNT. Pure where it can be',
    '// THE TALLY. Pure where it can be'), false);

sabotage('NO-OP: whitespace changes on the terms page', (d) =>
  edit(d, 'app/terms/page.tsx',
    '<h2 style={heading}>Law</h2>',
    '<h2 style={heading}>Law</h2>\n'), false);

process.stdout.write(
  `\n  ${applied} sabotages applied, ${held} behaved, ${holes} holes, ${broken} broken anchors\n`,
);
if (holes > 0 || broken > 0) process.exit(1);
if (applied !== 67) {
  process.stdout.write(`  COUNT WRONG: expected 67 sabotages to apply, got ${applied}\n`);
  process.exit(1);
}
