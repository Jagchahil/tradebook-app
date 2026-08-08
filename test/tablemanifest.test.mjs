// THE TABLE CENSUS. Every table this product writes to must be answerable at both data rights
// doors, or must be exempt FOR A WRITTEN REASON. Nothing may be neither.
//
//   node test/tablemanifest.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS, AND WHY IT IS WORTH MORE THAN THE TABLES IT FOUND.
//
// test/datarights.test.mjs already proves that the export and the erasure walk ONE manifest,
// USER_DATA_TABLES, so the two can never drift apart from each other. What it cannot see is a
// table that is in NEITHER. A new table is shipped, it is written to from a route, nobody thinks
// about erasure at all, and both doors keep agreeing perfectly about a list that no longer
// describes what we hold. Everything stays green. The manifest becomes a false statement about a
// legal obligation, in the one direction a symmetry test is blind to.
//
// That is exactly what happened. On 8 August 2026 the repo wrote to sixty four tables. Six of them
// held personal data keyed to one man and were in neither door:
//
//   voice_jobs       his user id, HIS PHONE NUMBER, and audio_base64: the recording of his voice
//   support_tickets  his number, his name, and the message he wrote asking for a human
//   contact_events   the timeline hanging off marketing_leads, keyed on the same address
//   company_members  his company's named directors and an invite address, no cascade
//   ai_usage         per day counters whose `key` column IS his phone number in plain text
//   dakiya_drafts    email he sent us, his address and his words, with no retention sweep at all
//
// None of that was written on purpose. It is what happens when the only list is one somebody has
// to remember to edit. So this suite does not hold a list of tables. It DERIVES the list from the
// source, every run, and fails when something in it is unaccounted for. A table added tomorrow
// cannot quietly skip erasure: the build stops until somebody either puts it in the manifest or
// writes down, here, why it does not belong there.
//
// The exemptions carry their reason in the same object, deliberately. A bare allowlist of table
// names is a second list of the kind that caused this, and reading it tells you nothing. A reason
// can be argued with. That is the point.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'service-role-key';

// Stage lib/ so the real module graph imports under node's type stripping, the same way
// test/datarights.test.mjs does.
const stage = mkdtempSync(path.join(tmpdir(), 'tablemanifest-'));
const fixTs = (s) =>
  s.replace(/from '(\.\/[a-zA-Z0-9_.-]+)'/g, (m, p) => (p.endsWith('.ts') ? m : `from '${p}.ts'`));
for (const f of readdirSync(path.join(root, 'lib'))) {
  if (f.endsWith('.ts')) {
    writeFileSync(path.join(stage, f), fixTs(readFileSync(path.join(root, 'lib', f), 'utf8')));
  }
}
const SB = await import(pathToFileURL(path.join(stage, 'supabase.ts')).href);

let pass = 0, fail = 0;
const ok = (desc, cond) => {
  if (cond) { pass++; process.stdout.write(`  ok   ${desc}\n`); }
  else { fail++; process.stdout.write(`  FAIL ${desc}\n`); }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE CENSUS. Read the source, not a list.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Every table reference in this codebase reaches Supabase through PostgREST over fetch, in one of
// three written forms. All three are matched, because a table that arrives by the form we did not
// look for is precisely the table that gets missed:
//
//   1. an interpolated url:      `${url}/rest/v1/transactions?user_id=eq...`
//   2. a path handed to a helper: q('knowledge_items?status=eq.reviewed&select=...')
//   3. a bare table to a helper:  rest('conversations', { method: 'POST', ... })
//
// Form 2 additionally requires a PostgREST operator in the string, so that an ordinary sentence
// ending in a question mark inside a comment or a piece of copy is never mistaken for a query.
const SOURCE_DIRS = ['lib', 'app', 'components', 'scripts'];
const PG_OPERATOR =
  /(^|[?&])(select|order|limit|offset|on_conflict|columns|and|or|not)=|=(eq|neq|gt|gte|lt|lte|like|ilike|in|is|cs|cd|not)\./;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const p = path.join(dir, entry.name);
    // withFileTypes plus an explicit stat guard: a stray toolchain directory carries broken
    // symlinks and a census that crashes on one is a census nobody keeps.
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const files = SOURCE_DIRS
  .map((d) => path.join(root, d))
  .filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } })
  .flatMap((d) => walk(d));

const sightings = new Map(); // table -> [ 'file:line', ... ]
const note = (table, loc) => {
  if (!sightings.has(table)) sightings.set(table, []);
  sightings.get(table).push(loc);
};

const RE_REST_V1 = /rest\/v1\/([A-Za-z_][A-Za-z0-9_]*)/g;
const RE_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(root, file);
  src.split('\n').forEach((line, i) => {
    const loc = `${rel}:${i + 1}`;
    let m;
    RE_REST_V1.lastIndex = 0;
    while ((m = RE_REST_V1.exec(line))) note(m[1], loc);
    RE_LITERAL.lastIndex = 0;
    while ((m = RE_LITERAL.exec(line))) {
      const literal = m[2];
      const withQuery = /^([a-z_][a-z0-9_]*)\?/.exec(literal);
      if (withQuery && PG_OPERATOR.test(literal)) note(withQuery[1], loc);
      const before = line.slice(0, m.index);
      if (/\b(rest|restJson|sbFetch)\s*\($/.test(before) && /^[a-z_][a-z0-9_]*$/.test(literal)) {
        note(literal, loc);
      }
    }
  });
}

