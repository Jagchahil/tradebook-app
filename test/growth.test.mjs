// The Growth desk's pure core (lib/growth.ts): the CEO brief derivation, the pipeline mapping, the
// channel state and the source mix. Run: node test/growth.test.mjs
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.resolve(here, '../lib');
const stage = mkdtempSync(path.join(tmpdir(), 'growth-'));
writeFileSync(path.join(stage, 'growth.ts'), readFileSync(path.join(lib, 'growth.ts'), 'utf8'));
const G = await import(pathToFileURL(path.join(stage, 'growth.ts')).href);

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}`); } };

const base = {
  isOwner: true, enabled: true,
  platforms: [
    { platform: 'meta', configured: true, connected: false },
    { platform: 'linkedin', configured: true, connected: true },
  ],
  assetStates: [], cancelRequested: 0, trialing: 0, paying: 0, scheduledCount: 0,
};

console.log('\n=== deriveActions: approvals lead, hi priority ===\n');
{
  const a = G.deriveActions({ ...base, assetStates: ['awaiting_approval', 'awaiting_approval', 'live', 'idea'] });
  const approve = a.find((x) => x.id === 'approve-posts');
  ok('posts awaiting approval become an approve action', !!approve && approve.kind === 'approve');
  ok('it counts only awaiting_approval', approve.text.startsWith('2 posts'));
  ok('approvals sort to the front (hi)', a[0].id === 'approve-posts');
}

console.log('\n=== deriveActions: cancellations ===\n');
{
  const a = G.deriveActions({ ...base, cancelRequested: 1 });
  const w = a.find((x) => x.id === 'winback');
  ok('a cancellation raises a win-back approve', !!w && w.kind === 'approve');
  ok('win-back text is singular for one', w.text.includes('1 customer asked'));
}

console.log('\n=== deriveActions: connect only what is configured-not-connected ===\n');
{
  const a = G.deriveActions(base);
  ok('meta (configured, not connected) becomes a connect need', a.some((x) => x.id === 'connect-meta' && x.kind === 'needs'));
  ok('linkedin (connected) raises no connect action', !a.some((x) => x.id === 'connect-linkedin'));
}

console.log('\n=== deriveActions: owner gate ===\n');
{
  const a = G.deriveActions({ ...base, isOwner: false });
  ok('a non-owner is never shown a connect door they cannot open', !a.some((x) => x.id.startsWith('connect-')));
  ok('a non-owner is not shown the layer switch', !a.some((x) => x.id === 'enable-layer'));
}

console.log('\n=== deriveActions: the layer switch ===\n');
{
  const a = G.deriveActions({ ...base, enabled: false });
  ok('owner sees the layer-off nudge when disabled', a.some((x) => x.id === 'enable-layer'));
  ok('the layer nudge is low priority (last)', a[a.length - 1].id === 'enable-layer');
}

console.log('\n=== deriveActions: a clean desk is an empty list ===\n');
{
  const a = G.deriveActions({ ...base, platforms: [{ platform: 'linkedin', configured: true, connected: true }] });
  ok('nothing pending means no actions, not a fake one', a.length === 0 && G.actionCount(a) === 0);
}

console.log('\n=== pipelineFrom: only trial and paid are measured ===\n');
{
  const p = G.pipelineFrom({ trialing: 9, active: 30, pastDue: 2 });
  ok('trial reads trialing', p.trial === 9);
  ok('paid is active + past due', p.paid === 32);
  ok('lead is null (not a confident zero)', p.lead === null);
  ok('warming is null', p.warming === null);
  ok('checkout is null', p.checkout === null);
  const p2 = G.pipelineFrom({ trialing: 1, active: 0, pastDue: 0 }, { lead: 71 });
  ok('an explicit earlier count is honoured', p2.lead === 71);
}

console.log('\n=== channelState ===\n');
{
  ok('a stored token is connected', G.channelState({ configured: true, connected: true }) === 'connected');
  ok('keys but no token is configured', G.channelState({ configured: true, connected: false }) === 'configured');
  ok('nothing is off', G.channelState({ configured: false, connected: false }) === 'off');
  ok('channelLabel maps twitter to X', G.channelLabel('twitter') === 'X');
}

console.log('\n=== sourceShare: honest percentages ===\n');
{
  const mix = G.sourceShare({ meta: 18, organic: 11, referral: 6, in_person: 4, billboard: 0, unknown: 1 });
  ok('sorted by count, biggest first', mix[0].source === 'meta' && mix[0].count === 18);
  ok('percentage of the whole (40)', mix[0].pct === 45);
  const empty = G.sourceShare({ meta: 0, organic: 0, referral: 0, in_person: 0, billboard: 0, unknown: 0 });
  ok('an empty database is 0% everywhere, never NaN', empty.every((s) => s.pct === 0));
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail ? 1 : 0);
