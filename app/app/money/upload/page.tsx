import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { userFromSessionCookie } from '../../../../lib/webauth';
import { SESSION_COOKIE } from '../../../../lib/websession';
import { hasClaudeConfig } from '../../../../lib/claude';
import { gateForUser } from '../../../../lib/gateserver';
import { READONLY_TITLE, READONLY_LINE } from '../../../../lib/gate';
import {
  A11Y_CSS, APP_CSS, BREAK, FONT, MOTION, RADIUS, SPACE, TYPE,
} from '../../../../lib/tokens';
import {
  INK, LINE, MUTED, ON_RIVER, PANEL, PAPER, RIVER, RIVER_DEEP, SURFACE,
} from '../../../../lib/apptheme';
import { AppNav } from '../../AppNav';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// THE ONE DOOR FOR UPLOADS. Receipts and statements together, as many as he has.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY, 12 AUGUST 2026. The founder sat where a customer sits, with a folder of receipts and a
// bank export, and the product made him open one door for the photographs, another for the
// CSV, and feed every file through alone. He stopped half way and said so. Two doors asking
// him to sort his own paperwork was the product handing him its job (doc 103: the best button
// is no button). So: one door, one picker, the multiple attribute, and the sorting is ours.
//
// ⚠️ THE PLAIN FORM STILL WORKS WITHOUT SCRIPT. The doctrine on the two old pages stands: a
// page that cannot accept a file on a bad signal is no use to a man on a building site. The
// form posts as ordinary multipart and the route walks what one request can honestly carry.
// The script, where it runs, takes the same form and streams the files ONE REQUEST EACH, so a
// hundred photographs do not have to fit in one request body, and each file's verdict lands on
// the screen as it is read. Same route, same walks, same words either way.
//
// ⚠️ THE OLD DOORS STAY STANDING. /app/money/capture and /app/money/import still work for
// open tabs and old bookmarks. What changed is the Money page: it offers ONE row now, this
// one, because two rows asking him to pre-sort his files was the very thing being removed.
// ═══════════════════════════════════════════════════════════════════════════════════════════

