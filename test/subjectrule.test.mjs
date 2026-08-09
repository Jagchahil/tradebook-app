// THE SUBJECT RULE. Run: node test/subjectrule.test.mjs
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS SUITE EXISTS, AND WHY IT IS A RATCHET RATHER THAN A LIST OF STRINGS.
//
// 7 August 2026. Every sign in code WAS delivered and the customer still could not find one. The
// magic link subject was the fixed string "Your Lekhio Code". GMAIL THREADS BY SENDER PLUS SUBJECT
// AND HEADS A THREAD WITH ITS OLDEST MESSAGE, so every code a man had ever been sent collapsed
// into ONE conversation, dated whenever the first one arrived, sitting wherever that date sits.
// Nothing new ever appeared at the top of his inbox. Eight codes in one thread and two of them in
// Trash, because tidying away a spent code bins the new one filed underneath it. It cost a week.
//
// Then seven of our OWN emails turned out to have exactly the same shape. The worst was "Your week
// is ready", every Sunday for the life of the customer, fifty two a year, all in one thread.
//
// ⚠️ THIS SUITE IS NOT A LIST OF APPROVED SUBJECT LINES. A list would go stale the day somebody
// rewrote the copy, and it would say nothing at all about the email added in six months, which is
// the one that will have the bug. It asserts the PROPERTY instead:
//
//     every subject an email can produce more than once must differ when the input differs.
//
// It walks REPEATING_SUBJECTS, calls every entry twice with two different marks, and goes red when
// the two come back the same. Add a repeating email without a mark and this stops the build. There
// is no way to write the bug and stay green, which is the only kind of test worth having for a
// defect that has now been shipped twice.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 9 AUGUST 2026. IT WAS SHIPPED A THIRD TIME, AND THE ORIGINAL RATCHET WATCHED IT HAPPEN.
//
// Two lead confirm emails reached one real Gmail inbox FIFTY THREE SECONDS apart. Both subjects
// read "Confirm your email to get your result, 9 August", byte for byte, and Gmail collapsed them
// into ONE conversation, id 19fe3c19bd3f15ce, headed by the OLDER message. The Gmail search
// returned the pair as a single result.
//
// The suite was green throughout, and it was right to be: it asked whether TWO DIFFERENT MARKS
// give two different subjects, and they do. What it never asked is whether the mark itself can
// change twice in one day. subjectDay() is day and month with no year and no clock, so it is a
// constant for twenty four hours, and FIVE of the eight keys were built on it.
//
// So the ratchet has a second half now, and it is the half that would have caught this:
//
//     every subject an email can produce TWICE IN ONE DAY must differ between those two sends.
//
// The two instants it uses are the two from that inbox: 53 seconds apart, and deliberately placed
// inside ONE minute, because a mark that resolves to the minute would still collapse them about one
// time in nine and would collapse a double tapped submit button every time.
//
// A key may be let off, and two are. It costs a named entry in SAME_DAY_EXEMPT carrying an argument
// a person can read and disagree with. The exempt set is DERIVED from SUBJECT_MARKS and held to
// that list by equality, in both directions, so an exemption can never be taken by leaving a key
// quietly out of a loop.
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// The second half is the honesty half. It sends the REAL emails through a stubbed Resend, reads
// what would have gone on the wire, and models Gmail's threading on it. That is the assertion in
// the customer's own terms: three Sundays in a row must produce three threads.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const src = (rel) => readFileSync(path.join(repo, rel), 'utf8');

// Node's type stripping cannot follow an extensionless relative import, so the module and its
// dependencies are staged with the rewrite every engine suite in here uses.
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const stage = mkdtempSync(path.join(tmpdir(), 'subjectrule-'));
for (const f of ['email', 'entitlement', 'onboarding', 'vat', 'money', 'newsletter', 'taxengine', 'nurture', 'presale', 'housestyle']) {
  writeFileSync(path.join(stage, f + '.ts'), fixImports(src('lib/' + f + '.ts')));
}
const stagedImport = (f) => import(pathToFileURL(path.join(stage, f + '.ts')).href);

// The secret must exist before lib/leadtoken.ts is imported, because it reads it at load time.
process.env.LEAD_TOKEN_SECRET = 'subject-rule-suite-secret-not-real';
// Resend must look configured or send() returns false before it ever composes a subject.
process.env.RESEND_API_KEY = 'subject-rule-suite-key-not-real';

const email = await stagedImport('email');
const newsletter = await stagedImport('newsletter');
const nurture = await stagedImport('nurture');
const presale = await stagedImport('presale');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const {
  REPEATING_SUBJECTS, ONCE_PER_CUSTOMER, CALLER_OWNS_SUBJECT,
  resolveSubject, subjectDay, weekEndingDay,
} = email;

// ═══ 1. THE RATCHET ═══════════════════════════════════════════════════════
// Every repeating subject, called twice with two different marks. This is the whole suite.
console.log('\n-- the ratchet: a repeating subject must change when its mark changes --');

