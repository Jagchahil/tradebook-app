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
ok('🔴 THE APPLIED LINE COMES FROM THE MODULE THAT CAN REFUSE IT', money.includes('appliedLineFor'));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
