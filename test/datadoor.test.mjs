// THE DATA DOOR. His copy, his erasure, and the guard that stopped the chat answering both with
// a phone bill.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS SUITE EXISTS TO PREVENT, IN ONE STORY. 11 AUGUST 2026.
//
// A customer typed "delete all my data" into the in app chat. He got back:
//
//   🟡 Phone and broadband. The business share. Work out the business percentage of your bill
//   and claim that.
//
// Two separate faults met in that one screenshot, and both had been live since launch.
//
//   1. THE CARD LAYER FIRED BEFORE ANYTHING UNDERSTOOD HIM. app/api/thread/route.ts guarded its
//      claim lane with one condition, `!/£\s*\d/.test(q)`, under a comment claiming it was
//      "guarded the same way the WhatsApp checker guards itself". isExpenseCheck() in
//      app/api/whatsapp/route.ts asks three things; only the money one had been copied across. So
//      every sentence without a pound sign in it reached a corpus that answers any string
//      carrying an alias. "delete all my data" hit the alias 'data' on the phone rule. "free
//      subscription", a question about OUR price, came back a green tick about trade bodies.
//
//   2. THEN HE WENT LOOKING FOR THE ACTUAL DOOR AND THERE WAS NOT ONE. POST /api/account/delete
//      and GET /api/account/export both worked and were both proved on 10 August. Both are
//      deliberately exempt from the paywall, and lib/gate.ts says why in capitals. A grep for
//      `api/account` across the repo returned lib/gate.ts and two test files. Zero pages, zero
//      forms, zero fetches. /privacy told him to email us. The settings hub listed nine doors and
//      neither of these was among them.
//
// 🔴 THE SECOND FAULT IS WHY THIS SUITE HOLDS THE PAGE AND NOT ONLY THE GUARD. Working machinery
// that nothing links to is not a feature, it is a passing test. Everything here is asserted
// against a customer reachable surface: the hub row, the page, the two form actions.
//
// 🔴 AND THE NEGATIVE SET IS THE POINT OF THE FIRST HALF. Before today not one assertion anywhere
// in the suite said checkExpense must return NOTHING for anything, which is precisely how a
// matcher that answers everything shipped and stayed shipped. A guard is only proved by what it
// refuses.
//
//   node test/datadoor.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkExpense, isClaimQuestion, EXPENSE_RULES } from '../lib/claimrules.data.ts';
// lib/waintents.ts is pure and has no relative imports, so it loads directly.
import * as WA from '../lib/waintents.ts';

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

// ⚠️ PRESENT AND ORDERED, NEVER JUST ORDERED. indexOf(a) < indexOf(b) is true when a is missing
// entirely, because indexOf returns -1. Two security guards shipped vacuous on exactly that on 10
// August. This helper is the lesson, and every ordering claim below goes through it.
function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

// ⚠️ NEGATIVE ASSERTIONS RUN ON THE CODE, NEVER ON THE PROSE AROUND IT. This codebase's oldest
// trap: the comment explaining what was removed necessarily contains the removed thing, so a
// grep for the old guard finds the note that says the old guard is gone and reports it as still
// there. Every "the route no longer holds X" claim below is on codeOnly().
const codeOnly = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const routeSrc = read('app/api/thread/route.ts');
const routeCode = codeOnly(routeSrc);
const corpusSrc = read('lib/claimrules.data.ts');
const corpusCode = codeOnly(corpusSrc);

// 🔴 THE CHAT'S OWN LANE, COMPOSED HERE EXACTLY AS THE ROUTE COMPOSES IT, AND PINNED BELOW.
//
// Asserting on checkExpense alone would prove nothing about the defect: the corpus is a lookup and
// it is SUPPOSED to answer any string carrying an alias. What shipped wrong was the decision about
// what reaches it. So every claim assertion in section 1 runs through this, and section 2 proves
// the route really is this and holds no second copy of the rule.
const throughTheChat = (q) => (isClaimQuestion(q) ? checkExpense(q) : null);

