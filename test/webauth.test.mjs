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

import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');

let pass = 0, fail = 0;
const ok = (name, cond) => {
  if (cond) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}`); }
};

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e === '.git') continue;
    const p = path.join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
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
const noRedirect = pages.filter((f) => !/redirect\(['"]\/in['"]\)/.test(read(f)));
ok('every page sends a signed out visitor to /in: ' + (noRedirect.map(rel).join(', ') || 'none'), noRedirect.length === 0);

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
const printsMoney = appPages.filter((f) => /£/.test(stripComments(read(f))) || /gbp0|gbp2|gbpAbs/.test(read(f)));
for (const f of printsMoney) {
  ok(`${rel(f)}: writes pounds through lib/money.ts`, read(f).includes("from '../../../lib/money'") || read(f).includes("from '../../lib/money'"));
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

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
