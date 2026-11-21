import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Figure from '../components/Figure';
import { CATEGORIES, TECH_BY_ID, youtubeId, youtubeSearchUrl } from '../data/techniques';
import { useStore } from '../lib/store';

const SPEEDS = [0.25, 0.5, 1];

export default function TechniqueDetail() {
  const { id = '' } = useParams();
  const t = TECH_BY_ID[id];
  const { data, update } = useStore();
  const navigate = useNavigate();
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(0.5);
  const [mirror, setMirror] = useState(data.settings.stance === 'southpaw');
  const [phase, setPhase] = useState(0);
  const [videoDraft, setVideoDraft] = useState(data.videos[id] ?? '');

  if (!t) {
    return (
      <div className="page">
        <p>Technique not found.</p>
        <Link to="/learn">Back to Learn</Link>
      </div>
    );
  }

  const learned = data.learned.includes(t.id);
  const savedVideo = data.videos[t.id];
  const vid = savedVideo ? youtubeId(savedVideo) : null;
  const cat = CATEGORIES.find((c) => c.id === t.category);

  const stepTo = (i: number) => {
    setPlaying(false);
    setPhase((i + t.phases.length) % t.phases.length);
  };

  const toggleLearned = () =>
    update((d) => ({ ...d, learned: learned ? d.learned.filter((x) => x !== t.id) : [...d.learned, t.id] }));

  const saveVideo = () =>
    update((d) => {
      const videos = { ...d.videos };
      if (videoDraft.trim()) videos[t.id] = videoDraft.trim();
      else delete videos[t.id];
      return { ...d, videos };
    });

  return (
    <div className="page detail">
      <Link to="/learn" className="back">
        ← {cat?.name}
      </Link>
      <h1>
        {t.code && <span className="code big">{t.code}</span>} {t.name}
      </h1>
      <p className="lead">{t.summary}</p>

      <div className="stage card">
        <Figure
          phases={t.phases}
          playing={playing}
          speed={speed}
          mirror={mirror}
          step={phase}
          hold={700}
          onPhase={setPhase}
          className="stage-figure"
          label={`${t.name} animation`}
        />
        <div className="phase-label" aria-live="polite">
          Step {phase + 1}/{t.phases.length}: <strong>{t.phases[phase]?.label}</strong>
        </div>
        <div className="controls">
          <button className="btn icon" onClick={() => stepTo(phase - 1)} aria-label="Previous step">
            ‹
          </button>
          <button className="btn primary" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button className="btn icon" onClick={() => stepTo(phase + 1)} aria-label="Next step">
            ›
          </button>
          <div className="seg" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} className={`seg-btn ${speed === s ? 'on' : ''}`} onClick={() => setSpeed(s)}>
                {s}x
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Southpaw view
          </label>
        </div>
        <ol className="phase-list">
          {t.phases.map((p, i) => (
            <li key={i} className={i === phase ? 'on' : ''}>
              <button onClick={() => stepTo(i)}>{p.label}</button>
            </li>
          ))}
        </ol>
      </div>

      <div className="two-col">
        <section className="card">
          <h2>Key cues</h2>
          <ul className="cues">
            {t.cues.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Common mistakes</h2>
          <ul className="mistakes">
            {t.mistakes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card">
        <h2>Video</h2>
        {vid ? (
          <div className="video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${vid}`}
              title={`${t.name} video`}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : savedVideo ? (
          <p>
            <a href={savedVideo} target="_blank" rel="noreferrer">
              Open your saved video ↗
            </a>
          </p>
        ) : (
          <p className="muted small">Find a video you like, then paste its link below to keep it here.</p>
        )}
        <div className="row">
          <a className="btn" href={youtubeSearchUrl(t.videoQuery)} target="_blank" rel="noreferrer">
            Search YouTube ↗
          </a>
        </div>
        <div className="row">
          <input
            className="input grow"
            type="url"
            placeholder="Paste a video link (YouTube links embed here)"
            value={videoDraft}
            onChange={(e) => setVideoDraft(e.target.value)}
          />
          <button className="btn" onClick={saveVideo} disabled={(savedVideo ?? '') === videoDraft.trim()}>
            Save
          </button>
        </div>
      </section>

      <div className="row actions">
        <button className={`btn ${learned ? '' : 'primary'}`} onClick={toggleLearned}>
          {learned ? '✓ Learned (undo)' : 'Mark as learned'}
        </button>
        {t.strike && (
          <button className="btn accent" onClick={() => navigate(`/train?technique=${t.id}`)}>
            Practice this for a round
          </button>
        )}
      </div>
    </div>
  );
}
