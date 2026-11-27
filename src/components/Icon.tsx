/** Small line icons for the main buttons (24×24, drawn with the text colour). */
const PATHS = {
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M8 5v14M16 5v14',
  stop: 'M6.5 6.5h11v11h-11z',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  back: 'M15 6l-6 6 6 6',
  history: 'M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8M12 7.5V12l3 2',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10.5 11v5M13.5 11v5',
  edit: 'M4 20l1-4.5L16 4.5l3.5 3.5L8.5 19zM13.5 7l3.5 3.5',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20.5 20.5',
  chevron: 'M6 9.5l6 6 6-6',
  close: 'M6 6l12 12M18 6L6 18',
  calendar: 'M4.5 6.5h15v13h-15zM4.5 10.5h15M8.5 4v4M15.5 4v4M8 14h2M14 14h2M8 17h2',
  bolt: 'M13 3L5 13.5h6.5L10 21l8.5-10.5H12z',
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const filled = name === 'play';
  return (
    <svg className="btn-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d={PATHS[name]}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 1.5 : 2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
