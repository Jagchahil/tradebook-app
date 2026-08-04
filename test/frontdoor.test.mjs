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
import { fileURLToPath, pathToFileURL } from 'node:url';
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
// ⚠️ AND THE NAV, WHICH NAMES WHATSAPP AS A PLACE RATHER THAN AS AN INSTRUCTION.
//
// app/app/AppNav.tsx carries a "WhatsApp" item pointing at the connect page. That is the opposite
// of the bug this file was written about: the old screens told a man to send a receipt on WhatsApp
// when he had no number bound and nowhere to bind it. A link that takes him TO the place he binds
// it is the fix, not a repeat.
//
// It is exempted from the word check and held to a stricter one instead, below: the nav may name
// WhatsApp, and it may not tell him to do anything with it.
const APP_NAV = 'app/app/AppNav.tsx';
const inApp = pages.filter((f) => rel(f).startsWith('app/app/'));
ok('the logged in app has screens to check', inApp.length >= 3);
ok('the connect page is one of them', inApp.map(rel).includes(CONNECT_PAGE));
const appInstructs = inApp
  .filter((f) => rel(f) !== CONNECT_PAGE && rel(f) !== 'app/app/page.tsx' && rel(f) !== APP_NAV)
  .filter((f) => /WhatsApp/.test(read(rel(f)).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')))
  .map(rel);
ok(
  `🔴 no screen inside /app instructs a WhatsApp action${appInstructs.length ? `\n     ${appInstructs.join('\n     ')}` : ''}`,
  appInstructs.length === 0,
);


// The nav's exemption, paid for. It may name WhatsApp; it may not instruct.
{
  const whole = read(APP_NAV).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Everything above the style object, which is the only part that renders words at a customer.
  // Checking the whole file matches "text" inside textDecoration, and a guard that cries wolf on a
  // CSS property is a guard the next person switches off.
  const nav = whole.slice(0, whole.indexOf('const S:') === -1 ? whole.length : whole.indexOf('const S:'));
  ok('the nav names WhatsApp only as a link to the connect page',
    /href: '\/app\/connect', label: 'WhatsApp'/.test(nav));
  ok('the nav does not tell him to do anything on WhatsApp',
    !/\b(send|snap|photo|message|receipt)\b/i.test(nav));
}// 🔴 AND THE MONEY SCREEN'S ONE MENTION IS GATED. Without this the exemption above would let any
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
// 🔴 STEP ONE IS SOMETHING HE CAN DO ON THE DAY HE SIGNS UP.
//
// THIS ASSERTION USED TO SAY "step one is connecting the bank", AND IT WAS RIGHT WHEN IT WAS
// WRITTEN. Bank connect needed no proved number, no Twilio and no message in either direction, so
// it was the one capture route a web signup could reach on day one. Then TrueLayer declined
// production authorisation (see lib/bankfeed.ts), bankFeedOffered() went to default off, and the
// same sentence became an instruction nobody could follow, printed as step one of three on the
// front door. The premise moved; the test did not.
//
// So the rule is now the one underneath the old rule, which was always the real one: STEP ONE
// NAMES A DOOR THAT IS OPEN. A photo, a statement import and a line of plain words all work with
// no provider and no proved number. The bank feed may be named elsewhere on the page as something
// coming, and lib/features.ts governs that wording, but it may not be the first thing we ask of a
// man who has just paid us.
//
// ⚠️ IF A PROVIDER LANDS, DO NOT SIMPLY REVERT THIS. Bank connect may become step one again only
// when bankFeedOffered() is true in production, and the honest way to write that is to branch the
// copy the way captureLine() in app/page.tsx already does, not to swap one hardcoded promise for
// another.
// ---------------------------------------------------------------------------------------------
const site = read('app/_shared/site.tsx');
const home = read('app/page.tsx');
// ⚠️ ON codeOnly(), AND IT WAS NOT. NINTH INSTANCE OF THIS CODEBASE'S OLDEST TRAP.
// The guard sweeps the whole shared module for the word, which passed while the hero WAS a WhatsApp
// mock only because the mock spelled it in colours rather than in prose. Replacing that hero meant
// writing a comment explaining what was removed and why, and the comment necessarily says the word
// a dozen times. A negative assertion over a source file runs on codeOnly(), because the note
// explaining a removal always contains the removed thing.
ok('the how it works list names no messaging channel as step one', !/WhatsApp/.test(codeOnly(site)));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE HERO. IT WAS AN ANIMATED WHATSAPP CONVERSATION AND NOTHING PINNED IT EITHER WAY.
//
// The guard above proves no SENTENCE names the channel. It could not see the picture, which used
// WhatsApp's own header green, WhatsApp's own bubble colours and the word "online", 320 pixels
// wide, above the fold, on the page everybody sees. Doc 104 says sell the outcome and never the
// technology, and the loudest thing on the front door was the technology.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THE PALETTE HALF OF THIS GUARD LIVED HERE FIRST AND FAILED ON ITS OWN EXPLANATION, which is
// the TENTH time this codebase has been caught by that shape and the fourth in one sitting. The
// comment recording which hex codes were removed necessarily contains them. It is not patched with
// codeOnly() and left in place, because the whole public site sweep below already covers this file
// and already runs on codeOnly(): two guards for one claim is how the weaker one rots unnoticed.
ok('🔴 IT SHOWS WHAT THE EMPLOYEE DID, and ends on the one button doc 104 says the product is',
  /export function HeroReport/.test(site) && /Payments sorted/.test(site)
  && />Approve</.test(codeOnly(site)));
// 🔴 AND IT SHOWS THE WORK BEING DONE, NOT A LIST OF FACTS FADING IN. Jag: make it act like an
// employee. Every line arrives as work in hand and resolves to work done, which is why each row
// carries both a `doing` string and a result.
ok('🔴 EVERY ROW IS WORK IN HAND BEFORE IT IS A RESULT',
  /doing: '/.test(site) && /hdoing\$\{i\}/.test(site) && /hdone\$\{i\}/.test(site));
ok('...and the in hand line is hidden from screen readers, so the report is read once, not twice',
  /className=\{`hr-doing hdoing\$\{i\}`\} aria-hidden="true"/.test(site));
// 🔴 THE LAST LINE OF THE REPORT IS THE PRICE, in the same shape as the work above it. The reader
// makes the comparison; we never make it, so nobody is named and no rival's price is printed here.
ok('🔴 THE REPORT ENDS ON WHAT IT COST, and the figure is the real one',
  /heroCost = \{ label: 'What it cost you', value: '£12\.99' \}/.test(site));
ok('...and the cost is set against the WORK, never against the money found (doc 108)',
  !/heroCost[\s\S]{0,200}(saving|saved|£1,390)/i.test(site));
ok('🔴 AND IT SAYS ON THE CARD THAT THE FIGURES ARE AN EXAMPLE, not in a footnote elsewhere',
  /An example month\. Your figures are your own/.test(site));
// Every colour a token, or dark mode needs a second set of overrides to undo the first.
ok('the hero card pairs no accent with a literal white',
  !/background:var\(--river\);color:#fff/.test(site));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND THE SWEEP IS THE WHOLE PUBLIC SITE, BECAUSE THE HERO WAS NOT THE ONLY ONE.
//
// The guard above was written for app/_shared/site.tsx and, run once, immediately found FOUR MORE
// mockups nobody had listed: two further bubble styles in the shared module and on the homepage,
// a full phone with a green header and the word "online" on /product, another on /can-i-claim, and
// a fourth on /compare. Five public pages drawing somebody else's product in somebody else's brand
// colours, while the copy beside them argued we are not a messaging tool.
//
// ⚠️ THE ILLUSTRATIONS THEMSELVES ARE FINE AND WERE KEPT. A man says what he spent and it comes
// back logged: that is the outcome, it is real, and doc 104 says sell the outcome. What went is the
// borrowed palette, which is the technology. Every one of them now paints in our own tokens, which
// also deleted six dark mode overrides that existed only to undo the borrowed green.
//
// ⚠️ THE APP KEEPS #25D366. app/app/connect and the invoice page put real WhatsApp BUTTONS on
// screen, and a button that opens WhatsApp should look like it opens WhatsApp. The palette is a
// lie only where it is used to draw a fake conversation and imply the product IS that app.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const BORROWED_PALETTE = /#DCF8C6|#075E54|#ECE5DD|#005c4b|#cde7b4|#0b141a/i;
const publicPages = pages.filter((f) => !rel(f).startsWith('app/app/') && !rel(f).startsWith('app/api/'));
ok('the public page sweep is not vacuous', publicPages.length > 15);
for (const f of publicPages) {
  ok(`${rel(f)} draws no borrowed messaging palette`, !BORROWED_PALETTE.test(codeOnly(read(rel(f)))));
}
ok('🔴 AND NO PUBLIC PAGE CLAIMS A PRESENCE IT CANNOT HAVE: nothing here is "online"',
  publicPages.every((f) => !/<small>online<\/small>|>online</.test(codeOnly(read(rel(f))))));

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE NOSCRIPT FALLBACK MUST NAME CLASSES THAT EXIST, AND IT DID NOT.
//
// SharedHead ships one stylesheet nobody ever looks at: the noscript block that makes the page
// readable when the reveal script never runs. It forces `opacity:1` on the elements that start
// hidden. Replacing the hero renamed `.cmsg` to `.hrow` everywhere it was USED, and left the
// fallback pointing at a class that no longer exists.
//
// ⚠️ THAT FAILURE IS INVISIBLE BY CONSTRUCTION. Nothing throws, nothing logs, no test that renders
// the page notices, and tsc cannot see inside a template literal of CSS. The only symptom is a
// visitor with the script blocked seeing an empty card where the product's headline figures should
// be, and that visitor never tells us.
//
// So the rule is mechanical: every selector in the noscript block is a class this module actually
// uses. It costs one guard and it closes a whole category of silent rot behind renames.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const block = site.slice(site.indexOf('<noscript>'), site.indexOf('</noscript>'));
  ok('the noscript fallback block was found', block.length > 20 && /opacity:1/.test(block));
  const selectors = [...block.matchAll(/\.([a-zA-Z][\w-]*)\s*\{/g)].map((m) => m[1]);
  ok('and it names at least the two it is there for', selectors.length >= 2);
  for (const cls of selectors) {
    ok(`noscript .${cls} is a class this module actually uses`,
      new RegExp(`className=[\`"'][^\`"']*\\b${cls}\\b|\\.${cls}\\{`).test(site.replace(block, '')));
  }
}
ok('🔴 AND THE HOMEPAGE RENDERS IT, or the component is a nicely tested orphan',
  /<HeroReport \/>/.test(home) && !/HeroPhone/.test(codeOnly(home)));
// Doc 104 section 9 angle 1: the reframe is worthless if the site never names what an employee is
// measured against. It said "employee" for weeks and never once said "instead of what".
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THIS GUARD PINNED "An accountant costs hundreds a year and answers on Tuesdays", WHICH IS DOC
// 104's OWN WORDING, AND JAG OVERRULED IT THE SAME DAY: do not pick a fight with accountants. They
// are a referral channel and a future partner, and a shot fired from the front door invites one
// back from people well placed to cause trouble for a tax product.
//
// The CLAIM the guard was made for survives: the hero must still make the employee argument rather
// than assert the word. What changed is that the argument now names nobody, and the price is left
// to do the work, because everybody already knows what the alternative costs.
//
// ⚠️ AND IT NOW POLICES THE OTHER DIRECTION TOO. The front door is the page most likely to grow a
// jab back, so the sweep below fails if any public page shames a profession on price or speed.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
ok('🔴 THE HERO STILL MAKES THE EMPLOYEE ARGUMENT rather than just using the word',
  /Your first hire costs £12\.99 a month/.test(home) && /never clocks off/.test(home));
ok('🔴 AND IT PICKS A FIGHT WITH NOBODY',
  !/accountant/i.test(codeOnly(home).slice(codeOnly(home).indexOf('className="vs"') - 200,
    codeOnly(home).indexOf('className="vs"') + 300)));
const JABS = [
  /accountant[^.<]{0,40}(takes days|days to reply)/i,
  /(£[\d,]+ to £[\d,]+)[^.<]{0,30}just to file/i,
  /none of the bill/i,
  /stop paying for a \d+ minute job/i,
  /an accountant charges/i,
];
for (const f of publicPages) {
  const src = codeOnly(read(rel(f)));
  for (const jab of JABS) {
    ok(`${rel(f)} does not shame a profession on price or speed (${jab.source.slice(0, 24)})`, !jab.test(src));
  }
}
ok('the homepage names no messaging channel at all', !/WhatsApp/.test(home));

// The steps array only, never the whole file: "Connect your bank" is legitimate inside the
// comingSoon list, and matching the file as a whole is what let the old assertion pass vacuously
// after steps[0] had already changed underneath it.
const stepsBlock = (site.match(/export const steps = \[[\s\S]*?\n\];/) || [''])[0];
ok('the steps list is where we think it is', stepsBlock.length > 100);
ok('🔴 step one is NOT connecting the bank, because that door has no provider',
  !/Connect your bank/i.test(stepsBlock));
ok('step one names a door that is actually open on day one',
  /photo|snap|import|statement|say/i.test(stepsBlock.split("{ n: '2'")[0]));

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
  /Add your first entry or upload a bank statement, and this fills itself in/.test(read('lib/ledger.ts')));

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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE BANK FEED IS OFFERED BY ONE SWITCH, AND UNTIL IT IS ON, NOTHING NAMES IT.
//
// Found by walking the live product on 31 July: TrueLayer declined production authorisation, so
// the Choose your bank button sent a brand new customer to a dialog with an orange "Testing mode
// active, do not enter your bank credentials" banner, while the empty states on the Overview, the
// money log, the tax hub, the quarterly summary and Pay yourself all told him to connect the bank
// he could not connect. Same disease as the WhatsApp lines above: an instruction the account
// cannot follow.
//
// bankFeedOffered() in lib/bankfeed.ts is the single switch for OFFERING new connections. It is
// false unless BANK_FEED_OFFERED is exactly 'true', and it gates only the offering: the sync
// engine and existing connections are untouched. Both wordings live in the ternaries, so the day
// a provider lands the bank copy returns with one env var and no copy hunt.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== the bank feed is offered by one switch, honestly ===\n');
{
  ok('the switch exists, defaults off, and only the exact string true turns it on',
    /export function bankFeedOffered\(\): boolean \{\s*return process\.env\.BANK_FEED_OFFERED === 'true';\s*\}/.test(read('lib/bankfeed.ts')));

  // The door itself. While the switch is off no request may leave for TrueLayer, and a form
  // caller goes politely back to the bank step rather than being shown an error object.
  const connectRoute = read('app/api/bank/connect/route.ts');
  ok('🔴 /api/bank/connect refuses before anything TrueLayer when the feed is not offered',
    connectRoute.indexOf('if (!bankFeedOffered())') > -1
    && connectRoute.indexOf('if (!bankFeedOffered())') < connectRoute.indexOf('buildAuthLink(state)'));
  ok('and the form caller gets a 303 back to the bank step, never JSON',
    /bankFeedOffered\(\)[\s\S]{0,500}\/app\/setup\?step=bank[\s\S]{0,120}303/.test(connectRoute));
  ok('the institutions probe hands out no Choose your bank entry while the feed is not offered',
    /!bankFeedOffered\(\) \|\| !hasBankFeedConfig\(\)/.test(read('app/api/bank/institutions/route.ts')));

  const setup = read('app/app/setup/page.tsx');
  ok('🔴 the setup bank step draws no button and no radios when the feed is not offered',
    /const offered = bankFeedOffered\(\);/.test(setup)
    && /\) : !offered \? \(/.test(setup)
    && setup.indexOf(': !offered ? (') < setup.indexOf('action="/api/bank/connect"'));
  ok('and its honest copy points at the statement importer instead',
    setup.includes('a bank statement CSV does the same job'));

  // 🔴 THE SWEEP. Every customer facing "connect the bank" is chosen by the switch.
  //
  // ⚠️ THE SETUP HEADING USED TO BE EXEMPT BY NAME, AND THAT EXEMPTION IS GONE. It read "Connect
  // your bank." whatever the switch said, on the reasoning that the step keeps its title and there
  // is no button under it. Walking the live site on 31 July settled it the other way: the heading is
  // the first thing he reads, and an instruction he cannot follow is doc 103's honesty test failing
  // whatever the paragraph underneath says. It is now chosen by the switch like everything else, so
  // this sweep covers it with no special case. The reveal's regex literal, which stops the ledger's
  // own bank line printing twice, is code rather than copy and is still stripped.
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THE TWO CHANNELS THAT REACH HIM WHEN HE IS NOT LOOKING AT A SCREEN.
  //
  // This sweep walked app/app and nothing else, so it only ever covered places a man has to open
  // before we can tell him anything. The nudges are the opposite. lib/banknudge.ts writes the
  // WhatsApp reply that lands the moment his day's AI allowance runs out, and the line that follows
  // his fifth receipt. lib/trialnudge.ts writes the ONE email of the whole trial, on the day before
  // he decides whether to pay us. A dead sentence in either is worse than the same sentence on a
  // page he chose to open: he did not ask for it, it arrives while he is on site, and the busy
  // message in particular lands at the exact moment he has just been refused something.
  //
  // Both were fixed on 31 July and neither was covered by anything that would notice them coming
  // back, because a grep for JSX finds neither. They are in the sweep now.
  //
  // ⚠️ NEITHER FILE MAY IMPORT lib/bankfeed.ts. Their own suites load them through Node's type
  // stripping, which cannot resolve an extensionless relative import, so each keeps its own read of
  // BANK_FEED_OFFERED and test/wave9_nudges.test.mjs pins the three reads against each other. This
  // sweep does not care which copy of the read a sentence sits behind, only that it sits behind one.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const BANK_COPY_LIBS = ['lib/banknudge.ts', 'lib/trialnudge.ts'];
  const swept = [...inApp.map(rel), ...BANK_COPY_LIBS];

  // ═══════════════════════════════════════════════════════════════════════════════════
  // 🔴 THE PATTERN USED TO BE "connect your bank" ONLY, AND THAT IS HOW ONE GOT THROUGH.
  //
  // The dashboard footer said "New spending lands in YOUR BANK FEED on its own", every time
  // anything sat in his pile. It names a door that does not open and it matched nothing in the
  // old pattern, because it never uses the word connect. A sweep that catches one phrasing
  // catches the sentences somebody happened to write that way. Found on the live site on 31 July
  // 2026, one commit after this sweep was supposed to have finished the job.
  //
  // ⚠️ AND THE VERB IS NOT ALWAYS "connect", WHICH IS THE THIRD TOO NARROW PATTERN IN TWO DAYS.
  // The old one demanded a space straight after "connect", so "connecting your bank" and "it
  // connects to your bank" both walked past it. The endings are covered here rather than waited for.
  //
  // ⚠️ AND THE POSSESSIVE IS THE POINT, which is why this is "your bank feed" and not "bank feed".
  // "The bank feed is on its way" (the setup step's honest copy) and "none of this is in a bank
  // feed" (why the circumstances questions exist) are both TRUE with the switch off, and gating
  // them would be gating the sentences that explain the absence. What must be behind the switch
  // is any sentence asserting he HAS one, and in English that is the possessive.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const BANK_SENTENCE = /([Cc]onnect(ed|ing|s)? (to )?(your|the) bank|your bank feed)/g;

  const bankOffenders = [];
  const bankMentions = new Map();
  for (const f of swept) {
    const src = codeOnly(read(f))
      .replace(/\/connect your bank\/i/g, '');
    let seen = 0;
    for (const m of src.matchAll(BANK_SENTENCE)) {
      seen += 1;
      const before = src.slice(Math.max(0, m.index - 260), m.index);
      if (!before.includes('bankFeedOffered()')) {
        bankOffenders.push(`${f}: ...${src.slice(m.index, m.index + 40)}...`);
      }
    }
    bankMentions.set(f, seen);
  }
  ok(`🔴 no sentence a customer is shown or sent names connecting a bank outside the switch${bankOffenders.length ? `\n     ${bankOffenders.join('\n     ')}` : ''}`,
    bankOffenders.length === 0);

  // ⚠️ AND THE TWO LIBS ARE CHECKED FOR HAVING ANYTHING TO SWEEP. A file listed in BANK_COPY_LIBS
  // whose bank sentence has been renamed, moved or reworded passes this sweep by being empty, which
  // is exactly how a sweep stops working without anybody noticing. If a sentence has genuinely gone
  // for good, take its file out of BANK_COPY_LIBS in the same commit and this says so out loud.
  const emptyLibs = BANK_COPY_LIBS.filter((f) => (bankMentions.get(f) ?? 0) === 0);
  ok(
    `the two message channels really carry bank copy, so sweeping them is not vacuous${emptyLibs.length ? `\n     nothing to sweep in: ${emptyLibs.join(', ')}` : ''}`,
    emptyLibs.length === 0,
  );

  // Both states of every rewritten empty state are pinned, so the bank wording can only return
  // through the switch and the honest wording cannot quietly rot while the switch is off.
  const BOTH_STATES = [
    ['app/app/page.tsx',
      'Connect your bank and new spending lands here on its own, ready for you to check.',
      'Add an entry, upload a till slip, or import a bank statement, and it lands here ready for you to check.'],
    ['app/app/money/page.tsx',
      'Connect your bank and every payment lands here on its own.',
      'Add an entry, upload a till slip, or import a statement, and every payment lands here.'],
    ['app/app/tax/page.tsx',
      'Connect your bank and your tax position builds itself from what you confirm.',
      'Add what you earn and spend, by hand or by statement, and your tax position builds itself from what you confirm.'],
    ['app/app/tax/summary/page.tsx',
      'Connect your bank and confirm what lands, and this page keeps itself ready.',
      'Put your money in, by hand or by statement, and confirm what lands. This page keeps itself ready.'],
    ['app/app/pay-yourself/page.tsx',
      'Connect your bank or log what you have earned, and it fills in by itself.',
      'Log what you have earned, and it fills in by itself.'],
    ['app/app/pay-yourself/page.tsx',
      'connect the bank or log what the company has earned, and this page prices every rung,',
      'log what the company has earned, and this page prices every rung,'],
  ];
  for (const [f, onCopy, offCopy] of BOTH_STATES) {
    const src = read(f);
    ok(`${f} carries both states of the switch: "${offCopy.slice(0, 30)}..."`,
      src.includes(onCopy) && src.includes(offCopy));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 AND A FRONT DOOR HAS TO OPEN FROM THE OUTSIDE TOO.
//
// This file was written about a stranger who could not find his way IN. On 30 July it turned out a
// CUSTOMER could not find his way BACK in. The nav had five marketing links and a Sign up button,
// and of the sixty links on the home page the only one matching "sign in" was "Team sign in",
// which is the staff door and would have turned him away.
//
// /in worked perfectly the whole time. Nothing pointed at it. That is the same disease as a job
// that runs and never reports, and as a health check that cannot tell no from nothing: the thing
// exists, and the product behaves exactly as though it does not.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log('\n=== a customer can get back in ===\n');
{
  const chrome = readFileSync(path.join(root, 'app/_shared/site.tsx'), 'utf8');
  const nav = chrome.slice(chrome.indexOf('export function SiteNav'), chrome.indexOf('export function StickyCta'));
  const footer = chrome.slice(chrome.indexOf('export function SiteFooter'));

  ok('the nav links to the sign in page', nav.includes('href="/in"'));
  ok('the nav says "Sign in" in words a customer would look for', /Sign in/.test(nav));
  ok('the mobile menu links to it too, not just the desktop nav',
    (nav.match(/href="\/in"/g) || []).length >= 2);
  // ⚠️ PRESENT IS NOT THE SAME AS FINDABLE. The first version of this put it last in the mobile
  // panel, which on a phone is fifteenth, under "Rent a Room checker". A stranger will read down a
  // list of what we do. A customer is here for one thing. It comes before the marketing links.
  {
    const panel = nav.slice(nav.indexOf('className="nav-panel"'));
    const signIn = panel.indexOf('href="/in"');
    const marketing = panel.indexOf('NAV_LINKS.map');
    ok('sign in comes before the marketing links in the mobile menu',
      signIn > -1 && marketing > -1 && signIn < marketing);
  }
  ok('the footer links to it as well', footer.includes("'/in'"));

  // ⚠️ THE STAFF DOOR MUST NEVER BE THE ONLY DOOR. It stays, plainly labelled, because it is where
  // the team signs in. What it may not be again is the single thing on the page that looks like a
  // way back into your own books.
  const teamOnly = footer.includes("'/team'") && !footer.includes("'/in'");
  ok('"Team sign in" is not the only sign in on the page', !teamOnly);
}


// ---------------------------------------------------------------------------------------------
// 🔴 ONE BANNER, NOT SIX. FOUND BY WALKING THE DEPLOYED SITE, MINUTES AFTER A DEPLOY.
//
// The MTD banner sat inline on six pages. Four were corrected on 1 August to name landlords and to
// say GROSS income rather than "earning", and because they were corrected in two separate sittings
// the site went live saying "gross qualifying income over £50,000" on the front door and "gross
// income over £50k" one click away. Two of the six typed the threshold as a literal while three
// read it from FACTS, so a Budget that moved the number would have left two pages quietly wrong.
//
// Neither wording was false, which is exactly why a house style sweep, a full test run and a review
// all walked past it. A sentence duplicated at six call sites is six chances to be wrong.
// ---------------------------------------------------------------------------------------------
// 🔴 DEMOTED 3 AUGUST 2026, FROM SIX PAGES TO ONE. The banner ran ABOVE THE NAVIGATION on every
// public page, so the first thing anybody read about Lekhio, anywhere, was an announcement about a
// filing regime. Doc 104: "as software, we are a £12.99 app next to a £7 Xero and a £0 Monzo
// bundle, and we lose that fight on price forever." Leading with MTD on the pricing page and the
// security page put us in exactly that category on our own front door.
//
// ⚠️ THE GUARD IS NOT WEAKENED, IT IS POINTED THE OTHER WAY. It still proves the banner is defined
// once and reads the threshold from FACTS, and it now ALSO proves the five demoted pages carry
// neither the component nor a hand rolled copy of its sentence, which is the failure this whole
// section was written about: six literals, two of them stale.
const BANNER_PAGES = ['app/how-mtd-works/page.tsx'];
const DEMOTED_PAGES = [
  'app/page.tsx', 'app/compare/page.tsx',
  'app/product/page.tsx', 'app/pricing/page.tsx', 'app/security/page.tsx',
];
const shared = read('app/_shared/site.tsx');

ok('🔴 the MTD banner is defined exactly once, in the shared module',
  (shared.match(/export function MtdBanner/g) || []).length === 1);
ok('and it reads the threshold rather than typing it, so a Budget cannot leave it stale',
  /FACTS\.mtdThreshold2026/.test(shared.slice(shared.indexOf('export function MtdBanner'),
    shared.indexOf('export function MtdBanner') + 900)));

for (const f of BANNER_PAGES) {
  const src = read(f);
  ok(`${f} renders the shared banner`, /<MtdBanner \/>/.test(src));
  ok(`${f} carries no inline copy of it`, !/className="mtdtop"><Link/.test(src));
}

// 🔴 AND THE FIVE DEMOTED PAGES DO NOT LEAD WITH MAKING TAX DIGITAL, in either form.
for (const f of DEMOTED_PAGES) {
  const src = codeOnly(read(f));
  ok(`${f} no longer leads with the MTD banner`, !/<MtdBanner \/>/.test(src));
  ok(`${f} did not grow a hand rolled copy of it instead`, !/className="mtdtop"/.test(src));
}

// The threshold may not be typed as a literal anywhere a banner lives, for the same reason.
for (const f of BANNER_PAGES) {
  ok(`${f} does not hardcode the MTD threshold beside the banner`,
    !/Making Tax Digital is now live/.test(read(f)));
}


// ═══════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WE PROMISED DEADLINE REMINDERS THAT NO CHANNEL COULD SEND.
//
// /resources printed "Lekhio reminds you well before each, so you never do" directly above a
// table of NINE penalty dates. /product and /file-your-tax-return both promised "on your
// dashboard and by email". Every channel that could have delivered one was off: the reminder cron
// bails on an unapproved template, Rakha's alerts route whatsapp_template and push (gated, and a
// mobile app that is not in the stores), and the only email that exists carries no dates at all.
//
// ⚠️ THIS IS A WORSE CLASS OF LIE THAN ADVERTISING A FEATURE EARLY. A man reads it and stops
// keeping his own calendar, and the failure mode is an automatic £100 penalty out of HIS pocket.
//
// The wordings now live in lib/features.ts next to remindersLive(), so the promise returns by
// itself the day a channel can keep it, exactly as the filing and bank feed copy already does.
//
// ⚠️ SWEPT WITH codeOnly(), because the comments ON those pages quote the old promise to explain
// why it went, and a checker that fires on its own explanation is how you end up "fixing" copy
// that is already correct.
// ═══════════════════════════════════════════════════════════════════════════════════════════
{
  const REMINDER_PAGES = [
    ['app/resources/page.tsx', /reminds you well before each/i],
    ['app/product/page.tsx', /on your dashboard and by email/i],
    ['app/file-your-tax-return/page.tsx', /we remind you well before it/i],
  ];
  for (const [file, promise] of REMINDER_PAGES) {
    const code = codeOnly(read(file));
    ok(`🔴 ${file} does not promise a reminder no channel can send`, !promise.test(code));
    ok(`...and it asks lib/features for the wording instead of holding its own`,
      /from '(\.\.\/)+lib\/features'/.test(code));
  }

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND NOW THE WHOLE PUBLIC SITE, BECAUSE THREE NAMED PAGES WAS NOT ENOUGH.
  //
  // The first version of this guard checked three files for three exact phrases. A walk on
  // 3 August then found FOUR MORE, and the worst two were not on feature pages at all: they
  // were the inducement on an EMAIL CAPTURE. "Pop your email in for MTD deadline reminders"
  // on the free invoice generator, and "Get the claim answers, plus your tax reminders" on
  // /can-i-claim. lib/nurture.ts ships dark, and switched on it is two emails, neither keyed
  // to a deadline. He was handing over his address for a thing that does not exist.
  //
  // So this sweeps every public page for the CLAIM rather than for three sentences.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  const CLAIMS_A_REMINDER = /(we|lekhio)\s+(will\s+)?remind|deadline reminders|tax reminders|get the reminders/i;
  // ⚠️ ONE ALLOWED, AND IT IS ALLOWED BECAUSE IT IS TRUE. app/terms says "We will remind you
  // before the trial ends", and trial_ending routes to ['whatsapp_template','email'] in
  // lib/routing.ts, with the email arm verified by a real email arriving on 30 July. A guard
  // that refused a true sentence would teach the next person to widen the guard, not the copy.
  const TRUE_REMINDER = ['app/terms/page.tsx'];
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 THIS SWEPT app/ AND NOTHING ELSE, AND THE WORST PROMISE IN THE PRODUCT WAS IN components/.
  //
  // components/LeadCapture.tsx renders on TWELVE public tool pages and carried four reminder
  // promises of its own, hard typed: the heading, the sub, the thank you, and the tick box whose
  // exact words are POSTed to /api/lead as consent_text and STORED as the provable record of what
  // the customer agreed to. The 3 August fix went into the four pages that pass a sub through
  // nudgeClause(); the seven that pass nothing shipped the defaults, and the tick box shipped on
  // all twelve because a module constant cannot be overridden by a prop.
  //
  // ⚠️ THE GUARD BELOW WAS THE SECOND HALF OF THE MISS. "the email capture clause is gated too"
  // proved that lib/features.ts EXPORTS nudgeClause. It never checked that the email capture uses
  // it. An assertion that the tool exists is not an assertion that the tool is held.
  //
  // ⚠️ AND components/ IS A SYSTEMATIC BLIND SPOT, not a one off: frontdoor, mtdclaims, hardening,
  // proof and phonewidth all sweep app/ or app + lib and never open it. This one walks it now.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const shared = walk(path.join(root, 'components'));
  ok('the components tree was actually walked, so this is not vacuous', shared.length >= 1);
  const publicPages = [...pages, ...shared]
    .map(rel)
    .filter((f) => !f.startsWith('app/app/') && !f.startsWith('app/api/'))
    .filter((f) => !TRUE_REMINDER.includes(f));
  const offenders = publicPages.filter((f) => CLAIMS_A_REMINDER.test(codeOnly(read(f))));
  ok(`🔴 NO PUBLIC PAGE OR SHARED COMPONENT PROMISES A REMINDER WE CANNOT SEND${offenders.length ? ': ' + offenders.join(', ') : ''}`,
    offenders.length === 0);
  ok('⚠️ and the one that DOES promise it still says so, because the trial reminder is real',
    /We will remind you before the trial ends/.test(read('app/terms/page.tsx')));

  // 🔴 AND THE EMAIL CAPTURE IS CHECKED BY WHAT IT DOES, NOT BY WHAT lib/features.ts OFFERS.
  const lead = read('components/LeadCapture.tsx');
  const leadCode = codeOnly(lead);
  ok('the email capture asks lib/features for every word it promises with',
    /from '\.\.\/lib\/features'/.test(leadCode)
    && ['leadHeading', 'leadSub', 'leadConsentText', 'leadDoneLine'].every((f) => leadCode.includes(`${f}(`)));
  ok('🔴 AND IT TYPES NONE OF THEM ITSELF, heading, sub, thank you or tick box',
    !/MTD reminders|deadline reminders|deadlines that matter|nudge about your tax deadlines/i.test(leadCode));
  // ⚠️ THE ONE THAT IS STORED. consent_text is the record of what he agreed to, so it must be the
  // gated wording and never a constant sitting beside it.
  ok('🔴 and the CONSENT it records is the gated wording, not a hard typed one',
    /consent_text: leadConsentText\(\)/.test(leadCode) && !/const CONSENT_TEXT/.test(leadCode));
  ok('both wordings still live side by side, so the flag flipping needs no copy rewrite',
    ['leadHeading', 'leadSub', 'leadConsentText', 'leadDoneLine']
      .every((f) => new RegExp(`export function ${f}\\(\\): string \\{\\s*return remindersLive\\(\\)`).test(read('lib/features.ts'))));

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // 🔴 AND THE WORDS THEMSELVES ARE RUN, NOT READ, BECAUSE MOVING THE LIE INTO lib/ HID IT.
  //
  // A sabotage pass on 4 August put "occasional tax deadline reminders" straight back into the OFF
  // branch of leadConsentText, and every assertion above stayed green. The sweep walks app/ and
  // components/, the promise had moved to lib/features.ts, and the shape check only proved the
  // function BRANCHES on remindersLive, never what it says on the false side.
  //
  // ⚠️ SO THE FLAG IS SET OFF AND THE FOUR STRINGS ARE ACTUALLY CALLED. What ships is what a
  // customer reads, and reading the source for the shape of a promise is how the last three of
  // these survived. A control with the flag ON proves the test can tell the difference.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const asked = ['leadHeading', 'leadSub', 'leadConsentText', 'leadDoneLine'];
  process.env.NEXT_PUBLIC_REMINDERS_LIVE = '';
  const off = await import(pathToFileURL(path.join(root, 'lib/features.ts')).href + '?off');
  const offWords = asked.map((f) => off[f]());
  ok('🔴 WITH THE FLAG OFF, NOT ONE OF THE FOUR PROMISES A REMINDER',
    offWords.every((w) => typeof w === 'string' && w.length > 0 && !CLAIMS_A_REMINDER.test(w)));
  ok('🔴 and the words a customer CONSENTS to say nothing about deadlines either',
    !/deadline|remind/i.test(off.leadConsentText()));

    // 🔴 THE FLAG IS THE STRING 'true' AND NOTHING ELSE. lib/features on() is v === 'true', so '1'
  // is OFF. A control set with '1' would have compared two identical off strings and passed by
  // accident, which is the exact failure mode a control exists to rule out.
  process.env.NEXT_PUBLIC_REMINDERS_LIVE = 'true';
  const on = await import(pathToFileURL(path.join(root, 'lib/features.ts')).href + '?on');
  // ⚠️ COMPARED AGAINST THE CAPTURED off WORDS, not against off.leadHeading() called again. These
  // read process.env at CALL time rather than at import time, so calling the off module now would
  // return the ON wording and the control would compare a string to itself. That mistake made this
  // very control fail the first time it ran, which is the best possible advertisement for it.
  ok('CONTROL: with the flag ON the promise really is there, so this test can tell them apart',
    CLAIMS_A_REMINDER.test(on.leadConsentText()) && on.leadHeading() !== offWords[0]);
  process.env.NEXT_PUBLIC_REMINDERS_LIVE = '';

  // ⚠️ BOTH WORDINGS MUST EXIST. The point of this file is that the launch copy is written NOW and
  // gated, so nobody has to remember to write it on the day. A gate with only the honest half is
  // a deletion wearing a flag's clothes.
  const feat = read('lib/features.ts');
  ok('lib/features.ts holds the HONEST wording, for today',
    /kept ready inside your Lekhio/.test(feat));
  ok('...and the PROMISE, ready for the day a channel can keep it',
    /reminds you well before each/.test(feat) && /on your dashboard and by email/.test(feat));
  ok('...behind one flag, named the same way as the others on that page',
    /NEXT_PUBLIC_REMINDERS_LIVE/.test(feat) && /export function remindersLive/.test(feat));

  // \ud83d\udd34 THE EIGHTH ONE, AND IT IS WHY THIS SWEEP GREW A SECOND SHAPE.
  //
  // The sweep above hunts the reminder claim AS PROSE, and it found seven. It could never have
  // found the eighth, because the eighth is a three word cell in the "replaces a whole shelf of
  // subscriptions" table: "Diary and reminders". The promise is made by the "All of it, in Lekhio"
  // heading over the table, not by the cell's own grammar. A sweep looks for the shape of a lie,
  // and a lie can change shape.
  ok('\ud83d\udd34 NO SUBSCRIPTION TABLE SELLS THE REMINDERS EITHER, in either of the two tables',
    !/label: 'Diary and reminders'/.test(codeOnly(read('app/_shared/site.tsx')))
    && !/label: 'Diary and reminders'/.test(codeOnly(read('app/pricing/page.tsx'))));
  ok('...both rows ask the same helper, so the two tables cannot drift apart',
    /label: diaryRowLabel\(\)/.test(read('app/_shared/site.tsx'))
    && /label: diaryRowLabel\(\)/.test(read('app/pricing/page.tsx')));
  ok('...and it holds BOTH wordings, like every other gate on that page',
    /'Diary and reminders' : 'Jobs diary'/.test(feat));
}

// ---------------------------------------------------------------------------------------------
// \ud83d\udd34 THE STATUTORY COMPANY PARTICULARS. AN OFFENCE IF THEY ARE NOT THERE.
// ---------------------------------------------------------------------------------------------
// SI 2015/17 reg 24(2) requires the registered name on a company's websites, and reg 25 requires
// the part of the UK where it is registered, the registered number, and the registered office
// address. reg 28 makes failure an offence by the company and by every officer in default.
//
// The footer carried "© 2026 Lekhio" and none of the four. This test exists because docs/81 had
// already logged the job, as a note that said to do it "when the company is incorporated", and the
// company was incorporated on 8 July 2026 and the note went stale. A note goes stale. A test does
// not.
{
  const site = read('app/_shared/site.tsx');
  ok('\ud83d\udd34 THE REGISTERED NAME IS DISCLOSED (reg 24(2))', /name: 'Lekhio Ltd'/.test(site));
  ok('\ud83d\udd34 THE REGISTERED NUMBER IS DISCLOSED (reg 25)', /number: '17329341'/.test(site));
  ok('\ud83d\udd34 THE PART OF THE UK IS DISCLOSED (reg 25)', /jurisdiction: 'England and Wales'/.test(site));
  ok('\ud83d\udd34 THE REGISTERED OFFICE IS DISCLOSED (reg 25)', /office: '[^']*E11 4QW'/.test(site));
  ok('...and the footer actually renders all four, not just declares them',
    /COMPANY\.name\} is a company registered in \{COMPANY\.jurisdiction\}/.test(site)
    && /company number \{COMPANY\.number\}/.test(site)
    && /Registered office: \{COMPANY\.office\}/.test(site));
  ok('...the copyright line carries the REGISTERED name, not the trading one',
    /© 2026 \{COMPANY\.name\}/.test(site) && !/© 2026 Lekhio</.test(site));
  // codeOnly, because the doctrine comment beside the constant cites the Companies House URL the
  // number was verified against, and that citation is worth keeping. Third time today a guard has
  // fired on a comment quoting the thing it polices: the rule is now simply that ANY assertion
  // about source content runs on codeOnly(), positive or negative.
  ok('\u26a0\ufe0f and the particulars are written ONCE: a second copy is a second thing to forget',
    (codeOnly(site).match(/17329341/g) || []).length === 1);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE TWO SENTENCES THAT LEAVE THE SITE, AND NOTHING HAS EVER LOOKED AT EITHER.
//
// Every guard above polices a PAGE. The most repeated sentence in the whole product is not on a
// page: it is the footer of every email we send, on every receipt, every invoice notice and every
// trial message. It read "Lekhio. Your books and tax, handled in WhatsApp", and it went out under
// a homepage that had been selling an employee for weeks. No suite imported lib/email.ts, so the
// line a customer sees most often was the one line nothing could catch.
//
// ⚠️ THE CLAIM IS ABOUT THE CATEGORY, NOT THE WORDING. These do not pin a sentence, which would
// make every copy edit a test failure and teach whoever hits it to delete the guard. They pin the
// thing doc 104 actually forbids: naming the channel as if it were the product.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const emailSrc = codeOnly(read('lib/email.ts'));
  const footer = emailSrc.slice(emailSrc.indexOf('${unsub}') - 700, emailSrc.indexOf('${unsub}'));
  ok('the email footer block was found', /Lekhio\./.test(footer) && footer.length > 40);
  ok('🔴 THE EMAIL FOOTER DOES NOT SELL THE CHANNEL AS THE PRODUCT',
    !/in WhatsApp|from WhatsApp|on WhatsApp/i.test(footer));
  ok('...and it names what Lekhio is instead, in doc 104\'s own words',
    /first employee your business hires/i.test(footer));
  // The honesty half of the footer is load bearing and predates this. It stays.
  ok('...while the independence and approval sentence is untouched',
    /not affiliated with HMRC/.test(footer) && /without your approval/.test(footer));

  const nurture = codeOnly(read('lib/nurture.ts'));
  ok('🔴 AND NEITHER DOES THE NURTURE SEQUENCE, the other copy that leaves the building',
    !/books and tax handled from WhatsApp/i.test(nurture));
  ok('...it still promises the approval gate, which is the part that must never go',
    /before anything moves/.test(nurture));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE THEME FOLLOWS THE DEVICE, AND NOTHING MAY OUTRANK IT.
//
// Reported live: "the website is stuck in dark mode, it should match my laptop." Detection was
// never broken. 430fa37 on 3 July, "Light-only theme sitewide", hid the toggle with display:none
// !important and left everything the toggle drove still running: the dark palette, the media
// query, and a localStorage override that beat the device FOREVER. So one tap of a button that no
// longer exists on any screen at any width pinned a man to the wrong colour with nothing to press.
//
// ⚠️ THE LESSON IS BIGGER THAN THE COLOUR. Hiding a control with CSS is not removing a feature. It
// removes the way IN and leaves every consequence of having used it, which is the worst of both:
// the state is still reachable, still permanent, and now unreachable to fix.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const shared = codeOnly(read('app/_shared/site.tsx'));
  ok('🔴 NOTHING READS A STORED THEME OVERRIDE: the device is the only opinion that counts',
    !/getItem\(\s*'lekhio-theme'\s*\)/.test(shared) && !/setItem\(\s*'lekhio-theme'/.test(shared));
  ok('...and the stale key left in early visitors\' browsers is cleaned up, not just ignored',
    /removeItem\('lekhio-theme'\)/.test(shared));
  ok('🔴 THE THEME COMES FROM prefers-color-scheme, both on load and when the laptop changes',
    /matchMedia\('\(prefers-color-scheme:dark\)'\)/.test(shared)
    && /addEventListener\('change'/.test(shared));
  ok('🔴 AND THE DEAD TOGGLE IS GONE, not hidden: a control display:none at every width is not a control',
    !/theme-toggle/.test(shared) && !/id="lekhio-theme"/.test(shared));
  // The whole public site, because a second copy of the button anywhere brings the trap back.
  for (const f of publicPages) {
    ok(`${rel(f)} ships no theme toggle`, !/id="lekhio-theme"|className="theme-toggle"/.test(codeOnly(read(rel(f)))));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 ONE WEB LOGIN DOOR, AND IT IS THE ONE WITH THE LOCKS ON IT.
//
// /account was a SECOND web sign in, on SMS, posting from the customer's own browser with the anon
// key straight to Supabase auth/v1/otp. Three faults, and the third stranded paying customers:
//
//   1. lib/logindoor.ts states "FROM 2 AUGUST 2026 THE WEB SCREEN OFFERS THE ADDRESS ONLY", on the
//      175x cost of a text and because only the text is worth attacking. This offered the number.
//   2. It bypassed /api/auth/start, and with it every rate limit, send cap, spend cap and origin
//      check this product has. None of that is reachable from a browser fetch to Supabase.
//   3. A web customer HAS NO PHONE on his auth user. Every admin/users write mints { email,
//      email_confirm } and nothing else, so with create_user:false there was no user to match. The
//      one page offering cancellation, a card change and invoices could never be got through.
//
// ⚠️ AND THE FOOTER POINTED AT IT, on every public page, under "Manage subscription". 31 July built
// /app/you/billing to ride the web session and left this "for the phone era", but a page the footer
// links to is live whatever a comment says. That is what these guards are really for.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  // Nowhere public may mint or verify an auth code by talking to Supabase from the browser.
  for (const f of publicPages) {
    const src = codeOnly(read(rel(f)));
    ok(`${rel(f)} does not call Supabase auth from the browser`,
      !/auth\/v1\/(otp|verify)/.test(src));
    ok(`${rel(f)} sends no SMS login code`, !/type:\s*'sms'/.test(src));
  }
  const acct = read('app/account/page.tsx');
  ok('🔴 /account NO LONGER ASKS FOR A PHONE NUMBER', !/toE164|Mobile number/.test(codeOnly(acct)));
  ok('🔴 AND IT LANDS ON THE DOOR THAT ACTUALLY OPENS',
    /redirect\('\/app\/you\/billing'\)/.test(acct));
  ok('...and it is not indexable, which is what Search Console was complaining about',
    /robots:\s*\{\s*index:\s*false/.test(acct));
  ok('🔴 THE FOOTER SENDS "Manage subscription" TO THE WORKING DOOR, not the dead one',
    /\['\/app\/you\/billing', 'Manage subscription'\]/.test(site));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EVERY PUBLIC PAGE IS EITHER INDEXABLE WITH A CANONICAL, OR DELIBERATELY NOT INDEXABLE.
//
// Google reported "Duplicate without user-selected canonical" on 28 July. /account was the one page
// with NEITHER a canonical NOR a noindex NOR a robots.txt disallow, so Google was free to index it
// and had nothing to pick a canonical from. The class of bug is "a page nobody decided about", so
// the guard is about the DECISION rather than about that one page: say index it and say which URL
// is the real one, or say do not.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
{
  const robotsSrc = read('app/robots.ts');
  const disallowed = [...robotsSrc.matchAll(/'(\/[a-z0-9/-]*)'/g)].map((m) => m[1])
    .filter((v) => v !== '/' && v.length > 1);
  ok('the robots disallow list was parsed', disallowed.length >= 5);
  for (const f of publicPages) {
    const r = rel(f);
    if (!r.endsWith('page.tsx')) continue;
    const route = '/' + r.replace(/^app\//, '').replace(/\/page\.tsx$/, '').replace(/^page\.tsx$/, '');
    const blocked = disallowed.some((d) => route === d || route.startsWith(d.endsWith('/') ? d : d + '/'));
    if (blocked) continue;
    const dir = r.replace(/\/page\.tsx$/, '');
    const own = read(r);
    let lay = '';
    try { lay = read(`${dir}/layout.tsx`); } catch { lay = ''; }
    const both = own + lay;
    ok(`${route || '/'} either declares a canonical or refuses indexing`,
      /canonical/.test(both) || /robots:\s*\{\s*index:\s*false/.test(both));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n🔴 SIX PEOPLE WHO DO NOT EXIST, WITH FIVE STARS EACH, ON THE FRONT DOOR\n');
//
// app/_shared/site.tsx held six invented customers with names, trades and towns. app/page.tsx ran
// them in a marquee with a five pointed rating on every card, plus a second ★★★★★ and four avatar
// circles in the hero. The only hedge was "Illustrative examples, based on real self employed
// people", 13px, grey.
//
//   CAP 3.47  hold documentary evidence a testimonial is genuine, "unless it is obviously
//             fictitious", and hold contact details for the person who gave it.
//   CAP 3.50  never feature a testimonial without permission.
//
// A plausible named tradesman with a rating is not obviously fictitious, which is the whole reason
// somebody writes one, and there was no permission to hold because there was no person. Fake
// consumer reviews are separately a banned practice under the DMCC Act 2024, Schedule 20 para 13,
// in force 6 April 2025. And app/llms.txt/route.ts published, at the same time, "Lekhio does not
// publish invented testimonials or user numbers": two answers to one question, and the one a
// customer saw was the false one.
{
  const site = read('app/_shared/site.tsx');
  const home = read('app/page.tsx');
  const homeCode = codeOnly(home);

  // 🔴 NAMED, SO THEY CANNOT COME BACK BY A COPY AND PASTE FROM GIT HISTORY.
  const GHOSTS = [
    'lost a whole Sunday just setting it up',
    'started charging me once I went over a receipt limit',
    'talked to me like I was an accountant',
    'put me through a robot',
    'used to dread the quarter',
    'Voice notes are the best bit',
  ];
  for (const g of GHOSTS) {
    ok(`the invented quote "${g.slice(0, 34)}..." is gone from the whole site`,
      !read('app/_shared/site.tsx').includes(g) && !home.includes(g));
  }
  ok('🔴 and the array they lived in is EMPTY, not deleted, so a real one turns the section back on',
    /export const reviews: Review\[\] = \[\];/.test(codeOnly(site)));
  ok('the section renders nothing while it is empty',
    /\{reviews\.length > 0 \? \(/.test(homeCode));
  ok('🔴 AND NO STAR IS DRAWN ANYWHERE ON THE FRONT DOOR',
    !/★/.test(homeCode) && !/\.stars\{/.test(homeCode));
  ok('...nor the four avatars that stood for nobody',
    !/className="avs"/.test(homeCode) && !/\.avs\{/.test(homeCode));
  // ⚠️ BOTH OF THESE RUN ON codeOnly() AND THE FIRST DRAFT DID NOT, AND BOTH WENT RED ON MY OWN
  // COMMENTS. The note above `reviews` quotes the small print in order to explain why it went, and
  // the note where `fixes` used to be quotes "reviewing another app" for the same reason. The rule
  // this codebase already carries, once more: an assertion about rendered copy runs on codeOnly, in
  // both directions, because a comment is a perfectly good place to write the thing you just banned.
  ok('🔴 and the small print that was doing the excusing is gone with them',
    !/Illustrative examples/i.test(homeCode));
  ok('the eight invented reviews of OTHER apps went too, and nothing imported them',
    !/export const fixes = \[/.test(codeOnly(site)) && !/reviewing another app/.test(codeOnly(site)));
  ok('the star components that drew them are gone as well',
    !/export function Stars\(\)/.test(codeOnly(site)) && !/export function ReviewCard\(/.test(codeOnly(site)));

  // ⚠️ THE PRODUCT'S OWN PUBLISHED ANSWER AND ITS FRONT DOOR NOW AGREE. This is the assertion that
  // would have caught it: llmstxt tests the STRING, and nothing tested whether it was true.
  ok('🔴 and llms.txt\'s promise is now a fact about the site, not just a sentence in a file',
    /does not publish invented testimonials or user numbers/i.test(read('app/llms.txt/route.ts'))
    && !/★/.test(homeCode));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
console.log('\n/product sells the job, not the buttons\n');
//
// doc 104: not software you buy, the first employee a business ever hires, and sell the outcome
// never the technology. The page led with "Snap it. Say it. Sorted." over "the whole back office,
// in one chat", which is a description of what your thumb does, and then listed eight features
// under "Everything it does", which is a spec sheet.
{
  const prod = read('app/product/page.tsx');
  const code = codeOnly(prod);

  ok('🔴 the hero describes the hire rather than the gesture',
    /Your first employee/.test(code) && /the first person your business hires/.test(code));
  ok('...and the old mechanism headline is gone from it',
    !/Snap it\. Say it\./.test(code));
  ok('the eight things it does are framed as a job, not a feature list',
    /<div className="eyebrow">The job<\/div>/.test(code)
    && /What it does all week, so you do not/.test(code));
  ok('🔴 and not one of the eight was quietly dropped while it was reframed',
    ['Files your receipts', 'Takes it down as you say it', 'Claims your mileage',
     'Sends the invoices', 'Watches your CIS refund', 'Tells you what to put by',
     'Goes looking for money', 'Brings it to you to sign off'].every((t) => code.includes(t)));

  // 🔴 THE PRICE IS THE ARGUMENT AND THE PAGE NEVER MADE IT.
  ok('🔴 the page says what the job costs', /What it costs you/.test(code) && /12\.99/.test(code));
  // ⚠️ DOC 108: NEVER PRICE ON THE SAVING. A number claiming what he keeps, or hours saved, is a
  // figure that is his and that moves, and it is the one thing this section must never grow.
  ok('🔴 AND IT NEVER PRICES ON A SAVING OR ON HOURS',
    !/saves? you (£|\d)/i.test(code) && !/\d+\s*hours? (a|per) (month|week|year)/i.test(code));
  ok('...and it points at /pricing rather than restating the whole thing',
    /href="\/pricing"/.test(code));

  // ⚠️ EVERYTHING THE REWRITE HAD TO KEEP, because a rewrite is where a guarded claim quietly dies.
  ok('it still asks lib/features for the reminder wording rather than holding its own',
    /from '(\.\.\/)+lib\/features'/.test(code) && /\{alertChannels\(\)\}/.test(code));
  ok('Rakha still names the one thing she watches that this suite pins',
    prod.includes('the VAT threshold creeping closer'));
  ok('the two badges are still asked of the flags, never typed',
    /filingBadge\(\)/.test(code) && /bankBadge\(\)/.test(code));
  ok('and it still picks no fight with accountants',
    !/none of the bill|instead of an accountant|cheaper than an accountant/i.test(code));
}

console.log(`\n  ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);