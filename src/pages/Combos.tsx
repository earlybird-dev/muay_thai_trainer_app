import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { chainPhases } from '../components/Figure';
import FigureView from '../components/FigureView';
import { calloutDisplay, newId, type Combo } from '../data/combos';
import { LEVELS, TECH_BY_ID, type Level } from '../data/techniques';
import { useStore } from '../lib/store';

export default function Combos() {
  const { data, update, allCombos } = useStore();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<string | null>(null);
  const [level, setLevel] = useState<Level | 'all'>('all');
  const byLevel = (c: Combo) => level === 'all' || c.level === level;
  const mine = data.combos.filter(byLevel);
  const presets = allCombos.filter((c) => c.preset && byLevel(c));
  const mirror = data.settings.stance === 'southpaw';
  const countOf = (l: Level | 'all') => allCombos.filter((c) => l === 'all' || c.level === l).length;

  const duplicate = (c: Combo) => {
    const copy: Combo = { ...c, id: newId(), name: `${c.name} (copy)`, preset: undefined };
    update((d) => ({ ...d, combos: [copy, ...d.combos] }));
    navigate(`/combos/${copy.id}`);
  };
  const remove = (c: Combo) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    update((d) => ({ ...d, combos: d.combos.filter((x) => x.id !== c.id) }));
  };

  // A plain render function (not a nested component) so rows aren't remounted on every render.
  const row = (c: Combo) => (
    <li key={c.id} className="card combo-row">
      <div className="combo-main">
        <div className="combo-name">
          {c.name} <span className={`tag tag-${c.level}`}>{c.level}</span>
        </div>
        <div className="combo-call">{calloutDisplay(c.items, c.style)}</div>
        {preview === c.id && (
          <FigureView
            phases={chainPhases(c.items.map((i) => TECH_BY_ID[i]?.phases ?? []))}
            speed={0.8}
            mirror={mirror}
            className="combo-preview"
            label={`${c.name} animation`}
          />
        )}
      </div>
      <div className="combo-actions">
        <button className="btn small" onClick={() => setPreview(preview === c.id ? null : c.id)}>
          {preview === c.id ? 'Hide' : 'Preview'}
        </button>
        <Link className="btn small" to={`/train?combo=${c.id}`}>
          Train
        </Link>
        {c.preset ? (
          <button className="btn small" onClick={() => duplicate(c)}>
            Copy & edit
          </button>
        ) : (
          <>
            <Link className="btn small" to={`/combos/${c.id}`}>
              Edit
            </Link>
            <button className="btn small danger" onClick={() => remove(c)}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Combos</h1>
        <Link to="/combos/new" className="btn primary">
          + New combo
        </Link>
      </div>

      <div className="seg wrap level-filter" role="group" aria-label="Filter by level">
        {([{ id: 'all', name: 'All' }, ...LEVELS] as { id: Level | 'all'; name: string }[]).map((l) => (
          <button key={l.id} className={`seg-btn ${level === l.id ? 'on' : ''}`} onClick={() => setLevel(l.id)}>
            {l.name} <span className="muted">{countOf(l.id)}</span>
          </button>
        ))}
      </div>

      <section className="section">
        <h2>My combos</h2>
        {data.combos.length === 0 ? (
          <p className="muted">No custom combos yet. Build one, or copy a starter combo below and tweak it.</p>
        ) : mine.length === 0 ? (
          <p className="muted">None of your combos are at this level.</p>
        ) : (
          <ul className="list">{mine.map(row)}</ul>
        )}
      </section>

      <section className="section">
        <h2>
          Starter combos <span className="muted small">({presets.length})</span>
        </h2>
        <ul className="list">{presets.map(row)}</ul>
      </section>
    </div>
  );
}
