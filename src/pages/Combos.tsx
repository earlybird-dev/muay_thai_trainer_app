import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { chainPhases } from '../components/Figure';
import FigureView from '../components/FigureView';
import { calloutDisplay, newId, type Combo } from '../data/combos';
import { TECH_BY_ID } from '../data/techniques';
import { useStore } from '../lib/store';

export default function Combos() {
  const { data, update, allCombos } = useStore();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<string | null>(null);
  const mine = data.combos;
  const presets = allCombos.filter((c) => c.preset);
  const mirror = data.settings.stance === 'southpaw';

  const duplicate = (c: Combo) => {
    const copy: Combo = { ...c, id: newId(), name: `${c.name} (copy)`, preset: undefined };
    update((d) => ({ ...d, combos: [copy, ...d.combos] }));
    navigate(`/combos/${copy.id}`);
  };
  const remove = (c: Combo) => {
    if (!confirm(`Delete "${c.name}"?`)) return;
    update((d) => ({ ...d, combos: d.combos.filter((x) => x.id !== c.id) }));
  };

  const Row = ({ c }: { c: Combo }) => (
    <li className="card combo-row">
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

      <section className="section">
        <h2>My combos</h2>
        {mine.length === 0 ? (
          <p className="muted">No custom combos yet. Build one, or copy a starter combo below and tweak it.</p>
        ) : (
          <ul className="list">{mine.map((c) => <Row key={c.id} c={c} />)}</ul>
        )}
      </section>

      <section className="section">
        <h2>Starter combos</h2>
        <ul className="list">{presets.map((c) => <Row key={c.id} c={c} />)}</ul>
      </section>
    </div>
  );
}
