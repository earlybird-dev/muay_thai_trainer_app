import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { chainPhases } from '../components/Figure';
import FigureView from '../components/FigureView';
import { calloutDisplay, newId, type Combo } from '../data/combos';
import { LEVELS, TECH_BY_ID, type Level } from '../data/techniques';
import { useStore } from '../lib/store';
import { useDialog } from '../components/Dialog';
import { FavButton, practiceLabel, usePractice } from '../components/ComboMeta';

type Filter = Level | 'all' | 'essentials' | 'favorites';

const FILTERS: { id: Filter; name: string }[] = [
  { id: 'all', name: 'All' },
  { id: 'essentials', name: '★ Essentials' },
  { id: 'favorites', name: '♥ Favourites' },
  ...LEVELS,
];

export default function Combos() {
  const { data, update, allCombos } = useStore();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [preview, setPreview] = useState<string | null>(null);
  const [level, setLevel] = useState<Filter>('all');
  const favs = data.settings.favorites;
  const practice = usePractice();
  const matches = (l: Filter, c: Combo) =>
    l === 'all' || (l === 'essentials' ? !!c.essential : l === 'favorites' ? favs.includes(c.id) : c.level === l);
  const byLevel = (c: Combo) => matches(level, c);
  // Filters apply to the starter library; your own combos are always listed in their own section.
  const mine = data.combos;
  const presets = allCombos.filter((c) => c.preset && byLevel(c));
  const mirror = data.settings.stance === 'southpaw';
  const countOf = (l: Filter) => allCombos.filter((c) => c.preset && matches(l, c)).length;

  const duplicate = (c: Combo) => {
    const copy: Combo = { ...c, id: newId(), name: `${c.name} (copy)`, preset: undefined, essential: undefined };
    update((d) => ({ ...d, combos: [copy, ...d.combos] }));
    navigate(`/combos/${copy.id}`);
  };
  const remove = async (c: Combo) => {
    if (
      !(await dialog.confirm({
        title: `Delete “${c.name}”?`,
        message: 'This combo is removed from your list. Saved workouts that picked it will skip it.',
        confirmLabel: 'Delete combo',
        danger: true,
      }))
    )
      return;
    update((d) => ({ ...d, combos: d.combos.filter((x) => x.id !== c.id) }));
  };

  // A plain render function (not a nested component) so rows aren't remounted on every render.
  const row = (c: Combo) => (
    <li key={c.id} className="card combo-row">
      <div
        className="combo-main clickable"
        role="button"
        tabIndex={0}
        aria-expanded={preview === c.id}
        aria-label={`${c.name}: ${preview === c.id ? 'hide' : 'show'} preview`}
        onClick={(e) => {
          // Dragging/tapping the animation itself (e.g. rotating the 3D fighter) shouldn't close it.
          if ((e.target as HTMLElement).closest('.combo-preview')) return;
          setPreview(preview === c.id ? null : c.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPreview(preview === c.id ? null : c.id);
          }
        }}
      >
        <div className="combo-name">
          {c.name} <span className={`tag tag-${c.level}`}>{c.level}</span>
          {c.essential && <span className="tag tag-essential">★ essential</span>}
        </div>
        <div className="combo-call">{calloutDisplay(c.items, c.style)}</div>
        {(() => {
          const l = practiceLabel(practice.get(c.name.toLowerCase()));
          return <div className={`practice ${l.due ? 'due' : ''}`}>{l.text}</div>;
        })()}
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
        <FavButton id={c.id} name={c.name} />
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
        <h2>
          My combos <span className="muted small">({mine.length})</span>
        </h2>
        {mine.length === 0 ? (
          <p className="muted">No custom combos yet. Build one, or copy a starter combo below and tweak it.</p>
        ) : (
          <ul className="list">{mine.map(row)}</ul>
        )}
      </section>

      <section className="section">
        <h2>
          Starter combos <span className="muted small">({presets.length})</span>
        </h2>
        <div className="seg wrap level-filter" role="group" aria-label="Filter starter combos">
          {FILTERS.map((l) => (
            <button key={l.id} className={`seg-btn ${level === l.id ? 'on' : ''}`} onClick={() => setLevel(l.id)}>
              {l.name} <span className="muted">{countOf(l.id)}</span>
            </button>
          ))}
        </div>
        {presets.length ? (
          <ul className="list">{presets.map(row)}</ul>
        ) : (
          <p className="muted">{level === 'favorites' ? 'No favourite starter combos yet — tap ♡ on any combo to add it.' : 'No combos here.'}</p>
        )}
      </section>
    </div>
  );
}
