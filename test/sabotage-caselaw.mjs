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

// ── THE SUITE ITSELF CANNOT VANISH. ─────────────────────────────────────────────────────────

sabotage('🔴 the caselaw definition file is deleted', (d) => {
  rmSync(path.join(d, 'khoji/caselaw.mjs'));
});

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

process.stdout.write(
  `\n  ${applied} sabotages applied, ${held} behaved, ${holes} holes, ${broken} broken anchors\n`,
);
if (holes > 0 || broken > 0) process.exit(1);
if (applied !== 20) {
  process.stdout.write(`  COUNT WRONG: expected 20 sabotages to apply, got ${applied}\n`);
  process.exit(1);
}
