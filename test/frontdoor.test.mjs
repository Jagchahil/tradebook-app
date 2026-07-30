// THE WEB APP IS THE FRONT DOOR. Nothing else is.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PROTECTS, AND WHY IT IS A TEST RATHER THAN A NOTE IN A DOC.
//
// On 28 July the live signup was walked as a barber and ended by telling him to download an app
// that is not released and to say hello on WhatsApp, with no link to the web app anywhere. The
// product did not appear at the end of its own signup.
//
// That was not one bad screen. The whole site sold WhatsApp as the mechanic: "Photograph a receipt
// on WhatsApp", "Ten seconds a day on WhatsApp", and a comparison row reading "Lives in WhatsApp,
// no new app to learn".
//
// 🔴 AND A WEB CUSTOMER CANNOT USE IT ON DAY ONE. Inbound WhatsApp resolves a message to an account
// BY PHONE NUMBER, and a web signup's number is deliberately unproved. Until he binds it, every one
// of those lines is an instruction he cannot follow.
//
// So this is not a matter of taste, it is doc 103's honesty test: never advertise a capability
// before it exists for the man reading it. WhatsApp stays in the product and stays described where
// it is a fact. What it may never be again is the way IN.
//
// These read source, because the failure is a sentence rather than a crash. One helpful line put
// back is all it takes, and nothing anywhere else would go red.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// lstat, not stat, and dot directories are skipped. There is a dangling symlink at app/.node/bin
// which stat follows and throws on, and a test suite that dies on a stray symlink is a suite that
// gets deleted rather than fixed.
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = path.join(dir, name);
    const st = lstatSync(full);
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(root, f);
// The same walk, named for the second sweep below so the intent of each call site reads clearly.
const walkAll = walk;
// ⚠️ DEFINED HERE RATHER THAN BESIDE ITS FIRST USE, because three separate sweeps now need it and
// the two added on 30 July run before the one it was originally written for.
const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('\nfront door: the web app, and nothing else');

const pages = walk(path.join(root, 'app'))
  .filter((f) => !rel(f).startsWith('app/team/'));
ok('the app tree was actually walked (not vacuous)', pages.length > 30);

// ---------------------------------------------------------------------------------------------
// 🔴 EXACTLY ONE CUSTOMER PAGE LINKS OUT TO WHATSAPP, AND IT IS THE ONE THAT BINDS HIS NUMBER.
//
// ⚠️ THIS ASSERTION USED TO READ "no customer page links out to WhatsApp", AND IT WAS RIGHT WHEN IT
// WAS WRITTEN. Its reasoning, kept because it is still the reasoning:
//
//   A wa.me link is the strongest possible statement that WhatsApp is the next step, and it is the
//   exact thing the 28 July walk ended on. Inbound WhatsApp resolves a message to an account BY
//   PHONE NUMBER, and a web signup's number is deliberately unproved, so until he binds it every
//   such link is a door to a room he cannot enter.
//
// Binding is what changed on 30 July, and it changed by the only route that makes the link honest:
// he proves the number by sending us a code from it. So the rule narrows rather than lifting. The
// link may exist in exactly one file, /app/connect, which is the page whose entire job is that
// binding, and which draws nothing at all when the feature is not configured.
//
// 🔴 IF THIS LIST EVER GROWS, THE OLD BUG IS BACK. A wa.me link on the homepage, in the signup, or
// on a Stripe return screen is once again an instruction a man cannot follow.
// ---------------------------------------------------------------------------------------------
//
// ⚠️ COMMENTS ARE STRIPPED FIRST. The connect page's own header explains at length why the link
// travels the direction it does, and it has to say wa.me to make sense. What matters is the link a
// customer can press, not the reasoning above it.
const waLinks = pages.filter((f) => /wa\.me/.test(codeOnly(read(rel(f))))).map(rel);
ok(
  `🔴 no page writes a wa.me link itself${waLinks.length ? `\n     ${waLinks.join('\n     ')}` : ''}`,
  waLinks.length === 0,
);
// The link is BUILT by lib/walink.ts and the page never writes the host itself, so the sweep above
// finds nothing even on the page that legitimately links out. That is the right answer and it is
// also a trap: a future page could link out by calling waMeLink too and this would stay green.
// So the builder is pinned to the one file allowed to call it.
const waMeCallers = walkAll(path.join(root, 'app'))
  .filter((f) => !rel(f).startsWith('app/team/'))
  .filter((f) => /waMeLink/.test(read(rel(f))))
  .map(rel);
ok(
  `🔴 only the connect page builds a WhatsApp link${waMeCallers.length ? `\n     ${waMeCallers.join('\n     ')}` : ''}`,
  waMeCallers.length === 1 && waMeCallers[0] === 'app/app/connect/page.tsx',
);
ok('the wa.me host is written in exactly one place, and it is not a page',
  /wa\.me/.test(read('lib/walink.ts')));

