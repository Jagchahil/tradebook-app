// SYNTHESIS. One answer, three layers, and the hierarchy between them.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 HMRC GUIDANCE IS NOT THE LAW. IT IS HMRC'S VIEW OF THE LAW.
//
// Every answer this product gives comes off a GOV.UK page. Every rule in lib/taxrules.ts is a
// paraphrase of HMRC's guidance, checked nightly against HMRC's guidance, and delivered to a man with
// the confidence of law.
//
// It is not law. It is one party's opinion, and that party is the one collecting the money.
//
// The actual hierarchy, and it runs the other way:
//
//   1. THE STATUTE       What Parliament wrote. ITTOIA 2005 s34. This is the law.
//   2. THE COURTS        What the statute MEANS, decided by judges. This binds HMRC.
//   3. HMRC GUIDANCE     What HMRC thinks the above adds up to. It binds nobody.
//
// HMRC being wrong about the law is not hypothetical. They lost the double-cab pickup argument in the
// Court of Appeal, and their own manual was out of step until they rewrote it. A man who followed the
// guidance and a man who followed the judgment got different answers, and only one of them was right.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// AND THE MOST IMPORTANT THING THIS FILE DOES IS ADMIT WHAT WE DO NOT HAVE.
//
// 25 rules. 15 carry a statutory reference. FOUR carry a case. So for TEN of our rules, the honest
// answer to "what is the authority for this" is: HMRC SAID SO, AND NOTHING ELSE. That is a perfectly
// respectable position, and it is a very different one from "the House of Lords decided this", and a
// man is entitled to know which of the two he is being given.
//
// ⚠️ WE ALSO CHANGED THE TRAINING RULE THIS MORNING, ON AN HMRC PAGE, WITH NO STATUTE AND NO CASE.
// That is the thinnest layer of the three, and it is the one where HMRC has most room to be wrong.
// The synthesis says so, out loud, rather than dressing it up.

import { RULE_SOURCES, type RuleSource } from './rulesources';

export type Layer = 'statute' | 'precedent' | 'guidance';

export interface Authority {
  layer: Layer;
  /** What it says, or what it is. Never our paraphrase where we can quote instead. */
  text: string;
  /** Where a human goes to check it. */
  url?: string;
  /** In one line: how much weight does this actually carry? */
  weight: string;
}

// ---------------------------------------------------------------------------------------------
// PULLING THE LAYERS APART.
//
// The `authority` field on a RuleSource is a single string that has been carrying two different
// kinds of thing all along, separated by a semicolon:
//
//     "S34(1)(a) ITTOIA 2005; Mallalieu v Drummond [1983] 57 TC 330 (HL)"
//      ^^^^ the statute        ^^^^ the case that says what it means
//
// 🔴 AND THE ONE PLACE THAT RENDERED IT DID THIS:  s.authority.split(';')[0]
//
// It took the statute and THREW THE CASE AWAY. We cite the House of Lords and then cut it off at the
// semicolon, so the single strongest thing we have to say about our most contentious rule never
// reached a single user. Not a bug exactly. Just nobody ever asked what the second half was for.
// ---------------------------------------------------------------------------------------------

