// THE TENANCY TEST. Can a man reach another man's figures by changing something in a URL.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS IS A STRUCTURAL TEST AND NOT A REQUEST TEST.
//
// The obvious way to test "he cannot read another customer's books" is to sign in as one man and
// ask for another man's id. That test passes today and would pass tomorrow, and it would still not
// tell you the thing you need to know, because it only checks the routes somebody remembered to
// write it for. The web app is going to grow screens, and the screen that leaks will be the one
// nobody thought to add to the list.
//
// So this walks the tree instead and asserts the SHAPE that makes the leak impossible:
//
//   THERE IS NOWHERE TO PUT AN ID.
//
// Every authenticated surface derives the account from the session, server side. No page under
// app/app takes a dynamic segment. No authenticated route reads a user id out of a query string.
// If there is no id in the URL, there is nothing for a customer to change.
//
// Run: node test/webauth.test.mjs   Pure, reads files, no network.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync, readdirSync, lstatSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

// lib/websession.ts imports nothing but node:crypto, so it loads straight through Node's type
// stripping with no staging. safeNext() is the allowlist every next= parameter has to survive.
const W = await import(pathToFileURL(path.join(repo, 'lib/websession.ts')).href);

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

// ⚠️ DOT DIRECTORIES AND SYMLINKS ARE SKIPPED, AND THAT IS NOT TIDINESS. app/.node/bin/corepack is
// a BROKEN SYMLINK committed into this repo, so statSync on it throws and takes the whole suite
// down with a stack trace about corepack. It only surfaced when this walk was widened past app/app
// on 4 August, which is a fair warning about every other walk in test/. lstat, never stat, and
// never follow a link out of the tree: test/tokens.test.mjs already learned this the same way.
function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e.startsWith('.') || e === 'node_modules') continue;
    const p = path.join(dir, e);
    let st;
    try { st = lstatSync(p); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e) && !e.includes('fuse_hidden')) out.push(p);
  }
  return out;
}

const read = (p) => readFileSync(p, 'utf8');

// Comments stripped, for the scans that ask what the CODE does. A comment saying "⚠️ NOT user.email"
// must not be read as a use of user.email. test/watemplates.test.mjs and test/domain.test.mjs both
// carry the same helper for the same reason, and both learned it the same way.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const rel = (p) => path.relative(repo, p);

console.log('\n1. THE CUSTOMER WEB APP HAS NOWHERE TO PUT AN ID');
const appDir = path.join(repo, 'app/app');
ok('the web app exists', existsSync(appDir));
const appFiles = walk(appDir);
ok('it has at least one page', appFiles.some((f) => f.endsWith('page.tsx')));

// A dynamic segment is a folder named [something]. One of those is an id in a URL, which is the
// only way this class of bug gets in.
const dynamicSegments = appFiles.filter((f) => /\[[^\]]+\]/.test(rel(f)));
ok('🔴 NO PAGE UNDER app/app TAKES A DYNAMIC SEGMENT: ' + (dynamicSegments.map(rel).join(', ') || 'none'), dynamicSegments.length === 0);

// searchParams is allowed on the sign in page (it carries an error code), but a page that reads a
// user id out of the query is exactly the bug.
const idFromQuery = /searchParams[\s\S]{0,400}?\b(user_?[Ii]d|userid|account_?[Ii]d|customer_?[Ii]d)\b/;
const leaky = appFiles.filter((f) => idFromQuery.test(read(f)));
ok('🔴 NO PAGE READS A USER ID FROM THE QUERY STRING: ' + (leaky.map(rel).join(', ') || 'none'), leaky.length === 0);

// Every page under app/app must actually resolve a user, or it is rendering somebody's money
// without asking whose.
const pages = appFiles.filter((f) => f.endsWith('page.tsx'));
const unguarded = pages.filter((f) => {
  const src = read(f);
  return !src.includes('userFromSessionCookie') && !src.includes('sessionUser');
});
ok('🔴 EVERY PAGE UNDER app/app RESOLVES THE USER FROM THE SESSION: ' + (unguarded.map(rel).join(', ') || 'none'), unguarded.length === 0);

// And every one of them must send him away when there is no session, rather than rendering an
// empty shell that looks like an account with no money in it.
// ⚠️ THE ANCHOR MOVED ON 3 AUGUST 2026 AND THE CLAIM DID NOT. /app/you/billing now redirects to
// `/in?next=%2Fapp%2Fyou%2Fbilling`, because the footer's "Manage subscription" lands there and a
// signed out customer used to prove who he is and then arrive at the dashboard, one click from the
// thing he came for. So the pattern allows a query string, and gains a second assertion that the
// destination is OUR sign in page and not somebody else's.
const IN_REDIRECT = /redirect\(['"]\/in(\?[^'"]*)?['"]\)/;
const noRedirect = pages.filter((f) => !IN_REDIRECT.test(read(f)));
ok('every page sends a signed out visitor to /in: ' + (noRedirect.map(rel).join(', ') || 'none'), noRedirect.length === 0);

