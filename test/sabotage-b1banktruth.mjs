// SABOTAGE THE PUBLIC BANK TRUTH. B1, 17 AUGUST 2026.
//
//   node test/sabotage-b1banktruth.mjs
//
// TrueLayer declined production authorisation on 30 July 2026, and the reason nothing in this
// estate had ever recorded is that THEY ARE SCALING AND ARE NOT TAKING ON SMALL BUSINESSES. ICO
// registration completed on 15 July 2026, ZC198977, and was never the blocker. For six weeks after
// that the PUBLIC site went on selling the feed: /product badged it BUILT and SWITCHING ON SOON,
// /compare put a SOON chip in our column of a row where the other apps column ticks, /llms.txt told
// every model on earth it was "waiting on ICO registration and the provider's production access",
// and /privacy named TrueLayer as a processor we use.
//
// 🔴 AND test/llmstxt.test.mjs:108 PINNED THE FALSE SENTENCE IN PLACE. A guard written to stop us
// overclaiming was the thing keeping the overclaim alive, and it would have failed anybody who
// tried to tell the truth. That is the failure this pass exists to make expensive: an assertion
// tied to a SENTENCE outlives the fact and then defends it.
//
// TWO suites hold the repair and this pass runs both, because a sabotage caught by either is caught
// and one caught by NEITHER is the hole:
//   test/frontdoor.test.mjs   the public surfaces, the badges, the marks, the routes and the sweep
//   test/llmstxt.test.mjs     what the machines read, which is the claim that travels furthest
//
// Every sabotage below is a way the finding comes back: a badge asserting a date, a chip borrowing
// filing's word, the two working routes going quiet again, the record naming a processor we do not
// use, or a number in prose drifting away from the code that owns it.
//
// ⚠️ THE SCRATCH TREE COPIES app, lib, test AND components. All four are read: frontdoor walks app
// and components, reads lib, and imports lib/statementimport.ts to count the banks. A tree missing
// one of them does not fail the suite, it CRASHES it, and this pass would then score every sabotage
// as caught and every control as broken. Controls going red together is the tell.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b1bank-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app', 'components']) {
    cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  }
  return { base, dir };
}

// A crashing suite counts as RED. A hand rolled gate that greps for "N failed" scores a suite that
// threw as green, which is how a dead suite once walked all the way into a green CI.
const SUITES = ['test/frontdoor.test.mjs', 'test/llmstxt.test.mjs'];
function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed/.test(out)) return true;
      if (!/\d+ passed, 0 failed/.test(out)) return true;
    } catch { return true; }
  }
  return false;
}

const edit = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.split(from).join(to));
};
// Lifts a code line out and puts it back somewhere else, so "the card is in the wrong section" can
// be sabotaged without quoting a whole page at itself.
const moveLine = (dir, rel, needle, anchor, offset) => {
  const p = path.join(dir, rel);
  const lines = readFileSync(p, 'utf8').split('\n');
  const hit = lines.findIndex((l) => l.includes(needle) && !l.trimStart().startsWith('//'));
  if (hit === -1) throw new Error(`NO CODE LINE in ${rel} carrying: ${needle.slice(0, 50)}`);
  const [moved] = lines.splice(hit, 1);
  const at = lines.findIndex((l) => l.includes(anchor) && !l.trimStart().startsWith('//'));
  if (at === -1) throw new Error(`NO ANCHOR LINE in ${rel} carrying: ${anchor.slice(0, 50)}`);
  lines.splice(at + offset, 0, moved);
  writeFileSync(p, lines.join('\n'));
};

