import { useStore } from '../lib/store';

/** Small on/off button for background music. */
export default function MusicToggle({ className = '' }: { className?: string }) {
  const { data, update } = useStore();
  const on = data.settings.music;
  return (
    <button
      type="button"
      className={`music-toggle ${on ? 'on' : ''} ${className}`}
      aria-pressed={on}
      aria-label={on ? 'Turn music off' : 'Turn music on'}
      title={on ? 'Music on' : 'Music off'}
      onClick={() => update((d) => ({ ...d, settings: { ...d.settings, music: !d.settings.music } }))}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
        <path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
        <circle cx="16.5" cy="16" r="2.5" fill="currentColor" />
        {!on && <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
      </svg>
    </button>
  );
}
