// THE APPROVAL GATE. One click, and it is the most consequential click in the company.
//
// A `reviewed` row is the ONLY kind that ever reaches a user's tax answer. So approving is the exact
// moment a sentence Khoji scraped off GOV.UK, and a model summarised, becomes something we will tell
// a self-employed man about the return he is legally responsible for.
//
// Until 14 July 2026 the console said "39 waiting for a human" and THERE WAS NO WAY FOR A HUMAN TO
// DO ANYTHING ABOUT IT. The gate existed in the schema, the rule was enforced, and the door had no
// handle. An approval gate with no approve button is not a safeguard. It is a bottleneck we built
// and then forgot to open.
//
// What these tests defend is not the click. It is everything the click is NOT allowed to become.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const route = readFileSync(path.join(root, 'app/api/team/review/route.ts'), 'utf8');
const brain = readFileSync(path.join(root, 'app/team/Brain.tsx'), 'utf8');
const db = readFileSync(path.join(root, 'lib/supabase.ts'), 'utf8');

// ⚠️ STRIP THE COMMENTS BEFORE GREPPING FOR FORBIDDEN THINGS.
//
// The first version of the "there is no Approve All" test FAILED, because the comment forbidding
// Approve All contains the words "Approve All". A test that reads prose is a test that can be
// satisfied, or broken, by prose. It has to read the CODE.
const codeOnly = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

const routeCode = codeOnly(route);
const brainCode = codeOnly(brain);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nthe approval gate: the one button the whole doctrine is about');

// ---------------------------------------------------------------------------------------------
// 🔴 THE CLIENT MUST NEVER CHOOSE THE STATUS.
// ---------------------------------------------------------------------------------------------
//
// The client posts a DECISION ('approve' | 'dismiss'). The SERVER turns that into a status. If a
// client could post `status: 'anything'`, it could invent a state the system has never heard of, and
// every downstream check (which rows reach a user, which are incidents, what the console counts)
// would be quietly guessing.

ok('the route accepts a DECISION, and only two of them',
  route.includes("decision !== 'approve' && decision !== 'dismiss'"));

ok('THE BUG WE REFUSED TO SHIP: the status is derived on the SERVER, never read off the request',
  db.includes("const status = decision === 'approve' ? 'reviewed' : 'dismissed';")
  && !route.includes('body.status'));

ok('a bad body is a 400, not a shrug',
  route.includes("{ error: 'bad_request' }, { status: 400 }"));

// ---------------------------------------------------------------------------------------------
// 🔴 MEMBERSHIP IS RE-CHECKED ON THIS REQUEST. A SESSION IS NOT A PERMISSION.
// ---------------------------------------------------------------------------------------------

ok('the token is verified before anything else happens',
  route.includes('verifyAccessToken'));

ok('team membership is re-checked HERE, on the server, on this call',
  route.includes('readTeamMember') && route.includes('isTeam(member)'));

ok('...and a valid session with no team row is a 403. Anybody can make a Supabase account',
  route.includes("{ error: 'forbidden' }, { status: 403 }"));

// ---------------------------------------------------------------------------------------------
// 🔴 THERE IS NO APPROVE ALL, AND THERE WILL NOT BE ONE.
// ---------------------------------------------------------------------------------------------
//
// Forty unread items becoming forty things we have told our users, in one thoughtless second, is
// precisely what a human gate exists to prevent. If a future commit adds a bulk endpoint, this fails.

ok('the route takes ONE id. There is no array, no bulk endpoint, no "all"',
  routeCode.includes("typeof body.id === 'string'")
  && !/\bids\b/.test(routeCode)
  && !/approveAll|bulkApprove/i.test(routeCode));

ok('...and the UI has no Approve All control either',
  !/approveAll|Approve all</i.test(brainCode));

// ---------------------------------------------------------------------------------------------
// 🔴 A FAILED WRITE MUST NOT LOOK LIKE A SUCCESSFUL ONE.
// ---------------------------------------------------------------------------------------------
//
// This codebase's actual disease is silent success: a cron that reached 200 users and returned 200
// OK, an llms.txt tested and never served, a launchd job that fired into an empty folder for five
// days. The one thing worse than a slow approval is a human who BELIEVES he approved something and
// did not.

ok('a failed write is a 502, not an ok',
  db.includes('return res.ok;') && route.includes("{ error: 'write_failed' }, { status: 502 }"));

ok('the row comes BACK into the queue when the save fails',
  brain.includes('setD((cur) => (cur ? { ...cur, pending: before } : cur))'));

ok('...and the human is told plainly that nothing was approved',
  brain.includes('Nothing was approved.'));

// ---------------------------------------------------------------------------------------------
// 🔴 WHO SAID YES.
// ---------------------------------------------------------------------------------------------
//
// Not for blame. For the day somebody asks why we told six thousand men something about their tax,
// and the only acceptable answer is a name and a date, not "the system decided".

ok('the approver\'s email is recorded on the row',
  db.includes('reviewed_by: byEmail'));

ok('...and when',
  db.includes('reviewed_at: new Date().toISOString()'));

ok('the email comes from the VERIFIED token, never from the request body',
  route.includes('reviewKnowledgeItem(id, decision, user.email)'));

// ⚠️ NO EMAIL, NO APPROVAL. The typechecker found this and it is not a formality.
//
// `user.email` is nullable. The lazy fix is `user.email ?? ''`, which would write an APPROVAL WE
// CANNOT ATTRIBUTE: exactly the "the system decided" this whole gate exists to prevent, dressed up
// as a passing build. An account with no email cannot approve. That is not a gap in the gate. It IS
// the gate.
ok('an account with NO EMAIL cannot approve. An unattributable approval is not an approval',
  routeCode.includes('if (!user.email)')
  && routeCode.includes("{ error: 'no_identity' }, { status: 403 }"));

ok('...and nobody has quietly patched it with an empty string',
  !/user\.email\s*(\?\?|\|\|)/.test(routeCode));

// ---------------------------------------------------------------------------------------------
// 🔴 THE SOURCE IS ON THE SCREEN, BECAUSE A SUMMARY IS A MODEL'S ACCOUNT OF A PAGE.
// ---------------------------------------------------------------------------------------------
//
// A model read this page and wrote a sentence. On 8 July a model read the mileage page, scored its
// own confidence at 0.95, and was flat wrong. You are about to vouch for this in front of HMRC.

ok('every card links to the primary GOV.UK page, and says to read it FIRST',
  brain.includes('Read the GOV.UK page first'));

ok('an item with NO source says so, and says not to approve it',
  brain.includes('No source link. Do not approve this.'));

ok('an item that changes the tax engine is shouted about, not filed quietly',
  brain.includes('CHANGES THE TAX ENGINE'));

ok('the queue is ordered engine-impact first: a rate change is not one of forty chores',
  db.includes('order=engine_impact.desc'));

// ---------------------------------------------------------------------------------------------
// The line, held on our own console.
// ---------------------------------------------------------------------------------------------

ok('the page says plainly what approving MEANS, so nobody clicks it as an inbox chore',
  brain.includes('Nothing here reaches a single'));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
