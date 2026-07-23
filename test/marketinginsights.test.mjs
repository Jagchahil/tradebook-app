// THE CEO INSIGHT BOX. A single text field, one tap to save. Two things must hold:
//   1. cleanInsight() is the ONLY gate: empty/whitespace is rejected, everything real is trimmed and
//      capped, never silently truncated to something misleading.
//   2. The tag written is ALWAYS 'ceo_led_ideas' — a constant, not something a caller can drift on —
//      so a future reader (the marketing brain, once built) can trust every row without filtering.
//   3. The route is gated exactly like the rest of the console: unauthorized and non-team requests
//      are refused before any write, and it is the SAME pattern (verifyAccessToken + isTeam) as the
//      other team-gated desks, checked here on the source since next/server is not importable
//      without node_modules in every environment this suite runs in.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lib = await import(pathToFileURL(path.join(root, 'lib/marketinginsights.ts')).href);
const { cleanInsight, CEO_TAG } = lib;

const routeSrc = readFileSync(path.join(root, 'app/api/team/growth/insight/route.ts'), 'utf8');
const sqlSrc = readFileSync(path.join(root, 'supabase/APPLY_2026-07-23_marketing_insights.sql'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };

console.log('\nmarketing insights: the CEO insight box');

// ---------------------------------------------------------------------------------------------
// cleanInsight() — the only gate between the box and the table.
// ---------------------------------------------------------------------------------------------

ok('a real note passes through trimmed', cleanInsight('  worth a look  ') === 'worth a look');
ok('empty is rejected, not saved as a blank row', cleanInsight('') === null);
ok('whitespace only is rejected the same way', cleanInsight('   \n\t  ') === null);
ok('not a string at all is rejected, never coerced', cleanInsight(undefined) === null && cleanInsight(123) === null && cleanInsight(null) === null);
const cappedNote = cleanInsight('x'.repeat(5000));
ok('a very long note is capped, not rejected outright', typeof cappedNote === 'string' && cappedNote.length === 2000);
ok('a note inside the cap is never truncated', cleanInsight('a'.repeat(500)).length === 500);

// ---------------------------------------------------------------------------------------------
// The tag. One constant, never a free field the route can drift on.
// ---------------------------------------------------------------------------------------------

ok('the exported tag is exactly ceo_led_ideas', CEO_TAG === 'ceo_led_ideas');
ok('the SQL default matches the constant the code writes, so the two can never disagree', sqlSrc.includes(`default '${CEO_TAG}'`));
ok('the migration is additive: create table if not exists, never a destructive statement', /create table if not exists/.test(sqlSrc) && !/drop table|truncate/i.test(sqlSrc));
ok('RLS is on with no client policy, same posture as team_todos', /enable row level security/.test(sqlSrc) && !/create policy/.test(sqlSrc));

// ---------------------------------------------------------------------------------------------
// The route: gated exactly like the rest of the console, before any write.
// ---------------------------------------------------------------------------------------------

ok('GET and POST both run the gate before touching data',
  /export async function GET[\s\S]{0,120}await gate\(req\)/.test(routeSrc)
  && /export async function POST[\s\S]{0,120}await gate\(req\)/.test(routeSrc));

ok('the gate checks a real access token, not a header the client can fake',
  /verifyAccessToken\(token\)/.test(routeSrc) && /if \(!user\)/.test(routeSrc));

ok('the gate checks team_members membership, not just "logged in"',
  /readTeamMember\(user\.email\)/.test(routeSrc) && /isTeam\(member\)/.test(routeSrc));

ok('a request that fails the gate returns before addInsight or readInsights runs',
  /if \(g\.error\) return g\.error;/.test(routeSrc));

ok('the saved row is attributed to the team member who wrote it, not client-supplied text',
  /addInsight\([^,]+,\s*g\.member\.email\)/.test(routeSrc));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail === 0 ? 0 : 1);
