import { useEffect, useRef, useState } from 'react';
import { bell, bestVoice, ensureAudioContext, getVoices, hasClip, isNaturalVoice, loadVoiceManifest, preloadVoice, speak, unlockAudio, voiceScore } from '../lib/audio';
import { useStore } from '../lib/store';
import FighterPicker from '../components/FighterPicker';
import AccountCard from '../components/AccountCard';
import { useAuth } from '../lib/auth';
import { PHRASES } from '../data/phrases';
import { SHUFFLE_TRAINING, TRAINING_TRACKS, primeTrainingMusic, setMusicScene } from '../lib/music';
import { useDialog } from '../components/Dialog';
import { downloadBackup, emptyData, parseData, type Settings as S } from '../lib/storage';

export default function Settings() {
  const { data, update, replace } = useStore();
  const { account, clearRemoteHistory } = useAuth();
  const dialog = useDialog();
  const s = data.settings;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(getVoices);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState(false);

  // Preview the chosen training track; back to calm music when stopped or leaving Settings.
  useEffect(() => {
    if (!previewing) return;
    setMusicScene('fight');
    return () => setMusicScene('calm');
  }, [previewing]);
  useEffect(() => {
    if (!s.music) setPreviewing(false);
  }, [s.music]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(getVoices());
    speechSynthesis.addEventListener('voiceschanged', load);
    load(); // voices may have loaded before this listener was added
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const set = <K extends keyof S>(k: K, v: S[K]) => update((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  // Most natural first.
  const list = [...(english.length ? english : voices)].sort((a, b) => voiceScore(b) - voiceScore(a));
  const auto = bestVoice(voices);
  const [coachVoice, setCoachVoice] = useState(false);
  useEffect(() => {
    void loadVoiceManifest().then(() => setCoachVoice(hasClip(PHRASES.test)));
  }, []);

  const test = () => {
    unlockAudio();
    if (s.sounds) bell(1, s.volume);
    const ready = preloadVoice([PHRASES.test]);
    setTimeout(() => void ready.then(() => speak(PHRASES.test, { voiceURI: s.voiceURI, rate: s.rate, volume: s.volume })), 600);
  };

  const onImport = async (file: File) => {
    try {
      const parsed = parseData(JSON.parse(await file.text()));
      if (
        !(await dialog.confirm({
          title: 'Import this backup?',
          message: `It replaces everything on this device with ${parsed.combos.length} combos and ${parsed.history.length} sessions from the file.`,
          confirmLabel: 'Replace data',
          danger: true,
        }))
      )
        return;
      replace(parsed);
      setMsg('Backup imported.');
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>
      <AccountCard />

      <section className="card">
        <h2>Stance</h2>
        <div className="seg">
          {(['orthodox', 'southpaw'] as const).map((x) => (
            <button key={x} className={`seg-btn ${s.stance === x ? 'on' : ''}`} onClick={() => set('stance', x)}>
              {x === 'orthodox' ? 'Orthodox (left foot forward)' : 'Southpaw (right foot forward)'}
            </button>
          ))}
        </div>
        <p className="muted small">Southpaw mirrors all the animations.</p>
      </section>

      <section className="card">
        <h2>Illustrations</h2>
        <div className="seg">
          <button className={`seg-btn ${s.figure === '2d' ? 'on' : ''}`} onClick={() => set('figure', '2d')}>
            2D (simple)
          </button>
          <button className={`seg-btn ${s.figure === '3d' ? 'on' : ''}`} onClick={() => set('figure', '3d')}>
            3D (rotate with drag)
          </button>
        </div>
        <p className="muted small">3D is used for technique tutorials, combo previews and the training screen. Technique thumbnails stay 2D.</p>
      </section>

      <section className="card">
        <h2>Your fighter</h2>
        <p className="muted small">Choose who demonstrates the techniques. Shown in full in 3D; 2D uses their colours.</p>
        <FighterPicker />
      </section>

      <section className="card">
        <h2>Voice & sound</h2>
        <label className="check">
          <input type="checkbox" checked={s.voice} onChange={(e) => set('voice', e.target.checked)} /> Voice callouts
        </label>
        <label className="check">
          <input type="checkbox" checked={s.sounds} onChange={(e) => set('sounds', e.target.checked)} /> Bell & 10-second clap
        </label>
        <label className="check">
          <input type="checkbox" checked={s.music} onChange={(e) => set('music', e.target.checked)} /> Background music
        </label>
        <p className="muted small">Calm music while you browse; driving fight music while you train. It dips under voice callouts.</p>
        {s.music && (
          <label className="field">
            <span>Music volume: {Math.round(s.musicVolume * 100)}%</span>
            <input type="range" min={0.05} max={1} step={0.05} value={s.musicVolume} onChange={(e) => set('musicVolume', Number(e.target.value))} />
          </label>
        )}
        {s.music && (
          <div className="field">
            <span>Training music</span>
            <select
              className="input"
              aria-label="Training music"
              value={TRAINING_TRACKS.some((t) => t.id === s.trainingTrack) ? s.trainingTrack : SHUFFLE_TRAINING}
              onChange={(e) => set('trainingTrack', e.target.value)}
            >
              <option value={SHUFFLE_TRAINING}>🔀 Shuffle all ({TRAINING_TRACKS.length} tracks)</option>
              {TRAINING_TRACKS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {s.trainingTrack === SHUFFLE_TRAINING && (
              <p className="muted small">Each session picks two tracks at random and alternates between them.</p>
            )}
            <button
              className="btn small music-preview"
              aria-pressed={previewing}
              onClick={() => {
                ensureAudioContext();
                primeTrainingMusic();
                setPreviewing((p) => !p);
              }}
            >
              {previewing ? '■ Stop preview' : '▶ Preview'}
            </button>
          </div>
        )}
        <label className="field">
          <span>Voice</span>
          <select className="input" value={s.voiceURI ?? ''} onChange={(e) => set('voiceURI', e.target.value || null)}>
            <option value="">
              {coachVoice ? 'Auto — recorded coach voice' : `Auto — best on this device${auto ? ` (${auto.name})` : ''}`}
            </option>
            {list.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {isNaturalVoice(v) ? '★ ' : ''}
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          {coachVoice
            ? 'Auto uses the recorded coach voice for every built-in phrase and starter combo; your own combo names use the best voice on this device.'
            : '★ = natural-sounding voice.'}{' '}
          On iPhone, download an Enhanced or Premium voice in iOS Settings → Accessibility → Spoken Content → Voices for a more natural sound.
        </p>
        <label className="field">
          <span>Speech rate: {s.rate.toFixed(2)}x</span>
          <input type="range" min={0.7} max={1.6} step={0.05} value={s.rate} onChange={(e) => set('rate', Number(e.target.value))} />
        </label>
        <label className="field">
          <span>Volume: {Math.round(s.volume * 100)}%</span>
          <input type="range" min={0.1} max={1} step={0.05} value={s.volume} onChange={(e) => set('volume', Number(e.target.value))} />
        </label>
        <button className="btn" onClick={test}>
          🔊 Test sound
        </button>
      </section>

      <section className="card">
        <h2>Theme</h2>
        <div className="seg">
          {(['system', 'dark', 'light'] as const).map((x) => (
            <button key={x} className={`seg-btn ${s.theme === x ? 'on' : ''}`} onClick={() => set('theme', x)}>
              {x}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted small">
          {account
            ? 'Your combos, workouts, plans, history and most settings sync to your account, so they show up on any device you sign in on. Music and voice choices stay on this device. You can still export a backup file.'
            : 'Everything is stored on this device only. Sign in to sync across devices, or export a backup file to keep it safe.'}
        </p>
        <div className="row">
          <button className="btn" onClick={() => downloadBackup(data)}>
            Export backup
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import backup
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
              e.target.value = '';
            }}
          />
          <button
            className="btn danger"
            onClick={async () => {
              const where = account ? 'on this device and in your account' : 'on this device';
              if (
                !(await dialog.confirm({
                  title: 'Reset everything?',
                  message: `This erases all combos, progress, history and settings ${where}. It cannot be undone.`,
                  confirmLabel: 'Erase everything',
                  danger: true,
                }))
              )
                return;
              if (account) {
                try {
                  await clearRemoteHistory();
                } catch (e) {
                  setMsg(`Could not reach your account, nothing was erased: ${(e as Error).message}`);
                  return;
                }
              }
              replace(emptyData());
            }}
          >
            Reset everything
          </button>
        </div>
        {msg && <p className="small">{msg}</p>}
      </section>
    </div>
  );
}