// A case citation looks like a case citation. [1983] 57 TC 330. [2018] EWCA Civ 2618. "X v Y".
const CASE = /\[\d{4}\]|\bv\b\s+[A-Z]|EWCA|EWHC|UKSC|UKUT|UKFTT|\bHL\b|\bTC\b|\bSTC\b/;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 A STATUTE MUST LOOK LIKE A STATUTE. AND MY FIRST VERSION OF THIS DID NOT CHECK.
//
// It said: anything that is not a case citation is a statute. Which meant this string
//
//     "GOV.UK, Expenses if you are self-employed: Training courses. HMRC BROADENED this in 2024."
//
// was classified as STATUTE, and synthesise() would have told a man that the training rule "rests on
// the law", with the full weight of "Parliament wrote it. Nothing overrides it except Parliament."
//
// It is a GOV.UK page. It is HMRC's opinion. It is the single thinnest kind of authority we have.
//
// So my classifier committed, on its first run, the EXACT SIN THIS FILE EXISTS TO PREVENT: it dressed
// HMRC's guidance up as the law. Six of the fifteen "statutes" were GOV.UK prose I wrote myself this
// morning. The test caught it, and only because the test asserted a fact about the world (the
// training rule has no statute) rather than a fact about the code.
//
// ⚠️ SO THE DEFAULT IS GUIDANCE, AND IT ALWAYS MUST BE.
//
// A thing is a STATUTE only if it names an Act and a section. A thing is a CASE only if it carries a
// citation. EVERYTHING ELSE IS GUIDANCE, including anything we cannot confidently place. The error
// runs one way only: we may understate our own authority. We may never overstate it.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const STATUTE = new RegExp(
  [
    // "s34", "S34(1)(a)", "section 94", "ss15-16"
    '\\bs{1,2}\\.?\\s?\\d+',
    // The Acts a UK tax answer actually rests on. Named, so a GOV.UK page title cannot pass for one.
    '\\bITTOIA\\b', '\\bITEPA\\b', '\\bITA\\s*200[0-9]\\b', '\\bTCGA\\b', '\\bTMA\\b',
    '\\bCTA\\s*20\\d{2}\\b', '\\bCAA\\b', '\\bVATA\\b', '\\bFinance Act\\b', '\\bF\\(No\\.?\\s?2\\)A\\b',
    '\\bCompanies Act\\b', '\\bSchedule\\s+\\d+\\b', '\\bReg(ulation)?\\.?\\s*\\d+',
    '\\bStatutory Instrument\\b', '\\bSI\\s*\\d{4}\\b',
  ].join('|'),
  'i',
);

export function split(authority: string | undefined): { statute: string[]; precedent: string[] } {
  if (!authority) return { statute: [], precedent: [] };

  const parts = authority.split(';').map((p) => p.trim()).filter(Boolean);

  return {
    // A case first: a citation is the strongest signal in the string, and a case note can mention an
    // Act ("Mallalieu v Drummond, on s34") without becoming a statutory reference.
    precedent: parts.filter((p) => CASE.test(p)),
    // ...and a statute must NAME an Act or a section. Prose does not qualify, however authoritative
    // it sounds. This is the line that stops HMRC's opinion from being promoted to Parliament's words.
    statute: parts.filter((p) => !CASE.test(p) && STATUTE.test(p)),
  };
}

// ---------------------------------------------------------------------------------------------
// THE ANSWER, IN LAYERS, STRONGEST FIRST.
// ---------------------------------------------------------------------------------------------

export interface Synthesis {
  rule: string;
  layers: Authority[];
  /** 🔴 The honest headline. What is the STRONGEST thing standing behind this answer? */
  restsOn: Layer;
  /** One sentence a man can read. Never dressed up. */
  says: string;
}

