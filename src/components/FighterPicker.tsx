import { FIGHTERS, fighterById, type FighterLook } from '../data/fighters';
import { useStore } from '../lib/store';

/** Small flat portrait built from the fighter's colours (no WebGL needed). */
export function FighterBadge({ look, size = 44 }: { look: FighterLook; size?: number }) {
  const hairTop: Record<FighterLook['hair'], string | null> = {
    bald: null,
    buzz: 'M9 17 Q22 4 35 17 Q22 11 9 17Z',
    short: 'M7 19 Q8 4 22 4 Q36 4 37 19 Q30 10 22 11 Q14 10 7 19Z',
    topknot: 'M8 18 Q22 3 36 18 Q22 10 8 18Z',
    mohawk: 'M18 16 Q20 1 22 1 Q24 1 26 16Z',
  };
  const hair = hairTop[look.hair];
  return (
    <svg viewBox="0 0 44 44" width={size} height={size} aria-hidden className="fighter-badge">
      <circle cx="22" cy="22" r="22" fill={look.shorts} />
      <rect x="4" y="34" width="36" height="4" fill={look.shortsTrim} opacity="0.9" />
      <ellipse cx="22" cy="21" rx="12" ry="13.5" fill={look.skin} />
      {look.beard === 'goatee' && <rect x="19" y="29" width="6" height="5" rx="2" fill={look.hairColor} />}
      {look.beard === 'stubble' && <path d="M12 25 Q22 38 32 25 Q22 33 12 25Z" fill={look.hairColor} opacity="0.35" />}
      {hair && <path d={hair} fill={look.hairColor} />}
      {look.hair === 'topknot' && <circle cx="22" cy="4" r="3.4" fill={look.hairColor} />}
      {look.mongkol && <rect x="9" y="12" width="26" height="3.4" rx="1.7" fill={look.mongkol} stroke="#0003" strokeWidth="0.6" />}
      <rect x="14.5" y={look.brows === 'heavy' ? 16.5 : 16} width="6" height={look.brows === 'heavy' ? 2 : 1.2} rx="0.6" fill={look.hairColor} />
      <rect x="23.5" y={look.brows === 'heavy' ? 16.5 : 16} width="6" height={look.brows === 'heavy' ? 2 : 1.2} rx="0.6" fill={look.hairColor} />
      <circle cx="17.5" cy="20.5" r="1.4" fill="#1a1210" />
      <circle cx="26.5" cy="20.5" r="1.4" fill="#1a1210" />
      <rect x="19" y="27" width="6" height="1.3" rx="0.6" fill="#0005" />
      <circle cx="6" cy="31" r="4.2" fill={look.gloves} stroke="#0003" strokeWidth="0.6" />
      <circle cx="38" cy="31" r="4.2" fill={look.gloves} stroke="#0003" strokeWidth="0.6" />
    </svg>
  );
}

/** Grid of preset fighters; selection is saved in settings. */
export default function FighterPicker({ compact = false }: { compact?: boolean }) {
  const { data, update } = useStore();
  const current = fighterById(data.settings.fighter);
  const choose = (id: string) => update((d) => ({ ...d, settings: { ...d.settings, fighter: id } }));

  if (compact) {
    return (
      <div className="fighter-strip" role="radiogroup" aria-label="Fighter">
        {FIGHTERS.map((f) => (
          <button
            key={f.id}
            role="radio"
            aria-checked={f.id === current.id}
            className={`fighter-chip ${f.id === current.id ? 'on' : ''}`}
            onClick={() => choose(f.id)}
            title={`${f.name}: ${f.tagline}`}
          >
            <FighterBadge look={f} size={34} />
            <span className="sr-only">{f.name}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="fighter-grid" role="radiogroup" aria-label="Fighter">
      {FIGHTERS.map((f) => (
        <button
          key={f.id}
          role="radio"
          aria-checked={f.id === current.id}
          className={`fighter-card ${f.id === current.id ? 'on' : ''}`}
          onClick={() => choose(f.id)}
        >
          <FighterBadge look={f} />
          <span className="fighter-text">
            <b>{f.name}</b>
            <span className="muted small">{f.tagline}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
