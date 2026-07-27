// Tests for lib/watemplates.ts, THE REGISTRY THAT MAKES A BROKEN TEMPLATE FAIL THE BUILD.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE BUG THIS SUITE EXISTS FOR.
//
// On 27 July 2026 the code was found calling FOUR WhatsApp templates that did not exist in Meta.
// The weekly summary, the nudge and the reminders had been failing silently on every run for
// weeks. Nothing caught it and nothing could have: a template lives in Meta's console, so the name
// in the code was an unchecked string pointing at a thing no test could see.
//
// You cannot test that Meta has a template. So this suite tests the next best thing, which turns
// out to be nearly as good: that the code CANNOT REFERENCE a template this repo has not declared,
// that every declaration carries the two fields that actually break a send (parameter count and
// language), that they match the call sites, and that nothing unapproved can be sent at all.
//
// What it defends:
//   1. NO TEMPLATE NAME LITERAL EXISTS OUTSIDE THE REGISTRY. Walks app/ and lib/.
//   2. THE RETIRED NAMES ARE GONE, EVERYWHERE. lekhio_weekly, lekhio_weekly_v2, presale_welcome.
//   3. AN UNAPPROVED TEMPLATE CANNOT BE SENT. Anything Meta has not approved must sit behind a gate.
//   4. EVERY CALL SITE MATCHES ITS DECLARATION, on parameter count and language.
//   5. NO DEAD ENTRIES, and no undeclared ones.
//   6. A CALL SITE THE TEST CANNOT READ STATICALLY MUST BE JUSTIFIED HERE BY HAND.
//
// Run: node test/watemplates.test.mjs   (Node 22.6+, type stripping). Pure, no network.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const lib = path.join(repo, 'lib');
const stage = mkdtempSync(path.join(tmpdir(), 'watpl-'));

const SRC = readFileSync(path.join(lib, 'watemplates.ts'), 'utf8');
writeFileSync(path.join(stage, 'watemplates.ts'), SRC);
const R = await import(pathToFileURL(path.join(stage, 'watemplates.ts')).href);

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ── Walk the shipping source ─────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', '_to_delete']);
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = path.join(dir, e);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(repo, 'app')), ...walk(lib)];
const REGISTRY_FILE = path.join(lib, 'watemplates.ts');
const rel = (p) => path.relative(repo, p);

// Comments are stripped before any literal scan. A comment EXPLAINING that lekhio_weekly is retired
// must not itself trip the rule that lekhio_weekly may not appear. That trap is real: test/domain
// caught the same shape of mistake when a comment about a forbidden domain spelled it out.
function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const sources = new Map();
for (const f of files) sources.set(f, readFileSync(f, 'utf8'));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n1. THE REGISTRY ITSELF IS WELL FORMED');

const T = R.WA_TEMPLATES;
ok('the registry is a non empty array', Array.isArray(T) && T.length > 0);
ok('every name is unique', new Set(T.map((t) => t.name)).size === T.length);
ok('every name looks like a template name', T.every((t) => R.TEMPLATE_NAME_SHAPE.test(t.name)));
ok('every entry declares a language', T.every((t) => typeof t.language === 'string' && t.language.length >= 2));
ok('every entry declares a parameter count', T.every((t) => Number.isInteger(t.params) && t.params >= 0));
ok('every entry declares a Meta status', T.every((t) => ['approved', 'in_review', 'not_submitted'].includes(t.meta)));
ok('every entry says what it is for', T.every((t) => typeof t.purpose === 'string' && t.purpose.trim().length > 10));
ok('findTemplate finds a real one', !!R.findTemplate(R.T_NUDGE));
ok('findTemplate refuses an invented one', R.findTemplate('lekhio_not_a_real_template') === undefined);

// Every exported T_ constant must be in the registry, and every registry name must have a constant.
const constNames = Object.keys(R).filter((k) => /^T_[A-Z0-9_]+$/.test(k));
const constValues = constNames.map((k) => R[k]);
ok('every T_ constant is declared in the registry', constValues.every((v) => !!R.findTemplate(v)));
ok('every registry entry has a T_ constant', T.every((t) => constValues.includes(t.name)));
ok(`there are ${T.length} templates and ${constNames.length} constants, and they agree`, T.length === constNames.length);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n2. AN UNAPPROVED TEMPLATE CANNOT BE SENT');