// ---------------------------------------------------------------------------------------------
// 🔴 THE LOGGED IN APP NEVER TELLS HIM TO DO SOMETHING HE CANNOT DO.
//
// /app and /app/pile both used to end with "Send a receipt on WhatsApp any time and it lands here."
// He has no bound number, so it does not land anywhere. These are the two screens a paying customer
// actually opens, so they are held to the strictest version of the rule: no mention at all until
// the capability is real for him.
// ---------------------------------------------------------------------------------------------
//
// ⚠️ NARROWED ON 30 JULY, FOR THE SAME REASON AS THE RULE ABOVE, AND NO FURTHER.
//
// /app and /app/pile both used to end with "Send a receipt on WhatsApp any time and it lands here."
// He had no bound number, so it did not land anywhere. Those two screens are still held to the
// strictest version of the rule, because they are the two a paying customer actually opens and
// neither of them is where connecting happens.
//
// The exceptions are the connect page, whose whole subject is WhatsApp, and ONE row on the money
// screen that offers it. That row is gated on `offerWhatsApp`, which is false unless the feature is
// configured AND he has no number bound yet, so it is never on screen for a man who cannot act on
// it and never on screen for a man who already has.
const CONNECT_PAGE = 'app/app/connect/page.tsx';
const inApp = pages.filter((f) => rel(f).startsWith('app/app/'));
ok('the logged in app has screens to check', inApp.length >= 3);
ok('the connect page is one of them', inApp.map(rel).includes(CONNECT_PAGE));
const appInstructs = inApp
  .filter((f) => rel(f) !== CONNECT_PAGE && rel(f) !== 'app/app/page.tsx')
  .filter((f) => /WhatsApp/.test(read(rel(f)).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')))
  .map(rel);
ok(
  `🔴 no screen inside /app instructs a WhatsApp action${appInstructs.length ? `\n     ${appInstructs.join('\n     ')}` : ''}`,
  appInstructs.length === 0,
);
// 🔴 AND THE MONEY SCREEN'S ONE MENTION IS GATED. Without this the exemption above would let any
// amount of ungated WhatsApp copy back onto the first screen a new customer sees.
const money = read('app/app/page.tsx');
ok('🔴 the money screen offers WhatsApp only behind the gate',
  /const offerWhatsApp = proved !== null && !proved\.phone/.test(money)
  && /waLinksConfigured\(\) && WHATSAPP_NUMBER\.length >= 8/.test(money)
  && /\{offerWhatsApp \? \(/.test(money));
//
// 🔴 AND EVERY WORD OF IT IS INSIDE THAT GATE. Cutting the gated block out of the file must leave
// no customer facing mention behind anywhere else on the money screen, which is the assertion that
// stops the exemption above turning into a licence.
//
// ⚠️ THE IDENTIFIER IS NOT A MENTION. `offerWhatsApp` contains the word and appears twice, in the
// decision and in the gate. The first draft of this counted raw occurrences, expected one, and
// found three, which is a test failing for the wrong reason and is how a real assertion gets
// weakened into uselessness by whoever fixes it in a hurry.
const gateStart = money.indexOf('{offerWhatsApp ? (');
const gateEnd = money.indexOf(') : null}', gateStart);
ok('the gated block was actually found, so the check below is not vacuous',
  gateStart > 0 && gateEnd > gateStart);
const outsideGate = codeOnly(money.slice(0, gateStart) + money.slice(gateEnd))
  .replace(/offerWhatsApp/g, '');
ok('🔴 the money screen says WhatsApp inside that gate and nowhere else',
  !/WhatsApp/.test(outsideGate));

// 🔴 AND THE CONNECT PAGE ITSELF DRAWS NOTHING WHEN THE FEATURE IS NOT CONFIGURED. Doc 103's third
// test: a button whose only function is to say the feature does not exist yet is an advert for our
// roadmap. Reaching this page on a build with no number set must explain, not offer.
const connect = read(CONNECT_PAGE);
ok('the connect page is gated on both the secret and a real number',
  /waLinksConfigured\(\) && WHATSAPP_NUMBER\.length >= 8/.test(connect));
ok('🔴 the connect page never claims a proactive template sends the welcome',
  !/sendTemplate|TEMPLATES_APPROVED/.test(connect));
// AND IT SHIPS NO CLIENT SCRIPT, like every other screen in the web app. He is on a cheap Android
// on a bad signal and the square is the whole reason he is here, so it has to be in the HTML that
// arrives rather than something a bundle draws once it turns up.
//
// 🔴 dangerouslySetInnerHTML IS IN THIS LIST DELIBERATELY. The first version of this page injected
// the SVG as a string. It was safe, because nothing a customer types reaches the encoder, but "safe
// because of what today's only caller happens to pass" expires the moment somebody adds a second
// caller. lib/qr.ts now hands back a viewBox and a path and the page renders real JSX, so this is
// provable by grep rather than by argument.
ok('🔴 the connect page is server rendered and carries no script of any kind',
  !/'use client'/.test(connect)
  && /export const runtime = 'nodejs'/.test(connect)
  && !/onClick|onChange|onSubmit|<script|useState|dangerouslySetInnerHTML/.test(connect));
ok('every action on it is a form post or a plain link',
  (connect.match(/method="post"/g) ?? []).length >= 2);

// ---------------------------------------------------------------------------------------------
// 🔴 STEP ONE IS CONNECTING THE BANK.
//
// The shared "how it works" list and the homepage are where a stranger decides what this product
// is. Bank connect is the one capture route that works on day one for a web signup: it needs no
// proved number, no Twilio, and no message in either direction.
// ---------------------------------------------------------------------------------------------
const site = read('app/_shared/site.tsx');
const home = read('app/page.tsx');
ok('the how it works list names no messaging channel as step one', !/WhatsApp/.test(site));
ok('the homepage names no messaging channel at all', !/WhatsApp/.test(home));
ok('step one is connecting the bank', /title: 'Connect your bank'/.test(site));

// ---------------------------------------------------------------------------------------------
// 🔴 AND THE SENTENCES THAT COME OUT OF lib/, WHICH THE CHECKS ABOVE CANNOT SEE.
//
// The first version of this file walked app/*.tsx only, and missed the emptiest screen in the
// product: /app renders lib/ledger.ts's note, which read "Nothing confirmed yet. Send a receipt or
// connect the bank." Sending a receipt means WhatsApp, which needs a proved number he does not
// have. So the very first thing a new customer saw was an instruction he could not follow, and a
// test that only reads .tsx files reported everything green.
//
// These are the lib modules whose strings are printed to a customer verbatim.
// ---------------------------------------------------------------------------------------------
//
// ⚠️ COMMENTS ARE STRIPPED FIRST. lib/weeklyupdate.ts's header explains at length why the summary
// became a pull rather than a push, and it must keep saying WhatsApp to make sense. What matters is
// the STRINGS a customer is shown, not the reasoning above them.
const CUSTOMER_LIBS = ['lib/ledger.ts', 'lib/weeklyupdate.ts'];
const libSays = CUSTOMER_LIBS.filter((f) => /send a receipt|Send a receipt/i.test(codeOnly(read(f))));
ok(
  `🔴 no sentence printed from lib names an action a web customer cannot take${libSays.length ? `\n     ${libSays.join('\n     ')}` : ''}`,
  libSays.length === 0,
);
ok('the empty ledger points at the one thing that works today',
  /Connect your bank and this fills itself in/.test(read('lib/ledger.ts')));

// ⚠️ AND THE SAME SENTENCE IS NEVER PRINTED TWICE. headline() falls back to the note when there is
// not enough data to be confident, so /app rendering both put the identical line above itself.
ok('the money screen does not print the headline and the note when they are the same',
  read('app/app/page.tsx').includes("l.note !== headline(l)"));

// ---------------------------------------------------------------------------------------------
// 🔴 NOBODY IS OFFERED THE APP UNTIL HE IS INSIDE THE WEB APP.
//
// Jag's call, 30 July: everyone goes through the same door in the same order, and the phone is
// something a customer adds AFTER he is in, never a second way in that skips setting up.
//
// The store buttons were on /start's code screen and on both Stripe return screens, which under that
// rule is the worst placement there is: offered to a man in the middle of signing up, as an
// alternative to finishing the thing we just told him takes ten to fifteen minutes. Two of those
// three screens belong to a man who has not proved his email yet.
//
// So exactly one file may name a store, and it is the money screen behind the session.
// ---------------------------------------------------------------------------------------------
const STORE = /APP_STORE_URL|PLAY_STORE_URL|appStoreLive|App Store|Google Play/;
const storePages = pages
  .filter((f) => STORE.test(codeOnly(read(rel(f)))))
  .map(rel);
ok(
  `🔴 only the web app's own screen offers the app${storePages.length ? `\n     ${storePages.join('\n     ')}` : ''}`,
  storePages.length === 1 && storePages[0] === 'app/app/page.tsx',
);
ok('🔴 and /start offers it nowhere at all, on any of its three end screens',
  !STORE.test(codeOnly(read('app/start/page.tsx'))));

// ⚠️ AND IT RENDERS NOTHING UNTIL THE STORES REALLY HAVE IT. A dimmed "soon" chip is doc 103's third
// test exactly: a button whose only function is to say the feature does not exist yet is an advert
// for our roadmap. The old markup had one on every screen it appeared on.
ok('🔴 nothing anywhere advertises a store that has not got the app yet',
  !pages.some((f) => /App Store · soon|Google Play · soon/.test(read(rel(f)))));
ok('the app offer is gated on the flag AND on both links really existing',
  /appStoreLive\(\) && APP_STORE_URL && PLAY_STORE_URL/.test(read('app/app/page.tsx')));

// ---------------------------------------------------------------------------------------------
// WHAT STAYS, AND WHY REMOVING IT WOULD MAKE THINGS WORSE.
//
// The privacy policy, the terms and the security page describe a capability that genuinely exists
// and that we are legally bound to describe accurately. The privacy policy in particular promises
// that voice notes never leave our systems, which is a written commitment we may not quietly drop.
// Sweeping these would make three documents less true, not more.
// ---------------------------------------------------------------------------------------------
ok('the privacy policy still describes what happens to WhatsApp messages',
  /WhatsApp/.test(read('app/privacy/page.tsx')));
ok('the terms still describe how records arrive', /WhatsApp/.test(read('app/terms/page.tsx')));

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
