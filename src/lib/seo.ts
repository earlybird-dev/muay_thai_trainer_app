/**
 * Page titles and descriptions for search engines and link previews. Shared by the app (updates the
 * <head> as you navigate) and scripts/prerender.ts (writes a crawlable HTML page per route).
 */
import { CATEGORIES, TECHNIQUES, TECH_BY_ID } from '../data/techniques';

export const SITE_URL = 'https://muaythaitrainer.app';
export const SITE_NAME = 'Muay Thai Trainer';
export const DEFAULT_DESCRIPTION =
  'Free Muay Thai training app: learn every basic technique with animated 3D tutorials and videos, build combos, and train at home with a voice coach calling out combos, rounds and drills.';

export interface PageMeta {
  title: string;
  description: string;
  path: string;
}

const STATIC: Record<string, Omit<PageMeta, 'path'>> = {
  '/learn': {
    title: 'Learn Muay Thai Techniques – Stance, Punches, Kicks, Knees, Elbows',
    description:
      'Step-by-step Muay Thai tutorials for beginners: stance and footwork, jab, cross, hooks, uppercuts, teeps, roundhouse kicks, knees, elbows, defence and the clinch — with animated 3D demos, key cues and common mistakes.',
  },
  '/combos': {
    title: 'Muay Thai Combos – 100+ Beginner to Advanced Combinations',
    description:
      'Over 100 Muay Thai combos from beginner to advanced, with the essential combos to drill every session. Preview each combo animated, save favourites and build your own.',
  },
  '/train': {
    title: 'Muay Thai Home Workout Timer with Voice Callouts',
    description:
      'Train Muay Thai at home: a round timer and combo drill coach that calls out combos by voice, counts reps, rings the bell and plays fight music. Shadowboxing and bag work, no equipment needed.',
  },
  '/plans': {
    title: 'Muay Thai Training Plans – 30-Day Schedules',
    description: 'Build a weekly Muay Thai training plan, get daily reminders and track your progress on a calendar.',
  },
  '/history': {
    title: 'Training History & Streak',
    description: 'Your Muay Thai training log: sessions, rounds, combos drilled and your daily streak.',
  },
  '/settings': {
    title: 'Settings',
    description: 'Stance, 2D or 3D illustrations, fighter, voice coach, music and account settings.',
  },
};

/** Every route worth indexing (and pre-rendering). */
export function indexedPaths(): string[] {
  return ['/learn', ...TECHNIQUES.map((t) => `/learn/${t.id}`), '/combos', '/train', '/plans'];
}

export function pageMeta(pathname: string): PageMeta {
  const path = pathname.replace(/\/+$/, '') || '/learn';
  const tech = path.match(/^\/learn\/([^/]+)$/)?.[1];
  if (tech && TECH_BY_ID[tech]) {
    const t = TECH_BY_ID[tech];
    const cat = CATEGORIES.find((c) => c.id === t.category)?.name ?? 'Muay Thai';
    return {
      path,
      title: `Muay Thai ${t.name} – Step-by-Step ${cat} Tutorial`,
      description: `${t.summary} Step-by-step animated tutorial with key cues, common mistakes and a video. ${t.level[0].toUpperCase()}${t.level.slice(1)} level.`,
    };
  }
  const base = Object.keys(STATIC).find((k) => path === k || path.startsWith(`${k}/`));
  if (base) return { path: base === path ? path : base, ...STATIC[base] };
  return { path, title: SITE_NAME, description: DEFAULT_DESCRIPTION };
}

/** The canonical address of a page. GitHub Pages serves each page as a folder, so it ends in "/". */
export const canonicalUrl = (path: string) => SITE_URL + (path === '/' ? '/' : `${path}/`);

/** Full <title>: page title plus site name. */
export const fullTitle = (m: PageMeta) => (m.title === SITE_NAME ? SITE_NAME : `${m.title} | ${SITE_NAME}`);

/** Keep <head> in sync with the current page (title, description, canonical, social tags). */
export function applyHead(pathname: string) {
  const m = pageMeta(pathname);
  const url = canonicalUrl(m.path);
  document.title = fullTitle(m);
  const set = (selector: string, attr: string, value: string, make: () => HTMLElement) => {
    let el = document.head.querySelector(selector) as HTMLElement | null;
    if (!el) {
      el = make();
      document.head.appendChild(el);
    }
    el.setAttribute(attr, value);
  };
  const meta = (key: 'name' | 'property', name: string) => () => {
    const el = document.createElement('meta');
    el.setAttribute(key, name);
    return el;
  };
  set('meta[name="description"]', 'content', m.description, meta('name', 'description'));
  set('meta[property="og:title"]', 'content', fullTitle(m), meta('property', 'og:title'));
  set('meta[property="og:description"]', 'content', m.description, meta('property', 'og:description'));
  set('meta[property="og:url"]', 'content', url, meta('property', 'og:url'));
  set('meta[name="twitter:title"]', 'content', fullTitle(m), meta('name', 'twitter:title'));
  set('meta[name="twitter:description"]', 'content', m.description, meta('name', 'twitter:description'));
  set('link[rel="canonical"]', 'href', url, () => {
    const el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    return el;
  });
}