const keys = Object.keys(REPEATING_SUBJECTS ?? {});
ok('there is a registry of repeating subjects', keys.length > 0);

// Two marks that share no characters, so a function that merely truncates or lowercases its input
// cannot accidentally satisfy this.
const MARK_A = '11 January';
const MARK_B = '29 September';

for (const key of keys) {
  const compose = REPEATING_SUBJECTS[key];
  ok(`${key}: the registry entry is a function`, typeof compose === 'function');
  const a = compose(MARK_A);
  const b = compose(MARK_B);
  ok(`${key}: composes a non-empty subject`, typeof a === 'string' && a.trim().length > 0);
  // 🔴 THE ASSERTION THE WHOLE LANE EXISTS FOR.
  ok(`🔴 ${key}: TWO DIFFERENT MARKS MUST GIVE TWO DIFFERENT SUBJECTS`, a !== b);
  // And the mark has to be IN it. A subject that varies by something the reader cannot see is a
  // hash, not a subject: he still cannot tell which one is this week's.
  ok(`${key}: the mark he needs is in the subject`, a.includes(MARK_A) && b.includes(MARK_B));
}

// Two DIFFERENT emails must not collide either, or a payment receipt and a weekly summary land in
// one conversation.
const sameMark = keys.map((k) => REPEATING_SUBJECTS[k](MARK_A));
ok('no two repeating emails compose the same subject from the same mark', new Set(sameMark).size === sameMark.length);

// ═══ 1b. THE SAME DAY RATCHET ═════════════════════════════════════════════
// The half that was missing on 9 August. Everything above is satisfied by a mark that changes once
// a day; this is satisfied only by a mark that changes on every send.
console.log('\n-- the same day ratchet: two sends on ONE day must be two threads --');

// Missing exports are reported rather than thrown, so reverting the fix prints a readable red
// instead of a stack trace nobody reads.
ok('🔴 lib/email.ts exports subjectMoment, the mark that can tell two sends in one day apart',
  typeof email.subjectMoment === 'function');
const subjectMoment = typeof email.subjectMoment === 'function' ? email.subjectMoment : () => 'NO MOMENT MARK';
const MARKS = email.SUBJECT_MARKS ?? {};
const EXEMPT = email.SAME_DAY_EXEMPT ?? {};

// 🔴 THE TWO INSTANTS FROM THE INBOX. 53 seconds apart, same London day, and same London MINUTE,
// which is the half of that gap a minute resolution mark would still lose.
const T1 = new Date('2026-08-09T13:00:03Z');
const T2 = new Date('2026-08-09T13:00:56Z');
const londonMinute = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/London' });
ok('the two instants are the 53 seconds seen in the inbox', T2 - T1 === 53_000);
ok('...on one calendar day in London', subjectDay(T1) === subjectDay(T2));
ok('...inside one minute of it, so a minute resolution mark would not save us', londonMinute(T1) === londonMinute(T2));

// The mark each key really uses, built by the real producer, so this tests what ships rather than a
// hand made string that happens to differ.
const KNOWN_SOURCES = ['moment', 'day', 'week', 'caller'];
const sameDayMarks = (source) => {
  if (source === 'moment') return [subjectMoment(T1), subjectMoment(T2)];
  if (source === 'day') return [subjectDay(T1), subjectDay(T2)];
  if (source === 'week') return [weekEndingDay(T1), weekEndingDay(T2)];
  // 'caller': the uniqueness is real but it is not ours. Two sends, two caller values.
  if (source === 'caller') return ['INV-001', 'INV-002'];
  // ⚠️ AN UNDECLARED SOURCE IS NOT A PASS. Two identical marks, so a key with no decision on file
  // goes red on the assertion below rather than quietly borrowing the caller arm's uniqueness. The
  // default case of a ratchet has to be the failure, or the ratchet is a formality.
  return ['NO MARK SOURCE DECLARED', 'NO MARK SOURCE DECLARED'];
};

const markKeys = Object.keys(MARKS);
const exemptKeys = Object.keys(EXEMPT);
const sameSet = (a, b) => a.length === b.length && a.every((k) => b.includes(k)) && b.every((k) => a.includes(k));

// 🔴 KEY NUMBER NINE CANNOT BE ADDED WITHOUT A DECISION. Equality, not containment: a registry that
// is merely a subset is satisfied by forgetting the new key, which is exactly how this got shipped.
ok('🔴 EVERY REPEATING KEY DECLARES WHERE ITS MARK COMES FROM, AND THE TWO KEY LISTS ARE EQUAL',
  sameSet(keys, markKeys));