function noticeLine(problem: string | undefined, locked: string | undefined): string | null {
  if (locked === '1') return null;
  switch (problem) {
    case 'bad':
      return 'That upload did not arrive whole. Nothing was saved, so try it again.';
    default:
      return null;
  }
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const jar = await cookies();
  const user = await userFromSessionCookie(jar.get(SESSION_COOKIE)?.value ?? null);
  if (!user) redirect('/in?next=%2Fapp%2Fmoney%2Fupload');

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const said = noticeLine(one('problem'), one('locked'));

  // The counts from the route, taken only as small honest integers, the import page's rule.
  const num = (k: string): number => {
    const n = Number(one(k));
    return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : 0;
  };
  const done = one('done') === '1';
  const logged = num('logged');
  const merged = num('merged');
  const already = num('already');
  const unread = num('unread');
  const stmts = num('stmts');
  const read = num('read');
  const fresh = num('fresh');
  const review = num('review');
  const known = num('known');
  const skipped = num('skipped');
  const typebad = num('typebad');
  const toobig = num('toobig');
  const budget = num('budget');
  const slow = num('slow');
  const failed = num('failed');
  const off = num('off');
  const left = num('left');
  const waiting = logged + review;

  const gate = await gateForUser(user.id);
  const locked = gate === 'readonly';
  const configured = hasClaudeConfig();

  return (
    <main className="lek-wrap" style={S.wrap}>
      <style>{CSS}</style>

      <AppNav current="/app/money/upload" />

      {said ? <p style={S.said}>{said}</p> : null}

      {done ? (
        <section className="lek-card" style={S.result}>
          <h1 className="lek-title">Here is what I read.</h1>
          {logged > 0 ? (
            <p style={S.line}>{logged === 1 ? 'One receipt' : `${logged} receipts`} read and written down.</p>
          ) : null}
          {merged > 0 ? (
            <p style={S.line}>{merged === 1 ? 'One receipt' : `${merged} receipts`} matched a payment your bank already sent me, and {merged === 1 ? 'is' : 'are'} with it now rather than counted twice.</p>
          ) : null}
          {already > 0 ? (
            <p style={S.line}>{already === 1 ? 'One was' : `${already} were`} already given to me before, so nothing was added twice.</p>
          ) : null}
          {stmts > 0 ? (
            <p style={S.line}>
              {stmts === 1 ? 'One statement' : `${stmts} statements`}: {read} payments read, {fresh} new{known > 0 ? `, ${known} already in your books` : ''}{skipped > 0 ? `, ${skipped} lines that were not money` : ''}.
            </p>
          ) : null}
          {unread > 0 ? (
            <p style={S.line}>{unread === 1 ? 'One photo' : `${unread} photos`} I could not read. A clearer photograph with the total showing usually does it.</p>
          ) : null}
          {typebad > 0 ? (
            <p style={S.line}>{typebad === 1 ? 'One file was' : `${typebad} files were`} neither a photo nor a CSV, so I left {typebad === 1 ? 'it' : 'them'} alone.</p>
          ) : null}
          {toobig > 0 ? (
            <p style={S.line}>{toobig === 1 ? 'One file was' : `${toobig} files were`} over four megabytes, which is my limit.</p>
          ) : null}
          {budget > 0 ? (
            <p style={S.line}>{budget === 1 ? 'One photo' : `${budget} photos`} had to wait: that is all the reading I can afford today. Tomorrow is fine.</p>
          ) : null}
          {slow > 0 ? (
            <p style={S.line}>{slow === 1 ? 'One' : `${slow}`} hit the speed limit. Give it a few minutes and send {slow === 1 ? 'it' : 'them'} again.</p>
          ) : null}
          {failed > 0 ? (
            <p style={S.line}>{failed === 1 ? 'One did' : `${failed} did`} not save. Nothing changed for {failed === 1 ? 'it' : 'them'}, so try {failed === 1 ? 'it' : 'them'} again.</p>
          ) : null}
          {off > 0 ? (
            <p style={S.line}>Receipt reading is not switched on yet, so {off === 1 ? 'one photo' : `${off} photos`} waited.</p>
          ) : null}
          {left > 0 ? (
            <p style={S.line}>{left === 1 ? 'One file' : `${left} files`} did not fit this go. Send {left === 1 ? 'it' : 'them'} in the next one.</p>
          ) : null}
          {waiting > 0 ? (
            <a href="/app/pile" style={S.go}>Go and answer {waiting === 1 ? 'it' : 'them'}</a>
          ) : null}
        </section>
      ) : null}

      {locked ? (
        <section style={S.locked}>
          <span style={S.lockedTop}>{READONLY_TITLE}</span>
          <span style={S.lockedBody}>{READONLY_LINE}</span>
          <form action="/api/billing/checkout" method="post" style={{ marginTop: 12 }}>
            <button type="submit" style={S.lockedBtn}>Add a card</button>
          </form>
        </section>
      ) : (
        <section className="lek-card">
          <h1 className="lek-title">Your paperwork, in one go</h1>
          <p style={S.lead}>
            Receipts, till slips and bank statement CSVs, together. Pick everything at once and
            I will sort out which is which.
          </p>
          <p style={S.sub}>
            Photos are read for the shop, the total and the date. CSVs are read row by row.
            Everything lands waiting for your yes, and nothing counts until you give it.
            {configured ? '' : ' Receipt reading is not switched on yet, so today it is statements only.'}
          </p>

          <form id="lek-upload" action="/api/money/upload" method="post" encType="multipart/form-data">
            <label htmlFor="files" style={S.label}>Photographs and CSV files, as many as you like.</label>
            <input id="files" name="files" type="file" accept="image/*,.csv,text/csv" multiple required className="lek-field" />
            <button id="lek-upload-go" type="submit" className="lek-primary">Read them</button>
          </form>

          <ul id="lek-upload-list" style={S.list}></ul>
          <p id="lek-upload-summary" style={S.line}></p>
          <a id="lek-upload-pile" href="/app/pile" style={{ ...S.go, display: 'none' }}>Go and answer them</a>

          <p style={S.small}>
            One photograph per receipt, with the total showing. The same statement twice, or a
            receipt your bank already sent me, never doubles up.
          </p>

          {/* THE ENHANCEMENT, NOT THE MECHANISM. Where script runs, the same form streams the
              same files to the same route one request each, so a folder of photographs is not
              asked to fit one request body, and each file's verdict lands as it is read. Where
              script does not run, the form above posts plainly and the route walks what one
              request carries. Nothing here is required for the door to work. */}
          <script dangerouslySetInnerHTML={{ __html: ENHANCE }} />
        </section>
      )}
    </main>
  );
}

