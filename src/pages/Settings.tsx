import { useEffect, useRef, useState } from 'react';
import { bell, getVoices, speak, unlockAudio } from '../lib/audio';
import { useStore } from '../lib/store';
import { downloadBackup, emptyData, parseData, type Settings as S } from '../lib/storage';

export default function Settings() {
  const { data, update, replace } = useStore();
  const s = data.settings;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(getVoices);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const load = () => setVoices(getVoices());
    speechSynthesis.addEventListener('voiceschanged', load);
    return () => speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const set = <K extends keyof S>(k: K, v: S[K]) => update((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const list = english.length ? english : voices;

  const test = () => {
    unlockAudio();
    if (s.sounds) bell(1, s.volume);
    setTimeout(() => speak('One, two, kick!', { voiceURI: s.voiceURI, rate: s.rate, volume: s.volume }), 600);
  };

  const onImport = async (file: File) => {
    try {
      const parsed = parseData(JSON.parse(await file.text()));
      if (!confirm(`Replace current data with this backup (${parsed.combos.length} combos, ${parsed.history.length} sessions)?`)) return;
      replace(parsed);
      setMsg('Backup imported.');
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <h1>Settings</h1>

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
        <h2>Voice & sound</h2>
        <label className="check">
          <input type="checkbox" checked={s.voice} onChange={(e) => set('voice', e.target.checked)} /> Voice callouts
        </label>
        <label className="check">
          <input type="checkbox" checked={s.sounds} onChange={(e) => set('sounds', e.target.checked)} /> Bell & 10-second clap
        </label>
        <label className="field">
          <span>Voice</span>
          <select className="input" value={s.voiceURI ?? ''} onChange={(e) => set('voiceURI', e.target.value || null)}>
            <option value="">Default</option>
            {list.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        </label>
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
          Everything is stored on this device only. Export a backup file to keep it safe or move it to another device.
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
            onClick={() => {
              if (confirm('Erase all combos, progress, history and settings on this device? This cannot be undone.')) replace(emptyData());
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
