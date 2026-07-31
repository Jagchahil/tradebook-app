import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import {
  EXPENSE_RULES, VERDICT_LABEL, type ExpenseRule, type Verdict,
} from '../../../../lib/claimrules.data';
import { RULE_SOURCES } from '../../../../lib/rulesources';
import {
  A11Y_CSS, APP_CSS, FONT, GREEN_TINT, INK, LINE, MUTED, ON_GREEN_TINT, ON_SAFFRON_TINT, PAPER,
  RADIUS, RED, RED_TINT, SAFFRON_TINT, SPACE, TYPE,
} from '../../../../lib/tokens';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// CAN I CLAIM IT. The claim corpus as a reference he can read in the van.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠️ EVERY RULE ON THIS PAGE IS lib/claimrules.data.ts, THE ONE CORPUS, BYTE IDENTICAL WITH THE
// PHONE. That file's header tells the story of the two hand-typed copies that drifted and shipped
// four wrong answers to the phone for weeks. This page types no rule of its own: it draws the
// corpus, grouped by verdict, clearest answer first.
//
// ⚠️ AND THE SOURCE IS ON THE CARD, WHERE THERE IS ONE. lib/rulesources.ts holds the HMRC page,
// the exact sentence our rule rests on, and the statute or case where one exists, checked verbatim
// against GOV.UK nightly. A rule with no source yet gets no badge rather than a frightening
// "uncited": the public /can-i-claim page reasons that out under doc 103, and this page follows it.
//
// ⚠️ NOT FILTERED TO HIS TRADE, AND THAT IS A FINDING, NOT A SHORTCUT. The corpus carries no trade
// tags and lib/supabase.ts exposes no per-user trade, so any filter would be this page guessing
// which rules a roofer never needs. A guess that hides the training rule from the one roofer
// retraining as a gas engineer costs him real money. The moment the data supports it, filter here.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const yesRules = EXPENSE_RULES.filter((r) => r.verdict === 'yes');
const midRules = EXPENSE_RULES.filter((r) => r.verdict === 'partly' || r.verdict === 'depends');
const noRules = EXPENSE_RULES.filter((r) => r.verdict === 'no');

function chipStyle(v: Verdict): React.CSSProperties {
  if (v === 'yes') return { ...S.chip, color: ON_GREEN_TINT, background: GREEN_TINT };
  if (v === 'no') return { ...S.chip, color: RED, background: RED_TINT };
  return { ...S.chip, color: ON_SAFFRON_TINT, background: SAFFRON_TINT };
}

// The authority, linked to the GOV.UK page our rule rests on. The quote itself stays in
// lib/rulesources.ts where Khoji checks it nightly; the card shows the reference a man could put
// in a letter, which is the part he can use.
function Source({ ruleKey }: { ruleKey: string }) {
  const sources = RULE_SOURCES[ruleKey];
  if (!sources || sources.length === 0) return null;
  const s = sources[0];
  return (
    <a href={s.url} target="_blank" rel="noopener noreferrer" style={S.source}>
      HMRC {s.code}{s.authority ? `, ${s.authority}` : ''}
    </a>
  );
}

function Rule({ r }: { r: ExpenseRule }) {
  return (
    <div style={S.rule}>
      <div style={S.ruleTop}>
        <h3 style={S.ruleTitle}>{r.title}</h3>
        <span style={chipStyle(r.verdict)}>{VERDICT_LABEL[r.verdict]}</span>
      </div>
      <p style={S.ruleLine}>{r.rule}</p>
      <p style={S.ruleDetail}>{r.detail}</p>
      <Source ruleKey={r.key} />
    </div>
  );
}

export default async function CanIClaimPage() {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in');

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/tax/can-i-claim" />

      <section className="lek-card">
        <h1 className="lek-h2">Can I claim it</h1>
        <p style={S.body}>
          Straight answers on what goes through the books. The test behind every one is HMRC&apos;s
          own: the cost has to be wholly and exclusively for the trade. Where a rule rests on an
          HMRC page or a court case, it is named on the card so you can check it yourself.
        </p>
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">Yes, claim these</h2>
        {yesRules.map((r) => <Rule key={r.key} r={r} />)}
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">Partly, or it depends</h2>
        {midRules.map((r) => <Rule key={r.key} r={r} />)}
      </section>

      <section className="lek-card">
        <h2 className="lek-h2">No, these do not go through</h2>
        {noRules.map((r) => <Rule key={r.key} r={r} />)}
      </section>

      <p style={S.foot}>
        General information, never tax advice on your own facts. When you log a cost, Lekhio
        applies these rules to it and you can always see what was decided.
      </p>
    </main>
  );
}

// The column and the card come whole from APP_CSS. This screen owns only the rule rows.
const CSS = [A11Y_CSS, APP_CSS].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  body: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: 0, maxWidth: '62ch' },

  rule: { borderTop: `1px solid ${LINE}`, padding: `${SPACE.sm}px 0 0`, marginTop: SPACE.sm },
  ruleTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: SPACE.sm, flexWrap: 'wrap' },
  ruleTitle: { fontSize: TYPE.body, fontWeight: 800, margin: 0 },
  chip: { flex: '0 0 auto', fontSize: TYPE.label, fontWeight: 700, borderRadius: RADIUS.pill, padding: '3px 10px', whiteSpace: 'nowrap' },
  ruleLine: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, margin: '6px 0 0', maxWidth: '68ch' },
  ruleDetail: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '4px 0 0', maxWidth: '68ch' },
  source: { display: 'inline-block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, textDecoration: 'underline', textDecorationColor: LINE, textUnderlineOffset: 3, marginTop: 6 },

  foot: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, textAlign: 'center', margin: '18px 4px 0' },
};