// 🔴 AND NO PAGE MAY SEND HIM ANYWHERE BUT OUR OWN SIGN IN. A redirect target that leaves the site
// from a page that has just decided he is signed out is an open redirect with extra steps.
const offsite = pages.filter((f) => /redirect\(['"](https?:)?\/\//.test(read(f)));
ok('🔴 NO SIGNED OUT REDIRECT LEAVES THE SITE: ' + (offsite.map(rel).join(', ') || 'none'), offsite.length === 0);

// 🔴 AND EVERY DESTINATION IT CARRIES SURVIVES safeNext(), which allowlists /app and below. A page
// that hand rolled a next parameter safeNext would refuse is a page quietly sending him elsewhere.
{
  const carried = pages.map((f) => [rel(f), (read(f).match(/redirect\(['"]\/in\?next=([^'"]*)['"]\)/) || [])[1]])
    .filter(([, v]) => v);
  for (const [name, raw] of carried) {
    ok(`${name}: its next= is one safeNext would allow`, W.safeNext(decodeURIComponent(raw)) === decodeURIComponent(raw));
  }
}

console.log('\n2. THE AUTH ROUTES NEVER TRUST WHAT THE CLIENT SENT');
const startRoute = read(path.join(repo, 'app/api/auth/start/route.ts'));
const verifyRoute = read(path.join(repo, 'app/api/auth/verify/route.ts'));
const outRoute = read(path.join(repo, 'app/api/auth/signout/route.ts'));

ok('the send route checks the origin', startRoute.includes('originAllowed'));
ok('the verify route checks the origin', verifyRoute.includes('originAllowed'));
ok('the sign out route checks the origin', outRoute.includes('originAllowed'));

// The single most important line in the verify route: the contact comes from the signed cookie, so
// a man cannot send a code to something he controls and exchange it for another account.
ok('🔴 VERIFY READS THE CONTACT FROM THE SIGNED COOKIE', verifyRoute.includes('verifyPendingCookie'));
ok('🔴 VERIFY NEVER READS A PHONE OR EMAIL OUT OF THE FORM', !/form\.get\(\s*['"](phone|email|contact)['"]/.test(verifyRoute));
ok('the identity comes from Supabase, not from us', verifyRoute.includes('verifyAccessToken'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 7 AUGUST 2026. TWO RESULTS THIS DOOR THREW AWAY, AND THE SIGNUP DOOR NEVER DID.
//
// ensureUserRow returns false on a write that did not land. /api/signup/verify treats that as a
// 502 and refuses to open a session. This door carried on and minted one anyway, handing a man a
// cookie pointing at a user id with NO public.users row behind it and dropping him on /app, where
// every read is empty and nothing says why. Same function, same failure, two different answers,
// and the door that ignored it is the one he uses every day.
ok('🔴 A FAILED USERS ROW STOPS THE SESSION, IT DOES NOT MINT ONE ANYWAY',
  /const rowOk = await ensureUserRow\([\s\S]{0,160}?\);\s*\n\s*if \(!rowOk\) return back\(req, 'session', next\);/
    .test(verifyRoute));
ok('🔴 THE USERS ROW RESULT IS NEVER DISCARDED',
  !/^\s*await ensureUserRow\(/m.test(verifyRoute));
// And the signup door's posture is the one being matched, so neither can drift alone.
ok('the signup door still refuses a session when the row will not write',
  /const rowOk = await ensureUserRow/.test(read(path.join(repo, 'app/api/signup/verify/route.ts'))));

// ⚠️ reconcileSignupToUser MATCHES ON THE PHONE, AND A WEB MINTED ACCOUNT HAS NONE.
// It falls back to the verified address only when it is given one, so with no second argument the
// match string is empty and it returns before reading anything. Called bare here, it was a
// guaranteed no op for exactly the customers the web app exists for: a man whose /start answers
// landed after his signup verify ran has an unreconciled row, and signing in is where it gets
// picked up. /api/signup/verify has always passed the address. This door now does too.
ok('🔴 THE VERIFIED ADDRESS IS PASSED TO THE RECONCILE, OR IT IS A NO OP',
  /reconcileSignupToUser\(user\.id, user\.email \|\| null\)/.test(verifyRoute));

// ── REMEMBER MY BROWSER, THREADED HONESTLY THROUGH THE ONE DOOR THAT ASKS ──
//
// The box on /in is the user's statement about whose machine this is, and the only honest
// implementation is one where the row, the signed cookie and the cookie attributes all say the
// same thing. An unticked checkbox posts nothing, so absence must read as "do not remember",
// including for a crafted post that omits the field on purpose.
ok('verify reads the box from the form', verifyRoute.includes("form.get('remember')"));
ok('and only the ticked value counts, absence is the safe reading',
  /form\.get\('remember'\) === 'on'/.test(verifyRoute));
ok('🔴 THE ROW RECORDS WHICH KIND OF SESSION IT IS',
  /createWebSession\([^)]*,\s*remembered\)/.test(verifyRoute));
ok('🔴 AN UNTICKED SIGN IN GETS THE SHORT SERVER SIDE EXPIRY',
  verifyRoute.includes('SESSION_TTL_UNREMEMBERED_SECONDS'));
ok('🔴 AND A COOKIE WITH NO Max-Age, WHICH DIES WITH THE BROWSER',
  /remembered \? sessionCookieAttributes\(\) : browserSessionCookieAttributes\(\)/.test(verifyRoute));
// ⚠️ NOT [^)]* HERE: new Date() closes a bracket mid call, the exact trap this suite already
// documented once at the 303 assertion below. Matched across the whole call instead.
ok('the exp inside the signed cookie rides the same ttl as the row',
  /sessionCookieValue\(sessionId,[\s\S]{0,60}?ttlSeconds\)/.test(verifyRoute));

// The other half of the promise: use must not stretch an unticked session towards the ninety
// days he declined. The gate consults the row and slideExpiry refuses, and the refusal itself is
// held down as pure logic in test/websession.test.mjs.
const webauthSrc = read(path.join(repo, 'lib/webauth.ts'));
ok('🔴 THE GATE ONLY EVER SLIDES A REMEMBERED SESSION',
  /slideExpiry\(row\.remembered\)/.test(webauthSrc) && /if \(slid && needsTouch/.test(webauthSrc));
ok('and no other slide path survives in the gate',
  !/SESSION_TTL_SECONDS/.test(stripComments(webauthSrc)));
ok('the session read carries the flag out of the row',
  /select=id,user_id,created_at,last_seen_at,expires_at,remembered/.test(read(path.join(repo, 'lib/supabase.ts'))));

// The box itself, on /in: present, honestly worded, and unticked by default. A default of ticked
// would make the safe shape the one nobody in a hurry ever gets.
const inPage = read(path.join(repo, 'app/in/page.tsx'));
ok('the box posts as remember', /name="remember"/.test(inPage));
ok('🔴 THE BOX IS UNTICKED BY DEFAULT', !/defaultChecked/.test(inPage));
ok('it says what it is', inPage.includes('Remember my browser'));
ok('and says what unticked means, plainly', inPage.includes('leave this unticked')
  && inPage.includes('signed out') && inPage.includes('Keep your data safe'));

// The signup door mints a session too, and the parameter has no default, so it must answer the
// question out loud rather than inheriting an answer nobody chose.
ok('the signup door answers the remembered question explicitly',
  /createWebSession\([^)]*,\s*true\)/.test(read(path.join(repo, 'app/api/signup/verify/route.ts'))));

// And the column the row records it in is applied, before the code that selects it by name.
ok('the remembered column has a migration',
  /add column if not exists remembered boolean not null default true/.test(
    read(path.join(repo, 'supabase/APPLY_2026-07-31_remember_browser.sql'))));

console.log('\n3. THE ABUSE CONTROLS ARE ON THE ONE ROUTE THAT COSTS MONEY');
ok('🔴 IT REFUSES A CONTACT THAT IS NOT ALREADY OURS', startRoute.includes('findContactAccount'));
ok('🔴 THE DAILY CAP FAILS CLOSED (spendCapReached, not rateLimitedShared)', startRoute.includes('spendCapReached'));
ok('there is a per contact limit', startRoute.includes('PER_TARGET_SENDS'));
ok('there is a per source limit', startRoute.includes('PER_SOURCE_SENDS'));
ok('every outcome is logged', startRoute.includes('logAuthSend'));
ok('an unknown contact is logged as such', startRoute.includes("'refused_unknown'"));
ok('the shape check happens before anything is spent', startRoute.includes('readIdentifier'));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 7 AUGUST 2026. THE DAILY CAP FAILS CLOSED ON MONEY AND OPEN ON THE ONLY WEB DOOR.
//
// spendCapReached exists to protect a Twilio bill, and its own comment promised that "the email
// door, which costs nothing, keeps working". Since 2 August the email door is the ONLY web door,
// and it called the same function, so a failing rate_hit RPC did not slow sign in down, it SHUT
// it, for every customer at once, with the words "we have sent as many codes as we can for the
// moment". We had not hit a limit. We could not count. Nothing else in the product would notice a
// dead rate_hit, because everything else fails open, so the only symptom would be the front door.
const capCall = startRoute.slice(startRoute.indexOf('spendCapReached('));
ok('🔴 THE TEXT DOOR STILL FAILS CLOSED, BECAUSE IT SPENDS MONEY',
  /id\.channel === 'sms',\s*\)\)/.test(capCall.slice(0, 400)));
ok('🔴 A COUNTING FAILURE CANNOT SHUT THE EMAIL DOOR',
  /spendCapReached\(\s*`otp:daily:\$\{id\.channel\}`[\s\S]{0,200}id\.channel === 'sms',/.test(startRoute));
// And the posture is the CALLER's to choose, so a future door cannot inherit the wrong one by
// accident. Default closed: a new call site that says nothing gets the safe answer.
const rateLimit = read(path.join(repo, 'lib/ratelimit.ts'));
ok('the failure posture is a parameter, and it defaults to closed',
  /failClosed = true/.test(rateLimit) && /if \(shared === null\) return failClosed;/.test(rateLimit));
// The signup code door takes any address on earth, so it keeps the closed posture on purpose.
ok('🔴 THE PUBLIC SIGNUP CODE DOOR KEEPS THE CLOSED POSTURE',
  /spendCapReached\('sup:daily:email', DAILY_CAP, DAILY_WINDOW_SECONDS\)/.test(
    read(path.join(repo, 'app/api/signup/code/route.ts'))));
// The bind door is behind a session and bounded to one account, so it fails open like sign in.
ok('the email bind door fails open, it is behind a session',
  /spendCapReached\('bem:daily', DAILY_CAP, DAILY_WINDOW_SECONDS, false\)/.test(
    read(path.join(repo, 'app/api/you/email/start/route.ts'))));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 7 AUGUST 2026. THE ATTACH RESULT IS CHECKED, AND IT USED NOT TO BE.
//
// attachEmailToAuthUser PUTs the address onto the auth user, and it is the only thing that makes
// GoTrue's answer to "who owns this address" agree with ours. The OTP is then requested BY
// ADDRESS, so GoTrue picks the account, not us. Thrown away, the failures were:
//   404  GoTrue has never seen the address, create_user:false matches nothing, NOTHING IS SENT,
//        and he is told a code is on its way on every attempt for ever.
//   422  the address belongs to a DIFFERENT auth user, so a working code arrives in his own inbox
//        and SIGNS HIM INTO SOMEBODY ELSE'S BOOKS, with a clean 'sent' in the audit table.
// The neutrality rule does not cover this line: the stranger and the unbridged signup were both
// turned away above, so by here the address is already known to be ours.
ok('🔴 A FAILED EMAIL ATTACH STOPS THE SEND, IT DOES NOT CARRY ON',
  /const attached = await attachEmailToAuthUser\(account\.userId, id\.value\);\s*\n\s*if \(!attached\) return back\(req, 'unavailable', next\);/
    .test(startRoute));
ok('🔴 THE ATTACH RESULT IS NEVER DISCARDED',
  !/^\s*await attachEmailToAuthUser\(/m.test(startRoute));

// A stranger's contact and a customer's contact must produce the same next screen, or the login
// page is a customer list with a search box on it.
const unknownBranch = startRoute.slice(startRoute.indexOf("await logAuthSend(id.channel, hash, 'refused_unknown');"));
ok('🔴 AN UNKNOWN CONTACT GETS THE SAME SCREEN AS A KNOWN ONE', unknownBranch.slice(0, 200).includes('return onward('));

// The email door must not be able to mint an account, or a man who typed a stranger's number at
// signup could prove his own address and be handed an account keyed to that stranger's phone.
ok('🔴 THE EMAIL DOOR NEVER CREATES AN AUTH USER', /\{\s*email:[^}]*create_user:\s*false\s*\}/.test(startRoute));
// And the other half of the same rule: an email that matches only a signups row, with no account
// behind it yet, is turned away rather than used to mint one. The phone is the account key and it
// gets proved at least once first.
ok('🔴 AN EMAIL WITH NO ACCOUNT BEHIND IT IS TURNED AWAY', /id\.channel === 'email' && !account\.userId/.test(startRoute));

console.log('\n4. THERE IS ONE AUTH GATE, NOT TWO');
const webauth = read(path.join(repo, 'lib/webauth.ts'));
ok('the gate accepts the app Bearer token', webauth.includes('verifyAccessToken'));
ok('the gate accepts the web cookie', webauth.includes('verifySessionCookie'));
ok('🔴 THE COOKIE RESOLVES TO A ROW, AND THE USER COMES FROM THE ROW', webauth.includes('readWebSession') && webauth.includes('row.userId'));
// A bad Bearer must be a refusal, never a quiet fallback to the other door, or the weaker door
// becomes the only door that matters.
ok('🔴 A BAD BEARER TOKEN IS REFUSED, NOT RETRIED AS A COOKIE', /Bearer '\)\)[\s\S]{0,300}return user \?/.test(webauth));

// ⚠️ AND THE GATE HAS TO ACTUALLY BE THE GATE. It was not, until 28 July 2026.
//
// lib/webauth.ts was written to be the one place that answers "whose books are these", and then
// NOTHING CALLED IT. Every one of the 36 customer API routes verified a Bearer token itself, so the
// web session cookie could reach exactly none of them and the web app was two server rendered pages
// with no API behind it. A gate nobody walks through is a comment.
const apiRoutes = walk(path.join(repo, 'app/api')).filter((f) => path.basename(f) === 'route.ts');
ok('the api tree was actually walked (not vacuous)', apiRoutes.length > 50);

// The ONLY routes allowed to verify a Bearer themselves, each for a written reason.
//
//   api/team/...            Jag's internal console. Signs in with browserSupabase and sends a
//                           Bearer. Not a customer surface, and it must never start accepting the
//                           customer cookie.
//   api/auth/verify         The SIGN IN door. It MINTS the cookie, so it cannot require one.
//   api/connectors/.../start  Lives outside api/team but IS a team route: it checks readTeamMember
//                           and refuses anybody who is not the owner.
//
// api/signup/verify is deliberately NOT here. It mints a session, so it is a door, but it proves
// its own emailed code against lib/signupcode.ts and never touches a Bearer token. It is on the
// DOORS list below and nowhere else.
const BEARER_ALLOWED = [
  'app/api/team/',
  'app/api/auth/verify/route.ts',
  'app/api/connectors/[platform]/start/route.ts',
];

// ⚠️ AND THE EXCUSE HAS TO BE TRUE.
//
// Two entries above are excused because they MINT a session. That is a claim in a comment, and a
// comment is exactly what this file exists to stop us relying on: the next person who needs to
// verify a Bearer directly can make the red test go green by adding one line to the list, and the
// reason he writes need not be true.
//
// So the claim is checked. A route excused for being a door must actually set the session cookie.
// If one ever stops doing that, it is not a door any more and it has no business here.
const DOORS = ['app/api/auth/verify/route.ts', 'app/api/signup/verify/route.ts'];
const notReallyDoors = DOORS.filter((d) => {
  const src = read(path.join(repo, d));
  return !(src.includes('SESSION_COOKIE') && src.includes('sessionCookieValue'));
});
ok(
  `🔴 EVERY ROUTE EXCUSED AS A DOOR ACTUALLY MINTS A SESSION${notReallyDoors.length ? `\n     ${notReallyDoors.join('\n     ')}` : ''}`,
  notReallyDoors.length === 0,
);
const strayBearer = apiRoutes
  .filter((f) => read(f).includes('verifyAccessToken'))
  .map(rel)
  .filter((r) => !BEARER_ALLOWED.some((a) => r.startsWith(a) || r === a));
ok(
  `🔴 NO CUSTOMER ROUTE VERIFIES A BEARER ITSELF${strayBearer.length ? `\n     ${strayBearer.join('\n     ')}` : ''}`,
  strayBearer.length === 0,
);

// The other half: the customer routes must actually be going through the gate, or the check above
// would pass just as happily on a route with no authentication at all.
const throughTheGate = apiRoutes.filter((f) => read(f).includes('sessionUser('));
ok(`the customer routes go through sessionUser (${throughTheGate.length} of them)`, throughTheGate.length >= 30);

// 🔴 THE COST OF OPENING THESE ROUTES TO A COOKIE, AND IT IS NOT OPTIONAL.
//
// A Bearer only route is immune to cross site request forgery BY ACCIDENT: no browser attaches an
// Authorization header to a request another site caused. A cookie IS attached, on the browser's own
// judgement, so the moment sessionUser accepts one, every state changing route needs an origin
// check. It lives inside sessionUser rather than in 36 routes, because a rule every route author
// must remember is a rule that holds until somebody is in a hurry.
ok('🔴 THE COOKIE PATH CHECKS THE ORIGIN', webauth.includes('originAllowed'));
ok(
  '🔴 IT CHECKS IT ON ANYTHING THAT CHANGES SOMETHING, and skips GET and HEAD',
  /method !== 'GET' && method !== 'HEAD'[\s\S]{0,220}originAllowed/.test(webauth),
);
ok(
  'the origin check sits on the cookie path, AFTER the Bearer path has returned',
  webauth.indexOf("via: 'bearer'") < webauth.indexOf('originAllowed('),
);

// The email is the one thing the two doors do not agree on: GoTrue hands it over with the identity,
// a session row does not carry it. A route that reads user.email and gets null from the cookie door
// cannot tell "he has no email" from "this door did not carry it", and for a GDPR delete those are
// very different facts.
ok('there is one lazy identity lookup for the doors that need more than an id', webauth.includes('identityForUser'));
for (const r of ['app/api/account/delete/route.ts', 'app/api/account/export/route.ts', 'app/api/billing/portal/route.ts']) {
  const src = read(path.join(repo, r));
  ok(`${r}: resolves the identity rather than trusting the door`, src.includes('identityForUser'));
  ok(`🔴 ${r}: NEVER passes a raw session email`, !/\b(user|verified)\.email\b/.test(stripComments(src)));
}

console.log('\n5. THE SESSION TABLE IS NOT THE CUSTOMER\'S TO READ');
const sql = read(path.join(repo, 'supabase/APPLY_2026-07-27_web_login.sql'));
ok('web_sessions has row level security on', /alter table public\.web_sessions enable row level security/.test(sql));
ok('auth_sends has row level security on', /alter table public\.auth_sends enable row level security/.test(sql));
ok('🔴 NEITHER TABLE HAS A CLIENT POLICY, so only the service role reaches them', !/create policy[\s\S]*?on public\.(web_sessions|auth_sends)/.test(sql));
ok('a session dies with the account', /references auth\.users\(id\) on delete cascade/.test(sql));
ok('the login log is swept rather than kept for ever', sql.includes('auth_sends_sweep'));

console.log('\n6. THE MONEY ON THE SCREEN COMES FROM THE ONE ENGINE');
const money = read(path.join(repo, 'app/app/page.tsx'));
ok('the ledger comes from lib/ledger.ts', money.includes('ledgerFor'));
ok('the week comes from lib/weeklyupdate.ts', money.includes('weeklyInput') && money.includes('weeklyLine'));
ok('the banner comes from lib/announcements.ts', money.includes('selectAnnouncements'));
ok('🔴 THE PAGE DOES NOT RUN THE TAX ENGINE ITSELF', !money.includes('soleTraderTax') && !money.includes('from \'../../lib/taxengine\''));
// The tax to put by is his whole position, from the same function /api/optimise publishes, never a
// figure this page adds up for itself. Same for the chart and for what is waiting on him.
ok('the tax to put by comes from lib/taxoptimiser.ts', money.includes('taxPosition'));
ok('the week chart comes from lib/weekchart.ts', money.includes('weekOf'));
ok('what is waiting comes from lib/reviewpile.ts', money.includes('buildPile') && money.includes('partitionPile'));

// 🔴 THE APPLIED LINE COMES FROM THE MODULE THAT CAN REFUSE IT.
//
// It moved out of page.tsx on 30 July, when the client announcements banner was replaced by a
// server rendered one, so this checks the file that actually renders it rather than the file it
// used to live in. The rule is unchanged: lib/announcements.ts refuses to produce that sentence for
// an item it cannot prove, so no surface may write the sentence itself.
const banner = read(path.join(repo, 'app/app/Announcements.tsx'));
ok('🔴 THE APPLIED LINE COMES FROM THE MODULE THAT CAN REFUSE IT', banner.includes('appliedLineFor'));
ok('...and no surface types that sentence out for itself',
  !/already reflect this/.test(stripComments(banner)) && !/already reflect this/.test(stripComments(money)));
ok('the tag words come from the module too', banner.includes('tagFor'));

// 🔴 AND EVERY SCREEN IN THE WEB APP SHIPS NO CLIENT JAVASCRIPT.
//
// The whole argument for the web app is that his figures are already in the HTML when it arrives,
// because he is on a cheap Android on a bad signal with one hand on a ladder. Until 30 July the
// announcements banner was marked 'use client', so the one screen the app is built around was
// shipping React to the browser in order to draw two lines of text.
for (const f of walk(path.join(repo, 'app/app'))) {
  ok(`${rel(f)}: is server rendered`, !/^'use client'/m.test(read(f)));
}

// 🔴 AND NOBODY WRITES THE EIGHTEENTH MONEY FORMATTER.
//
// The 28 July sweep found SEVENTEEN in lib/, nine of which could print "£-33", and replaced them
// with lib/money.ts. app/app/page.tsx was written the same day and STILL declared its own
// `const money = (n) => ...` with the sign inside the pound. It happened to be safe only because
// nothing on that screen goes negative today, which is a formatter that is correct by luck.
//
// So the rule is checked where the rule actually gets broken: on the screens.
const appPages = walk(path.join(repo, 'app/app'));
//
// ⚠️ MATCHED ON THE DEFECT, NOT ON THE NAME. The first draft of this looked for an identifier
// containing "money", and flagged `export default async function MoneyPage()`, which is the page
// itself. A guard that fires on the thing it is protecting is a guard somebody deletes.
//
// So it looks for what actually goes wrong: a pound sign being BUILT next to a number, anywhere on
// a screen. That is the whole shape of the bug, whatever the variable ends up being called, and it
// stays true for the next screen somebody adds in a hurry.
const buildsAPound = /`£\$\{|['"]£['"]\s*\+|\+\s*['"]£['"]/;
const ownFormatter = appPages.filter((f) => buildsAPound.test(stripComments(read(f))));
ok(
  '🔴 NO SCREEN BUILDS A POUND ITSELF, IT ASKS lib/money.ts: ' + (ownFormatter.map(rel).join(', ') || 'none'),
  ownFormatter.length === 0,
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE SWEEP STOPPED AT app/app, SO SEVEN MORE COPIES SAT ON PUBLIC PAGES.
//
// Found on 4 August. Every free calculator carried its own
// `const gbp = (n) => \`£${Math.round(n).toLocaleString('en-GB')}\`` , six of them byte identical,
// plus a seventh on /tax-calculator and an eighth in the invoice generator. Each puts the sign
// INSIDE the pound, so a negative prints "£-33" instead of "-£33", which is the exact defect
// lib/money.ts gbp0 was written to end on 28 July. The sweep that ended it walked the signed in
// screens, and the free tools are the pages a STRANGER meets first.
//
// ⚠️ AND ONE OF THEM COULD REALLY GO NEGATIVE. /landlord-tax-calculator prints
// gbp(now.incomeTax - now.taxCausedByProperty), a subtraction of two engine outputs, on a page
// about somebody's rent.
//
// ⚠️ AND THE INVOICE GENERATOR IS WORSE THAN A SCREEN. Its output is a document our user sends to
// HIS customer, under his own business name, so a malformed pound there is our defect on his
// letterhead. It uses gbp2, because pence matter on an invoice.
//
// ⚠️ THE CALCULATORS ARE .tsx FILES OUTSIDE app/app, so this walks the public tree and excludes
// the signed in one (already covered above) and app/team (internal).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const publicFiles = [...walk(path.join(repo, 'app')), ...walk(path.join(repo, 'components'))]
  .filter((f) => !rel(f).startsWith('app/app/'))
  .filter((f) => !rel(f).startsWith('app/team/'))
  .filter((f) => !rel(f).startsWith('app/api/'));
ok('the public tree was actually walked, so this is not vacuous', publicFiles.length > 30);
// ⚠️ ONE FILE IS EXCEPTED, BY NAME, WITH THE REASON WRITTEN DOWN. app/how-mtd-works/page.tsx holds
// the slider's script as a STRING that runs in the browser, so it cannot import lib/money and has
// to rebuild the figure on every drag. It is safe by construction: the input's min is 0, so the
// value can never be negative and the sign can never land in the wrong place.
//
// 🔴 EXCEPTED BY NAME RATHER THAN BY LOOSENING THE PATTERN, on purpose. A regex relaxed to let one
// honest case through lets every dishonest one through with it, silently, forever. A named list of
// one is a thing somebody has to justify adding to.
const POUND_IN_A_SCRIPT_STRING = ['app/how-mtd-works/page.tsx'];
const publicFormatter = publicFiles
  .filter((f) => !POUND_IN_A_SCRIPT_STRING.includes(rel(f)))
  .filter((f) => buildsAPound.test(stripComments(read(f))));
ok(
  '🔴 AND NO PUBLIC PAGE OR SHARED COMPONENT BUILDS ONE EITHER: ' + (publicFormatter.map(rel).join(', ') || 'none'),
  publicFormatter.length === 0,
);
// 🔴 AND THE EXCEPTION IS HELD TO ITS OWN REASON. The excepted file may build a pound INSIDE the
// injected script string and nowhere else, so the exception cannot quietly become a licence.
{
  const mtd = read('app/how-mtd-works/page.tsx');
  const outsideScript = stripComments(mtd).replace(/const MTD_JS = `[\s\S]*?`;/, '');
  ok('the excepted page builds no pound outside the injected script it was excepted for',
    !buildsAPound.test(outsideScript));
  ok('...and it asks lib/money for the ones it renders itself',
    /from '\.\.\/\.\.\/lib\/money'/.test(mtd) && /gbp0\(/.test(stripComments(mtd)));
  ok('...and the slider input it relies on still cannot go negative',
    /min="0"/.test(mtd));
}
// 🔴 AND THE TOOLS ACTUALLY ASK FOR IT, rather than merely not building one. A calculator that
// prints no pound at all would pass the line above and be broken in a different way.
for (const f of ['app/tax-calculator/Calc.tsx', 'app/cis-calculator/Calc.tsx', 'app/ni-checker/Calc.tsx',
  'app/student-loan-checker/Calc.tsx', 'app/rent-a-room-checker/Calc.tsx',
  'app/landlord-tax-calculator/Calc.tsx', 'app/sole-trader-vs-limited/Calc.tsx',
  'app/invoice-generator/Generator.tsx']) {
  ok(`${f.split('/')[1]} writes its pounds with lib/money`,
    /from '\.\.\/\.\.\/lib\/money'/.test(read(f)) && /gbp0\(|gbp2\(/.test(stripComments(read(f))));
}
const printsMoney = appPages.filter((f) => /£/.test(stripComments(read(f))) || /gbp0|gbp2|gbpAbs/.test(read(f)));
for (const f of printsMoney) {
  // ⚠️ DEPTH AGNOSTIC ON PURPOSE, SINCE 1 AUGUST 2026. This used to name the two relative depths
  // that happened to exist, and app/app/you/elections/page.tsx is the first screen four levels
  // down that prints a pound. A guard that has to be edited every time a folder is added is a
  // guard that gets edited to pass rather than read. The property is that it asks lib/money.ts.
  ok(`${rel(f)}: writes pounds through lib/money.ts`, /from '(\.\.\/)+lib\/money'/.test(read(f)));
}

console.log('\n7. THE PILE IS A SURFACE, NOT A SECOND PILE');
//
// The grouping IS the feature: fourteen trips to a merchant is one question, not fourteen. All of
// that reasoning, the careful-first ordering, and the rule about whether the fast path is even on
// offer live in lib/reviewpile.ts, and /api/pile and the phone app already render it. A web page
// that regrouped the rows itself would be a second pile, disagreeing with his phone about how many
// questions he has left.
const pile = read(path.join(repo, 'app/app/pile/page.tsx'));
ok('the groups come from lib/reviewpile.ts', pile.includes('buildPile') && pile.includes('summarisePile'));
ok('🔴 THE FAST PATH RULE IS ASKED FOR, NOT REIMPLEMENTED', pile.includes('canBulkConfirm'));
ok('the vendor key comes from lib/memory.ts', pile.includes('normaliseVendor'));
ok('🔴 THE CATEGORY LIST HAS ONE HOME', pile.includes('CATEGORIES') && !/const CATEGORIES\s*=/.test(pile));
// A decision changes his books, so it is a form post. A GET that files fourteen payments is a GET
// any other site can make him send with an image tag.
ok('every decision is a POST, never a link', !/href="\/api\/pile/.test(pile) && (pile.match(/method="post"/g) || []).length >= 2);

const pileRoute = read(path.join(repo, 'app/api/pile/route.ts'));
ok('the route accepts the web form as well as the app JSON', pileRoute.includes('application/x-www-form-urlencoded'));
// One handler, two encodings. A second route for the web would be a second implementation of
// "file these and remember it", and the one that drifts is the one he used.
//
// ⚠️ THIS ASSERTION USED TO COUNT CALL SITES, AND IT CAUGHT ME, CORRECTLY, THEN TURNED OUT TO BE
// MEASURING THE WRONG THING.
//
// Adding the one tap "confirm everything we are sure about" branch made it two calls to
// confirmPile, and the count failed. But the invariant was never "one call site", it was "there is
// only one implementation of filing, and it lives in lib". A loop that calls the same function is
// not a second implementation. A route that wrote its own insert would be.
//
// So it now tests the thing it always meant: nothing in this route files anything itself.
ok(
  '🔴 THE ROUTE NEVER FILES ANYTHING ITSELF, IT ONLY EVER CALLS lib',
  !/\bfetch\s*\(/.test(pileRoute) && !/\binsert\b|\bupsert\b|rest\/v1/.test(pileRoute),
);
ok('every filing goes through confirmPile', pileRoute.includes('confirmPile('));
ok('every not-business decision goes through setManyPersonal', pileRoute.includes('setManyPersonal('));

// 🔴 AND THE ONE TAP BRANCH IS THE DANGEROUS ONE, so it gets its own assertions.
//
// It files many rows at once. If the page could hand it a list of ids, a crafted post would file
// anything at all, including the careful groups the own name check exists to protect. The intent
// comes from the client and nothing else does: the server re-reads the pile and asks
// bulkConfirmPlan what it was confident about.
// Anchored on the BRANCH, not the first mention of the word: 'confirm_known' also appears in the
// type and in the form parsing above it, and slicing from there swept the ordinary id reading into
// the range and failed for the wrong reason.
const bulk = pileRoute.slice(pileRoute.indexOf("if (body.verdict === 'confirm_known')"));
ok('the bulk branch rebuilds the pile server side', /pileEntries\(user\.id\)[\s\S]{0,400}buildPile\(/.test(bulk));
ok('🔴 IT ASKS lib WHICH GROUPS IT WAS CONFIDENT ABOUT', bulk.includes('bulkConfirmPlan('));
ok(
  '🔴 AND IT NEVER READS IDS FROM THE REQUEST',
  !/body\.ids|f\.get\(.ids.\)/.test(bulk.slice(0, bulk.indexOf('const ids ='))),
);
// 303, so a refresh or a back button cannot file the same rows twice.
ok('the form answer is a 303, not a 302', /NextResponse\.redirect\([^)]*,\s*303\)/.test(pileRoute));
// Reporting 14 filed when 11 were filed is how a man ends up with three he believes are in his books.
ok('🔴 A PARTIAL APPLY IS TOLD APART FROM A FULL ONE', pileRoute.includes("'partial'") && pile.includes("case 'partial'"));

// 🔴 NEVER MAKE HIM CHOOSE SOMETHING WE ALREADY KNOW.
//
// After the merchant rule landed, Trainline stopped being one tap, correctly: whether a journey was
// work is his to say, not the shop's. But the card then offered "Choose one" and made him hunt
// travel out of twenty four options for a merchant we had just recognised. Refusing to bulk file
// something is not the same as not knowing what it is, and throwing the answer away is the exact
// tedium that made him stop the first time.
ok('the category select is pre-filled from what we worked out', /defaultValue=\{g\.suggested \?\? ''\}/.test(pile));
ok('🔴 AND "CHOOSE ONE" ONLY APPEARS WHEN WE GENUINELY HAVE NO IDEA', /\{!g\.suggested && <option value="">Choose one<\/option>\}/.test(pile));
// The screen must not claim it has never seen a merchant it has just categorised.
// Comments stripped: the code carries a comment QUOTING the old wording to explain why it changed,
// and reading an explanation as a violation is the third time this suite has taught me that.
ok('it never claims not to have seen these before', !/have not seen/.test(stripComments(pile)));
// And the current map is what decides, not whatever map ran the day the row arrived.
ok('the page reads rows against the CURRENT keyword map', pile.includes('categoriseBankLine'));
ok('so does the api', pileRoute.includes('categoriseBankLine'));
// The account gate reaches both surfaces, or one of them would presume what the other refuses.
ok('the page partitions by what the account is for', /partitionPile\(groups, accountUse\)/.test(pile));
ok('the api gates the one tap by it too', /canBulkConfirm\(g, accountUse\)/.test(pileRoute));
ok('🔴 AND THE BULK PLAN IS GATED BY IT', /bulkConfirmPlan\(\s*[\s\S]{0,160}accountUse,/.test(pileRoute));

console.log('\n8. THE MONEY LOG IS A SURFACE, AND ITS TOTALS AGREE WITH THE OVERVIEW');
//
// This is the page that makes the ledger's claim checkable. lib/ledger.ts's header says "£12.99
// saves you £2,000" is a specification and not a slogan: if we cannot show him the £2,000 we have
// not earned the £12.99. Every pound of it comes from rows, and until 30 July the web app had
// nowhere to look at a row.
//
// So the risk is a page that adds his money up its own way. A total here that disagreed with the
// Overview would be the fourth time this codebase put two readers over one number.
const log = read(path.join(repo, 'app/app/money/page.tsx'));
const personalRoute = read(path.join(repo, 'app/api/personal/route.ts'));

ok('the month is grouped and added up in lib/moneylog.ts', log.includes('logFor'));
// 🔴 THE MONTH IS ASKED FOR BY DATE, NOT FILTERED OUT OF EVERYTHING.
//
// The first draft read getAllConfirmedForReview, which has no date filter and a limit of two
// thousand rows, and sliced a month out in memory. On a busy account that limit is reached and the
// oldest rows fall off the end, so a man stepping back to April is shown an EMPTY MONTH with
// nothing to tell him why. A silent truncation that reads as "you did no work in April".
ok('🔴 THE MONTH IS FETCHED BY DATE, NOT SLICED OUT OF A CAPPED LIST',
  log.includes('transactionsInMonth') && !log.includes('getAllConfirmedForReview'));
ok('a failed read is told apart from a quiet month', /rows !== null/.test(log));
ok('🔴 THE PAGE DOES NOT ADD HIS MONEY UP ITSELF',
  !/\breduce\(/.test(stripComments(log)) && !/income\s*\+=|expenses\s*\+=/.test(stripComments(log)));
ok('what is waiting is counted by lib/reviewpile.ts, like everywhere else',
  log.includes('buildPile') && log.includes('partitionPile'));
ok('pounds are written by lib/money.ts', log.includes("from '../../../lib/money'"));
ok('🔴 AND NO SCREEN BUILDS A POUND ITSELF', !buildsAPound.test(stripComments(log)));
ok('the month key off the query string is validated before it is used', log.includes('isMonthKey'));

// 🔴 A CORRECTION IS A POST, NEVER A LINK. A GET that strikes a line out of a man's tax figures is
// a change any other site can make for him with an image tag, and a crawler can make by accident.
ok('🔴 A CORRECTION IS A FORM POST, NEVER A LINK',
  /<form action="\/api\/personal" method="post"/.test(log));
ok('the route answers the web form as well as the app JSON', personalRoute.includes('formData'));
// ⚠️ THE OBVIOUS REGEX HERE IS WRONG, and it cost me a red run. [^)]* stops at the first bracket,
// which in `redirect(new URL(...), 303)` is the one closing the URL, so the assertion can never see
// the status code. Matched across the whole call instead.
ok('the form answer is a 303, not a 302',
  /NextResponse\.redirect\([\s\S]{0,160}?,\s*303\)/.test(personalRoute)
  && !/NextResponse\.redirect\([\s\S]{0,160}?,\s*302\)/.test(personalRoute));

// 🔴 'false' IS A TRUTHY STRING. A form posts strings, so reading the flag the lazy way would make
// "Put it back" mark the line personal all over again: a button that does the opposite of its own
// label, on his tax figures.
ok("🔴 THE FORM'S 'false' IS READ AS FALSE, NOT AS A TRUTHY STRING",
  /!==\s*'false'/.test(personalRoute));

// 🔴 MONEY IN IS NOT OFFERED THE BUTTON. Striking out a payment INTO his account removes income
// from his own tax figures in one press, and understating income is the one direction of error this
// product must never make easy. lib/personal.ts and confirm_pile both already refuse it.
ok('🔴 ONLY MONEY OUT CAN BE STRUCK OUT FROM THIS SCREEN',
  /e\.amount < 0 \? \(\s*<form action="\/api\/personal"/.test(log));

// He lands back on the month he was looking at. Returning him to today after he corrects a line in
// March loses his place, on the page whose whole job is finding one payment.
ok('the month travels with the correction', /name="m"/.test(log) && personalRoute.includes("f.get('m')"));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n9. THE SIGN IN SCREEN WHEN THE CODE DOES NOT COME');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 7 AUGUST 2026. FIVE FAULTS ON ONE SCREEN, AND ALL FIVE MET THE SAME MAN: THE ONE WHO IS
// ALREADY LOCKED OUT AND ALREADY ANNOYED.
//
//   1. There was NO RESEND. A man whose code never arrived could only clear the field, retype the
//      same address and press send, and that retype spends one of the three sends lib/logindoor.ts
//      allows per contact per fifteen minutes. The only control on the screen charged him for
//      using it.
//   2. "Use a different email address" was THE ONLY WAY OUT, and it empties the box. That is the
//      wrong default action for a man who typed the right address and is waiting.
//   3. "Too many tries" was shown on the SEND path, where he has tried nothing. He asked. He reads
//      an accusation and a lockout, and he stops.
//   4. A failed session write handed him back a SPENT code and told him to try again. The code had
//      already been given to GoTrue, so the one action offered was the one that could never work.
//   5. The unavailable branch told him to "get in touch" and showed NO ADDRESS, because the only
//      address on the page lived inside the form branch that this branch replaces. Same gap on the
//      code step, where the man who is actually stuck is standing.
//
// This section holds all five down twice: by walking the page's braces, and by running both auth
// routes with the branch forced open. A grep can tell you a string is somewhere in the file. Only
// the walk can tell you WHICH BRANCH it is in, which was the whole of fault five, and only running
// the route can tell you what a man is actually redirected into.

// ── A comment aware bracket walk, so a branch can be read on its own ────────────────────────────
// An apostrophe in "GoTrue's" opens a string that never closes, which is why this skips comments
// rather than only quotes. It throws rather than returning nothing: a walk that silently finds an
// empty branch would make every assertion below vacuously true, which is the one failure a guard
// must never have.
function matchFrom(s, i) {
  const open = '([{';
  const close = ')]}';
  const stack = [];
  let quote = null;
  for (; i < s.length; i += 1) {
    const c = s[i];
    if (!quote && c === '/' && s[i + 1] === '/') { i = s.indexOf('\n', i); if (i < 0) throw new Error('unclosed'); continue; }
    if (!quote && c === '/' && s[i + 1] === '*') { i = s.indexOf('*/', i) + 1; if (i < 1) throw new Error('unclosed'); continue; }
    if (quote) {
      if (c === '\\') { i += 1; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (open.includes(c)) { stack.push(close[open.indexOf(c)]); continue; }
    if (close.includes(c)) {
      if (!stack.length) return i;
      if (stack.pop() !== c) throw new Error('unbalanced');
      if (!stack.length) return i + 1;
    }
  }
  throw new Error('ran off the end of app/in/page.tsx');
}

// The one ternary that decides what a man is shown:
//   {!configured ? ( unavailable ) : step === 'code' ? ( codeStep ) : ( emailStep )}
const IN_BRANCHES = (() => {
  const at = inPage.indexOf('{!configured ? (');
  if (at < 0) throw new Error('the configured ternary on app/in/page.tsx moved, so this walk is blind');
  const whole = inPage.slice(at, matchFrom(inPage, at));
  const cut = (s) => { const o = s.indexOf('('); const c = matchFrom(s, o); return [s.slice(o + 1, c - 1), s.slice(c)]; };
  const [unavailable, r1] = cut(whole);
  const [codeStep, r2] = cut(r1);
  const [emailStep] = cut(r2);
  return { unavailable, codeStep, emailStep };
})();
ok('the branch walk is not vacuous: it found all three screens',
  IN_BRANCHES.unavailable.length > 40 && IN_BRANCHES.codeStep.length > 400 && IN_BRANCHES.emailStep.length > 200);
ok('...and it really did split them, rather than handing back one blob',
  IN_BRANCHES.emailStep.includes('name="contact"') && !IN_BRANCHES.codeStep.includes('name="contact"')
  && IN_BRANCHES.codeStep.includes('name="code"') && !IN_BRANCHES.unavailable.includes('<form'));

// Every sentence a customer can be shown, read out of the switch by its code. Comments stripped:
// the switch now carries an argument that QUOTES the old wording, and reading an explanation as
// the thing it explains is the fourth time this suite has had to learn that.
const SAYS = Object.fromEntries(
  [...stripComments(inPage).matchAll(/case '([a-z]+)': return '((?:[^'\\]|\\.)*)';/g)]
    .map((m) => [m[1], m[2].replace(/\\'/g, "'")]),
);
ok('the sentences were actually read off the page', Object.keys(SAYS).length >= 10);

// ── FAULT 1. THERE IS A WAY TO ASK FOR ANOTHER CODE ─────────────────────────────────────────────
const startForms = (b) => [...b.matchAll(/<form\b[^>]*action="([^"]+)"/g)].map((m) => m[1]);
ok('🔴 THE CODE STEP CAN ASK FOR ANOTHER CODE WITHOUT RETYPING AN ADDRESS',
  startForms(IN_BRANCHES.codeStep).includes('/api/auth/start'));
// A GET that sends a code is a GET any other site can make his browser send with an image tag, and
// every code that goes out is a row in auth_sends and a step towards his own cap.
ok('...and it is a POST, never a link',
  /<form action="\/api\/auth\/start" method="post">/.test(IN_BRANCHES.codeStep)
  && !/href="\/api\/auth\/start/.test(IN_BRANCHES.codeStep));
ok('...with a button he can actually see, not a bare word',
  /<button type="submit"[^>]*>Send the code again<\/button>/.test(IN_BRANCHES.codeStep));
// The resend carries no address field, because the code step has nowhere to type one. The contact
// comes back out of the signed pending cookie, so a resend can only ever repeat a send this door
// has already made.
ok('🔴 THE RESEND CARRIES NO CONTACT, SO NOTHING NEW CAN BE INTRODUCED FROM THAT SCREEN',
  !/name="contact"/.test(IN_BRANCHES.codeStep));
ok('🔴 AND THE SEND ROUTE READS IT BACK OUT OF THE SIGNED COOKIE',
  startRoute.includes('verifyPendingCookie') && /verifyPendingCookie\(req\.cookies\.get\(PENDING_COOKIE\)/.test(startRoute));
// GoTrue will not mint a second code inside sixty seconds. A button that fires inside that window
// must say so, not silently fail and not claim one is on its way.
ok('🔴 THERE IS AN HONEST MINUTE, AND IT IS THE BROWSER THAT KEEPS IT',
  /RESEND_WAIT_SECONDS = 60/.test(startRoute)
  && /res\.cookies\.set\(RESEND_COOKIE, '1', sessionCookieAttributes\(RESEND_WAIT_SECONDS\)\)/.test(startRoute));
ok('🔴 AND THE WAIT IS CHECKED BEFORE ANYTHING IS COUNTED, so a press inside it costs him nothing',
  stripComments(startRoute).indexOf("backToCode(req, 'wait', next)") < stripComments(startRoute).indexOf('otp:t:'));
ok('the man is told plainly, in a sentence about a minute',
  /less than a minute ago/.test(SAYS.wait) && !/on its way|have sent/.test(SAYS.wait));
// A press that really sent one has to say so, or the screen he lands back on is the screen he left
// and the button looks broken.
ok('🔴 A RESEND THAT REALLY WENT SAYS SO', /sent=1/.test(startRoute) && /one\('sent'\) === '1'/.test(inPage));
ok('...in words, on the page', /We have sent another code/.test(stripComments(inPage)));

// ── FAULT 2. THE LINK THAT CLEARS THE FIELD IS NO LONGER THE ONLY WAY OUT ────────────────────────
ok('🔴 "USE A DIFFERENT EMAIL ADDRESS" IS NO LONGER THE ONLY CONTROL ON THE CODE STEP',
  startForms(IN_BRANCHES.codeStep).length >= 2);
// It stays, because a man who really did mistype needs it. It just stops being the default action.
ok('...but it is still there for the man who did mistype',
  /<a href="\/in"[^>]*>Use a different email address<\/a>/.test(IN_BRANCHES.codeStep));
// ⚠️ COMMENTS STRIPPED, OR THIS READS THE ARGUMENT INSTEAD OF THE SCREEN. The branch carries a long
// note quoting the old link's words, and that quotation sits above the resend it explains.
{
  const rendered = stripComments(IN_BRANCHES.codeStep);
  ok('🔴 AND THE RESEND COMES FIRST, because he is far more likely to have typed it right',
    rendered.indexOf('/api/auth/start') < rendered.indexOf('Use a different email address'));
}

// ── FAULT 3. THE SEND DOOR STOPS ACCUSING HIM OF TRYING ─────────────────────────────────────────
ok('🔴 THE SEND DOOR NEVER SAYS "TOO MANY TRIES", BECAUSE HE HAS TRIED NOTHING',
  !/'toomany'/.test(stripComments(startRoute)));
ok('...it has its own word for asking too often', /'toosoon'/.test(stripComments(startRoute)));
ok('🔴 AND THE VERIFY DOOR KEEPS IT, because there he really has tried',
  /'toomany'/.test(stripComments(verifyRoute)));
ok('the two sentences are different, and each names what he actually did',
  SAYS.toomany !== SAYS.toosoon && /tries/.test(SAYS.toomany) && /asked for a few codes/.test(SAYS.toosoon));
ok('🔴 AND THE SEND SENTENCE ACCUSES HIM OF NOTHING', !/tries|too many/i.test(SAYS.toosoon));
// A refusal to send another must leave him on the step where his live code still works, not on an
// empty address field.
ok('🔴 A REFUSED RESEND LEAVES HIM ON THE CODE STEP',
  /function backToCode\(/.test(startRoute) && /step=code&e=\$\{reason\}/.test(startRoute));

// ── FAULT 4. NOTHING PAST THE EXCHANGE EVER OFFERS HIM A SPENT CODE ─────────────────────────────
//
// GoTrue's /auth/v1/verify is where the code is handed in. A non ok answer means it was refused and
// the code is untouched, so 'code' is honest there and only there. Everything after that line is
// holding a code that has already been accepted, and a one time code that has been accepted is gone.
{
  const anchor = "if (!res.ok) return back(req, 'code', next);";
  const src = stripComments(verifyRoute);
  const at = src.indexOf(anchor);
  ok('the exchange anchor is still in the verify route, so this slice is not vacuous', at > 0);
  const afterExchange = src.slice(at + anchor.length);
  const reasons = [...new Set([...afterExchange.matchAll(/back\(req, '([a-z]+)'/g)].map((m) => m[1]))];
  ok('the slice really did find the failures past the exchange', reasons.length >= 1);
  ok(`🔴 NO FAILURE PAST THE CODE EXCHANGE INVITES HIM TO TYPE THAT CODE AGAIN: ${reasons.join(', ')}`,
    reasons.every((r) => r === 'session'));
  ok("...and 'code' survives on the one line where the code really was refused",
    /if \(!res\.ok\) return back\(req, 'code', next\);/.test(src));
}
ok('🔴 AND THE SENTENCE TELLS HIM THE CODE IS GONE AND WHAT TO DO INSTEAD',
  /used up/.test(SAYS.session) && /fresh one/.test(SAYS.session));
ok('🔴 IT NEVER INVITES THE ONE ACTION THAT CANNOT WORK', !/try again/i.test(SAYS.session));
// The thing it tells him to do has to be on the screen he is sent to, or it is advice he cannot
// follow, which this door has been corrected for once already.
ok('🔴 AND THE SCREEN HE LANDS ON REALLY HAS THAT BUTTON ON IT',
  /step=code&e=\$\{reason\}/.test(verifyRoute) && startForms(IN_BRANCHES.codeStep).includes('/api/auth/start'));

// ── FAULT 5. EVERY "GET IN TOUCH" SHOWS HIM WHERE ───────────────────────────────────────────────
const hasAddress = (b) => /\{SUPPORT\}/.test(stripComments(b));
ok('🔴 THE UNAVAILABLE BRANCH SHOWS AN ADDRESS, having told him to write to us with none',
  hasAddress(IN_BRANCHES.unavailable));
ok('🔴 SO DOES THE CODE STEP, where the man who is actually stuck is standing',
  hasAddress(IN_BRANCHES.codeStep));
ok('...and the email step still does', hasAddress(IN_BRANCHES.emailStep));
// ⚠️ IT IS info@, NOT support@. test/llmstxt.test.mjs calls support@ "the mailbox we do not have",
// and offering one was itself a fault fixed on 7 August: an address nobody reads is worse than no
// address, because he writes to it and waits.
ok('🔴 THE ADDRESS IS info@lekhio.app AND THERE IS ONE HOME FOR IT',
  /const SUPPORT = 'info@lekhio\.app';/.test(inPage)
  && (stripComments(inPage).match(/info@lekhio\.app/g) || []).length === 1);
// Comments stripped again: the constant carries the argument for why it is info@ and not support@,
// and a guard that cannot tell the reason from the mistake is a guard somebody deletes.
ok('🔴 AND IT IS NEVER THE SUPPORT MAILBOX WE DO NOT HAVE', !/support@/.test(stripComments(inPage)));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n10. AND THE TWO AUTH ROUTES, RUN FOR REAL WITH THE BRANCH FORCED OPEN');
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Everything above reads the source. Reading the source is how you find out what a file says; it is
// not how you find out what a man is redirected into. These stage both routes with the real
// lib/logindoor.ts and the real lib/websession.ts, replace only the two modules that reach the
// world, and force each failure open one at a time.
//
// ⚠️ NOTHING LEAVES THE MACHINE. fetch is replaced by a fake GoTrue whose 200 means "the code was
// accepted", which is the fact fault four turns on: a code GoTrue has accepted is spent, and every
// branch below that point is holding one.
const AUTH = await (async () => {
  process.env.WEB_SESSION_SECRET = 'a-test-secret-long-enough-to-clear-the-32-byte-bar';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key-for-this-suite';
  const stage = mkdtempSync(path.join(tmpdir(), 'webauth-routes-'));
  const put = (n, s) => writeFileSync(path.join(stage, n), s);
  put('logindoor.ts', read(path.join(repo, 'lib/logindoor.ts')));
  put('websession.ts', read(path.join(repo, 'lib/websession.ts')));
  put('nextserver.ts', `
export class NextRequest {}
export const NextResponse = {
  redirect(url, status) {
    const jar = [];
    return { status, location: String(url), cookies: { set: (n, v, a) => jar.push({ n, v, a }) }, jar };
  },
};
`);
  put('ratelimit.ts', `
export const rl = { target: false, source: false, cap: false, calls: [] };
export function clientIp() { return '203.0.113.9'; }
export async function rateLimitedShared(key) {
  rl.calls.push(key);
  return /^otpv?:t:/.test(key) ? rl.target : /^otpv?:ip:/.test(key) ? rl.source : false;
}
export async function spendCapReached() { rl.calls.push('cap'); return rl.cap; }
`);
  put('supabase.ts', `
export const db = { account: { userId: 'u-1' }, attachOk: true, rowOk: true, sessionOk: true,
  user: { id: 'u-1', phone: '+447700900999', email: 'dave@example.com' }, calls: [] };
export async function findContactAccount(channel, value) { db.calls.push({ fn: 'find', value }); return db.account; }
export async function attachEmailToAuthUser() { db.calls.push({ fn: 'attach' }); return db.attachOk; }
export async function logAuthSend(channel, hash, outcome) { db.calls.push({ fn: 'log', outcome }); }
export async function verifyAccessToken() { db.calls.push({ fn: 'token' }); return db.user; }
export async function ensureUserRow() { db.calls.push({ fn: 'row' }); return db.rowOk; }
export async function createWebSession() { db.calls.push({ fn: 'session' }); return db.sessionOk; }
export async function reconcileSignupToUser() { return true; }
`);
  const fix = (s) => s.replace(/from 'next\/server'/g, "from './nextserver.ts'")
    .replace(/from '(?:\.\.\/)+lib\/([a-zA-Z]+)'/g, "from './$1.ts'");
  put('start.ts', fix(startRoute));
  put('verify.ts', fix(verifyRoute));
  const u = (f) => pathToFileURL(path.join(stage, f)).href;
  return {
    start: await import(u('start.ts')), verify: await import(u('verify.ts')),
    RL: await import(u('ratelimit.ts')), DB: await import(u('supabase.ts')), WS: await import(u('websession.ts')),
  };
})();

const authPost = (fields, cookies = {}, at = '/api/auth/start') => ({
  url: `https://lekhio.app${at}`,
  headers: new Headers({ origin: 'https://lekhio.app', host: 'lekhio.app' }),
  formData: async () => { const fd = new FormData(); for (const [k, v] of Object.entries(fields)) fd.append(k, String(v)); return fd; },
  cookies: { get: (n) => (n in cookies ? { value: cookies[n] } : undefined) },
});

// The fake GoTrue. `sent` counts codes that really went out, `burned` counts codes it accepted.
let gotrue;
function fakeGoTrue(plan = {}) {
  gotrue = { sent: 0, burned: 0 };
  globalThis.fetch = async (u) => {
    if (String(u).endsWith('/auth/v1/otp')) {
      if (plan.otpFails) return { ok: false, status: 429, json: async () => ({}) };
      gotrue.sent += 1;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    if (plan.codeRefused) return { ok: false, status: 403, json: async () => ({}) };
    gotrue.burned += 1;
    return { ok: true, status: 200, json: async () => ({ access_token: 'a-token' }) };
  };
}
const reason = (res) => new URL(res.location).searchParams.get('e');
const cookieOn = (res, n) => res.jar.find((c) => c.n === n);

const PENDING = AUTH.WS.pendingCookieValue({ channel: 'email', value: 'dave@example.com' });
ok('the harness really can mint a pending contact, so websession is configured here', PENDING.length > 20);

// ── FAULT 1, RUN ────────────────────────────────────────────────────────────────────────────────
{
  fakeGoTrue();
  const first = await AUTH.start.POST(authPost({ contact: 'dave@example.com' }));
  ok('🔴 A RESEND IS POSSIBLE AT ALL: the first send arms the code step', gotrue.sent === 1 && first.location.includes('step=code'));
  ok('🔴 AND THE MINUTE IS ARMED WITH IT', !!cookieOn(first, 'lek_w') && cookieOn(first, 'lek_w').a.maxAge === 60);
  ok('...httpOnly and same site, like every other cookie this door sets',
    cookieOn(first, 'lek_w').a.httpOnly === true && cookieOn(first, 'lek_w').a.sameSite === 'lax');

  // Inside the minute. This is the press that used to be impossible to make honest.
  fakeGoTrue();
  AUTH.RL.rl.calls.length = 0;
  AUTH.DB.db.calls.length = 0;
  const early = await AUTH.start.POST(authPost({}, { lek_p: PENDING, lek_w: '1' }));
  ok('🔴 A PRESS INSIDE THE MINUTE IS TOLD THE TRUTH, NOT THAT ONE IS ON ITS WAY', reason(early) === 'wait');
  ok('🔴 AND NO CODE WENT OUT BEHIND THAT SENTENCE', gotrue.sent === 0);
  ok('🔴 AND IT COST HIM NOTHING: not one send was counted against him', AUTH.RL.rl.calls.length === 0);
  ok('...nothing was looked up and nothing was logged either', AUTH.DB.db.calls.length === 0);

  // After the minute.
  fakeGoTrue();
  const again = await AUTH.start.POST(authPost({}, { lek_p: PENDING }));
  ok('🔴 AFTER THE MINUTE A FRESH CODE REALLY GOES OUT, with nothing retyped', gotrue.sent === 1);
  ok('🔴 TO THE ADDRESS IN THE SIGNED COOKIE, never one posted from that screen',
    AUTH.DB.db.calls.some((c) => c.fn === 'find' && c.value === 'dave@example.com'));
  ok('🔴 AND HE IS TOLD IT WENT', again.location.includes('sent=1'));
  ok('where he was heading survives a resend',
    (await AUTH.start.POST(authPost({ next: '/app/you/billing' }, { lek_p: PENDING }))).location.includes('next=%2Fapp%2Fyou%2Fbilling'));

  // ⚠️ AND THE NEUTRALITY RULE SURVIVES THE NEW BUTTON. A stranger's address and a customer's must
  // still produce the same screen, or the resend is a customer list with a button on it.
  fakeGoTrue();
  const known = await AUTH.start.POST(authPost({}, { lek_p: PENDING }));
  AUTH.DB.db.account = null;
  const stranger = await AUTH.start.POST(authPost({}, { lek_p: AUTH.WS.pendingCookieValue({ channel: 'email', value: 'nobody@example.com' }) }));
  ok('🔴 A STRANGER PRESSING RESEND GETS A BYTE IDENTICAL SCREEN', known.location === stranger.location);
  AUTH.DB.db.account = { userId: 'u-1' };

  // A resend after the pending cookie has run out is about an address, so it says so.
  fakeGoTrue();
  const stale = await AUTH.start.POST(authPost({}));
  ok('a resend with no live contact asks for the address again', reason(stale) === 'expired' && !stale.location.includes('step=code'));
}

// ── FAULT 3, RUN ────────────────────────────────────────────────────────────────────────────────
{
  fakeGoTrue();
  AUTH.RL.rl.target = true;
  AUTH.DB.db.calls.length = 0;
  const typed = await AUTH.start.POST(authPost({ contact: 'dave@example.com' }));
  ok('🔴 ASKING FOR A CODE IS NEVER CALLED A TRY', reason(typed) === 'toosoon');
  ok('...and he really had tried nothing: no code was verified in that request',
    !AUTH.DB.db.calls.some((c) => c.fn === 'token'));
  const pressed = await AUTH.start.POST(authPost({}, { lek_p: PENDING }));
  ok('🔴 AND A REFUSED RESEND LEAVES HIM STANDING ON THE CODE STEP',
    reason(pressed) === 'toosoon' && pressed.location.includes('step=code'));
  AUTH.RL.rl.target = false;

  // The verify door keeps 'toomany', because there every attempt really was a try.
  fakeGoTrue();
  AUTH.RL.rl.target = true;
  const guessed = await AUTH.verify.POST(authPost({ code: '12345678' }, { lek_p: PENDING }, '/api/auth/verify'));
  ok('🔴 THE VERIFY DOOR STILL SAYS "TOO MANY TRIES", because there he really has tried', reason(guessed) === 'toomany');
  AUTH.RL.rl.target = false;
}

// ── FAULT 4, RUN ────────────────────────────────────────────────────────────────────────────────
//
// Each of these hands GoTrue a code, gets a 200 back, and then breaks the step after it. The code
// is gone in every one of them, so the only honest answer is the one that tells him so.
for (const [what, set, unset] of [
  ['the users row will not write', () => { AUTH.DB.db.rowOk = false; }, () => { AUTH.DB.db.rowOk = true; }],
  ['the session row will not write', () => { AUTH.DB.db.sessionOk = false; }, () => { AUTH.DB.db.sessionOk = true; }],
  ['our own token check comes back empty', () => { AUTH.DB.db.user = null; }, () => { AUTH.DB.db.user = { id: 'u-1', phone: '+447700900999', email: 'dave@example.com' }; }],
]) {
  fakeGoTrue();
  set();
  const res = await AUTH.verify.POST(authPost({ code: '12345678' }, { lek_p: PENDING }, '/api/auth/verify'));
  unset();
  ok(`${what}: GoTrue took the code, so it is spent`, gotrue.burned === 1);
  ok(`🔴 ${what}: HE IS NOT INVITED TO TYPE IT AGAIN`, reason(res) === 'session' && !/try again/i.test(SAYS[reason(res)]));
  ok(`${what}: and he is left on the step that carries the resend`, res.location.includes('step=code'));
}
// The one case where the code really was refused keeps its own honest answer, or this whole fix
// would have turned a wrong code into a lecture about used up codes.
{
  fakeGoTrue({ codeRefused: true });
  const wrong = await AUTH.verify.POST(authPost({ code: '00000000' }, { lek_p: PENDING }, '/api/auth/verify'));
  ok('🔴 A GENUINELY WRONG CODE IS STILL TOLD IT IS WRONG, AND STILL INVITED TO TRY AGAIN',
    reason(wrong) === 'code' && gotrue.burned === 0 && /try again/.test(SAYS.code));
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