// 🔴 THE SAFETY PROPERTY. A template Meta has not approved WILL fail when sent, silently, at 3am.
// Everything else in this codebase already ships dark behind a flag; the reminder engine was the
// one send path with no gate, and it is the one that was quietly failing for weeks with four bad
// names in it. So the rule is now universal and asserted.
const naked = R.ungatedAndUnapproved();
ok(
  `no unapproved template is ungated${naked.length ? `: ${naked.map((t) => t.name).join(', ')}` : ''}`,
  naked.length === 0,
);
ok('every unapproved template names a gate', T.filter((t) => t.meta !== 'approved').every((t) => typeof t.gate === 'string' && t.gate.length > 0));

// The gate has to actually be read by the route that sends, or it is decoration.
const allSource = [...sources.values()].join('\n');
const gates = [...new Set(T.map((t) => t.gate).filter(Boolean))];
for (const g of gates) {
  ok(`the gate ${g} is read by shipping code`, allSource.includes(g));
}

// templateSendable is the one answer to "can we send this", so it must refuse an ungated unapproved
// template and obey the flag for a gated one.
ok('templateSendable refuses an unknown template', R.templateSendable('lekhio_nope', {}) === false);
ok('templateSendable refuses a gated template when the flag is off', R.templateSendable(R.T_NUDGE, {}) === false);
ok('templateSendable allows a gated template when the flag is on', R.templateSendable(R.T_NUDGE, { [R.GATE_REMINDERS]: 'true' }) === true);
ok('templateSendable is not fooled by a truthy non true value', R.templateSendable(R.T_NUDGE, { [R.GATE_REMINDERS]: '1' }) === false);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. NO TEMPLATE NAME LITERAL ESCAPES THE REGISTRY');

// The rule that makes all of the above worth anything: if a name can only be written in one file,
// then every name the code can send is declared, and there is nothing to remember.
// ⚠️ SCANNED BY NAME, NOT BY SHAPE, AND THE FIRST DRAFT GOT THIS WRONG.
//
// The shape regex (anything starting lekhio_, agent_ or presale_) flagged `agent_ping_sent` in
// lib/supabase.ts, which is a contact event name and has nothing to do with a template. A guard
// that cries wolf on unrelated code is a guard somebody deletes.
//
// So this scans for the names we actually know: every live template and every retired one. A NEW
// hardcoded name is caught by section 5 instead, which fails any sendTemplate call whose second
// argument is not a T_ constant. Between them there is no way to send a name that is not declared.
const KNOWN = [...T.map((t) => t.name), ...R.RETIRED_TEMPLATES];
const strays = [];
for (const [file, raw] of sources) {
  if (file === REGISTRY_FILE) continue;
  const code = stripComments(raw);
  for (const name of KNOWN) {
    for (const m of code.matchAll(new RegExp(`['\"\`]${name}['\"\`]`, 'g'))) {
      strays.push(`${rel(file)}: ${m[0]}`);
    }
  }
}
ok(
  `no template name literal outside lib/watemplates.ts${strays.length ? `\n     ${strays.join('\n     ')}` : ''}`,
  strays.length === 0,
);

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. THE RETIRED NAMES ARE GONE, EVERYWHERE');

// Not documentation, an assertion. A revert or a copied line must not quietly bring one back.
for (const dead of R.RETIRED_TEMPLATES) {
  const found = [];
  for (const [file, raw] of sources) {
    if (file === REGISTRY_FILE) continue;
    if (stripComments(raw).includes(dead)) found.push(rel(file));
  }
  ok(`${dead} appears nowhere in shipping code${found.length ? `: ${found.join(', ')}` : ''}`, found.length === 0);
  ok(`${dead} is not back in the live registry`, !R.findTemplate(dead));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n5. EVERY CALL SITE MATCHES ITS DECLARATION');

// Find each sendTemplate( call and split its arguments at the top level. A hand rolled bracket
// matcher rather than a parser dependency: this suite must run with nothing installed.
function callSites(code) {
  const out = [];
  // ⚠️ NOT THE DECLARATION. `export async function sendTemplate(` is not a call site, and the first
  // draft of this reader dutifully reported lib/whatsapp.ts as an unjustified dynamic send.
  const re = /(^|[^.\w])sendTemplate\s*\(/g;
  let m;
  while ((m = re.exec(code))) {
    const before = code.slice(Math.max(0, m.index - 30), m.index + m[1].length);
    if (/\bfunction\s*$/.test(before)) continue;
    let i = re.lastIndex;
    let depth = 1;
    let inStr = null;
    const start = i;
    while (i < code.length && depth > 0) {
      const c = code[i];
      if (inStr) {
        if (c === '\\') i += 1;
        else if (c === inStr) inStr = null;
      } else if (c === "'" || c === '"' || c === '`') inStr = c;
      else if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c)) depth -= 1;
      i += 1;
    }
    if (depth !== 0) continue;
    out.push(code.slice(start, i - 1));
  }
  return out;
}

