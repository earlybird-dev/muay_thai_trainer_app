/**
 * Background music.
 *
 *  - calm:  public/music/calm.mp3, looped, for browsing and learning.
 *  - fight: public/music/training.mp3, looped, while training; quieter during prep/rest (`fight-rest`).
 *
 * If a track can't load (e.g. offline before it was ever fetched), generated music stands in: soft
 * pentatonic mallets over a pad (calm), or a sarama-style groove — klong drums, ching/chap and a reedy
 * pi-like lead (fight).
 *
 * Notes are scheduled slightly ahead of time on the audio clock, so timing stays tight even when the
 * main thread is busy. Music ducks under voice callouts.
 */
import { getAudioContext, setSpeechListener } from './audio';

export type MusicScene = 'off' | 'calm' | 'fight' | 'fight-rest';

type StyleId = 'calm' | 'fight';

interface Layer {
  style: StyleId;
  bus: GainNode;
  step: number;
  nextTime: number;
}

const BPM: Record<StyleId, number> = { calm: 72, fight: 138 };
/** Relative loudness of each scene before the user's music volume. */
const SCENE_LEVEL: Record<MusicScene, number> = { off: 0, calm: 0.25, fight: 1.9, 'fight-rest': 1 };

let scene: MusicScene = 'off';
let enabled = true;
let volume = 0.4;
let hidden = typeof document !== 'undefined' && document.hidden;

let out: GainNode | null = null; // user volume
let duck: GainNode | null = null; // voice ducking
let layer: Layer | null = null;
let timer: number | null = null;
let speaking = 0;
let noise: AudioBuffer | null = null;

// Recorded tracks: <audio> elements streamed through the audio graph (volume, fades, ducking).
interface Track {
  url: string;
  el: HTMLAudioElement | null;
  bus: GainNode | null;
  failed: boolean;
  wanted: boolean;
  pauseTimer: number | null;
}
const newTrack = (file: string): Track => ({
  url: `${import.meta.env.BASE_URL}music/${file}`,
  el: null,
  bus: null,
  failed: false,
  wanted: false,
  pauseTimer: null,
});
/** Training tracks the user can pick from (Settings → Voice & sound). */
export const TRAINING_TRACKS = [
  { id: 'fight-night', name: 'Fight Night', file: 'training.mp3' },
  { id: 'ring-walk', name: 'Ring Walk', file: 'training-2.mp3' },
  { id: 'shadow-boxing', name: 'Shadow Boxing', file: 'training-3.mp3' },
  { id: 'main-event', name: 'Main Event', file: 'training-4.mp3' },
  { id: 'fight-camp', name: 'Fight Camp', file: 'training-5.mp3' },
] as const;
export type TrainingTrackId = (typeof TRAINING_TRACKS)[number]['id'];
const CALM_FILE = 'calm.mp3';
/** Setting value that plays every training track, one after another in random order. */
export const SHUFFLE_TRAINING = 'shuffle';
let shuffle = true;
let trainingFile: string = TRAINING_TRACKS[Math.floor(Math.random() * TRAINING_TRACKS.length)].file;

/** A random training track, different from `avoid` when there's a choice and skipping broken ones. */
function pickTrainingFile(avoid?: string): string {
  const ok = TRAINING_TRACKS.map((t) => t.file).filter((f) => !TRACKS[f]?.failed);
  const pool = ok.filter((f) => f !== avoid);
  const from = pool.length ? pool : ok.length ? ok : [TRAINING_TRACKS[0].file];
  return from[Math.floor(Math.random() * from.length)];
}

const TRACKS: Record<string, Track> = {};
const getTrack = (file: string) => (TRACKS[file] ??= newTrack(file));
/** Track level per scene (before the user's music volume). */
// Track gain = level × min(1, 2 × music volume). At the default volume (40%) the background music
// outside training plays at 20%; training music at 80%.
const TRACK_LEVEL: Partial<Record<MusicScene, number>> = { calm: 0.25, fight: 1, 'fight-rest': 0.45 };
let trackDuck: GainNode | null = null;