// `rpc` is the stored procedure namespace, not a table. Every other name the scan finds is one.
sightings.delete('rpc');
const FOUND = [...sightings.keys()].sort();

console.log(`\nThe census: ${files.length} source files, ${FOUND.length} tables reached over PostgREST.\n`);
ok('the census finds source files to read', files.length > 100);
ok('the census finds tables', FOUND.length > 40);
// The tables the product cannot work without. If the scanner ever stops matching one of the three
// written forms it will quietly find fewer tables and pass everything, so it is pinned against
// names that must always be there, one for each form.
for (const anchor of ['transactions', 'users', 'conversations', 'knowledge_items']) {
  ok(`the scanner still sees ${anchor} (it would pass everything if it saw nothing)`, FOUND.includes(anchor));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 2. WHAT ANSWERS THE TWO DOORS TODAY.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const MANIFEST = SB.USER_DATA_TABLES.map((t) => t.table);

// Handled by name in exportUserData and deleteUserData rather than by the manifest, because each
// answers to BOTH his number and his address and a manifest entry is one table and one key. They
// are not exemptions: they are erased and exported, and test/datarights.test.mjs proves the two
// doors agree about them.
const BY_HAND = ['users', 'subscriptions', 'waitlist'];

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 3. THE EXEMPTIONS, EACH WITH ITS REASON.
//
// 🔴 IF YOU ARE HERE BECAUSE THIS SUITE FAILED ON A TABLE YOU JUST ADDED, READ THIS FIRST.
//
// The question is NOT "is this table about a customer". It is: if a customer exercises UK GDPR
// article 17 tomorrow, does anything in this table still describe him afterwards? A phone number
// on its own is personal data. So is an email address, a name, an ip address, a recording of his
// voice, and a sentence he wrote. If the answer is yes, the fix is a line in USER_DATA_TABLES, not
// a line here.
//
// Only add an entry here when one of these is honestly true, and say WHICH:
//   . the table holds no personal data at all (company or operational data),
//   . it cascades from a row the erasure already deletes, and you have checked the foreign key,
//   . or there is a lawful reason to keep it, which article 17(3) permits and which you can name.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const EXEMPT = {
  // ── Covered by a cascade the erasure already triggers ──────────────────────────────────────
  web_sessions:
    'user_id references auth.users(id) on delete cascade (APPLY_2026-07-27_web_login.sql), and '
    + 'deleteUserData deletes the auth identity last, so every session row goes with it.',

  // ── A lawful reason to keep it, named ─────────────────────────────────────────────────────
  auth_sends:
    'The login abuse ledger. It holds target_hash, an HMAC of the number or address and never the '
    + 'value, so no plaintext identifier survives here. Its whole purpose is refusing to send a '
    + 'code to a stranger, which is the control that protects every OTHER customer account, and '
    + 'auth_sends_sweep already deletes rows past ninety days. Kept as security data on purpose. '
    + 'If that call is ever judged wrong the hash is recomputable and this becomes erasable.',
  processed_messages:
    'The WhatsApp idempotency horizon: one column, the message id Meta gave us, and no content. '
    + 'pruneOldRows deletes it at seven days, which is far beyond Meta retries.',
  stripe_events:
    'The Stripe webhook idempotency ledger: a Stripe event id and its type. The financial record '
    + 'about the man is subscriptions, which the erasure deletes by hand.',

  // ── A different data subject, on a different lawful basis ─────────────────────────────────
  team_members:
    'Lekhio staff, not customers. A different data subject on an employment basis, and not '
    + 'reachable from any customer identity.',

  // ── Pooled or aggregated across everybody, so no row belongs to one man ───────────────────
  vendor_patterns:
    'One row per (vendor_key, category) with a vote count summed across every user. Deduped by '
    + 'design so that no row is anybody\'s in particular. See supabase/memory.sql.',
  qa_cache:
    'The general answer cache. app/api/ask/route.ts writes it only when isGeneralQuestion passes '
    + 'AND every source is recognised, so it carries no personal context, and the table has no '
    + 'user id, email or phone column at all. See the LIVE CHECK on question_sample in the packet.',
  metrics_daily: 'The company revenue history, one row per day. Counts and pence, nobody named.',

  // ── Company and operational data with no per customer identity column ────────────────────
  announcements: 'Product notices a human wrote for everyone. created_by is a member of staff.',
  content_assets: 'Marketing studio: our own scripts, captions and files.',
  content_approvals: 'Who on the team approved a marketing asset, and for how much spend.',
  content_metrics: 'Reach and clicks a platform reported for our own posts.',
  marketing_connectors: 'OUR OAuth tokens for OUR marketing accounts. Not a customer credential.',
  marketing_insights: 'Field observations the founder wrote down. No customer data.',
  support_kb:
    'Our own help articles, keyed by slug. Written by the team through the console and read to '
    + 'answer customers. No customer identity column exists on it.',
  team_todos:
    'The internal work list the console shows the team. from_label names a member of staff, never '
    + 'a customer, and there is no user id, email or phone column.',
  testimonials:
    'A customer\'s quote, name and trade, published with permission. It has NO user id, email or '
    + 'phone column, so an erasure cannot reach it from any identity we hold: withdrawal of that '
    + 'permission is a manual unpublish today. Named in the packet as a live check, not skipped.',
  cron_runs: 'Which scheduled job last ran, and whether it finished.',
  rakha_runs: 'How many users a nudge sweep considered. Counts only.',
  worker_activity: 'What the Mac mini workers did. Keyed by worker_key.',
  worker_heartbeats: 'Whether a worker is alive. Keyed by worker_key.',
  worker_reruns: 'A request to run a worker again. Keyed by worker_key.',
  khoji_law: 'Whether a page of primary law changed under us. Keyed by url.',
  khoji_runs: 'Whether the law watchers ran, and what they checked.',
  khoji_history: 'The history of a tax CONSTANT, keyed by fact_key. Nobody\'s figures.',
  knowledge_items: 'GOV.UK findings and their review state. Public law, reviewed by staff.',
  fact_overrides: 'A tax constant we have overridden, with the source url that justifies it.',
};

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 4. THE RATCHET ITSELF.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const accountedFor = new Set([...MANIFEST, ...BY_HAND, ...Object.keys(EXEMPT)]);

