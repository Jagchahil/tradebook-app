// WHO WE ARE ASKING, ON EVERY SURFACE THAT ASKS. Run: node test/wave9_asking.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE WALK THAT PRODUCED THIS SUITE, 31 JULY 2026.
//
// A landlord signing up through the Landlord chip on /start is stored as business structure
// 'sole_trader', because he files a personal return and he is not a company. So he passed every
// guard in the codebase as a sole trader and was shown the whole trade corpus. On /app/setup he was
// asked "What were you doing before you went self-employed?" under this promise: "If you lose money
// in your first four years, we can carry that loss back against the wages from your old job. HMRC
// send you a cheque."
//
// That is ITA 2007 s72, early TRADE losses relief. A UK property business loss can only be carried
// FORWARD against future profits of the same letting business, and when that business ends the
// carried forward losses are lost. There is no carry back and there is no cheque. We were promising
// a man money that cannot exist for him.
//
// lib/circumstances.ts and lib/persona.ts hold the rule (a second axis, IncomeShape, beside the
// structure). This suite holds the CALLERS, which is where the same class of bug has always lived:
// a filter that exists in a module and is never handed the facts it needs is a filter that does not
// run. Two things it pins, and the second is the one that bites:
//
//   1. EVERY SURFACE THAT ASKS PASSES THE WHOLE PERSONA. Not the structure alone, which is what
//      waved the landlord through, and never a bare string.
//
//   2. THE TWO CHANNELS THAT PASSED NOTHING AT ALL. app/api/whatsapp/route.ts called unanswered()
//      with one argument, so the DIRECTOR filter from the 30 July walk (b1742cbc) had NEVER RUN on
//      WhatsApp: a limited company director in the chain was still being offered "before you went
//      self employed" and the voluntary Class 2 tick box. app/api/circumstances/route.ts, which is
//      the phone app's whole question list, did the same.
//
// 🔴 AND THE SAFETY RULE IN BOTH DIRECTIONS. Unknown asks EVERYTHING. Only a KNOWN 'property_only'
// may withhold anything. Asking a landlord a trade question is a nuisance he can say no to. Never
// asking a sparky about his old employed job because a profile read came back empty is four figures
// gone with no trace that it ever happened.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); }
};

// Comments stripped before asking what the CODE does, as everywhere else in this test directory:
// these files argue at length, in prose, about the very calls being counted here.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

console.log('\nwave nine: every surface that asks a man a question knows who it is asking');

// ---------------------------------------------------------------------------------------------
// The call finder. Brackets are WALKED rather than matched with a regex, because these arguments
// carry array spreads and multi line object literals, and a regex that tries to read them is a
// regex that quietly matches nothing the day somebody adds a line break. A pin that silently stops
// pinning is worse than no pin, which is the entire lesson of the two routes below.
// ---------------------------------------------------------------------------------------------
function callsTo(src, fn) {
  const out = [];
  const needle = `${fn}(`;
  let i = src.indexOf(needle);
  while (i !== -1) {
    let depth = 0;
    let j = i + needle.length - 1;
    for (; j < src.length; j++) {
      const ch = src[j];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(i + needle.length, j));
    i = src.indexOf(needle, j);
  }
  return out;
}