// ---------- public API ----------

export function configureMusic(opts: { enabled: boolean; volume: number; trainingTrack?: string }) {
  const wasShuffle = shuffle;
  shuffle = opts.trainingTrack === SHUFFLE_TRAINING;
  if (shuffle) {
    if (!wasShuffle) trainingFile = pickTrainingFile();
  } else trainingFile = (TRAINING_TRACKS.find((t) => t.id === opts.trainingTrack) ?? TRAINING_TRACKS[0]).file;
  enabled = opts.enabled;
  volume = Math.max(0, Math.min(1, opts.volume));
  refresh();
}

export function setMusicScene(next: MusicScene) {
  if (next === scene) return;
  scene = next;
  refresh();
}

export const getMusicScene = () => scene;

/** Reasons the music is held silent right now (e.g. a YouTube video playing). */
const holds = new Set<string>();
/** Silence the music while something else needs the speakers; release it to bring the music back. */
export function holdMusic(reason: string, on: boolean) {
  if (on === holds.has(reason)) return;
  if (on) holds.add(reason);
  else holds.delete(reason);
  refresh();
}

/**
 * Call from the tap that starts a session (after unlockAudio): starts the training track silently from
 * the top inside the gesture, so mobile browsers allow it to play once the session scene asks for it.
 */
export function primeTrainingMusic() {
  const ctx = getAudioContext();
  if (!ctx || !enabled) return;
  const fresh = !getTrack(trainingFile).wanted;
  // Shuffle: each new session starts on a random track.
  if (shuffle && fresh) trainingFile = pickTrainingFile();
  // In shuffle mode every track may need to start later without a tap, so unlock them all now.
  const files = shuffle ? TRAINING_TRACKS.map((x) => x.file) : [trainingFile];
  for (const file of files) {
    const t = getTrack(file);
    if (!ensureTrack(ctx, t) || !t.el) continue;
    const el = t.el;
    if (!t.wanted) {
      try {
        el.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
    }
    if (el.paused)
      el.play()
        .then(() => {
          if (!t.wanted) el.pause();
        })
        .catch(() => {});
  }
}

/** Call after a user gesture created the audio context, so music can start. */
export function refreshMusic() {
  refresh();
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    refresh();
  });
}

setSpeechListener((on) => {
  speaking = Math.max(0, speaking + (on ? 1 : -1));
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const d of [duck, trackDuck]) {
    if (!d) continue;
    d.gain.cancelScheduledValues(now);
    d.gain.setTargetAtTime(speaking > 0 ? 0.15 : 1, now, speaking > 0 ? 0.03 : 0.4);
  }
});

// ---------- engine ----------

/** What should be playing right now. Calm music pauses in a background tab; training keeps going. */
function effectiveScene(): MusicScene {
  if (!enabled || volume <= 0 || holds.size) return 'off';
  if (hidden && scene === 'calm') return 'off';
  return scene;
}

function ensureGraph(ctx: AudioContext) {
  if (out && duck) return;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  duck = ctx.createGain();
  out = ctx.createGain();
  out.gain.value = 0;
  out.connect(duck).connect(comp).connect(ctx.destination);
  // The track is already mastered, so it skips the compressor.
  trackDuck = ctx.createGain();
  trackDuck.connect(ctx.destination);
}

