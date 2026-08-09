// EVERY PLACE THIS PRODUCT READS AN HTTP BODY, AND WHAT HAPPENS WHEN THAT BODY IS NOT JSON.
//
//   node test/readsweep.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT CLASS, AND WHY IT GETS A SWEEP RATHER THAN ANOTHER ONE OFF.
//
// Three files were fixed for the same bug on 9 August 2026, hours apart, each found by looking at
// the one in front of it:
//
//   lib/claude.ts    nine entry points, the customer's question silently unanswered
//   lib/stripe.ts    four, and the throw jumped over an apology written for the failure
//   lib/voicejobs.ts one, and a parked voice note was asked for a second time
//
// All three were the same three lines:
//
//     if (!res.ok) { ...return <fallback>; }
//     const rows = (await res.json()) as T;
//
// That guard is correct and it is not the guard that is missing. It catches a 4xx and a 5xx. It
// does nothing whatever about a TWO HUNDRED CARRYING HTML, which is what an edge, a proxy, a
// captive network or a corporate filter returns when it answers on the origin's behalf. res.json()
// then THROWS, and where the throw lands is decided by whichever caller happens to have a try.
//
// 🔴 A THIRD FIX OF THE SAME BUG IS A SIGN THAT THE FIX SHOULD BE A RULE. So this file is the rule.
// It reads the source, finds every outbound body parse in lib/ and app/api, works out whether a
// throw could leave the function, and FAILS IF THERE IS EVEN ONE that is not either
//
//   (a) inside a try in its own function, or
//   (b) carrying .catch() on the expression itself, or
//   (c) on the short, named, justified list below.
//
// ⚠️ THE LIST IS THE POINT, NOT AN ESCAPE HATCH. Two functions in this codebase THROW ON PURPOSE
// on a bad status, and their callers are written around that. Converting them would be the wrong
// fix. They are named here with their reason, so the next person adding to this list has to write
// down why, and anyone reading it can disagree.
//
// ⚠️ AND THE INBOUND SIDE IS SWEPT TOO. req.json() on a request body a stranger controls is the
// same failure with a shorter fuse: a POST with a malformed body would 500 the route instead of
// answering 400. All of them were already guarded when this was written, and this keeps it so.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    process.stdout.write(`\n  FAIL  ${name}`);
  }
};

// ── Every .ts under lib/ and app/api. ────────────────────────────────────────────────────────
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full);
  }
  return out;
}
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SCOPE, AND WHAT IS KNOWINGLY OUTSIDE IT. Written 9 August 2026, after a walkthrough audit
// found the gap by reading, which is the slow way to find it.
//
// lib/ and app/api are the customer's money paths and they are swept in full. app/team is the
// internal staff console, and it holds roughly thirty of the SAME shape: a client side
// `await res.json()` after an `if (res.ok)`, which throws on a 200 carrying HTML exactly like every
// site fixed in pushes 15 and 16.
//
// ⚠️ IT IS NOT SWEPT YET, AND A SILENT CAP IS A LIE. This codebase's rule is that a guard which
// bounds its own coverage says so out loud, because a green suite reads as "there are none of these
// anywhere" whether or not that is what it checked. So the number is PRINTED on every run.
//
// Why it is not simply fixed tonight: those are React handlers where a throw shows a stuck button
// to a member of staff who can press it again, not a wrong figure to a customer who cannot. Same
// defect, different blast radius. And a thirty file sweep on launch eve is how a launch acquires a
// new defect. It is on the list rather than in the dark.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const files = [...walk(path.join(root, 'lib')), ...walk(path.join(root, 'app/api'))];

ok('🔴 THE SWEEP FOUND FILES TO SWEEP, without which a clean result means nothing',
  files.length > 60);