// The arguments of one call, split at the commas that are actually argument separators.
function args(call) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < call.length; i++) {
    const ch = call[i];
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { parts.push(call.slice(start, i)); start = i + 1; }
  }
  parts.push(call.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

// What a page is really passing as "who we are asking". An object literal is read where it stands;
// an identifier is resolved back to the object the file built, so this suite pins WHAT travels
// rather than what a page happens to have called it.
function personaOf(arg, src) {
  const t = arg.trim();
  if (t.startsWith('{')) return t;
  if (!/^[A-Za-z_$][\w$]*$/.test(t)) return '';
  const m = src.match(new RegExp(`const ${t}(?::[^=]*)?=\\s*(\\{[\\s\\S]*?\\})`));
  return m ? m[1] : '';
}

// Both facts, or it is not a persona. A bare structure resolves to nothing here and fails, which is
// the point: the structure alone is what the landlord walked through.
const carriesBoth = (body) => /\bstructure\b/.test(body) && /\bincome\b/.test(body);

// ---------------------------------------------------------------------------------------------
// 🔴 1. THE SURFACES. Every gate call in every file that asks, and the last argument of each.
// ---------------------------------------------------------------------------------------------
const GATES = ['unanswered', 'unansweredMtd', 'progressIn'];

// The four screens that ask, plus the two routes that ask on the other two channels. The expected
// count is written down so that a gate ADDED to a page without a persona cannot pass by being
// invisible to a spot check.
const SURFACES = [
  ['app/app/setup/page.tsx', 4],
  ['app/app/you/circumstances/page.tsx', 4],
  ['app/app/pile/page.tsx', 1],
  ['app/app/you/page.tsx', 1],
  ['app/api/circumstances/route.ts', 1],
  ['app/api/whatsapp/route.ts', 1],
];

for (const [file, expected] of SURFACES) {
  const src = codeOnly(read(file));
  const calls = GATES.flatMap((fn) => callsTo(src, fn).map((c) => [fn, args(c)]));

  ok(`${file}: every gate call is found, all ${expected} of them`, calls.length === expected);

  ok(`🔴 ${file}: not one gate is called without being told who the man is`,
    calls.length > 0 && calls.every(([, a]) => a.length >= 2));

  ok(`🔴 ${file}: and what it is told carries BOTH how he trades and whether he trades`,
    calls.length > 0 && calls.every(([, a]) => carriesBoth(personaOf(a[a.length - 1], src))));

  ok(`${file}: the income shape is read from the profile, not guessed at here`,
    src.includes('incomeShape') && src.includes('businessType'));

  ok(`${file}: a failed profile read passes null rather than throwing, so unknown asks everything`,
    /getBusinessProfile\([^)]*\)\.catch\(\(\) => null\)/.test(src));
}

// The two channels that passed nothing at all, pinned by name as well as by count, because this is
// the specific line that was wrong and the specific way it was wrong.
{
  const wa = codeOnly(read('app/api/whatsapp/route.ts'));
  const api = codeOnly(read('app/api/circumstances/route.ts'));
  ok('🔴 THE WHATSAPP CHAIN NO LONGER CALLS unanswered(rows) WITH ONE ARGUMENT',
    !/unanswered\(\s*rows\s*\)/.test(wa) && wa.includes('getBusinessProfile'));
  ok('🔴 NOR DOES /api/circumstances, whose toAsk is the phone app\'s whole question list',
    !/unanswered\(\s*rows\s*\)/.test(api) && api.includes('getBusinessProfile'));
}

// ---------------------------------------------------------------------------------------------
// 🔴 2. THE RULE ITSELF, RUN. Fixtures against the real module, both directions of the safety rule.
// ---------------------------------------------------------------------------------------------
const C = await import(pathToFileURL(path.join(root, 'lib/circumstances.ts')).href);
const { unanswered, unansweredMtd, household, notHousehold, mtdQuestions, progressIn } = C;

const LANDLORD = { structure: 'sole_trader', income: 'property_only' };
const keys = (list) => list.map((c) => c.key);

