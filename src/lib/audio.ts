/** Voice callouts (recorded coach clips, else the Web Speech API) and generated sounds (Web Audio API). */
import { clipKey } from '../data/phrases';

let ctx: AudioContext | null = null;

/** The shared audio context, if a user gesture has created it. */
export const getAudioContext = () => ctx;

/** Create/resume the audio context. Must run from a user gesture (tap, click, key). */
export function ensureAudioContext(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

/** Notified when a voice callout starts/stops, so background music can duck under it. */
let speechListener: ((speaking: boolean) => void) | null = null;
export const setSpeechListener = (fn: ((speaking: boolean) => void) | null) => {
  speechListener = fn;
};

/** Must be called from a user gesture (e.g. the Start button) so browsers allow audio. */
export function unlockAudio() {
  ensureAudioContext();
  void loadVoiceManifest();
  // Prime speech synthesis on iOS/Safari.
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch {
    /* ignore */
  }
}

function strike(at: number, volume: number) {
  if (!ctx) return;
  // Inharmonic partials give a metallic boxing-bell ring.
  const partials = [
    [520, 1],
    [1370, 0.5],
    [2120, 0.3],
    [2900, 0.15],
  ];
  for (const [freq, gain] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.35 * gain * volume, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 1.5);
  }
}

export function bell(times = 1, volume = 1) {
  if (!ctx) return;
  const now = ctx.currentTime + 0.02;
  for (let i = 0; i < times; i++) strike(now + i * 0.32, volume);
}

/** Two sharp claps — the classic "10 seconds left" signal. */
export function clap(volume = 1) {
  if (!ctx) return;
  const c = ctx;
  for (let i = 0; i < 2; i++) {
    const at = c.currentTime + 0.02 + i * 0.18;
    const len = Math.floor(c.sampleRate * 0.08);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let j = 0; j < len; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3);
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    const g = c.createGain();
    g.gain.value = 0.9 * volume;
    src.buffer = buf;
    src.connect(filter).connect(g).connect(c.destination);
    src.start(at);
  }
}

/** Short countdown pip. */
export function beep(volume = 1, freq = 880) {
  if (!ctx) return;
  const at = ctx.currentTime + 0.01;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.25 * volume, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + 0.2);
}

export function getVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices();
}

// ---------- picking the most natural device voice ----------

/** Old, robotic or novelty voices that browsers often list first. */
const ROBOTIC = /\b(david|zira|mark|hazel|george|susan|fred|albert|bad news|bahh|bells|boing|bubbles|cellos|jester|organ|trinoids|whisper|wobble|zarvox|superstar|good news|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley|junior|ralph|kathy|princess|espeak)\b/i;

/** Higher = more natural sounding. English voices only score above zero. */
export function voiceScore(v: SpeechSynthesisVoice): number {
  if (!v.lang.toLowerCase().startsWith('en')) return -100;
  const name = v.name;
  let s = 0;
  if (/natural|neural|premium|enhanced/i.test(name)) s += 60; // Edge "Online (Natural)", Apple Premium/Enhanced
  if (/microsoft/i.test(name) && /online/i.test(name)) s += 20;
  if (/^google/i.test(name)) s += 40; // Chrome's cloud voices
  if (/siri/i.test(name)) s += 45;
  if (/^(samantha|daniel|karen|moira|tessa|serena|alex|ava|evan|nathan|zoe|allison|tom)\b/i.test(name)) s += 15; // decent Apple voices
  if (/en[-_](us|gb|au|ie|nz)/i.test(v.lang)) s += 5;
  if (ROBOTIC.test(name)) s -= 40;
  return s;
}

/** Natural enough to recommend in the voice picker. */
export const isNaturalVoice = (v: SpeechSynthesisVoice) => voiceScore(v) >= 40;

/** The most natural English voice on this device, if any. */
export function bestVoice(voices = getVoices()): SpeechSynthesisVoice | undefined {
  let best: SpeechSynthesisVoice | undefined;
  for (const v of voices) if (voiceScore(v) > 0 && (!best || voiceScore(v) > voiceScore(best))) best = v;
  return best;
}

// ---------- recorded coach clips (public/voice, made by scripts/generate-voice.ts) ----------

let clipFiles: Record<string, string> | null = null;
let manifestLoad: Promise<void> | null = null;
const clipBuffers = new Map<string, AudioBuffer>();
const clipLoads = new Map<string, Promise<void>>();
let clipSources: AudioBufferSourceNode[] = [];
let clipRelease: (() => void) | null = null;

/** Fetch the list of recorded clips (once). Missing list = no clips; the device voice is used. */
export function loadVoiceManifest(): Promise<void> {
  manifestLoad ??= fetch(`${import.meta.env.BASE_URL}voice/manifest.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then((m: { clips?: Record<string, string> } | null) => {
      clipFiles = m?.clips ?? {};
    })
    .catch(() => {
      clipFiles = {};
    });
  return manifestLoad;
}

/** Whether a recorded clip exists for this text (once the manifest has loaded). */
export const hasClip = (text: string) => !!clipFiles?.[clipKey(text)];

/** Download + decode the clips for these phrases so they can play instantly. */
export async function preloadVoice(texts: string[]) {
  await loadVoiceManifest();
  const c = ctx;
  if (!c || !clipFiles) return;
  await Promise.all(
    texts.map((t) => {
      const key = clipKey(t);
      const file = clipFiles![key];
      if (!file || clipBuffers.has(key)) return undefined;
      let p = clipLoads.get(key);
      if (!p) {
        p = fetch(`${import.meta.env.BASE_URL}voice/${file}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((buf) => c.decodeAudioData(buf))
          .then((b) => void clipBuffers.set(key, normalize(b)))
          .catch(() => void clipLoads.delete(key));
        clipLoads.set(key, p);
      }
      return p;
    }),
  );
}

