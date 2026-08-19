// SABOTAGE B33. THE REGION GATE. Put each half of it back the way it was and make the guards bite.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// A green suite proves the code passes the suite. It does not prove the suite would notice the
// gate coming down. Each sabotage below breaks one part of B33 on a scratch copy of the repo and
// test/regiongate.test.mjs (or test/startdraft.test.mjs) has to go red. One that stays green is a
// hole, and a hole here is a man in the wrong country being walked through fifteen minutes of
// interview, or a blocked screen quietly starting to promise things again.
//
// The disciplines this repo has learned, applied throughout:
//   1. ANCHOR ON THE WORK, never on a variable name, and never at the EDGE of a list.
//   2. KILL EVERY CALL SITE, or the sabotage is a no op and the green means nothing.
//   3. NO OP CONTROLS, including one that renames a local CONSISTENTLY, which is the only thing
//      that can see a guard anchored on an identifier. B30 was caught twice by exactly that.
//   4. baseline() FIRST. A pass measures a DIFFERENCE and cannot otherwise tell a caught sabotage
//      from a harness that reds on everything.
//   5. A SPECIMEN THAT CANNOT EXPIRE. Nothing here is anchored on a thing we are hoping to change.
//
//   node test/sabotage-b33regiongate.mjs
//   SAB_FROM=0 SAB_TO=8 SAB_SKIP_CONTROLS=1 node test/sabotage-b33regiongate.mjs   (a slice)
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// ⚠️ supabase/ IS COPIED, AND IT IS NOT DECORATION. regiongate.test.mjs reads the migration off
// disk. A tree without it does not FAIL the suite, it CRASHES it, so every sabotage would score
// as caught and every control as broken. That cost this repo a run once already.
function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'sab-b33-'));
  for (const d of ['lib', 'test', 'app', 'supabase']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  cpSync(path.join(root, 'proxy.ts'), path.join(dir, 'proxy.ts'));
  return dir;
}

// The two suites this packet's work lives under. regiongate holds the gate and the copy;
// startdraft holds the clamp, executable rather than read off the source.
const SUITES = ['test/regiongate.test.mjs', 'test/startdraft.test.mjs'];

