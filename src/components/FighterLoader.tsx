import { FIGHTER_LOADER_SVG } from '../lib/fighterLoader';

/** Inline loading animation (the kicking fighter) for parts of the app that are still loading. */
export default function FighterLoader({ label = 'Loading…', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`fighter-loader ${className}`} role="status" aria-label={label}>
      <span dangerouslySetInnerHTML={{ __html: FIGHTER_LOADER_SVG }} />
      <div className="fl-text">{label}</div>
    </div>
  );
}
