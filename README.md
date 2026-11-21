# Muay Thai Trainer

[![CI/CD](https://github.com/earlybird-dev/muay_thai_trainer_app/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/earlybird-dev/muay_thai_trainer_app/actions/workflows/ci-cd.yml)

Live: https://muaythaitrainer.app

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

## CI/CD

`.github/workflows/ci-cd.yml`:

- **Every pull request and push:** `npm ci`, unit tests, type-check and production build, then a check that the build output is complete.
- **Push to `master`:** the same checks, then deploy to GitHub Pages and a smoke test of the live site. A deploy only happens if every check passes.
- **Manual:** use **Run workflow** on the Actions tab to redeploy.

Dependabot (`.github/dependabot.yml`) opens grouped pull requests for npm updates weekly and GitHub Actions updates monthly. Each one runs through CI before you merge it.

## Accounts & cloud sync (Supabase)

Signing in with Google is optional. Without it, everything stays on the device. When signed in, combos, training history, learned techniques, saved videos and settings sync to Supabase project `vqgwqhhkwhmntnqkcfej` (region ap-southeast-2):

- Tables: `combos`, `sessions` and `user_state`. Each has row-level security, so users can only read and write their own rows.
- The app stays local-first. `src/lib/sync.ts` pulls, merges and pushes after every change. When the same combo was changed on two devices, the newest change wins, and deletions sync too. The first sign-in uploads any data the guest already had.
- Signing out removes the account's data from the device. It stays in the account.
- The sign-in button only appears once the Google provider is enabled in Supabase (Authentication → Sign In / Providers). Its redirect URLs need to include `https://muaythaitrainer.app/**` and `http://localhost:5173/**`.

## Coach voice

By default the app speaks with the most natural voice available on the device (★ in Settings → Voice).
For a consistent, natural coach voice everywhere, record clips once with an AI voice service. They're saved in
`public/voice/` and played instead of the device voice for every built-in phrase and starter combo:

```powershell
$env:OPENAI_API_KEY = "<your key>"   # or: $env:VOICE_PROVIDER = "elevenlabs"; $env:ELEVENLABS_API_KEY = "..."; $env:VOICE = "<voice id>"
npm run voice
```

Optional: `$env:VOICE = "onyx"` picks the OpenAI voice; `$env:VOICE_FORCE = "1"` re-records everything.
Only existing clips are skipped, so re-run it after adding starter combos. Never commit API keys.