// ⚠️ THE TALLY LINE IS NOT THE SAME IN EVERY SUITE AND THIS PASS DOES NOT ASSUME IT IS. Thirty
// suites in this repo end without a full stop. Rather than carry a regex that is right for two
// files today, a suite is RED when it exits non zero, which is the thing both of them do, and the
// tally is only consulted as a second opinion. baseline() proves the whole arrangement first.
function runSuite(dir, suite) {
  try {
    const out = execFileSync('node', [path.join(dir, suite)], {
      cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { red: /[1-9]\d* failed/.test(out), out };
  } catch (e) {
    return { red: true, out: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}
function runAll(dir) {
  for (const s of SUITES) {
    const r = runSuite(dir, s);
    if (r.red) return true;
  }
  return false;
}

// 🔴 PROVE AN UNMODIFIED TREE IS GREEN BEFORE SCORING ANYTHING. It costs one tree.
function baseline() {
  const dir = scratch();
  const red = runAll(dir);
  rmSync(dir, { recursive: true, force: true });
  if (red) {
    console.log('🔴 BROKEN HARNESS: an UNMODIFIED scratch tree is already RED.');
    console.log('   Nothing below would mean anything. Check, in this order:');
    console.log('   1. every directory these suites READ is copied by scratch() (supabase/ is one)');
    console.log('   2. proxy.ts is copied too, because regiongate section 6 reads it');
    console.log('   3. df -h on TMPDIR: a suite that dies of ENOSPC scores as caught');
    process.exit(1);
  }
  console.log('BASELINE: an unmodified scratch tree is GREEN, so a red below is the sabotage.\n');
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};

const SABOTAGES = [
  // ── The gate on the screen ───────────────────────────────────────────────────────────────
  {
    name: 'step one stops asking for the confirmation, so the tick is decoration',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'if (step === 1) return region && emailValid', 'if (step === 1) return emailValid'),
  },
  {
    name: 'the memo stops watching it, so ticking the box leaves Continue dead',
    apply: (d) => edit(d, 'app/start/page.tsx',
      '}, [step, region, phone, phoneReady,', '}, [step, phone, phoneReady,'),
  },
  {
    name: 'the tick is drawn but never bound, so it can never be ticked',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'checked={region}', 'checked={false}'),
  },
  // ── The gate on the server, which is the half that is actually a gate ───────────────────
  {
    name: 'the door stops refusing, so anything that skips the screen mints an account',
    apply: (d) => edit(d, 'app/api/onboard/route.ts',
      'if (b.regionConfirmed !== true) {', 'if (false) {'),
  },
  {
    name: 'the signup stops sending the confirmation at all',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'regionConfirmed: region,', ''),
  },
  {
    name: 'the confirmation is sent as a constant true, whatever he ticked',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'regionConfirmed: region,', 'regionConfirmed: true,'),
  },
  // ── The draft, which is the only real way past a client side tick ───────────────────────
  {
    name: 'a restored draft resumes past the only screen that asks',
    apply: (d) => edit(d, 'app/start/draft.ts',
      'step: d.region === true && typeof d.step', 'step: typeof d.step'),
  },
  {
    name: 'a hand edited store can tick the box with any truthy value',
    apply: (d) => edit(d, 'app/start/draft.ts',
      'region: d.region === true,', 'region: Boolean(d.region),'),
  },
  {
    name: 'the draft stops carrying it, so every refresh loses the answer',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'v: 1, t0, step, region, phone,', 'v: 1, t0, step, region: false, phone,'),
  },
  // ── The one constant. This is the rule the whole file exists for. ───────────────────────
  {
    name: 'the region name is typed a second time instead of derived',
    apply: (d) => edit(d, 'lib/region.ts',
      'return `I live in ${REGION}.`;',
      "return 'I live in England, Wales or Northern Ireland.';"),
  },
  {
    name: 'the screen types the region name rather than asking the module',
    apply: (d) => edit(d, 'app/start/page.tsx',
      '{regionConfirmLabel()}', "{'I live in England, Wales or Northern Ireland.'}"),
  },
  {
    name: 'the rates wording becomes its own constant, so one word changes half the gate',
    apply: (d) => edit(d, 'lib/region.ts',
      "export const REGION_AND = REGION.replace(' or ', ' and ');",
      "export const REGION_AND = 'England, Wales and Northern Ireland';"),
  },
  {
    name: 'the waitlist tag stops being derived, so a new region tags rows with the old one',
    apply: (d) => edit(d, 'lib/region.ts',
      "export const REGION_TAG = REGION.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');",
      "export const REGION_TAG = 'uk';"),
  },
  // ── The blocked screen starts promising. Four different ways, because it is four rules. ──
  {
    name: 'the blocked screen promises a timeline',
    apply: (d) => edit(d, 'lib/region.ts',
      "return 'Leave your email and we will write to you if that changes. It will not be used for anything else.';",
      "return 'More regions are coming soon. Leave your email and we will tell you the moment yours is ready.';"),
  },
  {
    name: 'the blocked screen names the country it guesses he is in',
    apply: (d) => edit(d, 'lib/region.ts',
      'return `Lekhio works your tax out at ${REGION_AND} rates, and it does not do any others. Putting you through the setup would only end in a number that is wrong for you.`;',
      'return `Lekhio works your tax out at ${REGION_AND} rates. Scotland is not modelled yet.`;'),
  },
  {
    name: 'the blocked screen claims what will be supported',
    apply: (d) => edit(d, 'lib/region.ts',
      "return 'Lekhio is not set up for where you are.';",
      "return 'Your area will be supported shortly.';"),
  },
  {
    name: 'the thank you becomes a commitment rather than a condition',
    apply: (d) => edit(d, 'lib/region.ts',
      "return 'We have got your address. You will not hear from us unless that changes.';",
      "return 'We have got your address. We will be in touch the moment we open up.';"),
  },
  // ── The waitlist capture ────────────────────────────────────────────────────────────────
  {
    name: 'the route goes back to demanding a mobile number, so the address is refused',
    apply: (d) => edit(d, 'app/api/waitlist/route.ts',
      'if (!phone && !email) {', 'if (!phone) {'),
  },
  {
    name: 'the region is taken as typed rather than validated as a slug',
    apply: (d) => edit(d, 'app/api/waitlist/route.ts',
      "typeof rawRegion === 'string' && /^[a-z0-9-]{1,60}$/.test(rawRegion.trim())",
      "typeof rawRegion === 'string'"),
  },
  {
    name: 'the tag never reaches the insert, so the list stops being segmentable',
    apply: (d) => edit(d, 'app/api/waitlist/route.ts',
      'insertWaitlistSignup({ phone, email, region })', 'insertWaitlistSignup({ phone, email })'),
  },
  {
    name: 'the screen stops tagging the row at all',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'body: JSON.stringify({ email: regionEmail.trim(), region: REGION_TAG }),',
      'body: JSON.stringify({ email: regionEmail.trim() }),'),
  },
  {
    name: 'the turned away man gets the welcome email that promises him a spot and a trial',
    apply: (d) => edit(d, 'app/api/waitlist/route.ts',
      "if (email && !region && outcome === 'inserted') {", "if (email && outcome === 'inserted') {"),
  },
  {
    name: 'the insert stops writing the tag',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'if (signup.region) record.region = signup.region;', ''),
  },
  {
    name: 'a missing column drops the ADDRESS rather than the tag',
    apply: (d) => edit(d, 'lib/supabase.ts',
      "if (res.status === 400 && record.region) {", 'if (false) {'),
  },
  {
    name: 'the phone is assumed again, so an email only row writes a column nobody gave us',
    apply: (d) => edit(d, 'lib/supabase.ts',
      'if (signup.phone) record.phone = normalizeUkPhone(signup.phone);',
      'record.phone = normalizeUkPhone(signup.phone ?? "");'),
  },
  {
    // The claim that /early-access cannot reach the relaxed branch is only worth making while its
    // own check is there. Take the check away and the claim has to go red with it.
    name: 'the marketing waitlist drops its own phone check, so the relaxation reaches it',
    apply: (d) => edit(d, 'app/early-access/page.tsx',
      'if (cleaned.length < 10) {', 'if (false) {'),
  },
  // ── The blast radius. It gates NEW onboarding and nothing else. ─────────────────────────
  {
    name: 'the gate spreads to the signed in setup interview',
    apply: (d) => edit(d, 'app/app/setup/page.tsx',
      "import { A11Y_CSS, APP_THEME_CSS, FONT, RADIUS } from '../../../lib/tokens';",
      "import { A11Y_CSS, APP_THEME_CSS, FONT, RADIUS } from '../../../lib/tokens';\nimport { regionConfirmLabel } from '../../../lib/region';"),
  },
  {
    name: 'the migration backfills a region onto everybody already on the list',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-18_waitlist_region.sql',
      'alter table public.waitlist add column if not exists region text;',
      "alter table public.waitlist add column if not exists region text;\nupdate public.waitlist set region = 'england-wales-or-northern-ireland' where region is null;"),
  },
  {
    // ⚠️ THE TWO CHROME BLOCKS ARE SABOTAGED SEPARATELY, BECAUSE THEY ARE TWO DIFFERENT COMPONENTS
    // AND ONE OF THEM GOT THROUGH THE FIRST PUSH. Each anchor carries the tail of its own comment
    // so it cannot match the other one: `edit` replaces EVERY occurrence, so a bare conditional
    // would knock out both and pass for one sabotage while hiding the other.
    name: 'the Continue footer is drawn under the blocked screen',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'disappoint. */}\n      {!done && !billingResult && !blocked && (',
      'disappoint. */}\n      {!done && !billingResult && ('),
  },
  {
    // 🔴 THE ONE PRODUCTION FOUND. The bar read "STEP 1 OF 6" and "10 to 15 minutes in total" over
    // a heading saying there is no setup for him: two false promises in the chrome, where no
    // assertion in this repo was looking, on a screen whose entire job is to be honest.
    name: 'the progress bar promises him a fifteen minute setup he cannot have',
    apply: (d) => edit(d, 'app/start/page.tsx',
      'read the whole screen. */}\n      {!done && !billingResult && !blocked && (',
      'read the whole screen. */}\n      {!done && !billingResult && ('),
  },
];

