import { FIGHTER_LOADER_SVG } from '../lib/fighterLoader';
import { useStore } from '../lib/store';

/** Inline loading animation (the kicking fighter) for parts of the app that are still loading. */
export default function FighterLoader({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  const { data } = useStore();
  const orthodox = data.settings.stance !== 'southpaw';
  return (
    <div className={`fighter-loader ${orthodox ? 'fl-orthodox' : ''} ${className}`} role="status" aria-label={label}>
      <span dangerouslySetInnerHTML={{ __html: FIGHTER_LOADER_SVG }} />
      <div className="fl-text">{label}</div>
    </div>
  );
}