function ensureTrack(ctx: AudioContext, t: Track): boolean {
  if (t.failed) return false;
  if (t.el && t.bus) return true;
  ensureGraph(ctx);
  try {
    const el = new Audio(t.url);
    // Shuffled training tracks play once and hand over to the next; everything else loops.
    el.loop = !(shuffle && TRAINING_TRACKS.some((x) => t.url.endsWith(`/${x.file}`)));
    el.preload = 'auto';
    el.addEventListener('error', () => {
      t.failed = true;
      if (shuffle && t.url.endsWith(`/${trainingFile}`)) trainingFile = pickTrainingFile(trainingFile);
      refresh();
    });
    // Shuffle mode doesn't loop: when a training track ends, move on to another one.
    el.addEventListener('ended', () => {
      if (!shuffle || !t.wanted) return;
      const next = pickTrainingFile(trainingFile);
      t.wanted = false;
      const n = getTrack(next);
      if (n.el && n !== t) {
        try {
          n.el.currentTime = 0;
        } catch {
          /* not loaded yet */
        }
      } else {
        el.currentTime = 0; // only one playable track: start it again
      }
      trainingFile = next;
      refresh();
    });
    const bus = ctx.createGain();
    bus.gain.value = 0;
    ctx.createMediaElementSource(el).connect(bus).connect(trackDuck!);
    t.el = el;
    t.bus = bus;
    return true;
  } catch {
    t.failed = true;
    return false;
  }
}

/** Fade one recorded track in/out for the scene. Returns whether it is playing the music. */
function updateTrack(ctx: AudioContext, t: Track, want: boolean, level: number): boolean {
  want = want && ensureTrack(ctx, t);
  t.wanted = want;
  if (!t.el || !t.bus) return false;
  const now = ctx.currentTime;
  t.bus.gain.cancelScheduledValues(now);
  if (t.pauseTimer !== null) window.clearTimeout(t.pauseTimer);
  t.pauseTimer = null;
  if (want) {
    t.bus.gain.setTargetAtTime(level * Math.min(1, volume * 2), now, 0.3);
    if (t.el.paused)
      t.el.play().catch((e: DOMException) => {
        if (e?.name === 'AbortError') return;
        if (e?.name === 'NotAllowedError') {
          // No user gesture yet; the next tap's refresh tries again.
          t.wanted = false;
          return;
        }
        t.failed = true; // unplayable: fall back to generated music
        refresh();
      });
    return true;
  }
  t.bus.gain.setTargetAtTime(0, now, 0.4);
  const el = t.el;
  t.pauseTimer = window.setTimeout(() => {
    if (!t.wanted) el.pause();
  }, 2000);
  return false;
}

function refresh() {
  const ctx = getAudioContext();
  if (!ctx) return; // no gesture yet — App calls refreshMusic() after the first one
  ensureGraph(ctx);
  const now = ctx.currentTime;
  const wanted = effectiveScene();
  const fight = wanted === 'fight' || wanted === 'fight-rest';
  const level = TRACK_LEVEL[wanted] ?? 0;
  const calmT = getTrack(CALM_FILE);
  const fightT = getTrack(trainingFile);
  for (const x of TRAINING_TRACKS) {
    const el = TRACKS[x.file]?.el;
    if (el) el.loop = !shuffle;
  }
  const calmTrack = updateTrack(ctx, calmT, wanted === 'calm', level);
  const fightTrack = updateTrack(ctx, fightT, fight, level);
  // Fade out a training track that was just swapped for another.
  for (const t of Object.values(TRACKS)) if (t !== calmT && t !== fightT && t.el) updateTrack(ctx, t, false, 0);
  // While a recorded track plays, the generated music stays silent.
  const target: MusicScene = calmTrack || fightTrack ? 'off' : wanted;

  out!.gain.cancelScheduledValues(now);
  out!.gain.setTargetAtTime(target === 'off' ? 0 : volume * 0.6, now, 0.25);

  if (target === 'off') {
    // Let the fade finish, then stop scheduling.
    if (layer) fadeOutLayer(ctx, layer, 0.6);
    layer = null;
    stopTimer();
    return;
  }

  const style: StyleId = target === 'calm' ? 'calm' : 'fight';
  if (!layer || layer.style !== style) {
    if (layer) fadeOutLayer(ctx, layer, 1.2);
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, now);
    bus.connect(out!);
    layer = { style, bus, step: 0, nextTime: now + 0.12 };
  }
  layer.bus.gain.cancelScheduledValues(now);
  layer.bus.gain.setTargetAtTime(SCENE_LEVEL[target], now, style === 'fight' ? 0.3 : 0.8);
  startTimer();
}