// ⚠️ PRINTED, NOT ASSERTED. An assertion here would go red as the console grows and be switched off
// the first time that was inconvenient, which is how a known gap becomes an unknown one. This has
// to stay VISIBLE rather than enforced.
{
  const team = walk(path.join(root, 'app/team'));
  let unguarded = 0;
  for (const f of team) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (/await\s+\w+\.json\(\)/.test(line) && !/\.catch\(/.test(line)) unguarded += 1;
    }
  }
  process.stdout.write(
    `\n  NOTE  app/team is OUTSIDE this sweep: ${unguarded} unguarded parse${unguarded === 1 ? '' : 's'}`
    + ` across ${team.length} staff console files. Internal only, tracked, not swept.\n`,
  );
}

// ═══ THE JUSTIFIED LIST. Anything added here must carry its reason. ═════════════════════════
const ALLOWED = [
  {
    fn: 'loadFactOverrides',
    why: 'It throws deliberately on a bad status one line above, and lib/facts.ts refreshFacts() '
      + 'wraps the call in a try that returns []. Converting it here would put the decision in two '
      + 'places. Verified: refreshFacts is the only caller.',
  },
  {
    fn: 'readAllowanceElection',
    why: 'Same shape. It throws on a bad status by design and every caller is written around that, '
      + 'so a quiet fallback here would hide a failure the callers currently see.',
  },
];