export function synthesise(ruleKey: string): Synthesis | null {
  const sources: RuleSource[] = RULE_SOURCES[ruleKey];
  if (!sources || !sources.length) return null;

  const layers: Authority[] = [];

  // 1. STATUTE. The strongest thing there is, and the only thing that is actually the law.
  const statutes = [...new Set(sources.flatMap((s) => split(s.authority).statute))];
  for (const s of statutes) {
    layers.push({
      layer: 'statute',
      text: s,
      weight: 'This is the law itself. Parliament wrote it. Nothing overrides it except Parliament.',
    });
  }

  // 2. PRECEDENT. What the statute MEANS, decided by a judge, and it binds HMRC whether they like it
  //    or not. This is the layer we were throwing away at a semicolon.
  const cases = [...new Set(sources.flatMap((s) => split(s.authority).precedent))];
  for (const c of cases) {
    layers.push({
      layer: 'precedent',
      text: c,
      weight: 'A court decided what the law means. It binds HMRC. It is stronger than anything on a GOV.UK page.',
    });
  }

  // 3. GUIDANCE. Last, and labelled for what it is.
  for (const s of sources) {
    layers.push({
      layer: 'guidance',
      text: s.quote,
      url: s.url,
      weight: 'HMRC\'s own words. This is what HMRC thinks the law means. It is not the law, and HMRC has been wrong before.',
    });
  }

  // ⚠️ THE HEADLINE IS THE STRONGEST LAYER WE ACTUALLY HAVE, NOT THE ONE WE WISH WE HAD.
  const restsOn: Layer = statutes.length ? 'statute' : cases.length ? 'precedent' : 'guidance';

  return { rule: ruleKey, layers, restsOn, says: headline(restsOn, statutes, cases) };
}

function headline(restsOn: Layer, statutes: string[], cases: string[]): string {
  if (restsOn === 'statute' && cases.length) {
    // The strongest position available: Parliament wrote it, a court said what it means, HMRC agrees.
    return `This one is settled. ${statutes[0]} is the law, ${cases[0]} is the court telling us what it means, and HMRC's guidance says the same.`;
  }
  if (restsOn === 'statute') {
    return `${statutes[0]} is the law. HMRC's guidance agrees with it. No court has had to rule on it.`;
  }
  if (restsOn === 'precedent') {
    return `A court has ruled on this: ${cases[0]}. That binds HMRC.`;
  }

  // 🔴 THE HONEST ONE, AND IT IS THE ONE THAT MATTERS. Ten of our twenty-five rules land here.
  //
  // "HMRC says so, and nothing else" is a perfectly respectable answer. It is also a completely
  // different answer from "the House of Lords decided this", and a man signing his own tax return is
  // entitled to know which of the two he has been given. The training rule we rewrote this morning
  // sits exactly here.
  return 'This rests on HMRC\'s guidance alone. No statute is cited and no court has ruled. That is usually fine, and it is worth knowing, because HMRC\'s view of the law is not the law.';
}

// ---------------------------------------------------------------------------------------------
// 🔴 WHERE ARE WE THINNEST? Counted, not guessed.
// ---------------------------------------------------------------------------------------------
//
// The same discipline as the uncited-rules count that found three broken rules this morning: A GAP
// YOU CAN COUNT IS A GAP YOU WILL CLOSE. A gap you cannot see becomes the mileage rate.
export function depth(): { rule: string; restsOn: Layer }[] {
  return Object.keys(RULE_SOURCES)
    .map((k) => {
      const s = synthesise(k);
      return s ? { rule: k, restsOn: s.restsOn } : null;
    })
    .filter((x): x is { rule: string; restsOn: Layer } => x !== null)
    .sort((a, b) => rank(a.restsOn) - rank(b.restsOn));
}

const rank = (l: Layer) => (l === 'guidance' ? 0 : l === 'precedent' ? 1 : 2);

// What Puchio gets handed. Layers, labelled, in order of authority, so a model can quote the right
// one and cannot mistake HMRC's opinion for Parliament's words.
export function forPrompt(ruleKey: string): string {
  const s = synthesise(ruleKey);
  if (!s) return '';

  const label: Record<Layer, string> = {
    statute: 'THE LAW (statute)',
    precedent: 'A COURT HAS RULED (binds HMRC)',
    guidance: 'HMRC GUIDANCE (HMRC\'s view. NOT the law.)',
  };

  return [
    `AUTHORITY FOR THIS ANSWER, strongest first. ${s.says}`,
    ...s.layers.map((l) => `  [${label[l.layer]}] ${l.text}${l.url ? ` (${l.url})` : ''}`),
    '',
    'If the guidance and the law disagree, SAY SO and tell him the law wins. Do not smooth it over.',
  ].join('\n');
}