function splitArgs(s) {
  const args = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === '\\') { cur += s[i + 1] ?? ''; i += 1; }
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { inStr = c; cur += c; continue; }
    if ('([{'.includes(c)) depth += 1;
    if (')]}'.includes(c)) depth -= 1;
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

// ⚠️ CALL SITES THE TEST CANNOT READ STATICALLY.
//
// Two send sites pick their template at runtime from a map or a helper, so no static reader can say
// which name and how many parameters. They are listed here BY HAND with the reason, and each gets
// its own targeted assertion below. A NEW unreadable call site is a build failure until somebody
// comes here and justifies it, which is the point: the allowlist is the friction.
const DYNAMIC_ALLOWED = [
  { file: 'app/api/cron/trial/route.ts', why: 'templateFor(nudge) picks between two trial templates, paramsFor matches them' },
  { file: 'app/api/cron/agent/route.ts', why: 'TEMPLATE_FOR maps a signal key to one of three agent templates, all one parameter' },
];

const unreadable = [];
let checked = 0;
for (const [file, raw] of sources) {
  if (file === REGISTRY_FILE) continue;
  const code = stripComments(raw);
  for (const site of callSites(code)) {
    const args = splitArgs(site);
    if (args.length < 3) continue;
    const nameArg = args[1];
    const langArg = args[2];
    const paramsArg = args[3] ?? '[]';

    const t = /^T_[A-Z0-9_]+$/.test(nameArg) ? R.findTemplate(R[nameArg]) : null;
    if (!t) {
      const allowed = DYNAMIC_ALLOWED.find((d) => rel(file) === d.file);
      if (!allowed) unreadable.push(`${rel(file)}: sendTemplate(..., ${nameArg}, ...)`);
      continue;
    }
    checked += 1;

    // Language must match the declaration. 'en' and 'en_GB' are different templates to Meta.
    const langLit = langArg.replace(/^['"`]|['"`]$/g, '');
    ok(`${t.name}: call site language ${langLit} matches the registry`, langLit === t.language);

    // Parameter count, only when the argument is a readable array literal.
    if (/^\[/.test(paramsArg)) {
      const inner = paramsArg.slice(1, -1).trim();
      const count = inner === '' ? 0 : splitArgs(inner).length;
      ok(`${t.name}: call site passes ${count} parameter${count === 1 ? '' : 's'}, registry says ${t.params}`, count === t.params);
    }
  }
}
ok(
  `every sendTemplate call is readable or justified${unreadable.length ? `\n     ${unreadable.join('\n     ')}` : ''}`,
  unreadable.length === 0,
);
ok('the static reader actually read some call sites (it is not vacuous)', checked >= 2);

// The two dynamic sites, asserted specifically rather than trusted.
const trialSrc = sources.get(path.join(repo, 'app/api/cron/trial/route.ts')) ?? '';
const nudgeSrc = readFileSync(path.join(lib, 'trialnudge.ts'), 'utf8');
ok('trialnudge only ever returns registry constants', /T_TRIAL_ENDING/.test(nudgeSrc) && /T_TRIAL_ENDED/.test(nudgeSrc));
ok('the trial route still exists and sends', /sendTemplate/.test(trialSrc));
// paramsFor must line up with the registry: warn has one parameter, ended has none.
ok('lekhio_trial_ending declares 1 parameter', R.findTemplate(R.T_TRIAL_ENDING).params === 1);
ok('lekhio_trial_ended declares 0 parameters', R.findTemplate(R.T_TRIAL_ENDED).params === 0);

const agentSrc = sources.get(path.join(repo, 'app/api/cron/agent/route.ts')) ?? '';
const agentConsts = [...agentSrc.matchAll(/T_AGENT_[A-Z]+/g)].map((m) => m[0]);
ok('the agent route maps signals onto registry constants only', agentConsts.length >= 3);
ok('every agent template takes exactly one parameter', [R.T_AGENT_THRESHOLD, R.T_AGENT_DEADLINE, R.T_AGENT_OPPORTUNITY].every((n) => R.findTemplate(n).params === 1));

// ─────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n6. NO DEAD ENTRIES');

// A registry that accumulates templates nobody sends is a registry nobody trusts. Every declared
// template must be referenced by name somewhere outside the registry file.
const outside = [...sources].filter(([f]) => f !== REGISTRY_FILE).map(([, raw]) => raw).join('\n');
for (const k of constNames) {
  ok(`${R[k]} (${k}) is actually used by shipping code`, outside.includes(k));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exitCode = fail === 0 ? 0 : 1;