console.log('\n--- 1. THE GUARD. The two proved strings, and everything they stand for ---\n');
{
  ok('the corpus was actually loaded, so nothing below is vacuous', EXPENSE_RULES.length > 20);

  // 🔴 THE TWO STRINGS A CUSTOMER REALLY TYPED. Named, quoted, and kept as fixtures for ever.
  ok('🔴 "delete all my data" gets NO claim card from the chat. He was asking to be erased',
    throughTheChat('delete all my data') === null);
  ok('🔴 "free subscription" gets NO claim card from the chat. He was asking about our price',
    throughTheChat('free subscription') === null);

  // AND THE FIRST ONE IS DEAD TWICE OVER. The guard refuses the sentence; the corpus no longer
  // holds the word either. Two independent reasons, because the alias was a word out of our own
  // privacy vocabulary and a guard only narrows a door, it does not fix a rule.
  ok('🔴 and the raw corpus does not answer it either: the alias \'data\' is gone from the phone rule',
    checkExpense('delete all my data') === null);
  ok('...proved at the rule rather than at the sentence, so a reworded ask cannot find it',
    EXPENSE_RULES.every((r) => !r.aliases.includes('data')));
  // The alias earned its place for mobile data allowances, and every real phrasing still lands.
  ok('and nothing was lost: "can I claim my mobile data" still answers phone and broadband',
    throughTheChat('can I claim my mobile data')?.key === 'phone');
  ok('...as does "is my broadband tax deductible"',
    throughTheChat('is my broadband tax deductible')?.key === 'phone');
}

console.log('\n--- 1b. A GUARD THAT REFUSES EVERYTHING IS NOT A FIX ---\n');
{
  // Real claim questions, in the three shapes a man actually uses: the ask, the statement of a
  // thing, and the bare follow up.
  ok('"can I claim my boots" still answers, and answers protective gear',
    throughTheChat('can I claim my boots')?.key === 'protective');
  ok('"is a drill tax deductible" still answers, and answers tools',
    throughTheChat('is a drill tax deductible')?.key === 'tools');
  // ⚠️ NON NULL, AND DELIBERATELY NOT PINNED TO A RULE. It comes back the VAN rule rather than the
  // insurance rule, because checkExpense takes the first rule in file order carrying any alias and
  // 'van' sits thirteen rules above 'van insurance'. That is a real defect of the same family and
  // it is reported rather than blessed here: pinning it to 'van' would write the wrong answer into
  // the guard, and pinning it to 'insurance' would fail on code that is behaving as written.
  ok('"what about my van insurance", the bare follow up, still reaches the corpus',
    throughTheChat('what about my van insurance') !== null);

  for (const [q, key] of [
    ['can I claim fuel?', 'fuel'],
    ['can I expense my work boots?', 'protective'],
    ['is a hard hat allowable?', 'protective'],
    ['can I claim mileage?', 'mileage'],
    ['are these overalls deductible?', 'protective'],
    ['is my accountant tax deductible', 'fees'],
  ]) {
    ok(`a real claim question still answers: "${q}" -> ${key}`, throughTheChat(q)?.key === key);
  }
}