// ── The scan. A parse is SAFE if it carries .catch on the expression, or the enclosing function
//    has a try before it. Anything else is reported by file, line and function. ───────────────
const parse = /await\s+(?:\(\s*)?([A-Za-z_$][\w$]*)\s*\.json\s*\(\)/;
// ⚠️ ANCHORED AT COLUMN ZERO, and the first version was not. `^\\s*const (\\w+) = \\(` matched
// `  const rows = (await res.json()) as T` ITSELF, so the enclosing function was reported as
// `rows()` and the backward scan for a try started on the parse line and found nothing. It
// reported fourteen files as unguarded that are perfectly guarded. A detector that cannot
// find the function cannot say anything true about what is inside it.
const fnStart = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^const\s+(\w+)\s*=\s*async/;

const outbound = [];
const inbound = [];
for (const file of files) {
  const rel = path.relative(root, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    // A comment is not code. Several of these files quote the old line on purpose, because a
    // defect note that will not name the defect is worth nothing to the next reader.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    const m = parse.exec(line);
    if (!m) continue;
    // NextResponse.json(...) / Response.json(...) construct a response, they do not read one.
    if (/(?:NextResponse|Response)\s*\.json\s*\(/.test(line)) continue;

    const obj = m[1];
    let name = '(top level)';
    let start = 0;
    for (let j = i; j >= 0; j -= 1) {
      const f = fnStart.exec(lines[j]);
      if (f) {
        name = f[1] || f[2] || name;
        start = j;
        break;
      }
    }
    const hasCatch = /\.json\s*\(\)\s*\.catch\s*\(/.test(line);
    // ⚠️ A try ON THE SAME LINE COUNTS. `try { body = (await req.json()) as B; } catch { }` is a
    // whole guard written on one line, and scanning only the lines ABOVE reported two perfectly
    // guarded routes as unguarded. The second false positive this detector produced, and the same
    // lesson: a guard that cannot see the guard is not a guard.
    let hasTry = /\btry\s*\{/.test(line);
    for (let j = start; j < i; j += 1) {
      if (/^\s*(\/\/|\*|\/\*)/.test(lines[j])) continue;
      if (/\btry\s*\{/.test(lines[j])) { hasTry = true; break; }
    }
    const site = { rel, line: i + 1, name, safe: hasCatch || hasTry, text: line.trim().slice(0, 80) };
    (obj === 'req' || obj === 'request' ? inbound : outbound).push(site);
  }
}

ok('🔴 THE SCAN FOUND PARSES AT ALL, so a green result is not an empty set',
  outbound.length > 40);
ok('and it found the inbound side too',
  inbound.length > 5);

// ── The verdict. ─────────────────────────────────────────────────────────────────────────────
const allowed = new Set(ALLOWED.map((a) => a.fn));
const unguardedOut = outbound.filter((s) => !s.safe && !allowed.has(s.name));
const unguardedIn = inbound.filter((s) => !s.safe);

if (unguardedOut.length > 0) {
  process.stdout.write('\n\n  🔴 UNGUARDED OUTBOUND BODY PARSES. A 200 carrying HTML throws out of each of these:\n');
  for (const s of unguardedOut) process.stdout.write(`       ${s.rel}:${s.line}  ${s.name}()  ${s.text}\n`);
  process.stdout.write('     Fix: put .catch(() => null) on the parse and return the SAME fallback the\n'
    + '     !res.ok branch above it returns, because a body we cannot read and a status we do not\n'
    + '     like mean the same thing: we do not know. If the write already SUCCEEDED, null is a\n'
    + '     lie and it needs a recovery read instead: see recoverInsertedId in lib/supabase.ts.\n'
    + '     If it must keep throwing, add it to ALLOWED above WITH ITS REASON.\n');
}
ok('🔴 NOT ONE OUTBOUND BODY PARSE CAN THROW OUT OF ITS FUNCTION',
  unguardedOut.length === 0);

if (unguardedIn.length > 0) {
  process.stdout.write('\n  🔴 UNGUARDED INBOUND req.json(). A malformed POST body 500s instead of answering 400:\n');
  for (const s of unguardedIn) process.stdout.write(`       ${s.rel}:${s.line}  ${s.name}()\n`);
}
ok('🔴 AND NOT ONE INBOUND req.json() EITHER, so a malformed POST is a 400 and never a 500',
  unguardedIn.length === 0);

// ── The list stays short and stays explained. ────────────────────────────────────────────────
ok('every name on the justified list carries a reason somebody can disagree with',
  ALLOWED.every((a) => typeof a.why === 'string' && a.why.length > 60));
ok('🔴 AND THE LIST IS STILL SHORT. Growing it is how a rule becomes a formality',
  ALLOWED.length <= 4);
ok('and every name on it is a function that really exists in the tree',
  ALLOWED.every((a) => files.some((f) => readFileSync(f, 'utf8').includes(`function ${a.fn}(`))));

// ── The three helpers this sweep grew out of are still doing their job. ──────────────────────
// ⚠️ ASSERTED HERE TOO, because the scan above would go green on a lib/claude.ts that had been
// reverted to something worse, so long as the revert happened to sit inside a try.
const claude = readFileSync(path.join(root, 'lib/claude.ts'), 'utf8');
const stripe = readFileSync(path.join(root, 'lib/stripe.ts'), 'utf8');
const supa = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');
ok('🔴 THE THREE READERS STILL EXIST AND ARE STILL NAMED',
  /async function readClaudeReply\(/.test(claude)
  && /async function readStripeJson<T>\(/.test(stripe)
  && /async function recoverInsertedId\(/.test(supa));
ok('🔴 AND NONE OF THEM LOGS THE BODY, which can carry a customer\'s own words or address',
  /bytes\)`/.test(claude) && /bytes\)`/.test(stripe));

// ── The two writes that cannot answer null, because null would be a lie. ─────────────────────
ok('🔴 createInvoice RECOVERS THE ROW IT WROTE rather than making him mint a second number',
  /const recovered = await recoverInsertedId\(/.test(supa)
  && /&number=eq\.\$\{encodeURIComponent\(number\)\}/.test(supa));
ok('🔴 AND createBookShare RECOVERS THE GRANT, rather than leaving a live share he cannot revoke',
  /\[createBookShare\] the reply was unreadable/.test(supa)
  && /revoked_at=is\.null/.test(supa));

process.stdout.write(`\n  ${pass} passed, ${fail} failed\n`);
if (fail > 0) process.exit(1);