const SABOTAGES = [
  // ── THE BADGE. This is the finding itself, in the words it was actually written in. ────────
  {
    name: '🔴 THE BADGE GOES BACK TO "BUILT · SWITCHING ON SOON", which is what was live for six weeks',
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      "    : { text: 'PLANNED', live: false };", "    : { text: 'BUILT · SWITCHING ON SOON', live: false };"),
  },
  {
    name: 'the badge merely softens to COMING SOON, which is the same claim in a kinder font',
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      "    : { text: 'PLANNED', live: false };", "    : { text: 'COMING SOON', live: false };"),
  },
  // ── THE TWO MARKS. Each direction is its own defect and each is asserted separately. ───────
  {
    name: "🔴 bankMark borrows filing's word and goes back to 'soon', beside a competitor's tick",
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      "  return bankFeedLive() ? true : 'planned';", "  return bankFeedLive() ? true : 'soon';"),
  },
  {
    name: "⚠️ THE OTHER DIRECTION: filingMark collapses into 'planned' and the distinction is lost",
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      "  return hmrcFilingLive() ? true : 'soon';", "  return hmrcFilingLive() ? true : 'planned';"),
  },
  {
    name: "the Cell type drops 'planned', so a stray mark falls through to a raw string",
    apply: ({ dir }) => edit(dir, 'app/compare/page.tsx',
      "type Cell = boolean | 'soon' | 'planned' | 'limit'", "type Cell = boolean | 'soon' | 'limit'"),
  },
  {
    name: '🔴 /compare loses the Planned label, so the mark renders as an unstyled word',
    apply: ({ dir }) => edit(dir, 'app/compare/page.tsx', "planned: 'Planned', ", ''),
  },
  {
    name: "the SOON chip branch is widened to swallow 'planned', which is the chip back by the side door",
    apply: ({ dir }) => edit(dir, 'app/compare/page.tsx',
      "  if (v === 'soon') return <span className=\"mk soon\">SOON</span>;",
      "  if (v === 'soon' || v === 'planned') return <span className=\"mk soon\">SOON</span>;"),
  },
  // ── THE TWO ROUTES THAT WORK. Silence passes every negative, so presence is asserted. ──────
  {
    name: '🔴 THE STATEMENT ROW GOES OFF /compare, so the only capture route shown missing is the one with no provider',
    apply: ({ dir }) => edit(dir, 'app/compare/page.tsx',
      "    { label: 'Import a bank statement, no connection needed', lekhio: true, apps: true, diy: false },\n", ''),
  },
  {
    name: '🔴 /product stops telling the three routes together',
    apply: ({ dir }) => edit(dir, 'app/product/page.tsx',
      '<h2 className="h2">Three ways money gets in. You pick.</h2>',
      '<h2 className="h2">Getting money in.</h2>'),
  },
  {
    name: 'the statement route loses its WORKS TODAY badge and is sold as a future thing',
    apply: ({ dir }) => edit(dir, 'app/product/page.tsx',
      '<h3>Import your statement</h3><p>Export a CSV from your bank and upload it under Money. A whole month lands in one go, and eleven UK banks are read exactly as they hand it out.</p><span className="rbadge live">WORKS TODAY</span>',
      '<h3>Import your statement</h3><p>Export a CSV from your bank and upload it under Money. A whole month lands in one go, and eleven UK banks are read exactly as they hand it out.</p><span className="rbadge soon">COMING SOON</span>'),
  },
  {
    name: '🔴 THE BANK CARD MOVES BACK INTO THE "Soon, Lekhio does the lot" GRID, where the heading makes the claim for it',
    apply: ({ dir }) => moveLine(dir, 'app/product/page.tsx',
      '<h3>Connect your bank</h3>', '<h3>Rakha gets sharper</h3>', 1),
  },
  {
    name: 'the quiet badge is swapped for the saffron soon chip, which says the same thing in colour',
    apply: ({ dir }) => edit(dir, 'app/product/page.tsx',
      "bankBadge().live ? 'rbadge live' : 'rbadge plan'", "bankBadge().live ? 'rbadge live' : 'rbadge soon'"),
  },
  {
    name: '🔴 the connection line stops naming the missing provider and becomes a roadmap notice',
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      "    : 'Money in and out logging itself, read only. We have no open banking provider engaged, so we will not put a date on it. The two routes beside this one are not a stopgap, they are how Lekhio works.';",
      "    : 'Money in and out logging itself, read only. Coming soon.';"),
  },
  {
    name: '⚠️ THE NUMBER IN PROSE DRIFTS AWAY FROM THE IMPORTER THAT OWNS IT',
    apply: ({ dir }) => edit(dir, 'app/product/page.tsx', 'eleven UK banks', 'twelve UK banks'),
  },
  // ── WHAT THE MACHINES READ. The claim that travels furthest and is hardest to withdraw. ────
  {
    name: '🔴 /llms.txt REINSTATES THE EXACT FALSE SENTENCE THE OLD GUARD PINNED',
    apply: ({ dir }) => edit(dir, 'app/llms.txt/route.ts',
      '- A read only bank connection is PLANNED and is not available to anybody.',
      '- The bank feed is built but not yet switched on for the public.'),
  },
  {
    name: '🔴 /llms.txt blames ICO registration again, five weeks after ICO cleared us',
    apply: ({ dir }) => edit(dir, 'app/llms.txt/route.ts',
      'ICO registration is not what holds it up: that completed on 15 July 2026, registration ZC198977.',
      'It is waiting on ICO registration and the provider\'s production access.'),
  },
  {
    name: 'the checkable ICO number goes, so a model has our word and nothing to verify it against',
    apply: ({ dir }) => edit(dir, 'app/llms.txt/route.ts', ', registration ZC198977', ''),
  },
  {
    name: '🔴 /llms.txt goes SILENT about the statement import, which passes every negative and still misleads',
    apply: ({ dir }) => edit(dir, 'app/llms.txt/route.ts',
      'a bank statement CSV uploaded in the app, read in the format eleven UK banks hand it out, so a whole month lands in one go and a hundred lines become about twenty five decisions; ',
      ''),
  },
  {
    name: 'the three route frame collapses back into one sentence about photos',
    apply: ({ dir }) => edit(dir, 'app/llms.txt/route.ts',
      '- Money gets in by whichever of three routes the user picks',
      '- Money gets in by photo, voice note or plain text'),
  },
  // ── THE RECORD. The one document whose whole job is a true list of who touches his data. ───
  {
    name: '🔴 /privacy NAMES TRUELAYER AGAIN, as a processor of data they have never touched',
    apply: ({ dir }) => edit(dir, 'app/privacy/page.tsx',
      '          Today there is no bank connection to make. We are not naming an open banking provider',
      '          Today there is no bank connection to make. If you connect a bank we use TrueLayer, a provider'),
  },
  {
    name: 'the commitment to name the provider BEFORE anybody can connect quietly goes',
    apply: ({ dir }) => edit(dir, 'app/privacy/page.tsx',
      'before a single customer can connect', 'at some point'),
  },
  // ── THE IN APP STEP, WHICH WAS THE CLOSEST CALL OF THE WHOLE PASS. ─────────────────────────
  {
    name: '🔴 the setup step goes back to "The bank feed is on its way", which asserts motion there is none of',
    apply: ({ dir }) => edit(dir, 'app/app/setup/page.tsx',
      '          A bank statement CSV does the job today: download one from your bank and give it to us at',
      '          The bank feed is on its way. Until it lands, a bank statement CSV does the same job: download one from your bank and give it to us at'),
  },
  // ── THE SWEEP ITSELF, on a surface no individual assertion above names. ────────────────────
  {
    name: '🔴 A DATE CREEPS IN BESIDE A BANK SENTENCE ON A SHARED SURFACE, which only the sweep can see',
    apply: ({ dir }) => edit(dir, 'app/_shared/site.tsx',
      "{ label: 'Connect your bank, read only', lekhio: bankMark(), apps: true, diy: false },",
      "{ label: 'Connect your bank, read only, coming soon', lekhio: bankMark(), apps: true, diy: false },"),
  },
];

