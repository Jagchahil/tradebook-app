// THE NEWSLETTER suite. The newsletter goes to real, consented people, so the two things that must
// never break are: (1) the content renders to safe HTML — author text escaped, links sanitised, no way
// for a stray character to break the markup or inject; and (2) the registry stays well-formed so the
// console can always list and preview an issue. The actual send is gated three ways in the route
// (team auth + NEWSLETTER_SEND_ENABLED + explicit confirm) and bounded per run; those gates are asserted
// by reading the route source here so a future edit cannot quietly remove a lock.

import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

// lib/newsletter.ts reads the mileage rate off lib/taxengine.ts's FACTS (6 August 2026: a typed
// "45p" survived in an issue four months after HMRC moved the rate, so the rate is the engine's
// now). Node's type stripping cannot follow the extensionless relative import, so the two files
// are staged with the same rewrite every engine suite uses.
const hereEarly = path.dirname(fileURLToPath(import.meta.url));
const fixImports = (s) => s.replace(/from '(\.\/[a-zA-Z0-9._-]+)'/g, "from '$1.ts'");
const nlStage = mkdtempSync(path.join(tmpdir(), 'newsletter-'));
for (const f of ['newsletter', 'taxengine']) {
  writeFileSync(path.join(nlStage, f + '.ts'), fixImports(readFileSync(path.resolve(hereEarly, '../lib/' + f + '.ts'), 'utf8')));
}
const { NEWSLETTERS, getNewsletter, renderNewsletterInner } = await import(pathToFileURL(path.join(nlStage, 'newsletter.ts')).href);

const here = path.dirname(fileURLToPath(import.meta.url));
const repoWeb = path.resolve(here, '..');

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// --- registry integrity ---------------------------------------------------
ok('at least one issue is written', NEWSLETTERS.length >= 1);
ok('every issue has a unique id', new Set(NEWSLETTERS.map((n) => n.id)).size === NEWSLETTERS.length);
for (const n of NEWSLETTERS) {
  ok(`issue ${n.id} has a subject`, typeof n.subject === 'string' && n.subject.length > 0);
  ok(`issue ${n.id} has blocks`, Array.isArray(n.blocks) && n.blocks.length > 0);
}
ok('getNewsletter finds a known issue', getNewsletter(NEWSLETTERS[0].id)?.id === NEWSLETTERS[0].id);
ok('getNewsletter returns null for an unknown issue', getNewsletter('does-not-exist') === null);

// --- rendering is safe -----------------------------------------------------
const rendered = renderNewsletterInner(NEWSLETTERS[0]);
ok('render returns a non-empty string', typeof rendered === 'string' && rendered.length > 50);
ok('render contains no <script>', !/<script/i.test(rendered));

// A hand-built issue exercising every block type, including hostile input.
const probe = {
  id: 'probe',
  subject: 'probe',
  blocks: [
    { type: 'lede', text: 'Danger <b>tag</b> & "quote"' },
    { type: 'h', text: 'Heading <img src=x>' },
    { type: 'p', html: 'Trusted <strong>bold</strong> copy.' },
    { type: 'button', href: 'javascript:alert(1)', label: 'Go <x>' },
    { type: 'divider' },
    { type: 'note', html: 'A small note.' },
  ],
};
const out = renderNewsletterInner(probe);
ok('lede text is HTML-escaped', out.includes('Danger &lt;b&gt;tag&lt;/b&gt; &amp; &quot;quote&quot;'));
ok('heading text is HTML-escaped', out.includes('Heading &lt;img src=x&gt;'));
ok('trusted p HTML is preserved', out.includes('<strong>bold</strong>'));
ok('a javascript: button href is refused and falls back to the app', !/javascript:/i.test(out) && out.includes('https://lekhio.app'));
ok('button label is escaped', out.includes('Go &lt;x&gt;'));
ok('divider renders a hairline', out.includes('height:1px'));

// --- the three send locks are still in the route --------------------------
const route = readFileSync(path.join(repoWeb, 'app/api/team/newsletter/route.ts'), 'utf8');
ok('send is team-gated', /verifyAccessToken/.test(route) && /isTeam/.test(route));
ok('send requires NEWSLETTER_SEND_ENABLED', /NEWSLETTER_SEND_ENABLED/.test(route));
ok('send requires an explicit confirm', /confirm\s*!==\s*true/.test(route));
ok('send is bounded per run', /MAX_PER_RUN/.test(route) && /slice\(0, MAX_PER_RUN\)/.test(route));
ok('send targets confirmed leads only', /listMarketableLeads\(true\)/.test(route));
ok('every send carries an unsubscribe', /unsubscribeUrl\(/.test(route));

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
