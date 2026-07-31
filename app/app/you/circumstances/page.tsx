import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { readCircumstances, getBusinessProfile } from '../../../../lib/supabase';
import {
  household, notHousehold, mtdQuestions, unanswered, unansweredMtd, progressIn,
  type Circumstance, type BusinessStructure,
} from '../../../../lib/circumstances';
import { A11Y_CSS, APP_CSS, FONT, RADIUS, SPACE, TYPE } from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RED, RED_TINT, RIVER, RIVER_DEEP, RIVER_TINT, edge,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// EVERY QUESTION, WHAT HE SAID, AND WHAT IS STILL WAITING. The "waiting for you inside" page.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ THIS PAGE DECIDES NOTHING ABOUT THE QUESTIONS. The wording, the order, the partitions, the
// claimant, which follow up is fair to ask today: all of it comes from lib/circumstances.ts, the
// same module /app/setup, the phone app and the WhatsApp chain read. Every answer posts to
// /api/circumstances, the one route that logs the verbatim sentence he was shown, because under
// Finance Act 2026 Sch 22 that log is the defence. This file is a surface.
//
// ⚠️ ANSWERED ONES ARE SHOWN WITH HIS ANSWER, AND CHANGEABLE. People get married, buy vans and
// register for VAT, and a record he cannot correct is a record that rots. Changing is the same
// POST as answering: saveCircumstance keeps one live answer per question, so pressing the other
// button replaces what he said, with the new wording logged beside it.
//
// 🔴 THE ARTICLE 9 QUESTION IS NOT ON THIS PAGE, AND ITS ABSENCE IS DELIBERATE. The partitions
// this page draws from all refuse special category questions, exactly as setup's do. The gated
// consent path needs erasure to be as easy as consent (Article 7(3)), and a server rendered form
// page has no DELETE to offer, so drawing the consent gate here would be offering a door in with
// no door out. The phone app holds that surface, behind its own consent, with its own delete.
//
// ⚠️ UNANSWERED DEPENDENT QUESTIONS STAY HIDDEN until their premise is established, exactly as
// everywhere else: a single man is never asked what his wife earns. The counts come from
// progressIn, whose denominator is his, so answering one can honestly raise the total.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// One sentence saying who has to make the claim, shared by the open and answered cards. The same
// judgements /app/setup states, said once here rather than four times below.
function claimantLine(c: Circumstance): string | null {
  switch (c.claimant) {
    case 'his council':
      return 'This one is claimed from your council, not HMRC. Tell us and we will show you exactly what to ask them for.';
    case 'his partner':
      return 'This one has to be claimed by your husband or wife, not by you. Tell us and we will show you what they need to do.';
    case 'both of them':
      return 'This one needs two people to claim it. Tell us and we will show you both what to do.';
    case 'his company':
      return 'This one is claimed by your company rather than by you.';
    default:
      return null;
  }
}

// What his stored answer reads as. Yes and no get plain words; anything longer came in over
// WhatsApp in his own words and is shown as he gave it, never paraphrased.
function saidLine(answer: string): string {
  if (answer === 'yes') return 'You said yes.';
  if (answer === 'no') return 'You said no.';
  if (answer === 'skip') return 'You left this one.';
  return `You told us: ${answer}`;
}