// NO OP CONTROLS. Each changes the files without changing one thing a customer can see, and each
// must stay GREEN. A control that cannot be APPLIED is worse than a sabotage that cannot be
// applied: it reports BAD while hiding behind a number that still looks nearly full.
const CONTROLS = [
  {
    // 🔴 THE ONE THAT MATTERS MOST, AND B30 IS WHY. Renaming a local CONSISTENTLY is invisible to
    // a customer, and it is the only thing that can see a guard anchored on an identifier rather
    // than on the work. Two of B30's guards died to this and nothing in the gate could see them.
    name: 'the blocked screen state is renamed, consistently',
    apply: (d) => {
      for (const [from, to] of [
        ['const [blocked, setBlocked] = useState(false);', 'const [turnedAway, setTurnedAway] = useState(false);'],
        ['setBlocked(true)', 'setTurnedAway(true)'],
        ['setBlocked(false)', 'setTurnedAway(false)'],
        ['!billingResult && !blocked &&', '!billingResult && !turnedAway &&'],
        [') : blocked ? (', ') : turnedAway ? ('],
      ]) edit(d, 'app/start/page.tsx', from, to);
    },
  },
  {
    // The same again on the tick's own state, which three guards read by name.
    name: 'the tick state is renamed, consistently',
    apply: (d) => {
      for (const [from, to] of [
        ['const [region, setRegion] = useState(false);', 'const [inRegion, setInRegion] = useState(false);'],
        ['checked={region}', 'checked={inRegion}'],
        ['onChange={(e) => setRegion(e.target.checked)}', 'onChange={(e) => setInRegion(e.target.checked)}'],
        ['if (step === 1) return region && emailValid', 'if (step === 1) return inRegion && emailValid'],
        ['}, [step, region, phone, phoneReady,', '}, [step, inRegion, phone, phoneReady,'],
        ['setRegion(found.region);', 'setInRegion(found.region);'],
        ['setRegion(false);', 'setInRegion(false);'],
        ['v: 1, t0, step, region, phone,', 'v: 1, t0, step, region: inRegion, phone,'],
        ['customTrade, postcode, address, vat, streams]);', 'customTrade, postcode, address, vat, streams]);'],
        ['regionConfirmed: region,', 'regionConfirmed: inRegion,'],
        ['}, [hydrated, done, t0, step, region, phone,', '}, [hydrated, done, t0, step, inRegion, phone,'],
      ]) edit(d, 'app/start/page.tsx', from, to);
    },
  },
  {
    // ⚠️ ANCHORED IN THE MIDDLE OF THE ARGUMENT, NOT AT ITS EDGE. A comment block is exactly the
    // kind of list that grows, and this repo lost three sabotages in one line edit to an anchor
    // that quoted a closing bracket.
    name: 'a comment is reworded inside lib/region.ts',
    apply: (d) => edit(d, 'lib/region.ts',
      '// The region name appears in the tick, in the heading, in the body, in the way back and in the',
      '// The region name shows up in the tick, in the heading, in the body, in the way back and in the'),
  },
  {
    name: 'a comment is added inside the blocked screen',
    apply: (d) => edit(d, 'app/start/page.tsx',
      '              {regionListed ? (',
      '              {/* The two halves of the capture. */}\n              {regionListed ? ('),
  },
  {
    name: 'the migration gains a line of its own explanation',
    apply: (d) => edit(d, 'supabase/APPLY_2026-08-18_waitlist_region.sql',
      '-- REVERSIBLE? Yes, completely:',
      '-- Nothing above this line touches a row that already exists.\n-- REVERSIBLE? Yes, completely:'),
  },
  {
    name: 'blank lines are added around the server side refusal',
    apply: (d) => edit(d, 'app/api/onboard/route.ts',
      '    if (b.regionConfirmed !== true) {',
      '\n    if (b.regionConfirmed !== true) {'),
  },
];