console.log('\n--- 1c. 🔴 THE NEGATIVE SET. What the corpus must never answer from the chat ---\n');
{
  // ⚠️ THE SUITE HAD NOT ONE OF THESE, ANYWHERE, WHICH IS WHY THIS SHIPPED. Every row is a thing a
  // customer might reasonably type into a chat with his bookkeeper, and not one of them is a claim
  // question. The second column is what the RAW corpus would have handed him, which is the whole
  // argument for the guard: seven of these had a card waiting for them.
  const NOT_CLAIM_QUESTIONS = [
    ['delete all my data', 'the erasure ask, in his words'],
    ['delete all my data please', 'the same ask, politely'],
    ['free subscription', 'a question about our price'],
    ['is my subscription free?', 'the same question, as a question'],
    ['delete my account', 'the ask this product now has a page for'],
    ['can you delete my account', 'the same, asked of a person'],
    ['export my data', 'the other half of the same page'],
    ['send me my data', 'the same, worded as a request'],
    ['how do I cancel', 'a billing question'],
    ['stop emailing me', 'an opt out, which is not a tax question'],
    ['remove my phone number', 'a contact change. The raw corpus offered him a phone bill card'],
    ['the internet is down', 'a complaint. The raw corpus offered him a broadband card'],
    ['what is my broadband', 'a question about a bill, not about claiming one'],
    ['my van broke down today', 'a bad day. The raw corpus offered him the van rule'],
    ['phone bill £45, 80% business', 'a LOGGED ENTRY. The money condition, doing its job'],
    ['I bought a drill for £89', 'another logged entry, with a real alias in it'],
    ['is this thing on?', 'a question about nothing at all'],
    ['thanks', 'not a question'],
    ['can I delete my expense data?', '🔴 carries a claim word AND a question shape, and is still not a claim question. The alias removal is what stops this one'],
  ];
  for (const [q, why] of NOT_CLAIM_QUESTIONS) {
    ok(`no card for "${q}" (${why})`, throughTheChat(q) === null);
  }
  ok('the table is a table, not a token gesture', NOT_CLAIM_QUESTIONS.length >= 15);

  // 🔴 AND THE TABLE IS NOT PASSING BECAUSE THE GUARD REFUSES EVERYTHING. Several of these rows
  // have a card sitting behind them in the raw corpus, and if the corpus stopped matching them
  // this table would go green for the wrong reason. Prove the danger is still real.
  const wouldHaveAnswered = NOT_CLAIM_QUESTIONS.filter(([q]) => checkExpense(q) !== null);
  ok(`🔴 the raw corpus still answers ${wouldHaveAnswered.length} of them, so the guard is doing the work`,
    wouldHaveAnswered.length >= 5);
}

