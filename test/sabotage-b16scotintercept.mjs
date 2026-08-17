// SABOTAGE THE DETERMINISTIC SCOTTISH RATES LANE. B16 AND THE B2 INTERCEPT, 17 AUGUST 2026.
//
//   node test/sabotage-b16scotintercept.mjs
//
// B2 moved the Scotland rule into the prompt block both channels spread, and test/scotland.test.mjs
// section 2b holds it there. That guard asks WHAT THE MODEL IS TOLD. It passed all the way through
// the two answers that started the whole thing: "you're in Scotland so your tax rates are the same
// as the rest of the UK", and a band table with a 41% higher rate and no advanced rate. The lesson
// written up that day was that the scope of a guard is a place a defect can hide.
//
// So the question is now answered from code on all three answering routers, and TWO suites hold it:
// test/scotland.test.mjs section 2d holds the WORDS, test/laneparity.test.mjs section 6 holds the
// ROUTING. This pass runs both, because a sabotage caught by either is caught, and a sabotage
// caught by NEITHER is the hole.
//
// Every sabotage below is a way the finding comes back: a channel losing the lane, the lane hoisted
// over the figure or sunk under the model, the answer growing a percentage, the matcher going deaf
// to the words the real customer typed, or the reserved taxes losing their refusal.
//
// The scratch tree is <tmp>/tradebook with a link to the real mobile repo beside it, because
// scotland.test.mjs section 3b reads '../tradebook-app'. Without the link every run is red for a
// missing repo, every sabotage looks caught, every control looks broken, and the harness is lying
// in both directions.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const MOBILE = path.resolve(root, '..', 'tradebook-app');

function scratch() {
  const base = mkdtempSync(path.join(tmpdir(), 'sab-b16scot-'));
  const dir = path.join(base, 'tradebook');
  for (const d of ['lib', 'test', 'app']) cpSync(path.join(root, d), path.join(dir, d), { recursive: true });
  if (existsSync(MOBILE)) symlinkSync(MOBILE, path.join(base, 'tradebook-app'), 'dir');
  return { base, dir };
}

