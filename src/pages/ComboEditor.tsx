import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Figure, { chainPhases } from '../components/Figure';
import { calloutDisplay, newId, type CalloutStyle, type Combo } from '../data/combos';
import { CATEGORIES, STRIKES, TECH_BY_ID, type Level } from '../data/techniques';
import { useStore } from '../lib/store';
import { speak } from '../lib/audio';
import { calloutSpeech } from '../data/combos';

export default function ComboEditor() {
  const { id } = useParams();
  const { data, update } = useStore();
  const navigate = useNavigate();
  const existing = id ? data.combos.find((c) => c.id === id) : undefined;

  const [name, setName] = useState(existing?.name ?? '');
  const [items, setItems] = useState<string[]>(existing?.items ?? []);
  const [level, setLevel] = useState<Level>(existing?.level ?? 'beginner');
  const [style, setStyle] = useState<CalloutStyle>(existing?.style ?? 'numbers');
  const [previewKey, setPreviewKey] = useState(0);

  const phases = useMemo(() => chainPhases(items.map((i) => TECH_BY_ID[i]?.phases ?? [])), [items]);

  if (id && !existing) {
    return (
      <div className="page">
        <p>Combo not found.</p>
        <Link to="/combos">Back to combos</Link>
      </div>
    );
  }

  const move = (i: number, d: number) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const copy = [...xs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const autoName = items.map((i) => TECH_BY_ID[i]?.call).join(' ');
  const canSave = items.length > 0;

  const save = () => {
    const combo: Combo = { id: existing?.id ?? newId(), name: name.trim() || autoName, items, level, style };
    update((d) => ({
      ...d,
      combos: existing ? d.combos.map((c) => (c.id === combo.id ? combo : c)) : [combo, ...d.combos],
    }));
    navigate('/combos');
  };

  return (
    <div className="page">
      <Link to="/combos" className="back">
        ← Combos
      </Link>
      <h1>{existing ? 'Edit combo' : 'New combo'}</h1>

      <div className="editor">
        <section className="card">
          <h2>Sequence</h2>
          {items.length === 0 ? (
            <p className="muted">Tap techniques below to add them in order.</p>
          ) : (
            <ol className="chips">
              {items.map((it, i) => (
                <li key={`${it}-${i}`} className="chip">
                  <span>
                    {TECH_BY_ID[it]?.code && <b>{TECH_BY_ID[it].code} </b>}
                    {TECH_BY_ID[it]?.name ?? it}
                  </span>
                  <button onClick={() => move(i, -1)} aria-label="Move earlier" disabled={i === 0}>
                    ‹
                  </button>
                  <button onClick={() => move(i, 1)} aria-label="Move later" disabled={i === items.length - 1}>
                    ›
                  </button>
                  <button onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove">
                    ✕
                  </button>
                </li>
              ))}
            </ol>
          )}
          {items.length > 0 && (
            <>
              <div className="callout-preview">{calloutDisplay(items, style)}</div>
              <Figure key={previewKey} phases={phases} speed={0.8} mirror={data.settings.stance === 'southpaw'} className="combo-preview" />
              <div className="row">
                <button className="btn small" onClick={() => setPreviewKey((k) => k + 1)}>
                  Replay
                </button>
                <button
                  className="btn small"
                  onClick={() => speak(calloutSpeech(items, style), { voiceURI: data.settings.voiceURI, rate: data.settings.rate, volume: data.settings.volume })}
                >
                  🔊 Hear callout
                </button>
                <button className="btn small" onClick={() => setItems([])}>
                  Clear
                </button>
              </div>
            </>
          )}
        </section>

        <section className="card">
          <h2>Add techniques</h2>
          {CATEGORIES.map((cat) => {
            const list = STRIKES.filter((t) => t.category === cat.id);
            if (!list.length) return null;
            return (
              <div key={cat.id} className="palette-group">
                <div className="palette-title">{cat.name}</div>
                <div className="palette">
                  {list.map((t) => (
                    <button key={t.id} className="btn pal" onClick={() => setItems((xs) => [...xs, t.id])}>
                      {t.code && <span className="code">{t.code}</span>}
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="card">
          <h2>Details</h2>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} placeholder={autoName || 'e.g. My 1-2 kick'} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="field">
            <span>Level</span>
            <div className="seg">
              {(['beginner', 'intermediate'] as Level[]).map((l) => (
                <button key={l} className={`seg-btn ${level === l ? 'on' : ''}`} onClick={() => setLevel(l)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span>Callout style</span>
            <div className="seg">
              <button className={`seg-btn ${style === 'numbers' ? 'on' : ''}`} onClick={() => setStyle('numbers')}>
                Numbers (1, 2, kick)
              </button>
              <button className={`seg-btn ${style === 'names' ? 'on' : ''}`} onClick={() => setStyle('names')}>
                Names (jab, cross, kick)
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="row actions sticky-actions">
        <button className="btn primary" onClick={save} disabled={!canSave}>
          Save combo
        </button>
        <Link to="/combos" className="btn">
          Cancel
        </Link>
      </div>
    </div>
  );
}
