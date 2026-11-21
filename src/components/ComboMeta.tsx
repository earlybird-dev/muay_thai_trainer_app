import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { DUE_AFTER_DAYS, daysSince, practiceStats, type Practice } from '../lib/stats';

/** ♡ / ♥ toggle that stars a combo as a favourite. */
export function FavButton({ id, name }: { id: string; name: string }) {
  const { data, update } = useStore();
  const on = data.settings.favorites.includes(id);
  return (
    <button
      type="button"
      className={`fav-btn ${on ? 'on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      title={on ? 'Favourite' : 'Add to favourites'}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        update((d) => {
          const favs = d.settings.favorites;
          return { ...d, settings: { ...d.settings, favorites: favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id] } };
        });
      }}
    >
      {on ? '♥' : '♡'}
    </button>
  );
}

/** Practice stats for every combo name, from history. */
export function usePractice(): Map<string, Practice> {
  const { data } = useStore();
  return useMemo(() => practiceStats(data.history), [data.history]);
}

/** "Drilled 4× · 2 days ago", or a nudge when it's due. */
export function practiceLabel(p: Practice | undefined, now = new Date()): { text: string; due: boolean } {
  const days = daysSince(p, now);
  if (!p) return { text: 'Not drilled yet', due: true };
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return { text: `Drilled ${p.sessions}× · ${when}`, due: days >= DUE_AFTER_DAYS };
}
