'use client';

import { useMemo, useState } from 'react';
import LeadCapture from '../../components/LeadCapture';

// Fully client side. No AI, no server, no cost. The browser does the maths and
// the "Save as PDF" is the browser's own print to PDF, so it never calls us.

const INK = 'var(--tx)';
const RIVER = 'var(--river)';
const RIVER_DEEP = 'var(--river-deep)';
const RIVER_TINT = 'var(--river-tint)';
const GREEN = 'var(--green)';
const MUTED = 'var(--tx-mut)';
const LINE = 'var(--bd)';
const SURFACE = 'var(--surface)';

type DocType = 'invoice' | 'quote';
interface Item { desc: string; qty: string; price: string }
interface Preset {
  label: string;
  fromName: string;
  fromDetails: string;
  toName: string;
  toDetails: string;
  vat: boolean;
  notes: string;
  items: Item[];
}

// Ready built, ready to use. Load one, change the names, send it.
const PRESETS: Preset[] = [
  {
    label: 'Electrician',
    fromName: 'Bright Spark Electrical',
    fromDetails: '7 Mill Lane, Leeds, LS1 4AB\n07700 900123\nhello@brightspark.co.uk\nSort 12-34-56  Acc 12345678',
    toName: 'Mr D Wilson',
    toDetails: '14 Oak Road, Leeds, LS6 2BT',
    vat: false,
    notes: 'Payment within 14 days by bank transfer. Thank you for your business.',
    items: [
      { desc: 'Full rewire, 3 bed house, labour', qty: '1', price: '1850' },
      { desc: 'Consumer unit and materials', qty: '1', price: '420' },
      { desc: 'Part P certification', qty: '1', price: '90' },
    ],
  },
  {
    label: 'Plumber',
    fromName: 'Mainline Plumbing & Heating',
    fromDetails: '22 Field Street, Bristol, BS2 9QP\n07700 900456\nbookings@mainline.co.uk\nSort 11-22-33  Acc 87654321',
    toName: 'Mrs S Khan',
    toDetails: '5 Elmhurst Avenue, Bristol, BS6 7DR',
    vat: false,
    notes: 'Payment due on completion. Parts guaranteed 12 months.',
    items: [
      { desc: 'Boiler service and labour', qty: '1', price: '95' },
      { desc: 'Replacement thermostatic valve', qty: '2', price: '38' },
    ],
  },
  {
    label: 'Builder',
    fromName: 'Sterling Build Ltd',
    fromDetails: 'Unit 4 Trade Park, Manchester, M1 2WX\n07700 900789\noffice@sterlingbuild.co.uk\nSort 20-30-40  Acc 11223344',
    toName: 'Mr & Mrs Taylor',
    toDetails: '88 Brook Lane, Manchester, M20 3JH',
    vat: true,
    notes: 'Stage payment 1 of 3. Net 7 days. VAT registered, number 123 4567 89.',
    items: [
      { desc: 'Single storey extension, groundworks and labour', qty: '1', price: '6400' },
      { desc: 'Materials, blocks, cement, steels', qty: '1', price: '2100' },
    ],
  },
  {
    label: 'Painter & Decorator',
    fromName: 'Finer Finish Decorating',
    fromDetails: '3 Hill Top, Glasgow, G12 8QQ\n07700 900222\nfinerfinish@email.co.uk\nSort 80-11-22  Acc 55667788',
    toName: 'Ms A Murray',
    toDetails: '19 Crown Terrace, Glasgow, G12 9HG',
    vat: false,
    notes: 'Half on start, half on completion. Paint included.',
    items: [
      { desc: 'Hallway, stairs and landing, prep and two coats', qty: '1', price: '780' },
      { desc: 'Paint and sundries', qty: '1', price: '120' },
    ],
  },
  {
    label: 'Cleaner',
    fromName: 'Spotless Home Services',
    fromDetails: '12 Vale Road, Birmingham, B14 7QA\n07700 900333\nspotless@email.co.uk\nSort 09-01-29  Acc 33445566',
    toName: 'Mr J Patel',
    toDetails: '40 Sycamore Drive, Birmingham, B27 6LP',
    vat: false,
    notes: 'Weekly clean. Payment by standing order each Friday.',
    items: [
      { desc: 'Deep clean, 4 hours', qty: '4', price: '18' },
      { desc: 'Oven clean', qty: '1', price: '45' },
    ],
  },
  {
    label: 'Gardener',
    fromName: 'Green & Tidy Garden Care',
    fromDetails: '6 Meadow Way, Norwich, NR2 3RT\n07700 900444\ngreenandtidy@email.co.uk\nSort 07-08-09  Acc 99887766',
    toName: 'Mrs P Edwards',
    toDetails: '2 Riverside Close, Norwich, NR1 1AA',
    vat: false,
    notes: 'Cash or transfer on the day. Green waste removed.',
    items: [
      { desc: 'Garden tidy, hedges and lawn, labour', qty: '1', price: '160' },
      { desc: 'Green waste removal', qty: '1', price: '40' },
    ],
  },
  {
    label: 'Mobile hairdresser',
    fromName: 'Hair by Sophie',
    fromDetails: '31 Park Crescent, Leeds, LS8 2DF\n07700 900555\nhairbysophie@email.co.uk\nSort 04-00-04  Acc 12121212',
    toName: 'Ms L Roberts',
    toDetails: '9 Beech Grove, Leeds, LS6 3PN',
    vat: false,
    notes: 'Payment on the day, cash or transfer.',
    items: [
      { desc: 'Cut and blow dry', qty: '1', price: '38' },
      { desc: 'Full head colour', qty: '1', price: '65' },
    ],
  },
  {
    label: 'Handyman',
    fromName: 'Fix It Right',
    fromDetails: '18 Station Road, Cardiff, CF10 2BX\n07700 900666\nfixitright@email.co.uk\nSort 30-90-12  Acc 45674567',
    toName: 'Mr R Hughes',
    toDetails: '27 Maple Street, Cardiff, CF11 9LJ',
    vat: false,
    notes: 'Payment on completion. Small jobs welcome.',
    items: [
      { desc: 'Half day labour, various repairs', qty: '1', price: '140' },
      { desc: 'Materials', qty: '1', price: '35' },
    ],
  },
];