/** Make every clip loud and even: speech level to about -13 dB RMS, peaks kept under -0.5 dB. */
function normalize(b: AudioBuffer): AudioBuffer {
  let peak = 0;
  let sum = 0;
  let n = 0;
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a > 0.01) {
        sum += d[i] * d[i];
        n++;
      }
    }
  }
  if (!peak || !n) return b;
  const rmsDb = 10 * Math.log10(sum / n);
  const gain = Math.min(Math.pow(10, (-13 - rmsDb) / 20), 0.94 / peak);
  if (gain <= 1.01) return b;
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
  return b;
}

/** Voice output: a fast limiter so a loud clip at full volume can't distort. */
let voiceOut: AudioNode | null = null;
function voiceOutput(c: AudioContext): AudioNode {
  if (voiceOut && voiceOut.context === c) return voiceOut;
  const lim = c.createDynamicsCompressor();
  lim.threshold.value = -2;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.002;
  lim.release.value = 0.08;
  lim.connect(c.destination);
  voiceOut = lim;
  return lim;
}

function stopClips() {
  for (const s of clipSources) {
    try {
      s.stop();
    } catch {
      /* already stopped */
    }
  }
  clipSources = [];
  clipRelease?.();
}

/** Play recorded clips back to back. Returns false (playing nothing) unless every part has a clip ready. */
function playClips(parts: string[], volume: number): boolean {
  const c = ctx;
  if (!c || c.state !== 'running') return false;
  const bufs = parts.map((p) => clipBuffers.get(clipKey(p)));
  if (!bufs.length || bufs.some((b) => !b)) return false;
  stopSpeech();
  const gain = c.createGain();
  gain.gain.value = volume;
  gain.connect(voiceOutput(c));
  let t = c.currentTime + 0.02;
  for (const b of bufs as AudioBuffer[]) {
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(gain);
    src.start(t);
    clipSources.push(src);
    t += b.duration + 0.06;
  }
  if (speechListener) {
    const listener = speechListener;
    let open = true;
    const release = () => {
      if (open) listener(false);
      open = false;
      if (clipRelease === release) clipRelease = null;
    };
    listener(true);
    clipRelease = release;
    window.setTimeout(release, (t - c.currentTime) * 1000 + 50);
  }
  return true;
}

// ---------- speaking ----------

/**
 * Say a phrase. Pass parts (e.g. ["First up", "Jab Cross"]) so recorded clips can be joined.
 * voiceURI null = automatic: the recorded coach voice when every part has a clip, otherwise the most
 * natural voice on this device. A chosen voiceURI always uses that device voice.
 */
export function speak(text: string | string[], opts: { voiceURI?: string | null; rate?: number; volume?: number } = {}) {
  const parts = (Array.isArray(text) ? text : [text]).filter(Boolean);
  if (!parts.length) return;
  const ticket = ++speakTicket;
  if (!opts.voiceURI) {
    if (playClips(parts, opts.volume ?? 1)) return;
    // Recorded, but still downloading: wait briefly rather than switch voices.
    if (ctx && parts.every(hasClip)) {
      const timeout = new Promise<void>((r) => window.setTimeout(r, 1500));
      void Promise.race([preloadVoice(parts), timeout]).then(() => {
        if (ticket !== speakTicket) return; // something newer was said meanwhile
        if (!playClips(parts, opts.volume ?? 1)) speakDevice(parts, opts);
      });
      return;
    }
  }
  speakDevice(parts, opts);
}

/** Incremented on every speak() so a delayed clip doesn't talk over something newer. */
let speakTicket = 0;

function speakDevice(parts: string[], opts: { voiceURI?: string | null; rate?: number; volume?: number }) {
  if (!('speechSynthesis' in window)) return;
  const line = parts.join('. ');
  try {
    stopSpeech();
    const u = new SpeechSynthesisUtterance(line);
    const v = opts.voiceURI ? getVoices().find((x) => x.voiceURI === opts.voiceURI) : bestVoice();
    if (v) u.voice = v;
    u.rate = opts.rate ?? 1;
    u.volume = opts.volume ?? 1;
    u.lang = v?.lang ?? 'en-US';
    if (speechListener) {
      const listener = speechListener;
      let open = true;
      const release = () => {
        if (open) listener(false);
        open = false;
      };
      listener(true);
      u.onend = release;
      u.onerror = release;
      // Some browsers never fire onend; don't leave the music ducked.
      window.setTimeout(release, 1500 + line.length * 90);
    }
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function stopSpeech() {
  speakTicket++;
  if (clipSources.length) stopClips();
  try {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

/** Keep the screen awake during a session where supported. */
export async function requestWakeLock(): Promise<{ release: () => void } | null> {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return null;
    const lock = await nav.wakeLock.request('screen');
    return { release: () => void lock.release().catch(() => {}) };
  } catch {
    return null;
  }
}