// BOTH suites, and either going red is a catch. A crashing suite counts as red too: on 17 August a
// hand rolled gate grepped for "N failed", a suite that threw printed no such line, and a dead
// suite counted as green all the way into a red CI.
const SUITES = ['test/scotland.test.mjs', 'test/laneparity.test.mjs'];
function runSuite(dir) {
  for (const rel of SUITES) {
    try {
      const out = execFileSync('node', [path.join(dir, rel)], {
        cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (/[1-9]\d* failed\./.test(out)) return true;
      if (!/\d+ passed, 0 failed\./.test(out)) return true;
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
const editOnce = (dir, rel, from, to) => {
  const p = path.join(dir, rel);
  const s = readFileSync(p, 'utf8');
  if (!s.includes(from)) throw new Error(`ANCHOR MISSING in ${rel}: ${from.slice(0, 60)}`);
  writeFileSync(p, s.replace(from, to));
};
// Lifts a code line out and puts it back somewhere else, which is how "the lane is in the wrong
// place" is sabotaged without quoting the whole router at itself.
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

const WA_GATE = '          } else if (isScottishRatesQuestion(text)) {\n            await sendText(from, SCOTTISH_RATES_ANSWER);\n';
const TH_GATE = '  if (isScottishRatesQuestion(q)) return SCOTTISH_RATES_ANSWER;\n';
const ASK_GATE = '  if (!truth && isScottishRatesQuestion(question)) truth = SCOTTISH_RATES_ANSWER;\n';

const SABOTAGES = [
  // ── A CHANNEL LOSES THE LANE. This is the shape every previous run found. ─────────────────
  {
    name: '🔴 WHATSAPP loses the lane, so the channel he uses from a van guesses again',
    apply: ({ dir }) => edit(dir, 'app/api/whatsapp/route.ts', WA_GATE, ''),
  },
  {
    name: '🔴 THE THREAD loses it, and the thread is the surface B2 actually caught it on',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts', TH_GATE, ''),
  },
  {
    name: '🔴 /api/ask loses it, the in app accountant whose prompt had the rule and ignored it',
    apply: ({ dir }) => edit(dir, 'app/api/ask/route.ts', ASK_GATE, ''),
  },
  // ── THE ORDER. Both bounds are a real defect, in opposite directions. ─────────────────────
  {
    name: '🔴 hoisted ABOVE the totals lane, so a man asking HOW MUCH is handed a rule instead of his figure',
    apply: ({ dir }) => moveLine(dir, 'app/api/thread/route.ts',
      'if (isScottishRatesQuestion(q)) return SCOTTISH_RATES_ANSWER;',
      'const totals = matchTotalsQuestion(q);', 0),
  },
  {
    name: '🔴 sunk BELOW the paid model call, so it answers correctly and charges him for the question',
    apply: ({ dir }) => moveLine(dir, 'app/api/thread/route.ts',
      'if (isScottishRatesQuestion(q)) return SCOTTISH_RATES_ANSWER;',
      'const answer = await answerMoneyQuestion(q, summary, knowledge);', 1),
  },
  {
    name: 'a second call site is added, so no index names one lane any more',
    apply: ({ dir }) => editOnce(dir, 'app/api/thread/route.ts', TH_GATE, TH_GATE + TH_GATE),
  },
  // ── THE ANSWER PRICES SOMETHING. The fourth written rule of lib/scotland.ts. ──────────────
  {
    name: '🔴 the answer grows a percentage, which is the number we cannot compute',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      "which includes plan 4.'", "which includes plan 4. Scottish taxpayers pay 42% above the higher threshold.'"),
  },
  {
    name: '🔴 the answer grows the band table the walk actually caught',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      "which includes plan 4.'", "which includes plan 4. The Scottish bands run 19, 20, 21, 42, 45 and 48.'"),
  },
  {
    name: 'the answer grows a threshold in pounds, which prices what Scotland would change',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      "which includes plan 4.'", "which includes plan 4. The Scottish higher rate starts at £43,662.'"),
  },
  {
    name: '🔴 the answer stops quoting SCOTLAND_LINE and words its own caveat, which is how one caveat becomes nine',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      '`${SCOTLAND_LINE} National Insurance and VAT are the same wherever you are in the UK, and your `',
      "'Your income tax here uses the England, Wales and Northern Ireland rates. '"),
  },
  {
    name: 'the answer sends him off to read the bands himself, which hands back the job he bought',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      "which includes plan 4.'", "which includes plan 4. The Scottish rates are on gov.scot.'"),
  },
  {
    name: 'the answer puts a date on the Scottish rates, and a promised month that slips is worse than none',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      "which includes plan 4.'", "which includes plan 4. Scottish rates arrive in April 2027.'"),
  },
  {
    name: '🔴 a router hand writes its own Scotland sentence instead of sending the shared constant',
    apply: ({ dir }) => edit(dir, 'app/api/thread/route.ts',
      'if (isScottishRatesQuestion(q)) return SCOTTISH_RATES_ANSWER;',
      "if (isScottishRatesQuestion(q)) return 'Your rates are the England and Wales ones for now.';"),
  },
  // ── THE MATCHER GOES DEAF. B2-F3's lesson: the lane was there and could not hear him. ─────
  {
    name: '🔴 the city names go, so the man who typed "am in glasgow mate" is not heard at all',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '|glasgow|edinburgh|aberdeen|dundee|inverness|stirling|paisley', ''),
  },
  {
    name: '🔴 the reserved tax refusal goes, so a VAT question is answered with an income tax caveat',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '  if (UK_WIDE_TAX_RE.test(b)) return false;\n', ''),
  },
  {
    name: 'the nation requirement goes, so every tax question in the product falls into this lane',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '  if (!SCOTTISH_NATION_RE.test(b)) return false;\n', ''),
  },
  {
    name: 'the subject requirement goes, so "am in glasgow mate" alone is answered with a tax caveat',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '  return TAX_RATE_RE.test(b);', '  return true;'),
  },
  {
    name: 'the money refusal goes, so a logged figure is eaten by a rates lane',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      "  if (/£\\s*\\d/.test(b)) return false;\n  if (UK_WIDE_TAX_RE.test(b)) return false;",
      '  if (UK_WIDE_TAX_RE.test(b)) return false;'),
  },
  {
    name: 'a second definition of the matcher appears, so there is no longer ONE rule',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      'export function isScottishRatesQuestion(body: string): boolean {',
      'export function isScottishRatesQuestionOld(body: string): boolean { return false; }\nexport function isScottishRatesQuestion(body: string): boolean {'),
  },
];

const CONTROLS = [
  {
    name: 'a comment above the matcher is reworded',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '// ⚠️ TWO SIGNALS ARE REQUIRED, AND THAT IS THE WHOLE MATCHER.',
      '// ⚠️ TWO SIGNALS ARE REQUIRED AND THAT IS THE WHOLE MATCHER (touched).'),
  },
  {
    name: 'a comment above the answer constant is reworded',
    apply: ({ dir }) => edit(dir, 'lib/scotland.ts',
      '// ⚠️ THE SECOND SENTENCE EARNS ITS PLACE AND IS NOT DECORATION.',
      '// ⚠️ THE SECOND SENTENCE EARNS ITS PLACE, AND IS NOT DECORATION (touched).'),
  },
  {
    name: '🔴 A CITY IS ADDED TO THE NATION LIST, which is somebody widening it correctly and must NOT be frozen',
    apply: ({ dir }) => edit(dir, 'lib/waintents.ts',
      '|inverness|stirling|paisley', '|inverness|stirling|paisley|falkirk|kilmarnock'),
  },
  {
    name: 'a blank line inside the matcher, which changes nothing about what it hears',
    apply: ({ dir }) => editOnce(dir, 'lib/waintents.ts',
      'export function isScottishRatesQuestion(body: string): boolean {\n',
      'export function isScottishRatesQuestion(body: string): boolean {\n\n'),
  },
];

// ⚠️ A SLICE, BECAUSE THE FULL PASS DOES NOT FIT IN A COWORK SHELL CALL. Every call is capped at
// 45 seconds in a fresh sandbox and a detached process does not survive between calls, so a session
// that cannot run the whole pass has to be able to run it in pieces and say which pieces it ran.
// SAB_FROM and SAB_TO are indices into the sabotage list; unset means all of it, which is what CI
// and the Mac run. SAB_SKIP_CONTROLS skips the controls for the same reason.
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