// Plain vanilla, no framework, small enough to read whole. Sentences match the route's
// verdicts one for one, so the two modes cannot drift into two vocabularies.
const ENHANCE = `
(function () {
  var form = document.getElementById('lek-upload');
  var input = document.getElementById('files');
  var go = document.getElementById('lek-upload-go');
  var list = document.getElementById('lek-upload-list');
  var summary = document.getElementById('lek-upload-summary');
  var pile = document.getElementById('lek-upload-pile');
  if (!form || !input || !go || !list || !summary || !pile) return;

  var SAY = {
    logged: 'read and written down',
    merged: 'your bank already sent this payment, so the receipt is with it now',
    already: 'you have already given me this one, nothing added twice',
    unread: 'I could not read this one. A clearer photo with the total showing usually does it',
    big: 'too big for me. Anything under four megabytes is fine',
    budget: 'that is all the reading I can afford today. Tomorrow is fine',
    slow: 'too many at once. Give it a few minutes and send this one again',
    off: 'receipt reading is not switched on yet',
    failed: 'that did not save. Nothing changed, so try it again',
    rejected: 'I could not read this as a bank statement export',
    type: 'neither a photo nor a CSV, so I left it alone'
  };

  form.addEventListener('submit', function (e) {
    if (!input.files || input.files.length === 0) return;
    e.preventDefault();
    var files = Array.prototype.slice.call(input.files);
    var waiting = 0;
    go.disabled = true;
    go.textContent = 'Reading...';
    list.innerHTML = '';
    summary.textContent = '';
    pile.style.display = 'none';

    var i = 0;
    function next() {
      if (i >= files.length) {
        go.disabled = false;
        go.textContent = 'Read them';
        summary.textContent = 'Done: ' + files.length + (files.length === 1 ? ' file.' : ' files.')
          + (waiting > 0 ? ' ' + waiting + ' waiting for your yes.' : '');
        if (waiting > 0) pile.style.display = 'inline-block';
        input.value = '';
        return;
      }
      var f = files[i];
      i += 1;
      var li = document.createElement('li');
      li.textContent = f.name + ': reading...';
      list.appendChild(li);
      var fd = new FormData();
      fd.append('files', f);
      fd.append('mass', '1');
      fetch('/api/money/upload', { method: 'POST', body: fd })
        .then(function (r) { return r.json(); })
        .then(function (v) {
          if (v && v.kind === 'statement' && v.outcome === 'done') {
            li.textContent = f.name + ': statement read. ' + v.read + ' payments, ' + v.fresh
              + ' new, ' + v.review + ' waiting for your yes.';
            waiting += v.review || 0;
          } else {
            var word = v && SAY[v.outcome] ? SAY[v.outcome] : SAY.failed;
            li.textContent = f.name + ': ' + word + '.';
            if (v && v.outcome === 'logged') waiting += 1;
          }
        })
        .catch(function () {
          li.textContent = f.name + ': ' + SAY.failed + '.';
        })
        .then(next);
    }
    next();
  });
})();
`;

const CSS = [
  A11Y_CSS,
  APP_CSS,
  `.lek-title{font-size:${TYPE.lead}px;line-height:1.3;font-weight:800;letter-spacing:-0.02em;margin:0 0 ${SPACE.xs}px}`,
  `.lek-field{width:100%;box-sizing:border-box;padding:${SPACE.sm}px;font-size:16px;font-family:${FONT};border:1.5px solid ${LINE};border-radius:${RADIUS.md}px;color:${INK};background:${PANEL}}`,
  `.lek-primary{width:100%;margin-top:${SPACE.sm}px;padding:14px ${SPACE.md}px;font-size:${TYPE.body}px;font-weight:700;font-family:${FONT};color:${ON_RIVER};background:${RIVER};border:none;border-radius:${RADIUS.md}px;cursor:pointer;transition:background-color ${MOTION.quick} ${MOTION.ease}}`,
  `.lek-primary:hover{background:${RIVER_DEEP}}`,
  `.lek-primary:disabled{opacity:0.6;cursor:default}`,
  `@media(min-width:${BREAK.desk}px){
    .lek-title{font-size:${TYPE.stat}px}
    .lek-field{max-width:420px}
    .lek-primary{width:auto;min-width:264px}
  }`,
].join('');

const S: Record<string, React.CSSProperties> = {
  wrap: { minHeight: '100dvh', background: PAPER, fontFamily: FONT, color: INK },

  said: { fontSize: TYPE.body, lineHeight: 1.55, color: INK, background: SURFACE, borderRadius: RADIUS.md, padding: '12px 14px', margin: '0 0 14px' },
  result: { marginBottom: 14 },
  line: { fontSize: TYPE.body, lineHeight: 1.6, color: INK, margin: '10px 0 0' },
  list: { fontSize: TYPE.body, lineHeight: 1.7, color: INK, margin: '12px 0 0', paddingLeft: 20 },
  go: { display: 'inline-block', marginTop: 12, color: ON_RIVER, background: RIVER, fontWeight: 700, textDecoration: 'none', borderRadius: RADIUS.md, padding: '11px 18px' },

  locked: { display: 'block', background: SURFACE, border: `1px solid ${LINE}`, borderRadius: RADIUS.lg, padding: '15px 16px', marginBottom: 14 },
  lockedTop: { display: 'block', fontSize: TYPE.label, fontWeight: 800, letterSpacing: '0.3px', color: INK, marginBottom: 5 },
  lockedBody: { display: 'block', fontSize: TYPE.body, lineHeight: 1.55, color: INK },
  lockedBtn: { background: RIVER, color: ON_RIVER, border: 'none', borderRadius: RADIUS.md, fontFamily: FONT, fontSize: TYPE.body, fontWeight: 800, padding: '11px 18px', cursor: 'pointer' },

  lead: { fontSize: TYPE.strong, lineHeight: 1.5, fontWeight: 700, margin: '0 0 8px' },
  sub: { fontSize: TYPE.body, lineHeight: 1.6, color: MUTED, margin: '0 0 14px' },
  small: { fontSize: TYPE.note, lineHeight: 1.55, color: MUTED, margin: '14px 0 0' },

  label: { display: 'block', fontSize: TYPE.label, fontWeight: 700, color: MUTED, margin: '4px 0 6px' },
};