function fadeOutLayer(ctx: AudioContext, l: Layer, sec: number) {
  const now = ctx.currentTime;
  l.bus.gain.cancelScheduledValues(now);
  l.bus.gain.setTargetAtTime(0, now, sec / 4);
  window.setTimeout(() => l.bus.disconnect(), (sec + 1.5) * 1000);
}

function startTimer() {
  if (timer !== null) return;
  timer = window.setInterval(tick, 40);
  tick();
}

function stopTimer() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
}

function tick() {
  const ctx = getAudioContext();
  if (!ctx || !layer || ctx.state !== 'running') return;
  // Background tabs throttle timers to ~1 s, so look further ahead there.
  const ahead = document.hidden ? 1.5 : 0.25;
  const stepDur = 60 / BPM[layer.style] / 4; // 16th notes
  if (layer.nextTime < ctx.currentTime - 0.5) layer.nextTime = ctx.currentTime + 0.05; // resumed after a stall
  while (layer.nextTime < ctx.currentTime + ahead) {
    if (layer.style === 'calm') calmStep(ctx, layer.bus, layer.step, layer.nextTime, stepDur);
    else fightStep(ctx, layer.bus, layer.step, layer.nextTime, stepDur, effectiveScene() === 'fight-rest');
    layer.step++;
    layer.nextTime += stepDur;
  }
}

// ---------- pitch helpers ----------

const PENTA = [0, 2, 4, 7, 9];
/** Pentatonic scale degree (can be negative / span octaves) -> frequency. */
export function degreeFreq(degree: number, base: number): number {
  const oct = Math.floor(degree / 5);
  const idx = ((degree % 5) + 5) % 5;
  return base * Math.pow(2, (oct * 12 + PENTA[idx]) / 12);
}

const rand = Math.random;

// ---------- instruments ----------

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const len = ctx.sampleRate;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = rand() * 2 - 1;
  return noise;
}

