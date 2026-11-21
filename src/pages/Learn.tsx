import { Link } from 'react-router-dom';
import Figure from '../components/Figure';
import { CATEGORIES, TECHNIQUES } from '../data/techniques';
import { useStore } from '../lib/store';

export default function Learn() {
  const { data } = useStore();
  const learned = new Set(data.learned);
  const done = TECHNIQUES.filter((t) => learned.has(t.id)).length;
  const mirror = data.settings.stance === 'southpaw';

  return (
    <div className="page">
      <h1>Learn the basics</h1>
      <p className="muted">Tap a technique for a step-by-step animated breakdown, key cues and video.</p>

      <div className="progress" aria-label={`${done} of ${TECHNIQUES.length} techniques learned`}>
        <div className="progress-bar" style={{ width: `${(done / TECHNIQUES.length) * 100}%` }} />
        <span className="progress-label">
          {done} / {TECHNIQUES.length} learned
        </span>
      </div>

      {CATEGORIES.map((cat) => {
        const items = TECHNIQUES.filter((t) => t.category === cat.id);
        return (
          <section key={cat.id} className="section">
            <h2>{cat.name}</h2>
            <p className="muted small">{cat.blurb}</p>
            <div className="grid">
              {items.map((t) => {
                const peak = t.phases.length > 1 ? t.phases[t.phases.length - 2].pose : t.phases[0].pose;
                return (
                  <Link key={t.id} to={`/learn/${t.id}`} className={`card tech-card ${learned.has(t.id) ? 'is-learned' : ''}`}>
                    <Figure pose={peak} playing={false} mirror={mirror} className="thumb" label={`${t.name} pose`} />
                    <div className="tech-card-body">
                      <div className="tech-card-title">
                        {t.code && <span className="code">{t.code}</span>}
                        {t.name}
                      </div>
                      <div className="tags">
                        <span className={`tag tag-${t.level}`}>{t.level}</span>
                        {learned.has(t.id) && <span className="tag tag-done">✓ learned</span>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