ok('every same day exemption names a repeating email that exists', exemptKeys.every((k) => keys.includes(k)));
// And the exemption list is EXACTLY the set of keys whose mark cannot change inside a day. Not a
// superset (an exemption nobody needs) and not a subset (a silent omission, which is the bug).
const cannotChangeInADay = keys.filter((k) => MARKS[k]?.source === 'day' || MARKS[k]?.source === 'week');
ok('🔴 A KEY WHOSE MARK CANNOT CHANGE WITHIN A DAY IS ON THE EXEMPTION LIST, AND NOTHING ELSE IS',
  sameSet(cannotChangeInADay, exemptKeys));
for (const k of exemptKeys) {
  // Same discipline as ONCE_PER_CUSTOMER: the value IS the exemption, so a word is not enough.
  ok(`${k}: the same day exemption carries an argument a person can disagree with`,
    typeof EXEMPT[k] === 'string' && EXEMPT[k].length > 80);
}

for (const key of keys) {
  const source = MARKS[key]?.source;
  ok(`${key}: names a mark source we know how to build`, KNOWN_SOURCES.includes(source));
  ok(`${key}: the choice of mark is argued in writing`, typeof MARKS[key]?.why === 'string' && MARKS[key].why.length > 40);
  const [m1, m2] = sameDayMarks(source);
  const s1 = REPEATING_SUBJECTS[key](m1);
  const s2 = REPEATING_SUBJECTS[key](m2);
  if (exemptKeys.includes(key)) {
    // Let off, out loud. The day still has to tell one day from the next, which is the property the
    // exemption does NOT get to give up.
    ok(`${key}: exempt by a written decision, not by omission`, typeof EXEMPT[key] === 'string' && EXEMPT[key].length > 80);
    const across = REPEATING_SUBJECTS[key](source === 'week' ? weekEndingDay(new Date('2026-08-16T23:00:00Z')) : subjectDay(new Date('2026-08-10T13:00:00Z')));
    ok(`${key}: and it still tells one day from the next`, across !== s1);
  } else {
    // 🔴 THE ASSERTION THE 9 AUGUST INBOX DEMANDS.
    ok(`🔴 ${key}: TWO SENDS 53 SECONDS APART ON ONE DAY MUST GIVE TWO DIFFERENT SUBJECTS`, s1 !== s2);
    ok(`${key}: and both marks are visible to the man reading them`, s1.includes(m1) && s2.includes(m2));
  }
}

// ═══ 1c. THE MOMENT MARK ITSELF ═══════════════════════════════════════════
console.log('\n-- the moment mark --');

const MOMENT = /^\d{1,2} [A-Z][a-z]+ at \d{1,2}:\d{2}:\d{2}(?:am|pm)$/;
ok('a moment reads like a British date and a British clock', MOMENT.test(subjectMoment(T1)));
ok('it leads with the day, written exactly as subjectDay writes it', subjectMoment(T1).startsWith(subjectDay(T1)));
ok('🔴 TWO SENDS INSIDE ONE MINUTE ARE TWO DIFFERENT MARKS', subjectMoment(T1) !== subjectMoment(T2));
ok('it is London time and not UTC, so British Summer Time is the hour he saw',
  subjectMoment(T1) === '9 August at 2:00:03pm');
ok('winter is GMT, and the clock does not drift an hour',
  subjectMoment(new Date('2026-01-15T09:05:06Z')) === '15 January at 9:05:06am');
ok('midnight is 12am, never 0am and never 24', subjectMoment(new Date('2026-01-15T00:00:00Z')) === '15 January at 12:00:00am');
ok('noon is 12pm', subjectMoment(new Date('2026-01-15T12:00:00Z')) === '15 January at 12:00:00pm');
ok('late on a summer Sunday it rolls the DAY too, not just the clock',
  subjectMoment(new Date('2026-08-09T23:30:00Z')) === '10 August at 12:30:00am');
ok('subjectMoment survives a bad date rather than printing Invalid Date', MOMENT.test(subjectMoment(new Date('not a date'))));
ok('subjectMoment defaults to now rather than throwing', MOMENT.test(subjectMoment()));
// ⚠️ AND IT IS STILL NOT MONEY. The clock is his business; his turnover is not.
ok('🔴 A MOMENT CARRIES NO FIGURE HE EARNED', !/£/.test(subjectMoment(T1)));

// ═══ 2. THE DAY IS A REAL DAY, AND THE WEEKLY ONE IS THE RIGHT DAY ════════
console.log('\n-- the marks themselves --');

ok('subjectDay reads like a British date', /^\d{1,2} [A-Z][a-z]+$/.test(subjectDay(new Date('2026-08-07T09:00:00Z'))));
ok('subjectDay changes from one day to the next',
  subjectDay(new Date('2026-08-07T09:00:00Z')) !== subjectDay(new Date('2026-08-08T09:00:00Z')));
ok('subjectDay survives a bad date rather than printing Invalid Date',
  /^\d{1,2} [A-Z][a-z]+$/.test(subjectDay(new Date('not a date'))));