const CONTROLS = [
  {
    name: 'a comment above the badge is reworded',
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      '// The badge on the "Connect your bank" route card on /product.',
      '// The badge on the "Connect your bank" route card over on /product.'),
  },
  {
    name: '⚠️ THE LIVE BRANCH OF THE ROUTE LINE IS REWORDED, which is the copy for the day a provider lands and must not be frozen',
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      "    ? 'Connect an account read only and money in and out logs itself. Lekhio can see it and can never move it.'",
      "    ? 'Connect an account read only and every payment in and out logs itself. Lekhio can see it and can never move it.'"),
  },
  {
    name: 'the eyebrow above the three routes is reworded, which changes no claim',
    apply: ({ dir }) => edit(dir, 'app/product/page.tsx',
      '<div className="eyebrow">However you want it done</div>',
      '<div className="eyebrow">However you want to do it</div>'),
  },
  {
    name: '⚠️ THE PRIVACY WORDING IS MADE MORE CAREFUL, which is somebody doing the right thing',
    apply: ({ dir }) => edit(dir, 'app/privacy/page.tsx',
      'not move money, make payments, or change anything in your account.',
      'not move money, make a payment, or change anything at all in your account.'),
  },
  {
    name: 'a blank line inside lib/features.ts, which changes nothing anybody reads',
    apply: ({ dir }) => edit(dir, 'lib/features.ts',
      'export function bankRouteLine(): string {\n  return bankFeedLive()',
      'export function bankRouteLine(): string {\n\n  return bankFeedLive()'),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS DOES NOT FIT IN A COWORK SHELL CALL. Every call is capped at 45
// seconds in a fresh sandbox and a detached process does not survive between calls, so a session
// that cannot run the whole pass has to run it in pieces and SAY which pieces it ran. SAB_FROM and
// SAB_TO are indices into the sabotage list; unset means all of it, which is what the Mac runs.
// SAB_SKIP_CONTROLS skips the controls for the same reason.
const FROM = Number(process.env.SAB_FROM ?? 0);
const TO = Number(process.env.SAB_TO ?? SABOTAGES.length);
const RUNNING = SABOTAGES.slice(FROM, TO);
if (RUNNING.length !== SABOTAGES.length) {
  console.log(`SLICE: sabotages ${FROM}..${TO - 1} of ${SABOTAGES.length}. NOT THE WHOLE PASS.`);
}

let caught = 0, missed = 0;
console.log('SABOTAGES (each must go RED)');
for (const s of RUNNING) {
  const t = scratch();
  try { s.apply(t); }
  catch (e) { missed += 1; console.log(`  MISSED ${s.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { caught += 1; console.log(`  ok  ${s.name}`); }
  else { missed += 1; console.log(`  MISSED ${s.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
const RUNNING_C = process.env.SAB_SKIP_CONTROLS ? [] : CONTROLS;
let cOk = 0, cBad = 0;
console.log('\nCONTROLS (each must stay GREEN)');
for (const c of RUNNING_C) {
  const t = scratch();
  try { c.apply(t); }
  catch (e) { cBad += 1; console.log(`  BAD ${c.name}  [${e.message}]`); rmSync(t.base, { recursive: true, force: true }); continue; }
  if (runSuite(t.dir)) { cBad += 1; console.log(`  BAD ${c.name} went red`); }
  else { cOk += 1; console.log(`  ok  ${c.name}`); }
  rmSync(t.base, { recursive: true, force: true });
}
console.log('');
console.log(`${caught}/${RUNNING.length} sabotages caught, ${cOk}/${RUNNING_C.length} controls green.`);
if (missed > 0 || cBad > 0) process.exit(1);
