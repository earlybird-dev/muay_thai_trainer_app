/**
 * After `vite build`: write a crawlable HTML page for every route (dist/learn/jab/index.html, …) with its
 * own <title>, description, canonical URL, social tags, structured data and readable content, plus
 * sitemap.xml and a 404.html fallback for the other in-app routes. The React app replaces the static
 * content as soon as it starts, so people see the normal app.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, LEVELS, TECHNIQUES, TECH_BY_ID, type Technique } from '../src/data/techniques';
import { ESSENTIAL_IDS, PRESET_COMBOS, calloutDisplay } from '../src/data/combos';
import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, canonicalUrl, fullTitle, indexedPaths, pageMeta, type PageMeta } from '../src/lib/seo';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const template = readFileSync(join(DIST, 'index.html'), 'utf8');
if (!template.includes('<!--prerender-->')) throw new Error('dist/index.html has no <!--prerender--> marker');

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

const NAV = `<nav aria-label="Main"><a href="/learn/">Learn techniques</a> · <a href="/combos/">Combos</a> · <a href="/train/">Home workout timer</a> · <a href="/plans/">Training plans</a></nav>`;

function page(meta: PageMeta, body: string, extraHead = '', robots = ''): string {
  const title = fullTitle(meta);
  const url = canonicalUrl(meta.path);
  let html = template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(meta.description)}$2`)
    .replace('<!--prerender-->', `<div class="page prerender">${NAV}${body}</div>`);
  if (extraHead || robots) html = html.replace('</head>', `${robots}${extraHead}</head>`);
  return html;
}

function write(path: string, html: string) {
  const file = path === '/' ? join(DIST, 'index.html') : join(DIST, path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const techLink = (t: Technique) => `<a href="/learn/${t.id}/">${esc(t.name)}</a>`;

function learnBody(): string {
  return (
    `<h1>Learn Muay Thai techniques</h1><p>${esc(pageMeta('/learn').description)}</p>` +
    CATEGORIES.map((c) => {
      const ts = TECHNIQUES.filter((t) => t.category === c.id);
      return `<section><h2>${esc(c.name)}</h2><p>${esc(c.blurb)}</p><ul>${ts
        .map((t) => `<li>${techLink(t)} (${t.level}) — ${esc(t.summary)}</li>`)
        .join('')}</ul></section>`;
    }).join('')
  );
}

function techniqueBody(t: Technique): { body: string; head: string } {
  const cat = CATEGORIES.find((c) => c.id === t.category);
  const related = TECHNIQUES.filter((x) => x.category === t.category && x.id !== t.id);
  const combos = PRESET_COMBOS.filter((c) => c.items.includes(t.id)).slice(0, 8);
  const body =
    `<p><a href="/learn/">Learn</a> › ${esc(cat?.name ?? '')}</p>` +
    `<h1>${esc(t.name)}</h1><p>${esc(t.summary)}</p><p>Level: ${t.level}${t.code ? ` · Callout number: ${t.code}` : ''}</p>` +
    `<h2>Step by step</h2><ol>${t.phases.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ol>` +
    `<h2>Key cues</h2><ul>${t.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` +
    `<h2>Common mistakes</h2><ul>${t.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` +
    (t.videoId ? `<h2>Video tutorial</h2><p><a href="https://www.youtube.com/watch?v=${t.videoId}">Watch a ${esc(t.name)} tutorial on YouTube</a></p>` : '') +
    (combos.length
      ? `<h2>Combos with the ${esc(t.name)}</h2><ul>${combos.map((c) => `<li>${esc(c.name)}: ${esc(calloutDisplay(c.items, c.style))}</li>`).join('')}</ul>`
      : '') +
    (related.length ? `<h2>More ${esc(cat?.name ?? '')}</h2><ul>${related.map((r) => `<li>${techLink(r)}</li>`).join('')}</ul>` : '');
  const howTo = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: `How to do the ${t.name} in Muay Thai`,
    description: t.summary,
    image: `${SITE_URL}/og-image.png`,
    totalTime: 'PT5M',
    step: t.phases.map((p, i) => ({ '@type': 'HowToStep', position: i + 1, name: p.label, text: p.label })),
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Learn', item: canonicalUrl('/learn') },
      { '@type': 'ListItem', position: 2, name: t.name, item: canonicalUrl(`/learn/${t.id}`) },
    ],
  };
  return { body, head: ld(howTo) + ld(crumbs) };
}

function combosBody(): string {
  const essentials = ESSENTIAL_IDS.map((id) => PRESET_COMBOS.find((c) => c.id === id)!).filter(Boolean);
  const list = (cs: typeof PRESET_COMBOS) =>
    `<ul>${cs.map((c) => `<li>${esc(c.name)} — ${esc(calloutDisplay(c.items, c.style))} (${c.items.map((i) => TECH_BY_ID[i]?.name).join(', ')})</li>`).join('')}</ul>`;
  return (
    `<h1>Muay Thai combos</h1><p>${esc(pageMeta('/combos').description)}</p>` +
    `<h2>Essential combos to drill every session</h2>${list(essentials)}` +
    LEVELS.map((l) => `<h2>${l.name} combos</h2>${list(PRESET_COMBOS.filter((c) => c.level === l.id))}`).join('')
  );
}

const TRAIN_BODY =
  `<h1>Muay Thai home workout timer with voice callouts</h1><p>${esc(pageMeta('/train').description)}</p>` +
  `<h2>Two ways to train</h2><ul><li><b>Combo drill</b>: one combo at a time — announced once, drilled for a set time with reps counted on screen, then a rest while the next combo is announced, with a 3-2-1 countdown.</li>` +
  `<li><b>Rounds</b>: classic 3-minute rounds where the coach calls random combos from your pool, with bell, rest and a 10-second warning.</li></ul>` +
  `<h2>Pick what to drill</h2><ul><li>Essential combos, favourites, or combos due for practice</li><li>All combos, by level, your own, or a hand-picked list</li></ul>` +
  `<h2>Made for training at home</h2><ul><li>Natural coach voice, adjustable speed</li><li>Fight music during rounds, calm music between</li><li>Keeps the screen awake; works offline</li><li>Save workouts and turn them into a training plan</li></ul>`;

const PLANS_BODY =
  `<h1>Muay Thai training plans</h1><p>${esc(pageMeta('/plans').description)}</p>` +
  `<ul><li>Turn any saved workout into a 30-day (or custom) plan</li><li>Choose your training days each week</li><li>Daily reminder and a today card</li><li>Calendar that ticks off days as you train</li></ul>`;

const HOME_BODY =
  `<h1>Muay Thai Trainer</h1><p>${esc(DEFAULT_DESCRIPTION)}</p>` +
  `<ul><li><a href="/learn/">Learn ${TECHNIQUES.length} Muay Thai techniques</a> with animated 3D tutorials and videos</li>` +
  `<li><a href="/combos/">${PRESET_COMBOS.length} combos</a> from beginner to advanced</li>` +
  `<li><a href="/train/">Home workout timer</a> with voice-called combos and rounds</li>` +
  `<li><a href="/plans/">Training plans</a> with reminders and progress tracking</li></ul>`;

// ---- write pages ----
const written: string[] = [];
const home: PageMeta = { path: '/', title: SITE_NAME, description: DEFAULT_DESCRIPTION };
write('/', page({ ...home, title: 'Muay Thai Trainer – Learn Techniques, Build Combos & Train at Home' }, HOME_BODY));
written.push('/');

for (const path of indexedPaths()) {
  const meta = pageMeta(path);
  const tech = path.match(/^\/learn\/(.+)$/)?.[1];
  let body = '';
  let head = '';
  if (tech) ({ body, head } = techniqueBody(TECH_BY_ID[tech]));
  else if (path === '/learn') body = learnBody();
  else if (path === '/combos') body = combosBody();
  else if (path === '/train') body = TRAIN_BODY;
  else if (path === '/plans') body = PLANS_BODY;
  write(path, page(meta, body, head));
  written.push(path);
}

// Other in-app routes (/history, /settings, /train/session, …): GitHub Pages serves 404.html, which loads the app.
writeFileSync(
  join(DIST, '404.html'),
  page({ path: '/', title: SITE_NAME, description: DEFAULT_DESCRIPTION }, HOME_BODY, '', '<meta name="robots" content="noindex" />'),
);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    written
      .map((p) => `  <url><loc>${canonicalUrl(p)}</loc><lastmod>${today}</lastmod><priority>${p === '/' ? '1.0' : p.split('/').length > 2 ? '0.7' : '0.9'}</priority></url>`)
      .join('\n') +
    `\n</urlset>\n`,
);

console.log(`prerendered ${written.length} pages + 404.html + sitemap.xml`);