function QuestionCard({ q, current }: { q: Circumstance; current: string | null }) {
  const whose = claimantLine(q);
  return (
    <div style={S.q}>
      <p style={S.ask}>{q.ask}</p>
      <p style={S.why}>{q.why}</p>
      {whose ? <p style={S.whose}>{whose}</p> : null}
      {current !== null ? <p style={S.said}>{saidLine(current)}</p> : null}
      <div style={S.answers}>
        {(['yes', 'no'] as const).map((a) => {
          const on = current === a;
          return (
            // One form per answer, same as setup: the tap is the save, and the 303 lands back
            // here. The `back` field is a token the route compares to one literal, never a path.
            <form key={a} action="/api/circumstances" method="post" style={S.aForm}>
              <input type="hidden" name="key" value={q.key} />
              <input type="hidden" name="answer" value={a} />
              <input type="hidden" name="back" value="you" />
              <button
                type="submit"
                style={{ ...(a === 'yes' ? S.yes : S.no), ...(on ? S.pressed : null) }}
                aria-pressed={on}
              >
                {on ? '✓ ' : ''}{a === 'yes' ? 'Yes' : 'No'}
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function Group({
  title, blurb, group, open, rows, structure,
}: {
  title: string;
  blurb: string;
  group: Circumstance[];
  open: Set<string>;
  rows: Array<{ key: string; answer: string }>;
  structure: BusinessStructure | null;
}) {
  const given = new Map(rows.map((r) => [r.key, r.answer]));
  // The structure keeps the denominator honest: a question lib/circumstances.ts refuses for how he
  // trades is not "waiting for him", so it never counts against him here. An answer he has already
  // given stays drawn and changeable whatever his structure is now, because the record is his.
  const { answered, askable } = progressIn(group, rows, structure);
  const drawable = group.filter((c) => open.has(c.key) || given.has(c.key));

  return (
    <section className="lek-card">
      <h2 className="lek-h2">{title}</h2>
      <p style={S.blurb}>{blurb}</p>
      {askable > 0 ? <p style={S.count}>{answered} of {askable} answered</p> : null}
      {drawable.length === 0 ? (
        <p style={S.quiet}>Nothing to ask you here yet.</p>
      ) : (
        <div style={S.stack}>
          {drawable.map((q) => (
            <QuestionCard key={q.key} q={q} current={given.get(q.key) ?? null} />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function CircumstancesPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  // The structure comes with the answers: askability branches on it in lib/circumstances.ts, so a
  // director is not shown "before you went self employed" as a question still waiting on him. A
  // failed profile read passes null, which the module treats as unknown and asks everything.
  const [rows, biz] = await Promise.all([
    readCircumstances(user.id),
    getBusinessProfile(user.id).catch(() => null),
  ]);
  const structure = biz?.businessType ?? null;

  // 🔴 A FAILED READ IS NEVER A BLANK SLATE. Drawing every question as open would ask a man
  // things he answered last month, and he only needs to notice once to stop answering the ones
  // worth thousands. Said plainly instead, with nothing else on the page to mislead.
  if (rows === null) {
    return (
      <main className="lek-wrap" style={S.wrap}>
        <style>{CSS}</style>
        <AppNav current="/app/you/circumstances" />
        <section className="lek-card">
          <h1 className="lek-eyebrow">Your circumstances</h1>
          <p style={S.warn}>
            We could not read your answers just this minute. Nothing is lost. Give it a moment and
            reload.
          </p>
        </section>
      </main>
    );
  }

  // The money queue and the compliance queue, asked of the module. unanswered() refuses the MTD
  // questions on purpose, so the MTD group has its own gate through unansweredMtd(). Both take the
  // structure, so what is "open" for this man is decided in one place for every surface.
  const open = new Set(unanswered(rows, structure).map((c) => c.key));
  const openMtd = new Set(unansweredMtd(rows, structure).map((c) => c.key));

  const overall = progressIn([...household(), ...notHousehold(), ...mtdQuestions()], rows, structure);
  const waiting = overall.askable - overall.answered;

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/you/circumstances" />

      <section className="lek-card lek-head">
        <h1 className="lek-eyebrow">Your circumstances</h1>
        <p style={S.lede}>
          {overall.answered} answered{waiting > 0 ? `, ${waiting} waiting for you` : ', nothing waiting'}.
        </p>
        <p style={S.blurb}>
          None of this is on a receipt or in a bank feed, which is exactly why every app before us
          missed it. Answer what you can, change anything that has changed, and leave what you are
          not sure of. We never ask the same thing twice.
        </p>
      </section>

      <Group
        title="You and your household"
        blurb="You know every answer off the top of your head, and most of them are claimed by someone who is not you, so telling us is how they get claimed at all."
        group={household()}
        open={open}
        rows={rows}
        structure={structure}
      />

      <Group
        title="What you can claim"
        blurb="Each open one is a relief we cannot get you until you tell us. The biggest are at the top on purpose."
        group={notHousehold()}
        open={open}
        rows={rows}
        structure={structure}
      />

      <Group
        title="Where you stand with HMRC"
        blurb="These do not change a penny of your tax. They change what we do for you during the year."
        group={mtdQuestions()}
        open={openMtd}
        rows={rows}
        structure={structure}
      />

      <p style={S.foot}>
        Every answer is saved the moment you press it, with the exact wording you read, so what we
        claim for you can always be shown to come from what you told us.
      </p>
    </main>
  );
}

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-head{background:${RIVER_TINT};border-color:${LINE};border-color:${edge(RIVER, 20)}}`,
  `.lek-eyebrow{font-size:${TYPE.label}px;font-weight:800;letter-spacing:0.05em;text-transform:uppercase;color:${RIVER_DEEP};margin:0 0 ${SPACE.xs}px}`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  lede: { fontSize: TYPE.lead, fontWeight: 800, letterSpacing: '-0.01em', margin: `0 0 ${SPACE.xs}px`, color: RIVER_DEEP },
  blurb: { fontSize: TYPE.note, lineHeight: 1.6, color: MUTED, margin: `0 0 ${SPACE.sm}px`, maxWidth: '62ch' },
  count: { fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: `0 0 ${SPACE.sm}px` },
  quiet: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0 },
  warn: { fontSize: TYPE.note, lineHeight: 1.6, color: INK, background: RED_TINT, border: `1px solid ${LINE}`, borderColor: edge(RED, 20), borderRadius: RADIUS.md, padding: SPACE.sm, margin: 0 },

  stack: { display: 'flex', flexDirection: 'column', gap: SPACE.xs },

  q: { border: `1px solid ${LINE}`, borderRadius: RADIUS.md, padding: 15, background: PANEL },
  ask: { fontSize: TYPE.strong, lineHeight: 1.45, fontWeight: 700, margin: '0 0 7px' },
  why: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: 0 },
  whose: { fontSize: TYPE.note, lineHeight: 1.5, color: RIVER_DEEP, background: RIVER_TINT, borderRadius: RADIUS.sm, padding: '9px 11px', margin: '10px 0 0' },
  said: { fontSize: TYPE.note, fontWeight: 700, color: INK, margin: '10px 0 0' },
  answers: { display: 'flex', gap: SPACE.xs, marginTop: 13 },
  aForm: { flex: 1, margin: 0 },
  yes: { width: '100%', background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.sm, padding: '13px 0', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  no: { width: '100%', background: PANEL, color: MUTED, border: `1.5px solid ${LINE}`, borderRadius: RADIUS.sm, padding: '13px 0', fontSize: TYPE.body, fontWeight: 700, fontFamily: FONT, cursor: 'pointer' },
  pressed: { outline: `2px solid ${RIVER_DEEP}`, outlineOffset: 1 },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