// 🔴 THE JOB FIRES AT 23:00 UTC ON SUNDAY. In British Summer Time that instant is already Monday in
// London, so the naive version dates his week to the day AFTER it ended.
ok('🔴 the Sunday 23:00 UTC send in BST is dated to the Sunday, not the Monday',
  weekEndingDay(new Date('2026-08-09T23:00:00Z')) === '9 August');
ok('the same job in winter is dated to the Sunday too',
  weekEndingDay(new Date('2026-11-08T23:00:00Z')) === '8 November');
ok('a run that slipped past midnight still names the week that ended',
  weekEndingDay(new Date('2026-08-10T01:00:00Z')) === '9 August');
ok('consecutive weeks give consecutive Sundays',
  weekEndingDay(new Date('2026-08-09T23:00:00Z')) !== weekEndingDay(new Date('2026-08-16T23:00:00Z')));
ok('weekEndingDay survives a bad date', /^\d{1,2} [A-Z][a-z]+$/.test(weekEndingDay(new Date('nonsense'))));

// ═══ 3. THE EXEMPTIONS MUST BE ARGUED, NOT ASSERTED ═══════════════════════
console.log('\n-- once per customer, and caller owned --');

const onceKeys = Object.keys(ONCE_PER_CUSTOMER ?? {});
ok('the once per customer exemptions are written down', onceKeys.length > 0);
for (const k of onceKeys) {
  // The value is the REASON. A one word reason is not a reason, and this is the only thing standing
  // between "it only sends once" and somebody typing that because it was convenient.
  ok(`${k}: the exemption carries a real reason`, typeof ONCE_PER_CUSTOMER[k] === 'string' && ONCE_PER_CUSTOMER[k].length > 40);
}
const callerKeys = Object.keys(CALLER_OWNS_SUBJECT ?? {});
ok('the caller owned subjects are written down', callerKeys.length > 0);
for (const k of callerKeys) {
  ok(`${k}: the reason the caller owns it is written down`, typeof CALLER_OWNS_SUBJECT[k] === 'string' && CALLER_OWNS_SUBJECT[k].length > 40);
}
ok('reply is caller owned, because a reply MUST keep its subject to thread', callerKeys.includes('reply'));

// resolveSubject reaches all three arms.
ok('resolveSubject composes a repeating subject', resolveSubject({ repeats: keys[0], mark: MARK_A }) === REPEATING_SUBJECTS[keys[0]](MARK_A));
ok('resolveSubject passes a once per customer subject through', resolveSubject({ once: onceKeys[0], subject: 'A fixed one' }) === 'A fixed one');
ok('resolveSubject passes a caller subject through', resolveSubject({ caller: 'reply', subject: 'Re: my van' }) === 'Re: my van');

// ═══ 4. NO EMAIL MAY REACH RESEND WITH A BARE STRING SUBJECT ══════════════
// tsc already refuses it, because send() takes the union. This says so out loud, so an `as any` or
// a hand-rolled fetch cannot quietly reopen the door.
console.log('\n-- the source cannot express the bug --');

