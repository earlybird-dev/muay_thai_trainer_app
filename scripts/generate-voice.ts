/**
 * Record the coach voice: one MP3 per fixed phrase and per starter combo name, written to
 * public/voice/ with a manifest the app reads. Run once (and again after adding starter combos);
 * clips that already exist are skipped.
 *
 *   OpenAI:      $env:OPENAI_API_KEY = "...";      npm run voice
 *   ElevenLabs:  $env:VOICE_PROVIDER = "elevenlabs"; $env:ELEVENLABS_API_KEY = "..."; $env:VOICE = "<voice id>"; npm run voice
 *
 * Options (environment variables):
 *   VOICE_PROVIDER  openai (default) | elevenlabs
 *   VOICE           OpenAI voice name (default "onyx") or ElevenLabs voice id (required)
 *   VOICE_FORCE=1   re-record everything (e.g. after changing voice)
 *
 * The API key is only read from the environment — never put it in a file in this repo.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESET_COMBOS } from '../src/data/combos';
import { clipKey, fixedPhrases } from '../src/data/phrases';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'voice');
const MANIFEST = join(OUT, 'manifest.json');
const provider = (process.env.VOICE_PROVIDER ?? 'openai').toLowerCase();
const force = process.env.VOICE_FORCE === '1';

const STYLE =
  'You are an energetic Muay Thai coach calling drills in a gym. Speak clearly and confidently, punchy and upbeat, ' +
  'with natural emphasis. Say only the given words.';

async function openai(text: string): Promise<ArrayBuffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Set OPENAI_API_KEY first.');
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: process.env.VOICE ?? 'onyx',
      input: text,
      instructions: STYLE,
      response_format: 'mp3',
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

async function elevenlabs(text: string): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  const voice = process.env.VOICE;
  if (!key || !voice) throw new Error('Set ELEVENLABS_API_KEY and VOICE (a voice id) first.');
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}

const record = provider === 'elevenlabs' ? elevenlabs : openai;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const old: { clips?: Record<string, string> } = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};
  const clips: Record<string, string> = force ? {} : { ...(old.clips ?? {}) };

  // Unique phrases by clip key.
  const phrases = new Map<string, string>();
  for (const t of [...fixedPhrases(), ...PRESET_COMBOS.map((c) => c.name)]) phrases.set(clipKey(t), t);

  const todo = [...phrases].filter(([key]) => force || !clips[key] || !existsSync(join(OUT, clips[key])));
  console.log(`${phrases.size} phrases, ${todo.length} to record with ${provider}.`);

  let done = 0;
  let failed = 0;
  const worker = async () => {
    for (let item = todo.shift(); item; item = todo.shift()) {
      const [key, text] = item;
      const file = `${key.replace(/ /g, '-')}.mp3`;
      try {
        writeFileSync(join(OUT, file), Buffer.from(await record(text)));
        clips[key] = file;
        done++;
        process.stdout.write(`\r${done} recorded`);
      } catch (e) {
        failed++;
        console.error(`\n✗ "${text}": ${(e as Error).message}`);
        if (/401|403|Set /.test((e as Error).message)) process.exit(1);
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);

  writeFileSync(MANIFEST, JSON.stringify({ provider, voice: process.env.VOICE ?? null, clips }, null, 2) + '\n');
  console.log(`\nDone: ${done} recorded, ${failed} failed. Manifest: public/voice/manifest.json`);
}

void main();