// SLICING, so this pass can be run inside Cowork at all: every shell call there is capped at 45
// seconds in a fresh sandbox and a detached process does not survive between calls. A sliced run
// SAYS SO, loudly, so nobody reads a partial figure as the whole pass.
const FROM = Number(process.env.SAB_FROM ?? 0);
const TO = Number(process.env.SAB_TO ?? SABOTAGES.length);
const RUNNING = SABOTAGES.slice(FROM, TO);
if (RUNNING.length !== SABOTAGES.length) {
  console.log(`SLICE: sabotages ${FROM}..${TO - 1} of ${SABOTAGES.length}. NOT THE WHOLE PASS.`);
}

baseline();

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of RUNNING) {
  const dir = scratch();
  try {
    s.apply(dir);
  } catch (e) {
    missed += 1;
    console.log(`  MISSED ${s.name}  [${e.message}]`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  if (runAll(dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

let controlsOk = 0, controlsBad = 0;
const SKIP_CONTROLS = process.env.SAB_SKIP_CONTROLS === '1';
console.log(SKIP_CONTROLS ? '\nCONTROLS SKIPPED (SAB_SKIP_CONTROLS=1)' : '\nCONTROLS (each must stay GREEN)');
for (const c of (SKIP_CONTROLS ? [] : CONTROLS)) {
  const dir = scratch();
  try {
    c.apply(dir);
  } catch (e) {
    controlsBad += 1;
    console.log(`  BAD ${c.name}  [${e.message}]`);
    rmSync(dir, { recursive: true, force: true });
    continue;
  }
  if (runAll(dir)) { controlsBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { controlsOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(dir, { recursive: true, force: true });
}

// The denominators are what was RUN, not what exists, or a slice prints a hole it never had.
const ranControls = SKIP_CONTROLS ? 0 : CONTROLS.length;
console.log('');
console.log(`${caught}/${RUNNING.length} sabotages caught, ${controlsOk}/${ranControls} controls green.`);
if (RUNNING.length !== SABOTAGES.length || SKIP_CONTROLS) console.log('NOT THE WHOLE PASS.');
if (missed > 0 || controlsBad > 0) process.exit(1);