console.log('\n--- 2. ONE OWNER. The rule lives in the corpus and the chat asks it ---\n');
{
  // 🔴 THE DEFECT WAS THE COPY, NOT THE MISSING LINE. A guard written out by hand in a second file
  // drifts, and this one had already drifted once, silently, in the direction nobody sees.
  ok('🔴 the guard is exported from the corpus, which is the file that owns the answers',
    /export function isClaimQuestion\(/.test(corpusCode));
  ok('and it is pure, so an Expo build can run it unchanged like everything else in that file',
    !/\bimport\b|\brequire\(/.test(corpusCode));

  ok('the chat imports it rather than rewriting it',
    /import \{[^}]*isClaimQuestion[^}]*\} from '\.\.\/\.\.\/\.\.\/lib\/taxrules'/.test(routeCode));
  ok('🔴 and the claim lane is now gated on it', /if \(isClaimQuestion\(q\)\) \{/.test(routeCode));
  ok('🔴 the gate is asked BEFORE the corpus, not alongside it',
    before(routeCode, 'isClaimQuestion(q)', 'checkExpense(q)'));
  ok('checkExpense is still the call by name, the same function the webhook runs',
    /const hit = checkExpense\(q\);/.test(routeCode));

  // 🔴 THE OLD ONE THIRD GUARD IS GONE FROM THE ROUTE, and it has to be gone rather than joined,
  // because two copies of a rule is the fault this whole change is about.
  ok('🔴 the route holds no copy of the money regex any more',
    !/\/£\\s\*\\d\//.test(routeCode));
  ok('...and no copy of the claim vocabulary either',
    !/CLAIM_WORDS/.test(routeCode));
  ok('both conditions live in the corpus instead',
    /const CLAIM_WORDS = /.test(corpusCode) && /const LOGGED_AMOUNT = /.test(corpusCode));

  // The three conditions, asserted as behaviour rather than as source text.
  ok('condition 1, a money amount is a logged purchase and never a question',
    isClaimQuestion('can I claim a drill for £89') === false);
  ok('condition 2, it has to read like a question',
    isClaimQuestion('claim boots') === false && isClaimQuestion('can I claim boots') === true);
  ok('condition 3, it has to be about claiming',
    isClaimQuestion('is my broadband on?') === false
    && isClaimQuestion('is my broadband allowable?') === true);

  // 🔴 THE WHATSAPP COPY IS STILL THERE AND THE NOTE SAYING SO MUST STAY. A second copy nobody has
  // written down is how this happened. When it is collapsed, this assertion is what tells whoever
  // does it that the note can go with it.
  const wa = read('app/api/whatsapp/route.ts');
  ok('the WhatsApp checker still holds its own private copy (known, and recorded)',
    /function isExpenseCheck\(/.test(wa));
  ok('🔴 and the corpus says out loud that it should be collapsed onto the one owner',
    /isExpenseCheck\(\) in app\/api\/whatsapp\/route\.ts/.test(corpusSrc)
    && /collapsed onto this one/i.test(corpusSrc));
}

console.log('\n--- 3. THE ERASURE DOOR EXISTS, AND A CUSTOMER CAN REACH IT ---\n');
{
  const PAGE = 'app/app/you/data/page.tsx';
  ok('🔴 there is a page at /app/you/data', existsSync(path.join(root, PAGE)));
  const page = read(PAGE);
  const pageCode = codeOnly(page);

  // 🔴 REACHABLE, WHICH IS THE HALF THAT WAS MISSING. The routes worked all along. Nothing linked
  // to them, so for a customer they did not exist.
  const hub = read('app/app/you/page.tsx');
  ok('🔴 the settings hub links to it, so it is not another door nobody can find',
    /href="\/app\/you\/data"/.test(codeOnly(hub)));
  ok('and the row says plainly what is behind it, both halves of it',
    /Your data/.test(codeOnly(hub)) && /delete it/.test(codeOnly(hub)));

  ok('🔴 it posts the erasure to the route that already does the work',
    /action="\/api\/account\/delete" method="post"/.test(pageCode));
  ok('...and does not reimplement any of it: no table walking, no database of its own',
    !/deleteUserData|USER_DATA_TABLES|supabase/i.test(pageCode));

  // 🔴 THE CONFIRMATION STEP, PROVED BY CONTAINMENT RATHER THAN BY ORDER. The destructive form must
  // be INSIDE the armed branch, so that until the word comes back matching it is not in the HTML at
  // all. An ordering assertion would pass on a page that drew the button under the form.
  ok('the page asks for a typed word', /const CONFIRM_WORD = 'DELETE'/.test(pageCode));
  ok('🔴 the word is checked on the SERVER, not left to the browser',
    /const armed = typed === CONFIRM_WORD/.test(pageCode));
  const armedStart = pageCode.indexOf('{armed ? (');
  const armedEnd = pageCode.indexOf(') : (', armedStart);
  ok('the armed branch was actually found, so the check below is not vacuous',
    armedStart > 0 && armedEnd > armedStart);
  const armedBlock = pageCode.slice(armedStart, armedEnd);
  const elsewhere = pageCode.slice(0, armedStart) + pageCode.slice(armedEnd);
  ok('🔴 THE DELETE FORM EXISTS ONLY INSIDE THE ARMED BRANCH',
    armedBlock.includes('action="/api/account/delete"'));
  ok('🔴 AND NOWHERE ELSE ON THE PAGE, so an unconfirmed visit has nothing to press',
    !elsewhere.includes('action="/api/account/delete"'));
  ok('the unconfirmed state asks him to type it, and that form is a GET',
    !armedBlock.includes('method="get"') && pageCode.includes('action="/app/you/data" method="get"'));

  // 🔴 NOTHING DESTRUCTIVE ON A GET, EVER. The confirmation rides in the URL, which means a crafted
  // link can ARM this page. That is safe only because arming it destroys nothing. If the erasure
  // itself ever became reachable by GET, any other site could fire it with an image tag, which is
  // the same reasoning the sign out row on /app/you is a form for.
  ok('🔴 the erasure is a POST and the page owns no other write',
    (pageCode.match(/method="post"/g) ?? []).length === 1);

  ok('a mistyped word is told so rather than silently redrawing the form',
    /const mistyped = typed\.length > 0 && !armed/.test(pageCode) && /did not match/.test(pageCode));

  // Case and trailing space forgiven, the word not. A phone keyboard capitalises and adds a space.
  ok('what he typed is trimmed and folded to upper case before the compare',
    /\.trim\(\)\.toUpperCase\(\)/.test(pageCode));
}

console.log('\n--- 4. THE EXPORT DOOR, AND THE HOUSE CONVENTIONS ---\n');
{
  const page = read('app/app/you/data/page.tsx');
  const pageCode = codeOnly(page);

  ok('🔴 the export is offered as a plain link to the route that already exists',
    /href="\/api\/account\/export"/.test(pageCode));
  ok('and it is a GET, so it changes nothing and he can take one whenever he likes',
    !/action="\/api\/account\/export"/.test(pageCode));

  // The paywall exemption is the reason both doors can be offered to a locked out man, so the page
  // is allowed to say so. Pinned here because the copy is a promise about lib/gate.ts.
  const gate = read('lib/gate.ts');
  ok('the erasure route is exempt from the paywall, which is what the page promises',
    /'app\/api\/account\/delete', rule: 'always'/.test(gate));
  ok('and so is the export',
    /'app\/api\/account\/export', rule: 'always'/.test(gate));

  // ZERO CLIENT SCRIPT, like /in and /app/connect. He is on a cheap Android on a bad signal, and
  // the whole confirmation works without a line of it.
  ok('🔴 the page is server rendered and carries no script of any kind',
    !/'use client'/.test(page)
    && /export const runtime = 'nodejs'/.test(page)
    && !/onClick|onChange|onSubmit|<script|useState|dangerouslySetInnerHTML/.test(pageCode));
  ok('it is behind the session, the /app/you/billing pattern',
    /userFromSessionCookie/.test(pageCode)
    && /redirect\('\/in\?next=%2Fapp%2Fyou%2Fdata'\)/.test(pageCode));
  ok('it wears the app shell rather than a visual language of its own',
    /<AppNav current="\/app\/you" \/>/.test(pageCode) && /className="lek-card"/.test(pageCode));
  // Every screen inside /app is held to this, and test/frontdoor.test.mjs sweeps for it. Held here
  // too so a failure names the page that caused it.
  ok('no screen inside /app instructs a messaging action, this one included',
    !/WhatsApp/.test(pageCode));
}

console.log('\n--- 5. 🔴 THE COPY PROMISES NO MORE THAN THE PRIVACY POLICY DOES ---\n');
{
  // ⚠️ THE WHOLE SECTION RUNS ON codeOnly(), AND THE FIRST DRAFT DID NOT. It went red on its own
  // explanation: the note above CONFIRM_WORD says the typed word "is the same for every customer",
  // and "for every" carries "for ever" inside it. That is this codebase's oldest trap wearing a
  // new hat, and the rule it teaches is the right one anyway. A COMMENT IS NOT COPY. What a
  // customer is promised is what is rendered, and a positive assertion on raw source can be
  // satisfied by a comment mentioning the promise, which proves nothing at all.
  const page = codeOnly(read('app/app/you/data/page.tsx'));
  const privacy = read('app/privacy/page.tsx');

  // The policy's own two sentences. If either moves, this suite goes red and whoever moved it has
  // to move the page with it, which is the whole point of asserting the phrase rather than the idea.
  ok('the privacy policy reserves the retention duty',
    /subject to our legal duty to keep some records/.test(privacy));
  ok('and names the rules it comes from',
    /required by UK tax and accounting rules/.test(privacy));
  ok('🔴 the erasure page says the SAME thing in the same words, so two surfaces cannot disagree',
    /UK tax and accounting rules require it/.test(page));
  ok('and it sends him to the policy itself rather than paraphrasing the rest of it',
    /href="\/privacy"/.test(page));

  // 🔴 THE OVERPROMISE TABLE. Every one of these is a sentence somebody writes to sound
  // reassuring, and every one of them says more than the policy we published.
  const OVERPROMISES = [
    [/\bfor ?ever\b/i, 'nothing here may promise "for ever"'],
    [/no exceptions/i, 'the policy has an exception, so the page may not say there are none'],
    [/nothing (is |will be )?(kept|retained|left)/i, 'the policy reserves records we may have to keep'],
    [/every trace/i, 'a claim about traces is a claim about backups we have not checked'],
    [/completely (erased|deleted|removed|wiped)/i, 'completeness is exactly what the policy qualifies'],
    [/permanently (and|,)/i, 'stacked absolutes'],
    [/we keep nothing/i, 'flatly contradicts the policy'],
    [/wiped from our servers/i, 'a claim about infrastructure nobody on this page can verify'],
    [/gdpr compliant/i, 'compliance is not a thing a button gets to assert'],
  ];
  for (const [re, why] of OVERPROMISES) {
    ok(`the erasure copy does not overpromise: ${why}`, !re.test(page));
  }

  // AND IT STILL SAYS THE HARD PART. A page that only hedges has not warned him.
  ok('🔴 it says plainly that it cannot be undone', /It cannot be undone/.test(page));
  ok('and it names what actually goes, rather than saying "your data"',
    /receipt photograph/.test(page) && /invoices/.test(page));
  ok('and it tells him to take a copy first, which is the one thing that makes it survivable',
    /take a copy first/i.test(page));

  // 🔴 THE ONE THING ERASURE DOES NOT DO, SAID BEFORE HE PRESSES. deleteUserData() clears the
  // subscriptions row and makes no call to the payment provider, so a live card mandate outlives
  // the account. Silence would be the worst kind of half truth: everybody assumes leaving stops
  // the money.
  const db = read('lib/supabase.ts');
  const del = /export async function deleteUserData[\s\S]*?\n}/.exec(db)?.[0] ?? '';
  ok('the erasure walk was read', del.length > 0);
  ok('🔴 it still makes no call to the payment provider, so the warning below is still true',
    !/stripe/i.test(del));
  ok('🔴 and the page tells him to cancel billing first, and where',
    /href="\/app\/you\/billing"/.test(page) && /cancel/i.test(page));
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE ANSWER THE CHAT GIVES ONCE THE CARD IS OUT OF THE WAY.
//
// 🔴 THE SECOND HALF OF F12, FOUND BY WALKING THE FIX ON 11 AUGUST. Removing the phone card let
// "delete all my data" reach the model, which replied, live, on production:
//
//   "That's a data protection question, not a tax one, so it's outside what I do here. You'd need
//    to contact Lekhio's support team directly about deleting your account and data."
//
// True in the morning, false by the evening: /app/you/data shipped the same day. Sending a man to
// a support queue for something he can do himself in two taps is the same failure as having no
// door, with better manners on it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nTHE CHAT POINTS AT THE DOOR, deterministically\n');
{
  const asks = [
    'delete all my data', 'delete everything you have on me', 'i want to close my account',
    'remove all my information', 'can I export my data', 'gdpr request',
    'right to be forgotten', 'delete my account please',
  ];
  ok('🔴 EVERY WAY HE MIGHT ASK IS RECOGNISED', asks.every((a) => WA.isDataRightsRequest(a)));

  // A guard that fires at everything would swallow real tax questions, which is the defect this
  // whole finding is made of, reached from the other side.
  const notAsks = [
    'can I claim my phone bill', 'delete the last entry', 'what is my data allowance',
    'remove that receipt', 'can I claim broadband', 'how much did I spend on materials',
  ];
  ok('🔴 AND ORDINARY WORK IS NOT', notAsks.every((a) => !WA.isDataRightsRequest(a)));

  ok('the answer names the door rather than a support queue',
    /You, then Your data/.test(WA.DATA_RIGHTS_ANSWER));
  ok('🔴 AND IT DOES NOT SEND HIM TO SUPPORT AS THE FIRST ANSWER',
    WA.DATA_RIGHTS_ANSWER.indexOf('Your data') < WA.DATA_RIGHTS_ANSWER.indexOf('info@lekhio.app'));
  ok('it warns that erasure cannot be undone', /cannot be undone/.test(WA.DATA_RIGHTS_ANSWER));
  ok('and it does not promise more than the privacy policy does',
    /may have to keep/.test(WA.DATA_RIGHTS_ANSWER));

  const route = read('app/api/thread/route.ts');
  ok('🔴 THE LANE RUNS BEFORE THE CLAIM CORPUS, which is what used to eat the question',
    before(route, 'isDataRightsRequest(q)', 'checkExpense(q)'));
  ok('🔴 AND BEFORE THE MODEL, so it costs nothing and cannot vary',
    before(route, 'isDataRightsRequest(q)', 'answerMoneyQuestion('));
}


// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE LAST THREE OF THE THIRTEEN, CLOSED 11 August 2026.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\nF7 the van, the corpus tie break, and the spoken reserved word\n');
{
  // ── F7. The van question reaches his own books, and refuses to pick a winner. ──────────────
  const asks = [
    'do i claim the van or do the mileage thing whats better',
    'i bought the transit in november 9800 do i claim that or mileage',
    'is the van better on mileage',
  ];
  ok('🔴 THE VAN QUESTION IS RECOGNISED AT ALL', asks.every((a) => WA.isVehicleQuestion(a)));
  ok('and an ordinary claim question is not', !WA.isVehicleQuestion('can I claim my boots')
    && !WA.isVehicleQuestion('what did i spend on fuel'));

  const withVan = WA.vehicleAnswer({ boughtThroughBooks: true, allowanceThisYear: 9800 });
  const without = WA.vehicleAnswer({ boughtThroughBooks: false, allowanceThisYear: 0 });
  ok('🔴 IT NAMES THE VEHICLE ALREADY IN HIS BOOKS, and the figure', /9,800/.test(withVan));
  ok('and says nothing about a vehicle he has not got', !/already/.test(without));
  ok('🔴 IT STATES THE LOCK IN, which is the irreversible part the card never mentioned',
    /cannot switch/.test(withVan) && /cannot start claiming/.test(withVan));
  ok('🔴 AND IT NEVER SAYS WHICH IS BETTER, because that turns on miles his books do not hold',
    !/\b(better|best|cheaper|you should claim|I would)\b/i.test(without.replace('comes out ahead', '')));
  ok('it sends him to the screen that can finish the sum', /Tax, then Vehicle/.test(without));

  const route = read('app/api/thread/route.ts');
  ok('🔴 THE LANE RUNS BEFORE THE CLAIM CORPUS, which is what answered it with a card',
    before(route, 'isVehicleQuestion(q)', 'checkExpense(q)'));
  ok('and it reads his own books rather than a template',
    /vehicleBoughtThroughBooks/.test(route) && /ytdCapitalAllowances/.test(route));

  // ── The corpus tie break. An over claim on a penalty is the worst thing this file can do. ──
  ok('🔴 A PARKING TICKET IS NO LONGER ANSWERED WITH "TRAINING AND COURSES, MOSTLY YES"',
    checkExpense('can I claim a parking ticket')?.key === 'parking');
  ok('🔴 AND THE RULE IT NOW REACHES IS THE ONE THAT SAYS HMRC NEVER ALLOWS A FINE',
    /never/i.test(checkExpense('can I claim a parking ticket')?.rule ?? ''));
  ok('car parking is parking, not a car', checkExpense('can I claim car parking')?.key === 'parking');
  ok('van insurance is insurance, not a van',
    checkExpense('what about my van insurance')?.key === 'insurance');
  ok('and the plain cases are untouched',
    checkExpense('can I claim my van')?.key === 'van'
    && checkExpense('can I claim a car')?.key === 'car'
    && checkExpense('can I claim a course')?.key === 'training');
  ok('🔴 THE MATCHER PICKS THE MOST SPECIFIC ALIAS, not the first rule in the file',
    /alias\.length > bestLen/.test(read('lib/claimrules.data.ts')));

  // ── A spoken reserved word is still a reserved word. ───────────────────────────────────────
  const vf = read('lib/voiceflow.ts');
  ok('🔴 A VOICE NOTE IS CHECKED FOR A RESERVED WORD BEFORE IT REACHES THE PARSER',
    before(vf, 'matchReservedWord(clean)', 'parseSpokenTransaction(clean)'));
  ok('🔴 AND IT REFUSES RATHER THAN ACTS, because Whisper mishears and a misheard STOP is worse',
    /nothing has changed/.test(vf) && /Send it to me as a text/.test(vf));
  ok('the outcome is named, so the caller can tell it from a failed parse',
    /'reserved'/.test(vf) && /VoiceFinishOutcome = [^;]*'reserved'/.test(vf));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
