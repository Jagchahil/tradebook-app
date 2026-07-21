'use client';

// PLAYBOOK — the support brain, and now the place you edit it. Search a topic, find the matching and
// related answers, sharpen one with AI, and save. Add new ones as questions come in. This is the master
// copy: the desk grounds its drafts and fills its pick-list from here, and a mini job mirrors it back
// into your Obsidian vault so your brain always holds a readable copy. Team-gated, no customer data.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { browserSupabase } from '../../../lib/supabasebrowser';
import { C, T, S as U } from '../ui';
import TeamShell from '../TeamShell';

interface Entry {
  id: string;
  title: string;
  body: string;
  keywords: string[];
  updatedAt: string;
}
type Draft = { title: string; keywords: string; body: string };

function score(e: Entry, q: string): number {
  if (!q) return 1;
  const t = q.toLowerCase();
  let s = 0;
  if (e.title.toLowerCase().includes(t)) s += 3;
  for (const k of e.keywords) if (k.toLowerCase().includes(t)) s += 2;
  if (e.body.toLowerCase().includes(t)) s += 1;
  return s;
}

export default function PlaybookPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [missingFaqs, setMissingFaqs] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<Draft | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data } = await browserSupabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const pull = useCallback(async () => {
    const tok = await token();
    if (!tok) return;
    try {
      const res = await fetch('/api/team/support-kb', { headers: { Authorization: `Bearer ${tok}` } });
      if (res.ok) {
        const j = (await res.json()) as { entries?: Entry[]; health?: { missingFaqs?: string[] } };
        setEntries(j.entries ?? []);
        setMissingFaqs(j.health?.missingFaqs ?? []);
      }
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await pull(); })();
    return () => { alive = false; };
  }, [pull]);

  const draftFor = (e: Entry): Draft =>
    edits[e.id] ?? { title: e.title, keywords: e.keywords.join(', '), body: e.body };
  const setDraft = (id: string, patch: Partial<Draft>) =>
    setEdits((m) => ({ ...m, [id]: { ...(m[id] ?? { title: '', keywords: '', body: '' }), ...patch } }));

  const results = useMemo(() => {
    const scored = entries.map((e) => ({ e, s: score(e, query.trim()) })).filter((x) => x.s > 0);
    scored.sort((a, b) => b.s - a.s || a.e.title.localeCompare(b.e.title));
    return scored.map((x) => x.e);
  }, [entries, query]);

  async function save(id: string | null, d: Draft) {
    const key = id ?? '__new__';
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null); setNote(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [key]: false })); return; }
    try {
      const res = await fetch('/api/team/support-kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ id: id ?? undefined, title: d.title, keywords: d.keywords, body: d.body }),
      });
      const j = (await res.json().catch(() => ({}))) as { entry?: Entry; error?: string };
      if (res.ok && j.entry) {
        setEntries((list) => {
          const without = list.filter((x) => x.id !== j.entry!.id);
          return [j.entry!, ...without];
        });
        if (id) setEdits((m) => { const n = { ...m }; delete n[id]; return n; });
        else setAdding(null);
        setNote('Saved.');
      } else {
        setError(j.error || 'That did not save. Try again.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  async function improve(question: string, draft: string, apply: (t: string) => void, key: string) {
    if (busy[key]) return;
    setBusy((b) => ({ ...b, [key]: true }));
    setError(null); setNote(null);
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [key]: false })); return; }
    try {
      const res = await fetch('/api/team/support-kb/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ question, draft }),
      });
      const j = (await res.json().catch(() => ({}))) as { improved?: string; error?: string };
      if (res.ok && j.improved) { apply(j.improved); setNote('Sharpened — review and save.'); }
      else setError(j.error || 'Could not improve that.');
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [key]: false }));
  }

  async function remove(id: string) {
    if (busy[id]) return;
    setBusy((b) => ({ ...b, [id]: true }));
    const tok = await token();
    if (!tok) { setBusy((b) => ({ ...b, [id]: false })); return; }
    try {
      const res = await fetch(`/api/team/support-kb?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (res.ok) setEntries((list) => list.filter((x) => x.id !== id));
      else setError('Could not delete that.');
    } catch {
      setError('Could not reach the server. Try again.');
    }
    setBusy((b) => ({ ...b, [id]: false }));
  }

  return (
    <TeamShell title="Playbook · Common issues">
      <section style={U.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ ...T.h2, margin: 0 }}>Support playbook</h2>
          <span style={{ ...T.small, color: C.muted }}>{entries.length} {entries.length === 1 ? 'answer' : 'answers'}</span>
        </div>
        <p style={{ ...T.tiny, marginTop: 12, marginBottom: 14, color: C.faint }}>
          Search a topic, tweak the answer, and save. The desk grounds its drafts and fills its pick-list
          from here, and it mirrors to your Obsidian vault so your brain keeps a readable copy.
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a question or topic — e.g. bank, refund, trial…"
          aria-label="Search the playbook"
          style={search}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setAdding(adding ? null : { title: '', keywords: '', body: '' })} style={{ ...btn, ...btnDark }}>
            {adding ? 'Cancel' : '+ Add an answer'}
          </button>
          {note ? <span style={{ ...T.small, color: C.green, alignSelf: 'center' }}>{note}</span> : null}
          {error ? <span style={{ ...T.small, color: C.red, alignSelf: 'center' }}>{error}</span> : null}
        </div>
      </section>

      {loaded && missingFaqs.length > 0 ? (
        <section style={U.section}>
          <div style={sweep}>
            <div style={{ ...T.tiny, color: '#8a5a00', textTransform: 'uppercase', letterSpacing: 0.6, fontWeight: 700, marginBottom: 6 }}>
              Website check
            </div>
            <div style={{ ...T.small, color: '#5c4200', lineHeight: 1.55 }}>
              {missingFaqs.length} {missingFaqs.length === 1 ? 'topic' : 'topics'} on the Lekhio site {missingFaqs.length === 1 ? 'is' : 'are'}n&rsquo;t in your playbook yet.
              Add an answer so the desk can ground on it:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {missingFaqs.map((q) => (
                <button key={q} onClick={() => setAdding({ title: q, keywords: '', body: '' })} style={sweepChip}>
                  {q} &nbsp;+
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {adding ? (
        <section style={U.section}>
          <div style={card}>
            <div style={{ ...T.tiny, color: C.faint, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 }}>New answer</div>
            <input value={adding.title} onChange={(e) => setAdding({ ...adding, title: e.target.value })} placeholder="The question / title" style={titleInput} aria-label="New answer title" />
            <input value={adding.keywords} onChange={(e) => setAdding({ ...adding, keywords: e.target.value })} placeholder="Keywords, comma separated (helps it match)" style={kwInput} aria-label="New answer keywords" />
            <textarea value={adding.body} onChange={(e) => setAdding({ ...adding, body: e.target.value })} placeholder="The answer you'd send a customer" rows={5} style={bodyArea} aria-label="New answer" />
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <button disabled={busy['__new__'] || !adding.title.trim() || !adding.body.trim()} onClick={() => save(null, adding)} style={{ ...btn, ...btnDark, opacity: busy['__new__'] || !adding.title.trim() || !adding.body.trim() ? 0.5 : 1 }}>{busy['__new__'] ? 'Saving…' : 'Save'}</button>
              <button disabled={busy['__new__'] || !adding.body.trim()} onClick={() => improve(adding.title, adding.body, (t) => setAdding({ ...adding, body: t }), '__new__')} style={{ ...btn, ...btnGhost }}>Improve with AI</button>
            </div>
          </div>
        </section>
      ) : null}

      <section style={U.section}>
        <div style={U.sectionHead}>
          <h2 style={T.h2}>{query.trim() ? 'Matches' : 'All answers'}</h2>
          <span style={U.sectionNote}>{results.length} {results.length === 1 ? 'answer' : 'answers'}</span>
        </div>
        {results.length === 0 ? (
          <div style={U.honest}>
            {!loaded ? 'Reading the brain…' : query.trim() ? 'No answer matches that yet — tap "+ Add an answer" to write one.' : 'The playbook is empty. Add your first answer, and it starts helping the desk straight away.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {results.map((e) => {
              const d = draftFor(e);
              const dirty = !!edits[e.id];
              const b = busy[e.id];
              return (
                <div key={e.id} style={card}>
                  <input value={d.title} onChange={(ev) => setDraft(e.id, { title: ev.target.value })} style={titleInput} aria-label="Title" />
                  <input value={d.keywords} onChange={(ev) => setDraft(e.id, { keywords: ev.target.value })} placeholder="Keywords, comma separated" style={kwInput} aria-label="Keywords" />
                  <textarea value={d.body} onChange={(ev) => setDraft(e.id, { body: ev.target.value })} rows={Math.min(12, Math.max(3, d.body.split('\n').length + 1))} style={bodyArea} aria-label="Answer" />
                  <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <button disabled={b || !dirty} onClick={() => save(e.id, d)} style={{ ...btn, ...btnDark, opacity: b || !dirty ? 0.5 : 1 }}>{b ? 'Working…' : dirty ? 'Save' : 'Saved'}</button>
                    <button disabled={b || !d.body.trim()} onClick={() => improve(d.title, d.body, (t) => setDraft(e.id, { body: t }), e.id)} style={{ ...btn, ...btnGhost }}>Improve with AI</button>
                    <button disabled={b} onClick={() => remove(e.id)} style={{ ...btn, ...btnGhost, color: C.red, marginLeft: 'auto' }}>Delete</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </TeamShell>
  );
}

const search: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 16, color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 12, padding: '13px 15px', background: '#fff',
  fontFamily: "Inter,-apple-system,'Segoe UI',sans-serif",
};
const card: React.CSSProperties = {
  background: C.panel, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18,
  boxShadow: '0 1px 2px rgba(17,17,17,.03)',
};
const titleInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 15.5, fontWeight: 700, color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: '9px 11px', marginBottom: 8, background: '#fff',
};
const kwInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 13, color: C.muted,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: '8px 11px', marginBottom: 8, background: '#fff',
};
const bodyArea: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', fontSize: 14, lineHeight: 1.6, color: C.ink,
  border: `1px solid ${C.line}`, borderRadius: 8, padding: '11px', background: '#fff',
  fontFamily: "Inter,-apple-system,'Segoe UI',sans-serif", resize: 'vertical',
};
const btn: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, borderRadius: 10, padding: '9px 15px', cursor: 'pointer', border: '1px solid transparent',
};
const btnDark: React.CSSProperties = { background: C.ink, color: '#fff' };
const btnGhost: React.CSSProperties = { background: 'transparent', color: C.muted, borderColor: C.line };
const sweep: React.CSSProperties = {
  background: '#fff8ec', border: '1px solid #f0dcae', borderRadius: 14, padding: 18,
};
const sweepChip: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, color: '#5c4200', background: '#fff',
  border: '1px solid #e6cf95', borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
};
