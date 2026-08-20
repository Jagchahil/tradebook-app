// What the email capture PROMISES, per page. See leadPromise() in lib/features.ts.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// RUN 0 of the customer week, 11 August 2026, joined the free filing waitlist as a stranger and
// was told four separate times that a result was on its way.
//
//   the button        "Email me my result"
//   the consent line  "Yes, email me my result plus occasional money saving tips"
//   the thank you     "We will send your result over. Check your inbox."
//   the confirm email "You asked us to send you your result."
//
// There is no result on /free-mtd-filing. Free filing is not built, the page says so plainly and
// well, and the only thing he did was join a list. The page had already overridden its heading and
// its sub to say exactly that, which is precisely why nobody caught the other four: they live
// inside a shared component, on a page nobody was looking at while editing it.
//
// The consent line is the one that matters most. It is STORED, as the proof of what he agreed to
// under UK PECR, so it has to be true on the day he ticks it.
//
// THE RULE THIS SUITE HOLDS: a waitlist source never says the word "result", anywhere, in any of
// the four places, and the eleven tool sources keep saying it, because for them it is true.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { leadPromise, leadButton, leadConsentText, leadDoneLine } from '../lib/features.ts';

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

function before(hay, a, b) {
  const i = hay.indexOf(a);
  const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

console.log('\n--- 1. Which sources are a list, and which have actually worked something out ---\n');

// Every page that renders the capture, read off the pages rather than listed here, so a twelfth
// page cannot join without this suite seeing it.
const sources = [];
const pageFiles = [
  'app/tax-calculator/Calc.tsx', 'app/cis-calculator/Calc.tsx', 'app/ni-checker/Calc.tsx',
  'app/student-loan-checker/Calc.tsx', 'app/landlord-tax-calculator/Calc.tsx',
  'app/rent-a-room-checker/Calc.tsx', 'app/sole-trader-vs-limited/Calc.tsx',
  'app/invoice-generator/Generator.tsx', 'app/can-i-claim/page.tsx',
  'app/how-mtd-works/page.tsx', 'app/free-mtd-filing/page.tsx',
];
for (const f of pageFiles) {
  const src = read(f);
  const s = /source="([^"]+)"/.exec(src)?.[1] ?? null;
  ok(`${f} still renders a capture with a named source`, Boolean(s));
  if (s) sources.push(s);
}

ok('🔴 /free-mtd-filing is a WAITLIST', leadPromise('free-mtd-filing') === 'waitlist');
for (const s of sources.filter((x) => x !== 'free-mtd-filing')) {
  ok(`${s} is a tool that has a result to send`, leadPromise(s) === 'result');
}
ok('an unknown source gets the honest default rather than promising a result it cannot send',
  ['result', 'waitlist'].includes(leadPromise('something-added-next-year')));

console.log('\n--- 2. The four sentences. A waitlist never says "result" ---\n');

const waitlistWords = [
  ['the button', leadButton('waitlist')],
  ['the consent line', leadConsentText('waitlist')],
  ['the thank you', leadDoneLine('waitlist')],
];
for (const [what, text] of waitlistWords) {
  ok(`🔴 ${what} does not promise a result: "${text}"`, !/result/i.test(text));
  ok(`${what} says what actually happens instead`, /free filing|when it opens|opens/i.test(text));
}

// And the eleven keep theirs, because theirs is true. A fix that quietly took the word off every
// page would be a different kind of wrong.
ok('the tool button still offers the result', /result/i.test(leadButton('result')));
ok('the tool consent line still offers the result', /result/i.test(leadConsentText('result')));
ok('the tool thank you still offers the result', /result/i.test(leadDoneLine('result')));

// The consent line is evidence, so it still has to carry the two things PECR needs.
ok('🔴 the waitlist consent line still names the marketing and the way out',
  /money saving tips/i.test(leadConsentText('waitlist')) && /unsubscribe/i.test(leadConsentText('waitlist')));

