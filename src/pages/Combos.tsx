import { useState } from 'react';
import Icon from '../components/Icon';
import { Link, useNavigate } from 'react-router-dom';
import { chainPhases } from '../components/Figure';
import FigureView from '../components/FigureView';
import { calloutDisplay, newId, searchCombos, type Combo } from '../data/combos';
import { LEVELS, TECH_BY_ID, type Level } from '../data/techniques';
import { useStore } from '../lib/store';
import { useDialog } from '../components/Dialog';
import { FavButton, practiceLabel, usePractice } from '../components/ComboMeta';

type Filter = Level | 'all' | 'essentials' | 'favorites' | 'due';

/** Same look as the combo pool picker on Train: suggestion cards, then the library by level. */
const SMART_FILTERS: { id: Filter; icon: string; name: string; hint: string; cls: string }[] = [
  { id: 'essentials', icon: '★', name: 'Essentials', hint: 'The core combos to drill every session', cls: 'essentials' },
  { id: 'favorites', icon: '♥', name: 'Favourites', hint: 'Combos you’ve starred', cls: 'favorites' },
  { id: 'due', icon: '⏱', name: 'Due for practice', hint: 'Not drilled in the last week', cls: 'due' },
];
const LIBRARY_FILTERS: { id: Filter; name: string }[] = [{ id: 'all', name: 'All' }, ...LEVELS];

export default function Combos() {
  const { data, update, allCombos } = useStore();
  const navigate = useNavigate();
  const dialog = useDialog();
  const [preview, setPreview] = useState<string | null>(null);
  const [level, setLevel] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const searching = !!query.trim();
  const favs = data.settings.favorites;
  const practice = usePractice();
  const matches = (l: Filter, c: Combo) =>
    l === 'all' ||
    (l === 'essentials'
      ? !!c.essential
      : l === 'favorites'
        ? favs.includes(c.id)
        : l === 'due'
          ? practiceLabel(practice.get(c.name.toLowerCase())).due
          : c.level === l);
  const byLevel = (c: Combo) => matches(level, c);
  // The filters and search apply to the starter library; your own combos are always listed in their own section.
  const mine = data.combos;
  const starters = searchCombos(
    allCombos.filter((c) => c.preset),
    query,
  );
  const presets = starters.filter(byLevel);
  const mirror = data.settings.stance === 'southpaw';
  const countOf = (l: Filter) => starters.filter((c) => matches(l, c)).length;

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
        onClick={() => setPreview(preview === c.id ? null : c.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setPreview(preview === c.id ? null : c.id);
          }
        }}
      >
        <div className="combo-name">
          {c.name}
          {c.essential && (
            <span className="essential-tag" title="Essential combo">
              ★
            </span>
          )}
        </div>
        <div className="combo-call">{calloutDisplay(c.items, c.style)}</div>
      </div>
      <div className="combo-actions">
        <FavButton id={c.id} name={c.name} />
        {c.preset ? (
          <button type="button" className="icon-btn" aria-label={`Copy and edit ${c.name}`} title="Copy & edit" onClick={() => duplicate(c)}>
            <Icon name="copy" />
          </button>
        ) : (
          <>
            <Link className="icon-btn" aria-label={`Edit ${c.name}`} title="Edit" to={`/combos/${c.id}`}>
              <Icon name="edit" />
            </Link>
            <button type="button" className="icon-btn danger" aria-label={`Delete ${c.name}`} title="Delete" onClick={() => void remove(c)}>
              <Icon name="trash" />
            </button>
          </>
        )}
        <Link className="icon-btn go" aria-label={`Train ${c.name}`} title="Train" to={`/train?combo=${c.id}`}>
          <Icon name="play" size={13} />
        </Link>
      </div>
      <div className="combo-meta" onClick={() => setPreview(preview === c.id ? null : c.id)}>
        <span className={`tag tag-${c.level}`}>{c.level}</span>
        {(() => {
          const l = practiceLabel(practice.get(c.name.toLowerCase()));
          return <span className={`practice ${l.due ? 'due' : ''}`}>{l.text}</span>;
        })()}
        <span className={`combo-chevron ${preview === c.id ? 'open' : ''}`}>
          <Icon name="chevron" size={14} />
        </span>
      </div>
      {preview === c.id && (
        <FigureView
          phases={chainPhases(c.items.map((i) => TECH_BY_ID[i]?.phases ?? []))}
          speed={0.8}
          mirror={mirror}
          className="combo-preview"
          label={`${c.name} animation`}
        />
      )}
    </li>
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Combos</h1>
        <Link to="/combos/new" className="btn primary">
          <Icon name="plus" />
          New combo
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
        <div className="pool-picker combo-filter">
          <div className="pool-cards" role="group" aria-label="Suggested filters">
            {SMART_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`pool-card pool-${f.cls} ${level === f.id ? 'on' : ''}`}
                aria-pressed={level === f.id}
                onClick={() => setLevel(level === f.id ? 'all' : f.id)}
              >
                <span className="pool-icon" aria-hidden>
                  {f.icon}
                </span>
                <span className="pool-text">
                  <b>{f.name}</b>
                  <small>{f.hint}</small>
                </span>
                <span className="pool-count">{countOf(f.id)}</span>
              </button>
            ))}
          </div>
          <div className="pool-library">
            <span className="pool-label">Library</span>
            <div className="pool-chips" role="group" aria-label="Filter by level">
              {LIBRARY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`pool-chip ${level === f.id ? 'on' : ''}`}
                  aria-pressed={level === f.id}
                  onClick={() => setLevel(f.id)}
                >
                  {f.name} <span className="pool-chip-count">{countOf(f.id)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="search-box">
          <Icon name="search" />
          <input
            type="search"
            className="input"
            placeholder="Search combos: name, strike, level…"
            aria-label="Search combos"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="icon-btn" aria-label="Clear search" title="Clear search" onClick={() => setQuery('')}>
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        <div className={searching ? 'search-results' : undefined}>
          {presets.length ? (
            <ul className="list">{presets.map(row)}</ul>
          ) : searching && starters.length > 0 ? (
            <p className="muted">
              No match here, but {starters.length} in the whole library.{' '}
              <button type="button" className="btn small" onClick={() => setLevel('all')}>
                Show all
              </button>
            </p>
          ) : searching ? (
            <p className="muted">No starter combos match “{query.trim()}”.</p>
          ) : (
            <p className="muted">{level === 'favorites' ? 'No favourite starter combos yet — tap ♡ on any combo to add it.' : 'No combos here.'}</p>
          )}
        </div>
      </section>
    </div>
  );
}
