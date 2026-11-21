/** Voice callouts (Web Speech API) and generated sounds (Web Audio API). No audio files needed. */

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

export function speak(text: string, opts: { voiceURI?: string | null; rate?: number; volume?: number } = {}) {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = opts.voiceURI ? getVoices().find((x) => x.voiceURI === opts.voiceURI) : undefined;
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
      window.setTimeout(release, 1500 + text.length * 90);
    }
    speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export function stopSpeech() {
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