{
  const forLandlord = keys(unanswered([], LANDLORD));

  ok('🔴 A LANDLORD IS NEVER ASKED WHAT HE DID BEFORE HE WENT SELF EMPLOYED (ITA 2007 s72 is a TRADE relief)',
    !forLandlord.includes('prior_employment'));
  ok('🔴 NOR OFFERED THE VOLUNTARY CLASS 2 TICK BOX. NIM74250: managing his own property is not gainful employment, so there is no Class 2 to buy the year with',
    !forLandlord.includes('low_profit_year'));
  ok('🔴 NOR THE USE OF HOME FLAT RATE. ITTOIA 2005 s94H is a deduction in computing the profits of a TRADE (BIM75010)',
    !forLandlord.includes('home_working'));
  ok('and not the other three trade questions either: the pre trading years, trade premises, the van',
    !forLandlord.includes('start_date') && !forLandlord.includes('premises')
    && !forLandlord.includes('vehicle'));

  ok('he keeps every question that does not turn on carrying on a trade',
    ['married', 'children', 'grandparent_childcare', 'pension', 'vat_registered', 'other_job',
      'gift_aid', 'rental'].every((k) => forLandlord.includes(k)));
  ok('🔴 AND HE KEEPS THE MTD GATE, which counts trade AND property: a man letting for £52,000 with no trade at all is mandated',
    keys(unansweredMtd([], LANDLORD)).includes('mtd_mandated_letter'));
  ok('a landlord filter never leaks a special category question either',
    unanswered([], LANDLORD).every((c) => !c.specialCategory));

  // The count a landlord is shown. A question that does not exist for him is not "waiting for him",
  // and a door on /app/you promising questions he can never be asked is a door that lies twice.
  const llAll = progressIn([...household(), ...notHousehold(), ...mtdQuestions()], [], LANDLORD);
  const unknownAll = progressIn([...household(), ...notHousehold(), ...mtdQuestions()], [], null);
  ok('🔴 his denominator is exactly the seven trade questions lighter',
    llAll.askable === unknownAll.askable - 7);
  ok('an answer he gave before we knew still counts: the record of what he told us is his',
    progressIn(notHousehold(), [{ key: 'prior_employment', answer: 'yes' }], LANDLORD).answered === 1);
}

