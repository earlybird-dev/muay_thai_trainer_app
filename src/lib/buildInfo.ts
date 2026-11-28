/** Filled in by vite.config.ts when the site is built: when, and from which commit. */
declare const __BUILD__: { time: string; sha: string } | undefined;

export const BUILD: { time: string; sha: string } = typeof __BUILD__ !== 'undefined' ? __BUILD__ : { time: '', sha: '' };