const BLANK: Preset = {
  label: 'Blank',
  fromName: '',
  fromDetails: '',
  toName: '',
  toDetails: '',
  vat: false,
  notes: 'Payment within 14 days by bank transfer. Thank you.',
  items: [{ desc: '', qty: '1', price: '' }],
};

function gbp(n: number): string {
  return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function plusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const inputStyle: React.CSSProperties = { width: '100%', border: `1.5px solid ${LINE}`, borderRadius: 10, padding: '11px 12px', fontSize: 14.5, color: INK, background: 'var(--panel)', outline: 'none', fontFamily: 'inherit' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: INK, marginBottom: 6 };

export default function Generator() {
  const [docType, setDocType] = useState<DocType>('invoice');
  const [fromName, setFromName] = useState(PRESETS[0].fromName);
  const [fromDetails, setFromDetails] = useState(PRESETS[0].fromDetails);
  const [toName, setToName] = useState(PRESETS[0].toName);
  const [toDetails, setToDetails] = useState(PRESETS[0].toDetails);
  const [number, setNumber] = useState('0001');
  const [date, setDate] = useState('');
  const [due, setDue] = useState('');
  // Seed dates on the client after mount so the server-rendered HTML and the client
  // agree (new Date() on the server vs browser can differ across the day boundary).
  React.useEffect(() => { setDate(todayISO()); setDue(plusDays(14)); }, []);
  const [vat, setVat] = useState(PRESETS[0].vat);
  const [vatRate, setVatRate] = useState('20');
  const [notes, setNotes] = useState(PRESETS[0].notes);
  const [items, setItems] = useState<Item[]>(PRESETS[0].items);

  function loadPreset(p: Preset) {
    setFromName(p.fromName);
    setFromDetails(p.fromDetails);
    setToName(p.toName);
    setToDetails(p.toDetails);
    setVat(p.vat);
    setNotes(p.notes);
    setItems(p.items.length ? p.items : [{ desc: '', qty: '1', price: '' }]);
  }

  function updateItem(i: number, key: keyof Item, value: string) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));
  }
  function addItem() {
    setItems((arr) => [...arr, { desc: '', qty: '1', price: '' }]);
  }
  function removeItem(i: number) {
    setItems((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr));
  }

  const { subtotal, vatAmount, total } = useMemo(() => {
    const sub = items.reduce((s, it) => s + Math.round((parseFloat(it.qty || '0') || 0) * (parseFloat(it.price || '0') || 0) * 100) / 100, 0);
    const v = vat ? sub * ((parseFloat(vatRate || '0') || 0) / 100) : 0;
    return { subtotal: sub, vatAmount: v, total: sub + v };
  }, [items, vat, vatRate]);

  const docWord = docType === 'invoice' ? 'Invoice' : 'Quote';

  return (
    <div>
      <style>{`
        @media print {
          .no-print{display:none !important;}
          .paper{box-shadow:none !important;border:none !important;margin:0 !important;max-width:100% !important;}
          @page{margin:14mm;}
        }
        .gen-grid{display:grid;grid-template-columns:minmax(0,420px) minmax(0,1fr);gap:28px;align-items:start;}
        @media(max-width:900px){.gen-grid{grid-template-columns:1fr;}}
        /* The invoice is a document: keep it a white printable page in any theme. */
        .paper{--panel:#FFFFFF;--bg:#FBFAF7;--surface:#F2F0EA;--bd:#E7E3D9;--tx:#111111;--tx-mut:#5B6470;--river:#1B59A6;--river-deep:#134277;--green:#15803D;--red:#C0392B;background:#FFFFFF;color:#111111;}
      `}</style>

      <div className="gen-grid">
        {/* Controls */}
        <div className="no-print">
          <div style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 16, padding: 22 }}>
            <div style={{ display: 'inline-flex', background: SURFACE, borderRadius: 12, padding: 4, marginBottom: 18 }}>
              {(['invoice', 'quote'] as DocType[]).map((d) => (
                <button key={d} onClick={() => setDocType(d)} style={{ border: 'none', cursor: 'pointer', padding: '9px 18px', borderRadius: 9, fontSize: 14, fontWeight: 700, fontFamily: 'inherit', background: docType === d ? 'var(--surface)' : 'transparent', color: docType === d ? INK : MUTED, boxShadow: docType === d ? '0 2px 8px rgba(0,0,0,.10)' : 'none' }}>{d === 'invoice' ? 'Invoice' : 'Quote'}</button>
              ))}
            </div>

            <label style={labelStyle}>Start from a ready made template</label>
            <select onChange={(e) => { const p = e.target.value === 'blank' ? BLANK : PRESETS[parseInt(e.target.value, 10)]; if (p) loadPreset(p); }} defaultValue="0" style={{ ...inputStyle, marginBottom: 20 }}>
              {PRESETS.map((p, i) => (<option key={p.label} value={i}>{p.label}</option>))}
              <option value="blank">Blank, start fresh</option>
            </select>

            <label style={labelStyle}>Your business</label>
            <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your business name" style={{ ...inputStyle, marginBottom: 8 }} />
            <textarea value={fromDetails} onChange={(e) => setFromDetails(e.target.value)} placeholder="Address, phone, email, bank details" rows={4} style={{ ...inputStyle, marginBottom: 18, resize: 'vertical' }} />

            <label style={labelStyle}>Bill to</label>
            <input value={toName} onChange={(e) => setToName(e.target.value)} placeholder="Customer name" style={{ ...inputStyle, marginBottom: 8 }} />
            <textarea value={toDetails} onChange={(e) => setToDetails(e.target.value)} placeholder="Customer address" rows={2} style={{ ...inputStyle, marginBottom: 18, resize: 'vertical' }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
              <div>
                <label style={labelStyle}>{docWord} number</label>
                <input value={number} onChange={(e) => setNumber(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Date</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {docType === 'invoice' ? (
              <div style={{ marginBottom: 18 }}>
                <label style={labelStyle}>Payment due</label>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} />
              </div>
            ) : null}

            <label style={labelStyle}>Lines</label>
            {items.map((it, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 52px 76px 28px', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                <input value={it.desc} onChange={(e) => updateItem(i, 'desc', e.target.value)} placeholder="Description" style={{ ...inputStyle, padding: '9px 10px' }} />
                <input value={it.qty} onChange={(e) => updateItem(i, 'qty', e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="Qty" style={{ ...inputStyle, padding: '9px 6px', textAlign: 'center' }} />
                <input value={it.price} onChange={(e) => updateItem(i, 'price', e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} placeholder="£ each" style={{ ...inputStyle, padding: '9px 8px', textAlign: 'right' }} />
                <button onClick={() => removeItem(i)} aria-label="Remove line" style={{ border: `1px solid ${LINE}`, background: 'var(--panel)', borderRadius: 8, cursor: 'pointer', color: MUTED, fontSize: 16, height: 38 }}>×</button>
              </div>
            ))}
            <button onClick={addItem} style={{ border: `1px dashed ${RIVER}`, background: RIVER_TINT, color: RIVER_DEEP, borderRadius: 10, padding: '10px 0', width: '100%', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit', marginBottom: 18 }}>+ Add a line</button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: INK, cursor: 'pointer' }}>
                <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} /> Add VAT
              </label>
              {vat ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input value={vatRate} onChange={(e) => setVatRate(e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'))} style={{ ...inputStyle, width: 64, padding: '8px 8px', textAlign: 'center' }} />
                  <span style={{ fontSize: 14, color: MUTED }}>%</span>
                </div>
              ) : null}
            </div>

            <label style={labelStyle}>Notes and payment terms</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />

            <button onClick={() => window.print()} style={{ marginTop: 20, width: '100%', background: RIVER, color: '#fff', border: 'none', borderRadius: 12, padding: '15px 0', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Download or print {docWord.toLowerCase()}</button>
            <p style={{ fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 10 }}>Free, no signup. Choose &ldquo;Save as PDF&rdquo; in the print window.</p>
          </div>
        </div>

        {/* Live preview, the printable paper */}
        <div className="paper" style={{ background: 'var(--panel)', border: `1px solid ${LINE}`, borderRadius: 14, padding: '40px 38px', boxShadow: '0 18px 50px rgba(17,17,17,.08)', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: INK, letterSpacing: '-0.4px' }}>{fromName || 'Your business name'}</div>
              <div style={{ fontSize: 13, color: MUTED, whiteSpace: 'pre-line', marginTop: 6, lineHeight: 1.5 }}>{fromDetails || 'Your address and contact details'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: RIVER, letterSpacing: '1px', textTransform: 'uppercase' }}>{docWord}</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{docWord} no. {number || '0001'}</div>
              <div style={{ fontSize: 13, color: MUTED }}>Date: {prettyDate(date)}</div>
              {docType === 'invoice' ? <div style={{ fontSize: 13, color: MUTED }}>Due: {prettyDate(due)}</div> : null}
            </div>
          </div>

          <div style={{ height: 1, background: LINE, margin: '26px 0' }} />

          <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{docType === 'invoice' ? 'Bill to' : 'Prepared for'}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: INK }}>{toName || 'Customer name'}</div>
          <div style={{ fontSize: 13, color: MUTED, whiteSpace: 'pre-line', marginTop: 2, lineHeight: 1.5 }}>{toDetails || 'Customer address'}</div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 24, fontSize: 13.5 }}>
            <thead>
              <tr style={{ background: SURFACE }}>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 700, color: INK }}>Description</th>
                <th style={{ textAlign: 'center', padding: '10px 8px', fontWeight: 700, color: INK, width: 50 }}>Qty</th>
                <th style={{ textAlign: 'right', padding: '10px 10px', fontWeight: 700, color: INK, width: 90 }}>Unit</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontWeight: 700, color: INK, width: 100 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const amt = (parseFloat(it.qty || '0') || 0) * (parseFloat(it.price || '0') || 0);
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${SURFACE}` }}>
                    <td style={{ padding: '11px 12px', color: INK }}>{it.desc || ' '}</td>
                    <td style={{ padding: '11px 8px', textAlign: 'center', color: MUTED }}>{it.qty || '0'}</td>
                    <td style={{ padding: '11px 10px', textAlign: 'right', color: MUTED }}>{gbp(parseFloat(it.price || '0') || 0)}</td>
                    <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 600, color: INK }}>{gbp(amt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <div style={{ width: 260 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: MUTED }}><span>Subtotal</span><span>{gbp(subtotal)}</span></div>
              {vat ? <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14, color: MUTED }}><span>VAT {vatRate || '0'}%</span><span>{gbp(vatAmount)}</span></div> : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 0', marginTop: 6, borderTop: `2px solid ${INK}`, fontSize: 18, fontWeight: 800, color: INK }}><span>Total</span><span>{gbp(total)}</span></div>
            </div>
          </div>

          {notes ? (
            <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${LINE}` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 13.5, color: INK, whiteSpace: 'pre-line', lineHeight: 1.55 }}>{notes}</div>
            </div>
          ) : null}

          <div style={{ marginTop: 26, textAlign: 'center', fontSize: 11.5, color: '#A8AFB8' }}>Made free with Lekhio · lekhio.com</div>
        </div>
      </div>
      <div className="no-print" style={{ maxWidth: 900, margin: '22px auto 0' }}>
        <LeadCapture
          source="invoice-generator"
          heading="Never miss a tax deadline"
          sub="Invoice sorted. Now let us keep you right on the tax side. Pop your email in for MTD deadline reminders and money saving tips. No spam, unsubscribe any time."
          resultNote="used invoice generator"
        />
      </div>
    </div>
  );
}