console.log('\nEvery table the repo writes to is answerable at both doors, or exempt with a reason.\n');
{
  const unaccounted = FOUND.filter((t) => !accountedFor.has(t));
  for (const t of unaccounted) {
    console.log(`        UNACCOUNTED: ${t}`);
    console.log(`          first written at ${sightings.get(t)[0]}`);
    console.log('          Add it to USER_DATA_TABLES in lib/supabase.ts, or to EXEMPT above WITH A REASON.');
  }
  ok('🔴 no table the repo writes to is missing from both the manifest and the exemptions',
    unaccounted.length === 0);
}

// The six that were found missing on 8 August 2026, named, so a regression that drops one of them
// is the original defect coming back rather than a number moving in a summary line.
console.log('\nThe six that were in neither door, named.\n');
for (const t of ['voice_jobs', 'support_tickets', 'contact_events', 'company_members', 'ai_usage', 'dakiya_drafts']) {
  ok(`${t} is in USER_DATA_TABLES`, MANIFEST.includes(t));
}

// The sharpest of them, pinned on the property that made it sharp rather than on its name.
console.log('\nThe voice note queue, on the columns that made it the worst of the six.\n');
{
  const entry = SB.USER_DATA_TABLES.find((t) => t.table === 'voice_jobs');
  ok('voice_jobs is erased by user_id, the only key every row carries', !!entry && entry.userKey === 'user_id');
  ok('the export hands back the shape of the job', !!entry && entry.select.includes('from_phone'));
  ok('the export does NOT inline the recording, which would break the download itself',
    !!entry && !entry.select.split(',').map((c) => c.trim()).includes('audio_base64'));
  // The erasure ignores `select` entirely and issues a bare filtered DELETE, so withholding the
  // audio from the EXPORT cannot leave it sitting in the bucket of rows after an erasure.
  const supabaseSrc = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
  const deleteFn = supabaseSrc.slice(supabaseSrc.indexOf('export async function deleteUserData'));
  ok('and the erasure takes the whole row anyway, because it never names columns',
    /await del\(`\$\{t\.table\}\?\$\{t\.userKey\}=eq\./.test(deleteFn) && !deleteFn.includes('t.select'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 5. THE EXEMPTION LIST MUST STAY HONEST.
//
// A reason nobody can read is not a reason, and an exemption for a table that no longer exists is
// a list rotting quietly, which is the disease this whole file treats.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nThe exemptions themselves.\n');
{
  const stale = Object.keys(EXEMPT).filter((t) => !FOUND.includes(t));
  stale.forEach((t) => console.log(`        exempt but no longer written to anywhere: ${t}`));
  ok('no exemption names a table the code no longer writes to', stale.length === 0);

  const both = Object.keys(EXEMPT).filter((t) => MANIFEST.includes(t) || BY_HAND.includes(t));
  both.forEach((t) => console.log(`        both erased and exempt, which cannot both be true: ${t}`));
  ok('nothing is both in the manifest and exempt from it', both.length === 0);

  const thin = Object.entries(EXEMPT).filter(([, reason]) => typeof reason !== 'string' || reason.trim().length < 40);
  thin.forEach(([t]) => console.log(`        exemption reason too thin to argue with: ${t}`));
  ok('every exemption carries a reason somebody could disagree with', thin.length === 0);

  ok('every manifest table is also one the code actually writes to',
    MANIFEST.every((t) => FOUND.includes(t)));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