console.log('\n--- 3. The component reads the source, rather than each page remembering to ---\n');
{
  const lc = read('components/LeadCapture.tsx');
  ok('LeadCapture works out the promise from the source it was given',
    /const promise = leadPromise\(source\)/.test(lc));
  for (const [what, call] of [
    ['the button', 'leadButton(promise)'],
    ['the stored consent', 'leadConsentText(promise)'],
    ['the thank you', 'leadDoneLine(promise)'],
  ]) {
    ok(`🔴 ${what} goes through the promise`, lc.includes(call));
  }
  ok('🔴 AND THE WORD IS NOT TYPED IN THE COMPONENT ANY MORE', !/Email me my result/.test(lc));
  ok('the promise is worked out before the form is submitted',
    before(lc, 'const promise = leadPromise(source)', 'consent_text: leadConsentText(promise)'));
}

console.log('\n--- 4. The confirm email, which is the one that arrives after he has decided ---\n');
{
  const email = read('lib/email.ts');
  const fn = /export async function sendLeadConfirmEmail[\s\S]*?\n}/.exec(email)?.[0] ?? '';
  const listFn = /export async function sendLeadListConfirmEmail[\s\S]*?\n}/.exec(email)?.[0] ?? '';
  ok('sendLeadConfirmEmail was read', fn.length > 0);
  ok('sendLeadListConfirmEmail was read', listFn.length > 0);
  ok('the one door takes the promise', /promise: LeadPromise = 'result'/.test(fn));
  // 🔴 TWO SENDERS RATHER THAN A TERNARY, because test/subjectrule.test.mjs requires one findable
  // send site per repeating subject key. One door decides; two senders write.
  ok('🔴 and it hands a waitlist straight to the waitlist sender',
    /if \(promise === 'waitlist'\) return sendLeadListConfirmEmail\(/.test(fn));
  ok('🔴 the waitlist body does not say "result"',
    /You asked to be told when free MTD prep opens/.test(listFn) && !/your result/.test(listFn));
  ok('and the tool body still does', /You asked us to send you your result/.test(fn));
  ok('the waitlist preheader does not say it either',
    /One tap and you are on the list/.test(listFn) && !/result is on its way/.test(listFn));
  ok('nor does the waitlist reset line promise a tool result',
    /join again from the page/.test(listFn));

  // 🔴 A DIFFERENT SUBJECT, OR GMAIL COLLAPSES THEM. A man who used a calculator this morning and
  // joined this list this afternoon is confirming two different things. Same argument as the
  // 9 August thread collision, which is why the subject is registered rather than inlined.
  ok('the waitlist confirm has its own repeating subject key',
    /'lead-confirm-list': \(mark\) => `Confirm your email to join the free MTD prep list/.test(email));
  ok('and it is declared in the RepeatKey union, so tsc sees it', /\| 'lead-confirm-list'/.test(email));
  ok('and it declares where its mark comes from', /'lead-confirm-list': \{\s*\n\s*source: 'moment'/.test(email));
  ok('the two subjects are different strings, which is the whole point',
    /Confirm your email to get your result/.test(email) && /Confirm your email to join the free MTD prep list/.test(email));

  const route = read('app/api/lead/route.ts');
  ok('🔴 THE ROUTE PASSES THE SOURCE THROUGH rather than trusting the default',
    /sendLeadConfirmEmail\(email, confirmUrl\(email\), unsubscribeUrl\(email\), new Date\(\), leadPromise\(source/.test(route));
}

console.log('\n--- 5. The page itself still tells the truth about what is not built ---\n');
{
  const page = read('app/free-mtd-filing/page.tsx');
  // 🔴 B89, 20 August 2026: the heading said "free filing opens", and filing is HMRC's to open,
  // not ours. What a stranger joins a list for has to be a thing we can actually deliver him.
  ok('the heading still says what he is joining', /Be first when free MTD prep opens/.test(page));
  ok('and the sub still promises only that',
    /we will tell you the moment you can get your basic quarterly update prepared free/.test(page));
  ok('🔴 and nothing on the page claims filing is live',
    !/file your return (now|today)|filing is live/i.test(page));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
