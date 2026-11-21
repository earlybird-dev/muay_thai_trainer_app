# Muay Thai Trainer

A home-training web app (installable PWA, works offline).

- **Learn**: 24 techniques (stance, footwork, punches 1–6, kicks, knees, elbows, defense, clinch) with an animated fighter, slow-mo, step-by-step phases, southpaw mirror, key cues, common mistakes, and a video slot (YouTube search + your own saved link).
- **Combos**: build your own combos or copy and edit 18 starter combos. Callouts can use numbers ("1, 2, kick") or names.
- **Train**: timed rounds with rest, a get-ready countdown, voice callouts, a bell, a 10-second warning clap, an optional freestyle burst, and keep-screen-on.
- **History & Settings**: session log and streak, voice/rate/volume, stance, theme, and JSON backup export/import.

All data stays on the device, in localStorage.

```
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (session engine, storage, poses)
npm run build    # production build to dist/
```

New techniques are data-only: add an entry to `src/data/techniques.ts` with phase poses (see `src/lib/pose.ts` for the angle conventions).