function env(ctx: AudioContext, dest: AudioNode, t: number, peak: number, attack: number, decay: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function osc(ctx: AudioContext, type: OscillatorType, freq: number, dest: AudioNode, t: number, dur: number) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function noiseHit(ctx: AudioContext, dest: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(env(ctx, dest, t, peak, 0.002, decay));
  src.start(t, rand() * 0.5);
  src.stop(t + decay + 0.05);
}

/** Klong khaek low stroke ("tum"): a pitched thump. */
function drumLow(ctx: AudioContext, dest: AudioNode, t: number, v: number) {
  const g = env(ctx, dest, t, 0.9 * v, 0.004, 0.32);
  const o = osc(ctx, 'sine', 140, g, t, 0.36);
  o.frequency.exponentialRampToValueAtTime(62, t + 0.16);
  noiseHit(ctx, dest, t, 'lowpass', 900, 0.7, 0.18 * v, 0.03);
}

/** Klong khaek high slap ("tak"). */
function drumHigh(ctx: AudioContext, dest: AudioNode, t: number, v: number) {
  const g = env(ctx, dest, t, 0.38 * v, 0.002, 0.11);
  const o = osc(ctx, 'triangle', 360, g, t, 0.13);
  o.frequency.exponentialRampToValueAtTime(240, t + 0.08);
  noiseHit(ctx, dest, t, 'bandpass', 1800, 1.2, 0.35 * v, 0.06);
}

/** Ching: open, ringing small cymbals (open) or the damped "chap" (closed). */
function ching(ctx: AudioContext, dest: AudioNode, t: number, open: boolean, v: number) {
  const decay = open ? 0.55 : 0.06;
  const g = env(ctx, dest, t, (open ? 0.07 : 0.05) * v, 0.002, decay);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2500;
  hp.connect(g);
  for (const f of [2960, 4170, 5630, 7420]) osc(ctx, 'square', f, hp, t, decay);
  noiseHit(ctx, dest, t, 'highpass', 6000, 0.7, (open ? 0.05 : 0.09) * v, open ? 0.12 : 0.04);
}

/** Reedy, nasal lead in the spirit of the pi java: buzzy oscillators, formant filter, vibrato, slides. */
function reed(ctx: AudioContext, dest: AudioNode, t: number, freq: number, from: number | null, dur: number, v: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16 * v, t + 0.025);
  g.gain.setValueAtTime(0.16 * v, t + Math.max(0.03, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.04);

  const formant = ctx.createBiquadFilter();
  formant.type = 'bandpass';
  formant.frequency.value = 1450;
  formant.Q.value = 1.1;
  const top = ctx.createBiquadFilter();
  top.type = 'lowpass';
  top.frequency.value = 4200;
  formant.connect(top).connect(g).connect(dest);

  const vib = ctx.createOscillator();
  const vibDepth = ctx.createGain();
  vib.frequency.value = 5.6;
  vibDepth.gain.setValueAtTime(0, t);
  vibDepth.gain.linearRampToValueAtTime(freq * 0.012, t + Math.min(0.25, dur));
  vib.connect(vibDepth);
  vib.start(t);
  vib.stop(t + dur + 0.1);

  for (const [type, detune, level] of [
    ['sawtooth', -6, 0.6],
    ['square', 5, 0.4],
  ] as const) {
    const lvl = ctx.createGain();
    lvl.gain.value = level;
    lvl.connect(formant);
    const o = osc(ctx, type, from ?? freq, lvl, t, dur + 0.05);
    o.detune.value = detune;
    if (from && from !== freq) o.frequency.exponentialRampToValueAtTime(freq, t + 0.045);
    vibDepth.connect(o.frequency);
  }
}

/** Soft mallet (ranat-like): bright attack, quick bloom, gentle decay. */
function mallet(ctx: AudioContext, dest: AudioNode, t: number, freq: number, v: number) {
  const g = env(ctx, dest, t, 0.2 * v, 0.004, 1.6);
  osc(ctx, 'sine', freq, g, t, 1.7);
  const g2 = env(ctx, dest, t, 0.05 * v, 0.002, 0.35);
  osc(ctx, 'sine', freq * 3.93, g2, t, 0.4);
}

/** Slow-swelling pad chord. */
function pad(ctx: AudioContext, dest: AudioNode, t: number, freqs: number[], dur: number, v: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05 * v, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1100;
  lp.connect(g).connect(dest);
  for (const f of freqs) {
    osc(ctx, 'triangle', f, lp, t, dur + 0.7).detune.value = rand() * 8 - 4;
  }
}

// ---------- calm style ----------

const CALM_BASE = 261.63; // C4
/** Chord roots (pentatonic degrees), two bars each. */
const CALM_CHORDS = [0, 4, 3, 1];
const CALM_ARP = [0, 3, 6, 8, 11, 14];

function calmStep(ctx: AudioContext, dest: AudioNode, step: number, t: number, sd: number) {
  const bar = Math.floor(step / 16);
  const s = step % 16;
  const root = CALM_CHORDS[Math.floor(bar / 2) % CALM_CHORDS.length];

  if (s === 0 && bar % 2 === 0) {
    pad(ctx, dest, t, [degreeFreq(root - 5, CALM_BASE), degreeFreq(root - 3, CALM_BASE), degreeFreq(root - 1, CALM_BASE)], sd * 32, 1);
    // Soft bass note
    const g = env(ctx, dest, t, 0.12, 0.05, 2.5);
    osc(ctx, 'sine', degreeFreq(root - 10, CALM_BASE), g, t, 2.6);
  }
  if (CALM_ARP.includes(s) && rand() > 0.28) {
    const deg = root + [0, 1, 2, 3, 5][Math.floor(rand() * 5)];
    mallet(ctx, dest, t, degreeFreq(deg, CALM_BASE), 0.6 + rand() * 0.4);
  }
  if (s === 8 && bar % 4 === 3) ching(ctx, dest, t, true, 0.35);
}

// ---------- fight style ----------

const FIGHT_BASE = 392; // G4
/** One 2-bar phrase per entry: [16th-step within the phrase, pentatonic degree, length in 16ths]. */
const PHRASES: [number, number, number][][] = [
  [[0, 5, 3], [3, 6, 1], [4, 7, 4], [8, 6, 2], [10, 5, 2], [12, 3, 4], [16, 4, 2], [18, 5, 2], [20, 7, 2], [22, 8, 2], [24, 7, 6], [30, 6, 2]],
  [[0, 8, 2], [2, 7, 2], [4, 6, 2], [6, 5, 2], [8, 6, 4], [12, 4, 4], [16, 5, 3], [19, 4, 1], [20, 3, 2], [22, 2, 2], [24, 3, 8]],
  [[0, 5, 2], [2, 5, 2], [4, 7, 2], [6, 5, 2], [8, 8, 3], [11, 7, 1], [12, 5, 4], [16, 6, 2], [18, 7, 2], [20, 8, 2], [22, 10, 2], [24, 9, 4], [28, 8, 4]],
  [[0, 7, 4], [4, 5, 2], [6, 4, 2], [8, 5, 2], [10, 3, 2], [12, 2, 4], [16, 3, 2], [18, 4, 2], [20, 5, 4], [24, 0, 8]],
];
/** Drum patterns over one bar of 16ths. */
const LOW = [0, 6, 10];
const HIGH = [3, 4, 8, 12, 14, 15];
const LOW_REST = [0, 8];
const HIGH_REST = [4, 12];

let lastReed: number | null = null;

function fightStep(ctx: AudioContext, dest: AudioNode, step: number, t: number, sd: number, rest: boolean) {
  const s = step % 16;
  const bar = Math.floor(step / 16);

  // Drums
  if ((rest ? LOW_REST : LOW).includes(s)) drumLow(ctx, dest, t, s === 0 ? 1 : 0.8);
  if ((rest ? HIGH_REST : HIGH).includes(s)) drumHigh(ctx, dest, t, s === 15 ? 0.55 : 0.85);
  // A pickup fill every 4th bar
  if (!rest && bar % 4 === 3 && s >= 12) drumHigh(ctx, dest, t, 0.5 + (s - 12) * 0.12);

  // Ching on the off-beat, chap on the beat
  if (s % 4 === 2) ching(ctx, dest, t, true, rest ? 0.7 : 1);
  if (!rest && s % 4 === 0) ching(ctx, dest, t, false, 0.9);

  // Low drone under the groove
  if (s === 0 && bar % 2 === 0) {
    const g = env(ctx, dest, t, rest ? 0.035 : 0.05, 0.3, sd * 32);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.connect(g);
    osc(ctx, 'sawtooth', FIGHT_BASE / 4, lp, t, sd * 32 + 0.3);
  }

  if (rest) {
    lastReed = null;
    return;
  }

  // Lead: phrases cycle every 8 bars
  const phrase = PHRASES[Math.floor(bar / 2) % PHRASES.length];
  const pos = step % 32;
  for (const [at, deg, len] of phrase) {
    if (at !== pos) continue;
    const f = degreeFreq(deg, FIGHT_BASE / 2);
    // Occasional grace note from above, a common ornament on the pi.
    if (len >= 3 && rand() < 0.35) {
      const grace = degreeFreq(deg + 1, FIGHT_BASE / 2);
      reed(ctx, dest, t, grace, lastReed, sd * 0.5, 0.85);
      reed(ctx, dest, t + sd * 0.5, f, grace, sd * (len - 0.5), 1);
    } else {
      reed(ctx, dest, t, f, lastReed, sd * len, 1);
    }
    lastReed = f;
  }
}

/** For diagnostics: what each recorded track is doing. */
export const trackState = () =>
  Object.fromEntries(
    Object.keys(TRACKS).map((k) => {
      const t = TRACKS[k];
      return [k, { loaded: !!t.el, playing: !!t.el && !t.el.paused, time: t.el?.currentTime ?? 0, failed: t.failed }];
    }),
  );