// 🔴 THE OTHER DIRECTION, AND IT IS THE EXPENSIVE ONE. Unknown asks everything.
{
  const unknown = keys(unanswered([]));
  const sole = keys(unanswered([], 'sole_trader'));

  ok('🔴 AN UNKNOWN PERSONA STILL GETS EVERYTHING, the whole point of the asymmetry',
    ['prior_employment', 'start_date', 'low_profit_year', 'premises', 'vehicle', 'home_working']
      .every((k) => unknown.includes(k)));
  ok('an empty persona object is unknown too, not a landlord',
    keys(unanswered([], {})).length === unknown.length);
  ok('a known structure with an unknown income is asked everything that structure is asked',
    keys(unanswered([], { structure: 'sole_trader', income: null })).join(',') === sole.join(','));
  ok('null and undefined are unknown, exactly as the old bare string callers were',
    keys(unanswered([], null)).length === unknown.length
    && keys(unanswered([], undefined)).length === unknown.length);
  ok('a bare structure string still behaves as it always did, so nothing broke by being left alone',
    sole.length === unknown.length);
  ok('🔴 AND A DIRECTOR WHO IS ALSO A LANDLORD LOSES BOTH SETS, never gains one back',
    keys(unanswered([], { structure: 'limited_company', income: 'property_only' }))
      .every((k) => !['prior_employment', 'low_profit_year', 'home_working', 'vehicle'].includes(k)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 3. THE SENTENCE ON /app/you. A landlord carries on no trade, and the page said he did.
// ---------------------------------------------------------------------------------------------
{
  const you = read('app/app/you/page.tsx');
  ok('🔴 /app/you no longer prints "{trade} by trade." at a man whose business is letting',
    !/\{tidyTrade\(card\.trade\)\} by trade\./.test(you));
  ok('the sentence branches on the income shape the profile read gives it',
    /property_only/.test(you) && /tradeLine\(/.test(you));
  ok('and an unknown shape keeps the old wording, which is true of every customer on record',
    /by trade\./.test(you));
}

// ---------------------------------------------------------------------------------------------
// 🔴 4. THE SAME QUESTION ON THE WHATSAPP CHANNEL: WHO IS THIS RELIEF EVEN FOR.
//
// Three doors lead to the use of home flat rate, and on 31 July 2026 only the web one had a lock.
// The other two are in the webhook: handleUseOfHomeElection, which writes the election row itself,
// and handleHomeOffice, which is older and writes an ordinary transaction. A director or a landlord
// could text three words and take a relief that does not exist for him.
//
// ITTOIA 2005 s94H and HMRC BIM75010: "Only partnerships comprising solely individual partners can
// claim this simplified expenses", so a company is outside the regime. And s94H is a deduction in
// computing the profits of a TRADE, so a property business apportions its actual costs instead
// (HMRC PIM2220). The rule lives in lib/elections.ts and every door asks IT.
// ---------------------------------------------------------------------------------------------

// One handler, sliced out by name, so an assertion about one door cannot be satisfied by another.
// The closing brace of a top level function is the only one at column zero.
function handler(src, name) {
  const i = src.indexOf(`async function ${name}(`);
  if (i === -1) return '';
  const end = src.indexOf('\n}\n', i);
  return end === -1 ? src.slice(i) : src.slice(i, end + 2);
}

const wa = codeOnly(read('app/api/whatsapp/route.ts'));

{
  const electing = handler(wa, 'electingAs');
  const door = handler(wa, 'refusedUseOfHome');
  const election = handler(wa, 'handleUseOfHomeElection');
  const hours = handler(wa, 'handleHomeOffice');

  ok('🔴 the webhook reads WHO IS ELECTING once, in one helper, the shape /api/elections uses',
    /getBusinessProfile\(userId\)\.catch\(\(\) => null\)/.test(electing)
    && /structure: biz\?\.businessType \?\? null/.test(electing)
    && /income: biz\?\.incomeShape \?\? null/.test(electing));

  ok('🔴 THE RULE IS ASKED OF lib/elections.ts, and the refusal is ONE send serving both doors',
    /electionRefusal\('use_of_home', await electingAs\(userId\)\)/.test(door)
    && /sendText\(from, refusal\.message\)/.test(door)
    && (wa.match(/sendText\(from, refusal\.message\)/g) || []).length === 1);

  ok('🔴 THE ELECTION DOOR REFUSES BEFORE IT ASKS HIM FOR HIS HOURS',
    /await refusedUseOfHome\(from, userId\)/.test(election)
    && election.indexOf('refusedUseOfHome') < election.indexOf('useOfHomeHoursQuestion'));
  ok('and long before it writes the row', election.indexOf('refusedUseOfHome') < election.indexOf('writeAllowanceElection'));

  ok('🔴 THE HOURS DOOR IS LOCKED THE SAME WAY, and it is the one the words actually reach',
    /await refusedUseOfHome\(from, userId\)/.test(hours)
    && hours.indexOf('refusedUseOfHome') < hours.indexOf('insertTransaction'));

  ok('🔴 AND NEITHER NAMES AN ALTERNATIVE WE HAVE NOT BUILT: no company route, no apportioning',
    !/apportion/i.test(door) && !/apportion/i.test(hours)
    && !/actual home costs/i.test(wa) && !/fair share of your actual/i.test(wa));

  ok('🔴 NOT ONE FLAT RATE OR BAND BOUNDARY IS TYPED INTO THE WEBHOOK ANY MORE',
    !/=\s*(?:10|18|26)\b/.test(hours) && !/hours\s*>=\s*\d/.test(hours));
  ok('the bands come from bandForHours and the money from the watched engine, where the election reads them',
    /bandForHours\(hours\)/.test(hours) && /homeOfficeFlatRateMonthly\(band\)/.test(hours));
  ok('and the amount written to his books is the rate the module priced',
    /amount: -monthly/.test(hours));
  ok('the sub threshold reply is the election\'s own, which promises nothing',
    /HMRC's flat rate starts at 25 hours a month/.test(hours));
}

// The rule itself, run. lib/elections.ts composes two modules through extensionless imports, so it
// is staged exactly as test/structurehonesty.test.mjs stages lib/position.ts.
const stage = mkdtempSync(path.join(tmpdir(), 'wave9asking-'));
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9]+)'/g, "from '$1.ts'");
for (const f of ['taxengine', 'money', 'elections']) {
  writeFileSync(path.join(stage, `${f}.ts`), fixImports(read(`lib/${f}.ts`)));
}
const E = await import(pathToFileURL(path.join(stage, 'elections.ts')).href);

{
  const ltd = E.electionRefusal('use_of_home', { structure: 'limited_company', income: 'trade' });
  const landlord = E.electionRefusal('use_of_home', { structure: 'sole_trader', income: 'property_only' });

  ok('🔴 A DIRECTOR IS REFUSED, and the axis is named so a caller need never read the sentence',
    ltd !== null && ltd.reason === 'structure');
  ok('🔴 A LANDLORD IS REFUSED TOO, on the other axis', landlord !== null && landlord.reason === 'income');
  ok('and both sentences say the relief is not his without offering a door we have not built',
    [ltd, landlord].every((r) => /cannot claim it\.$/.test(r.message) && !/instead|you could|we will/i.test(r.message)));
  ok('🔴 A SOLE TRADER AND A PARTNER KEEP IT, because s94H is theirs',
    E.canElect('use_of_home', { structure: 'sole_trader', income: 'trade' })
    && E.canElect('use_of_home', { structure: 'partnership', income: 'trade' }));
  ok('🔴 AND UNKNOWN CLAIMS EVERYTHING: nothing, null and a half known man are all allowed through',
    E.canElect('use_of_home') && E.canElect('use_of_home', null) && E.canElect('use_of_home', {})
    && E.canElect('use_of_home', { structure: 'sole_trader' }));
}

// ---------------------------------------------------------------------------------------------
// 🔴 5. THE NATIONAL INSURANCE ANSWER, WHICH HAD A GATE AND NOTHING TO OPEN IT WITH.
// ---------------------------------------------------------------------------------------------
const W = await import(pathToFileURL(path.join(root, 'lib/waintents.ts')).href);

{
  const ni = handler(wa, 'handleNiQuestion');
  ok('🔴 the NI handler reads the profile, so the landlord gate in niAnswer is no longer inert',
    /getBusinessProfile\(userId\)\.catch\(\(\) => null\)/.test(ni)
    && /incomeShape: biz\?\.incomeShape \?\? null/.test(ni));
  ok('and it costs him no extra wait: the read rides alongside the settings',
    /Promise\.all\(\[\s*getStudentLoanSettings\(userId\),/.test(ni));

  // A lean year with no job: exactly the man the voluntary Class 2 sentence was written for.
  const lean = {
    profit: 4000, salary: 0, class1: 0, class4: 0, class2Annual: 179.4,
    qualifies: false, voluntarySuggested: true,
  };
  ok('🔴 A LANDLORD IS NO LONGER SOLD VOLUNTARY CLASS 2 (NIM74250: managing property is not gainful employment)',
    !/Voluntary Class 2 protects it/.test(W.niAnswer({ ...lean, incomeShape: 'property_only' })));
  ok('he is told the route that is really his, Class 3, with no price we do not hold',
    /Class 3/.test(W.niAnswer({ ...lean, incomeShape: 'property_only' }))
    && !/£/.test(W.niAnswer({ ...lean, incomeShape: 'property_only' }).split('Class 3')[1]));
  ok('a trade keeps the sentence, because Class 2 is genuinely his',
    /Voluntary Class 2 protects it/.test(W.niAnswer({ ...lean, incomeShape: 'trade' })));
  ok('🔴 AN UNKNOWN SHAPE ANSWERS EXACTLY AS IT ALWAYS HAS, both spellings of unknown',
    W.niAnswer(lean) === W.niAnswer({ ...lean, incomeShape: null })
    && W.niAnswer(lean) === W.niAnswer({ ...lean, incomeShape: undefined })
    && /Voluntary Class 2 protects it/.test(W.niAnswer(lean)));
}

// ---------------------------------------------------------------------------------------------
// 🔴 6. THE BANK SENTENCES. There is no bank provider, so nothing may point at one.
// ---------------------------------------------------------------------------------------------
{
  const nudge = handler(wa, 'bankNudgeAfterReceipt');
  const refusal = handler(wa, 'sendBudgetRefusal');
  ok('🔴 THE WEBHOOK WRITES NO BANK COPY OF ITS OWN: every sentence comes from lib/banknudge.ts, which is behind bankFeedOffered()',
    !/connect your bank/i.test(wa) && !/link your bank/i.test(wa) && !/connect a bank/i.test(wa));
  ok('and it can never offer a connection we cannot deliver: available true sits behind hasBankFeedConfig()',
    /if \(!hasBankFeedConfig\(\)\) return null;/.test(nudge)
    && /available: true/.test(nudge)
    && /reason === 'user_daily_cap' && hasBankFeedConfig\(\)/.test(refusal));
  ok('a nudge never costs a man his receipt: the whole lookup is inside a catch that returns null',
    /catch \{\s*return null;/.test(nudge));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
