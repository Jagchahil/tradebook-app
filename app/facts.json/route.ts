// Serves /facts.json: every tax constant Lekhio computes with, as machine readable JSON.
//
// WHO READS THIS. Khoji, the knowledge watcher on the Mac mini (docs/105). Once a night it
// fetches this file, fetches the primary GOV.UK page for each figure, and compares the two.
// When they disagree it raises an incident. That comparison is the entire reason Khoji exists:
// anyone can scrape GOV.UK, but only we can say "GOV.UK says 55p and OUR CODE says 45p".
//
// WHY A ROUTE AND NOT A VENDORED facts.json ON THE MINI. A copied file needs a sync step, and a
// sync step that is skipped once leaves the differ checking last month's engine against this
// month's law and reporting all clear. There is no sync step here. This is generated from the
// same FACTS object the calculator, the app and the WhatsApp answers use, at build time, so it
// is the engine or it is nothing.
//
// WHY NOT REUSE /llms.txt (which doc 105 suggested). llms.txt is prose written for language
// models. Parsing "£12,570" back out of an English sentence means writing a second fragile
// extractor and pointing it at ourselves, and it only carries seven figures. This carries all
// of them, exactly, with no parsing. llms.txt stays as it is and stays tested against FACTS.
//
// DIRECTION OF TRAVEL. The mini reaches into production. Production NEVER reaches out to the
// mini (docs/105 rule 2). A power cut in a flat must not take down tax answers for anyone.
//
// IS THIS SAFE TO PUBLISH? Yes. Every value below is published UK tax law. It is on GOV.UK. We
// already print most of it in /llms.txt and on the free calculators. There is nothing here that
// is ours except the decision of which figures to hold.

import { FACTS, TAX_YEAR, TAX_YEAR_VALID_UNTIL } from '../../lib/taxengine';

export const dynamic = 'force-static';

// The file lib/taxengine.ts lives at, as the differ should report it to a human. If the engine
// moves, this string moves with it, because an incident that says "fix line 70 of a file that no
// longer exists" is an incident nobody can act on.
const ENGINE_FILE = 'lib/taxengine.ts';

// PARITY. The sole trader maths is duplicated by hand in the mobile app (see the warning at the
// top of lib/taxengine.ts). Any drift the differ finds has to be fixed in BOTH files or the app
// and the website will quietly disagree about a man's tax bill. The differ prints both paths.
const PARITY_FILE = 'tradebook-app/lib/tax.ts';

export const BODY = JSON.stringify(
  {
    _comment:
      'Lekhio tax constants, generated from lib/taxengine.ts. Read by Khoji to check our engine against GOV.UK. We prepare, the user approves. Not HMRC, not endorsed by HMRC.',
    taxYear: TAX_YEAR,
    validUntil: TAX_YEAR_VALID_UNTIL,
    engineFile: ENGINE_FILE,
    parityFile: PARITY_FILE,
    generatedFrom: 'lib/taxengine.ts FACTS',
    facts: FACTS,
  },
  null,
  2,
);

export function GET() {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