const emailSrc = src('lib/email.ts');
// The `once` and `caller` arms legitimately hold a string, and it is the arm itself that carries
// the argument for why. Blank those out, and anything still shaped like `subject: 'a string'` is an
// email that skipped the union.
const strippedSrc = emailSrc.replace(/\{\s*(?:once|caller):\s*'[^']*',\s*subject:[\s\S]*?\}/g, '{UNION}');
const bareSubject = strippedSrc.match(/subject:\s*(?:'|"|`)/g) || [];
ok('🔴 no subject is handed to send() as a bare string literal', bareSubject.length === 0);
// Every arm names a key that has a written reason beside it. tsc refuses an unknown one; this says
// so where a reader can see it.
for (const [, k] of emailSrc.matchAll(/\{\s*once:\s*'([^']*)'/g)) ok(`the once key ${k} has a reason on file`, onceKeys.includes(k));
for (const [, k] of emailSrc.matchAll(/\{\s*caller:\s*'([^']*)'/g)) ok(`the caller key ${k} has a reason on file`, callerKeys.includes(k));
for (const [, k] of emailSrc.matchAll(/\{\s*repeats:\s*'([^']*)'/g)) ok(`the repeat key ${k} is in the registry`, keys.includes(k));
// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND SUBJECT_MARKS MUST NOT BE ABLE TO LIE ABOUT ITS SENDER.
//
// This is the seam the 9 August defect actually lived in. The builders were correct, the registry
// would have been correct, and the BUG was in between: five senders composing a correct subject out
// of a mark that is constant for twenty four hours. Part 7b catches that behaviourally for the six
// senders it drives, but it cannot see a NINTH email whose sender it has never heard of.
//
// So the claim is checked against the code. For every key, the body of the function that sends it
// must reach for exactly the mark producer the registry declares, and no other.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const PRODUCER = { moment: 'subjectMoment(', day: 'subjectDay(', week: 'weekEndingDay(' };
const CLOCKS = Object.values(PRODUCER);
for (const key of keys) {
  const at = emailSrc.indexOf(`repeats: '${key}'`);
  ok(`${key}: has exactly one send site in lib/email.ts`,
    at > -1 && emailSrc.indexOf(`repeats: '${key}'`, at + 1) === -1);
  const fnStart = emailSrc.lastIndexOf('export async function', at);
  const fnEnd = emailSrc.indexOf('\nexport ', at);
  const body = at > -1 && fnStart > -1 ? codeOnly(emailSrc.slice(fnStart, fnEnd === -1 ? emailSrc.length : fnEnd)) : '';
  const used = CLOCKS.filter((c) => body.includes(c));
  const source = MARKS[key]?.source;
  if (source === 'caller') {
    ok(`${key}: the caller really does supply the mark, with no clock anywhere near it`,
      body.length > 0 && used.length === 0);
  } else {
    ok(`🔴 ${key}: THE SENDER HANDS IT THE MARK ITS REGISTRY ENTRY DECLARES (${source}), AND ONLY THAT ONE`,
      used.length === 1 && used[0] === PRODUCER[source]);
  }
}

ok("send() takes the union and not a string", /subject:\s*EmailSubject/.test(emailSrc));
ok('send() resolves the union rather than passing it on', /subject:\s*resolveSubject\(opts\.subject\)/.test(emailSrc));
// Exactly one fetch to Resend outside send(), and it is the front desk reply, which is allowed to
// keep its subject. If a second one appears it has bypassed the rule.
const resendCalls = (emailSrc.match(/api\.resend\.com\/emails/g) || []).length;
ok('only send() and the front desk reply talk to Resend', resendCalls === 2);

// ═══ 5. THE REGISTRIES THAT HOLD THEIR OWN SUBJECTS ═══════════════════════
// A campaign writes its own subject and that is correct. What is NOT correct is two of them being
// the same, which is what a copied and pasted issue produces.
console.log('\n-- the campaign registries --');

const nlSubjects = newsletter.NEWSLETTERS.map((n) => n.subject);
ok('every newsletter issue has a subject', nlSubjects.every((s) => typeof s === 'string' && s.trim().length > 0));
ok('no two newsletter issues share a subject', new Set(nlSubjects).size === nlSubjects.length);

const nuSubjects = nurture.NURTURE_SEQUENCE.map((e) => e.subject);
ok('no two nurture stages share a subject', new Set(nuSubjects).size === nuSubjects.length);

const psSubjects = presale.PRESALE_LADDER.map((s) => s.subject).filter(Boolean);
ok('no two presale steps share a subject', new Set(psSubjects).size === psSubjects.length);

// The trial pair. Both are once per customer, but they are two different emails and must not land
// in one thread with each other.
const trialSrc = src('lib/trialnudge.ts');
const trialWeek = trialSrc.match(/TRIAL_WEEK_SUBJECT\s*=\s*'([^']*)'/)?.[1] ?? '';
const trialEnded = trialSrc.match(/TRIAL_ENDED_SUBJECT\s*=\s*'([^']*)'/)?.[1] ?? '';
ok('the two trial subjects both exist', trialWeek.length > 0 && trialEnded.length > 0);
ok('the two trial subjects are different from each other', trialWeek !== trialEnded);

// ═══ 6. HOUSE STYLE, IN EVERY SUBJECT WE COMPOSE ══════════════════════════
console.log('\n-- house style --');

const everySubject = [
  ...keys.map((k) => REPEATING_SUBJECTS[k]('7 August')),
  // The same eight again wearing the new mark, because the house style rule applies to the shape
  // that actually ships and not only to the one that used to.
  ...keys.map((k) => REPEATING_SUBJECTS[k](subjectMoment(T1))),
  ...onceKeys.map((k) => ONCE_PER_CUSTOMER[k]),
  ...nlSubjects, ...nuSubjects, ...psSubjects, trialWeek, trialEnded,
];
for (const s of everySubject) {
  // The dash characters are written as escapes on purpose. A file that forbids a character has no
  // business being the one place in the repo that contains it.
  ok(`no em or en dash in ${JSON.stringify(s.slice(0, 44))}`, !/[\u2013\u2014]/.test(s));
  ok(`no hyphen used as a dash in ${JSON.stringify(s.slice(0, 44))}`, !/ \x2D | \x2D$|^\x2D /.test(s));
}
// We PREPARE, he APPROVES. A subject line is the one bit of copy that gets read whether he opens
// the email or not, so it is the last place to imply we file anything.
for (const s of everySubject) {
  ok(`no filing claim in ${JSON.stringify(s.slice(0, 44))}`, !/\bwe (?:will )?(?:file|submit|filed|submitted)\b/i.test(s));
}

// ═══ 7. THE CUSTOMER'S OWN TERMS. REAL SENDS, MODELLED THROUGH GMAIL ══════
console.log("\n-- what actually lands in his inbox --");

const wire = [];
globalThis.fetch = async (_url, init) => {
  wire.push(JSON.parse(init.body));
  return { ok: true, status: 200, json: async () => ({ id: 'stub' }) };
};

const TO = 'dave@example.test';
const sunday = (d) => new Date(`2026-08-${d}T23:00:00Z`);
// Three Sundays running, which is the shape that broke.
await email.sendWeeklyReadyEmail(TO, sunday('09'));
await email.sendWeeklyReadyEmail(TO, sunday('16'));
await email.sendWeeklyReadyEmail(TO, sunday('23'));
// Two renewals a month apart, then two dunning retries for the SAME amount on different days.
await email.sendPaymentConfirmedEmail({ to: TO, amountPence: 1200, when: new Date('2026-08-12T09:00:00Z') });
await email.sendPaymentConfirmedEmail({ to: TO, amountPence: 1200, when: new Date('2026-09-12T09:00:00Z') });
await email.sendPaymentFailedEmail({ to: TO, amountPence: 1200, updateUrl: 'https://lekhio.app/billing', when: new Date('2026-08-12T09:00:00Z') });
await email.sendPaymentFailedEmail({ to: TO, amountPence: 1200, updateUrl: 'https://lekhio.app/billing', when: new Date('2026-08-15T09:00:00Z') });
// Two free tool uses a month apart, and the results that follow them.
await email.sendLeadConfirmEmail(TO, 'https://lekhio.app/c', 'https://lekhio.app/u', new Date('2026-08-12T09:00:00Z'));
await email.sendLeadConfirmEmail(TO, 'https://lekhio.app/c', 'https://lekhio.app/u', new Date('2026-09-12T09:00:00Z'));
await email.sendLeadResultEmail(TO, 'A note', 'https://lekhio.app/u', new Date('2026-08-12T09:00:00Z'));
await email.sendLeadResultEmail(TO, 'A note', 'https://lekhio.app/u', new Date('2026-09-12T09:00:00Z'));
// A waitlist join and a second attempt the next day.
await email.sendWaitlistWelcomeEmail(TO, null, new Date('2026-08-12T09:00:00Z'));
await email.sendWaitlistWelcomeEmail(TO, null, new Date('2026-08-13T09:00:00Z'));
// Two sign in codes, the pair that started all of this.
await email.sendSignupCodeEmail(TO, '481920');
await email.sendSignupCodeEmail(TO, '773311');
// Two invoices from one tradesman to one customer.
await email.sendInvoiceEmail({ to: TO, number: 'INV-001', total: 450, link: 'https://lekhio.app/invoice/1', businessName: 'Dave Sparks' });
await email.sendInvoiceEmail({ to: TO, number: 'INV-002', total: 900, link: 'https://lekhio.app/invoice/2', businessName: 'Dave Sparks' });

ok('every one of those emails reached the wire', wire.length === 17);

// Gmail threads by sender plus subject. Model it exactly.
const threads = new Map();
for (const m of wire) {
  const key = `${m.from} ${m.subject}`;
  threads.set(key, (threads.get(key) ?? 0) + 1);
}
const collapsed = [...threads.entries()].filter(([, n]) => n > 1);
for (const [key, n] of collapsed) console.log(`       COLLAPSED x${n}  ${JSON.stringify(key.split(' ')[1])}`);
ok('🔴 17 EMAILS LAND IN 17 GMAIL THREADS, NOT ONE OF THEM HIDDEN UNDER AN OLDER ONE', threads.size === wire.length);

// And the three Sundays in particular, because that is the one he gets for the rest of his life.
const weeklySubjects = wire.filter((m) => /^Your week to /.test(m.subject)).map((m) => m.subject);
ok('the three Sunday summaries are three different subjects', new Set(weeklySubjects).size === 3);
ok('the Sunday summary names the Sunday its week ended on', weeklySubjects[0] === 'Your week to 9 August is ready');

// ⚠️ AND NEVER HIS MONEY. A subject is readable on a locked phone with a passenger beside him.
for (const m of wire) {
  ok(`no figure in ${JSON.stringify(m.subject.slice(0, 44))}`, !/£/.test(m.subject));
}

// The invoice pair keeps carrying the number, which was already right and must stay right.
const invoiceSubjects = wire.filter((m) => /^Invoice /.test(m.subject)).map((m) => m.subject);
ok('an invoice subject still carries its number', invoiceSubjects.some((s) => s.includes('INV-001')) && invoiceSubjects.some((s) => s.includes('INV-002')));
ok('two invoices to one customer are two threads', new Set(invoiceSubjects).size === 2);

// The signup code, the original defect, still in the subject.
const codeSubjects = wire.filter((m) => /is your Lekhio code$/.test(m.subject)).map((m) => m.subject);
ok('🔴 the sign in code is still IN the subject', codeSubjects.includes('481920 is your Lekhio code') && codeSubjects.includes('773311 is your Lekhio code'));

// ═══ 7b. THE 9 AUGUST INBOX, REPLAYED THROUGH THE REAL SENDERS ════════════
//
// 🔴 THIS IS THE ONE THAT GOES RED IF THE FIX IS TAKEN OUT OF lib/email.ts.
//
// Part 1b tests the BUILDERS, which is where a template can lose its mark. It cannot see a sender
// that composes the right subject from the wrong mark, and that is precisely what shipped: the
// builders were fine and five callers handed them a mark that is constant for a day. So this half
// drives the exported senders, reads what would have gone on the wire, and models Gmail on it.
console.log('\n-- 53 seconds apart, through the real senders --');

wire.length = 0;
// The pair from the inbox, then every other email a man can plausibly receive twice in an afternoon.
await email.sendLeadConfirmEmail(TO, 'https://lekhio.app/c', 'https://lekhio.app/u', T1);
await email.sendLeadConfirmEmail(TO, 'https://lekhio.app/c', 'https://lekhio.app/u', T2);
await email.sendLeadResultEmail(TO, 'A note', 'https://lekhio.app/u', T1);
await email.sendLeadResultEmail(TO, 'A note', 'https://lekhio.app/u', T2);
// A double tapped join button, which is the case the waitlist email exists for.
await email.sendWaitlistWelcomeEmail(TO, null, T1);
await email.sendWaitlistWelcomeEmail(TO, null, T2);
// He reads the dunning email, taps Update payment, and the second card fails too.
await email.sendPaymentFailedEmail({ to: TO, amountPence: 1200, updateUrl: 'https://lekhio.app/billing', when: T1 });
await email.sendPaymentFailedEmail({ to: TO, amountPence: 1200, updateUrl: 'https://lekhio.app/billing', when: T2 });
// Two codes and two invoices on one day, which were already right and must stay right.
await email.sendSignupCodeEmail(TO, '481920');
await email.sendSignupCodeEmail(TO, '773311');
await email.sendInvoiceEmail({ to: TO, number: 'INV-001', total: 450, link: 'https://lekhio.app/invoice/1', businessName: 'Dave Sparks' });
await email.sendInvoiceEmail({ to: TO, number: 'INV-002', total: 900, link: 'https://lekhio.app/invoice/2', businessName: 'Dave Sparks' });

ok('every same day send reached the wire', wire.length === 12);

const sameDayThreads = new Map();
for (const m of wire) {
  const k = `${m.from} ${m.subject}`;
  sameDayThreads.set(k, (sameDayThreads.get(k) ?? 0) + 1);
}
for (const [k, n] of sameDayThreads) {
  if (n > 1) console.log(`       COLLAPSED x${n}  ${JSON.stringify(k.slice(k.indexOf('> ') + 2))}`);
}
ok('🔴 12 SENDS ON ONE AFTERNOON LAND IN 12 GMAIL THREADS, NOT ONE OF THEM UNDER AN OLDER ONE',
  sameDayThreads.size === wire.length);

// And the pair that was actually observed, named, because a count is not a story.
const confirms = wire.filter((m) => /^Confirm your email to get your result/.test(m.subject)).map((m) => m.subject);
ok('both confirms went out', confirms.length === 2);
ok('🔴 THE TWO CONFIRMS 53 SECONDS APART ARE TWO SUBJECTS, SO HE CANNOT TAP THE OLDER LINK',
  confirms.length === 2 && confirms[0] !== confirms[1]);
ok('the confirm still says what it is before it says when',
  confirms.every((s) => s.startsWith('Confirm your email to get your result, ')));
ok('and it says when in words he reads off a clock', confirms.every((s) => / at \d{1,2}:\d{2}:\d{2}(?:am|pm)$/.test(s)));

// The exempt one, stated rather than left to be discovered. Two receipts on one day DO share a
// subject, and SAME_DAY_EXEMPT['payment-ok'] is the argument for why that is acceptable.
wire.length = 0;
await email.sendPaymentConfirmedEmail({ to: TO, amountPence: 1200, when: T1 });
await email.sendPaymentConfirmedEmail({ to: TO, amountPence: 1200, when: T2 });
console.log(`       EXEMPT       ${JSON.stringify(wire[0]?.subject ?? '')}  x${wire.length}`);
ok('the receipt pair is exempt by a written argument, not by accident',
  typeof EXEMPT['payment-ok'] === 'string' && EXEMPT['payment-ok'].length > 80);
ok('a receipt still tells one billing day from the next, which the exemption does not give up',
  wire[0]?.subject !== resolveSubject({ repeats: 'payment-ok', mark: subjectDay(new Date('2026-09-09T13:00:00Z')) }));
ok('and a receipt still carries no figure', !/£/.test(wire[0]?.subject ?? '£'));

// ═══ 8. THE LEAD CONFIRM LINK: AN EXPIRY, AND A GET THAT DOES NOTHING ═════
console.log('\n-- the lead confirm link --');

const leadtokenPath = path.join(stage, 'leadtoken.ts');
writeFileSync(leadtokenPath, fixImports(src('lib/leadtoken.ts')));
const leadtoken = await import(pathToFileURL(leadtokenPath).href);
const { leadToken, verifyLeadToken, LEAD_CONFIRM_TTL_SECONDS, confirmUrl } = leadtoken;

const NOW = Date.parse('2026-08-08T09:00:00Z');
const tok = leadToken('confirm', 'dave@example.test', NOW);
ok('a confirm token is minted', typeof tok === 'string' && tok.length > 10);
ok('a confirm token carries its expiry', /^\d+\.[0-9a-f]{32}$/.test(tok));
ok('it verifies on the day it was made', verifyLeadToken('confirm', 'dave@example.test', tok, NOW) === true);
ok('it still verifies six days later', verifyLeadToken('confirm', 'dave@example.test', tok, NOW + 6 * 86400_000) === true);
ok('🔴 IT STOPS WORKING AFTER THE WINDOW', verifyLeadToken('confirm', 'dave@example.test', tok, NOW + 8 * 86400_000) === false);
ok('the window is a week', LEAD_CONFIRM_TTL_SECONDS === 7 * 24 * 60 * 60);
ok('it does not open another address', verifyLeadToken('confirm', 'sam@example.test', tok, NOW) === false);
ok('a moved expiry does not extend it', verifyLeadToken('confirm', 'dave@example.test', `${Number(tok.split('.')[0]) + 999999}.${tok.split('.')[1]}`, NOW + 8 * 86400_000) === false);
ok('the old expiry free shape is refused', verifyLeadToken('confirm', 'dave@example.test', tok.split('.')[1], NOW) === false);
ok('a confirm token does not work as an unsubscribe token', verifyLeadToken('unsub', 'dave@example.test', tok, NOW) === false);
ok('the confirm link carries the token', confirmUrl('dave@example.test').includes('&t='));

// 🔴 THE UNSUBSCRIBE LINK NEVER EXPIRES, AND THAT IS THE POINT OF THE ASYMMETRY.
const unsub = leadToken('unsub', 'dave@example.test', NOW);
ok('an unsubscribe token is the bare signature it always was', /^[0-9a-f]{32}$/.test(unsub));
ok('🔴 AN UNSUBSCRIBE LINK STILL WORKS IN THREE YEARS', verifyLeadToken('unsub', 'dave@example.test', unsub, NOW + 1100 * 86400_000) === true);
ok('an unsubscribe token does not open another address', verifyLeadToken('unsub', 'sam@example.test', unsub, NOW) === false);

// The prefetch half. A mail gateway follows links; it does not press buttons.
const confirmRoute = src('app/api/lead/confirm/route.ts');
const getBlock = confirmRoute.slice(confirmRoute.indexOf('export async function GET'), confirmRoute.indexOf('export async function POST'));
ok('🔴 A GET NEITHER CONFIRMS THE LEAD NOR SENDS ANYTHING', !getBlock.includes('confirmLeadAndGetResult(') && !getBlock.includes('sendLeadResultEmail('));
ok('the confirm is a POST', /export async function POST/.test(confirmRoute));
ok('the POST is the one that confirms', confirmRoute.slice(confirmRoute.indexOf('export async function POST')).includes('confirmLeadAndGetResult('));
ok('the GET still checks the token, so a dead link says so before he taps', getBlock.includes("verifyLeadToken('confirm'"));
ok('the GET renders a form that posts back', getBlock.includes('confirmPage(') && /method="post"/.test(confirmRoute));
ok('both doors are rate limited', (confirmRoute.match(/rateLimitedShared\(/g) || []).length === 2);
ok('the token and address are escaped before they go in the form', /value="\$\{esc\(email\)\}"/.test(confirmRoute) && /value="\$\{esc\(token\)\}"/.test(confirmRoute));

// ═══ 9. THE SQL THAT STOPS THE SECOND WAITLIST ROW ════════════════════════
console.log('\n-- the waitlist unique index --');

const sql = src('supabase/APPLY_2026-08-08_waitlist_unique.sql');
ok('the migration exists', sql.length > 500);
ok('it dedupes before it constrains', sql.indexOf('delete from public.waitlist') < sql.indexOf('create unique index'));
ok('it keeps the oldest row', /order by created_at asc nulls last/.test(sql));
ok('it is idempotent', /create unique index if not exists/.test(sql));
ok('it is case and whitespace insensitive, like the route', /lower\(trim\(email\)\)/.test(sql));
ok('phone only rows are left alone', /where email is not null/.test(sql));
ok('it says how to undo it', /drop index if exists/.test(sql));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
