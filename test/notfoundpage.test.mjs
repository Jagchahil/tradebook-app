// The two pages that had no name and no way home. RUN 0 of the customer week, 11 August 2026.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE 404. Any dead URL served the Next.js default: "404 | This page could not be found." White
// page, default font, no logo, no nav, no footer, and NO LINK ANYWHERE. A man who mistypes a URL
// or follows a stale link from a forum post reached bare scaffolding and had to type our address
// again from memory to get back. Every other page on the estate is hand made.
//
// THE TEAM DOOR. /team shipped with an EMPTY document title, so the browser tab read the bare URL.
// The page itself is on brand and reassuring; it just had no name.
//
// Both are the same shape of fault: a page nobody chose to design, because nobody arrives at it on
// purpose. This suite is what stops either from silently reverting to the framework default.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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
const at = (rel) => path.join(root, rel);
const read = (rel) => readFileSync(at(rel), 'utf8');

console.log('\n--- 1. The 404 exists at all, which is the whole of it ---\n');

ok('🔴 app/not-found.tsx EXISTS, so Next never serves its own', existsSync(at('app/not-found.tsx')));
const nf = existsSync(at('app/not-found.tsx')) ? read('app/not-found.tsx') : '';

ok('it has a title, so the tab does not read "404: This page could not be found."',
  /title: 'That page is not here\. Lekhio\.'/.test(nf));
ok('and it is not indexed, because a dead URL is not a page we want in a search result',
  /robots: \{ index: false, follow: false \}/.test(nf));

console.log('\n--- 2. He knows he is still with us, and he can get out ---\n');

ok('🔴 THE MARK IS ON THE PAGE', /lekhio-mark\.svg/.test(nf));
ok('and the mark is itself a way home', /<Link[\s\S]{0,240}?href="\/"[\s\S]{0,600}?lekhio-mark\.svg/.test(nf));
ok('🔴 AND THERE IS A BUTTON HOME', /Take me home/.test(nf));

const links = [...nf.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
ok(`every link on the page goes home (${links.join(', ')})`, links.length >= 2 && links.every((h) => h === '/'));

// Doc 103. He came here by accident and wants out. Anything else on the screen is us talking.
ok('🔴 NO NAV, so he is not handed twenty choices at the moment he wants one', !/<SiteNav/.test(nf));
ok('no footer either', !/<SiteFooter/.test(nf));
ok('and no sticky trial bar on a page that is not selling anything', !/<StickyCta/.test(nf));

// One line, and it does not blame him.
ok('one sentence of explanation, in the house voice',
  /Either it moved or the link was wrong\. Nothing you did\./.test(nf));

console.log('\n--- 3. It looks like the rest of the site ---\n');
ok('it uses the shared palette rather than typing colours in',
  /INK, MUTED, PAPER, RIVER, ON_RIVER, FONT/.test(nf));
ok('and the shared head, so the fonts and the a11y rules are the site\'s',
  /<SharedHead \/>/.test(nf));
ok('and the marketing stylesheet, so the mark renders at the size it does everywhere else',
  /MARKETING_CSS/.test(nf));

console.log('\n--- 4. The writing rules, on the one page written today ---\n');
{
  // No em dash, no en dash, no hyphen used as a dash. CLAUDE.md, and it applies to every word we
  // ship. Checked on the prose, not the code: a hyphen inside a class name or a URL is not a dash.
  const prose = [...nf.matchAll(/>([^<>{}]{12,})</g)].map((m) => m[1]).join(' ');
  ok(`no em or en dashes in the copy`, !/[—–]/.test(prose));
  ok('and no hyphen standing in for one', !/\s-\s/.test(prose));
}

console.log('\n--- 5. The team door has a name ---\n');

ok('🔴 app/team/layout.tsx EXISTS', existsSync(at('app/team/layout.tsx')));
const tl = existsSync(at('app/team/layout.tsx')) ? read('app/team/layout.tsx') : '';
ok('🔴 AND IT GIVES /team A TITLE', /title: 'Team sign in\. Lekhio\.'/.test(tl));
ok('the title is not empty, which was the fault', !/title: ''/.test(tl));
ok('and the console stays out of the index', /robots: \{ index: false, follow: false \}/.test(tl));
ok('it is a server layout, because the page itself is a client component and cannot export metadata',
  !/'use client'/.test(tl) && /export const metadata/.test(tl));
ok('and it renders its children untouched', /return children/.test(tl));

// The real gate is unchanged and this suite says so, so nobody reads a noindex as security.
{
  const robots = read('app/robots.ts');
  ok('robots.txt still disallows /team, which is the first line and not the last',
    /'\/team'/.test(robots));
  const page = read('app/team/page.tsx');
  ok('and the gate is still a row in team_members re-checked on the server',
    /team_members/.test(page));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exitCode = fail ? 1 : 0;
