
export default function HeroPage() {
  const codeSnippet = `import { CollabDoc } from 'collabdoc-sdk';

const doc = new CollabDoc({
  roomId: 'my-room',
  serverUrl: 'wss://your-server.com',
  user: { name: 'Alice', color: '#7c5cfc' },
});

doc.connect();
doc.set(['title'], 'Hello World');

// That's it. Real-time sync just works.`;

  return (
    <div className="hero-page">
      {/* Ambient glow */}
      <div className="hero-glow" aria-hidden="true" />

      <section className="hero-section container">
        <div className="hero-content animate-in-up">
          <span className="badge">
            <span className="badge-dot" />
            Open Source · MIT Licensed
          </span>

          <h1 className="hero-title">
            Add <span className="gradient-text">real-time collaboration</span> to
            any app in minutes
          </h1>

          <p className="hero-subtitle">
            CollabDoc is a self-hostable SDK that gives your app multiplayer editing,
            live cursors, and presence — without vendor lock-in.
            Built on <strong>Yjs CRDTs</strong> and <strong>Socket.IO</strong>.
          </p>

          <div className="hero-actions">
            <a href="#demo" className="btn btn-primary">
              Try Live Demo
              <span className="btn-arrow">→</span>
            </a>
            <a href="#features" className="btn btn-secondary">
              See Features
            </a>
          </div>

          <div className="hero-stats stagger">
            {[
              { value: '< 10KB', label: 'SDK gzipped' },
              { value: '~50ms', label: 'Sync latency' },
              { value: '∞', label: 'Self-hostable' },
              { value: 'CRDT', label: 'No conflicts' },
            ].map(({ value, label }) => (
              <div key={label} className="stat-item animate-in">
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="hero-code animate-in-up" style={{ animationDelay: '200ms' }}>
          <div className="code-window">
            <div className="code-titlebar">
              <span className="code-dot red" />
              <span className="code-dot yellow" />
              <span className="code-dot green" />
              <span className="code-filename">app.ts</span>
            </div>
            <pre className="code-body">
              <code>{codeSnippet}</code>
            </pre>
          </div>

          {/* Floating presence indicators */}
          <div className="hero-presence">
            <div className="presence-pill" style={{ '--c': '#7c5cfc' } as any}>
              <span className="presence-avatar">A</span>
              <span className="presence-name">Alice</span>
              <span className="presence-cursor" />
            </div>
            <div className="presence-pill" style={{ '--c': '#34d399' } as any}>
              <span className="presence-avatar">B</span>
              <span className="presence-name">Bob</span>
              <span className="presence-cursor" />
            </div>
            <div className="presence-pill" style={{ '--c': '#f472b6' } as any}>
              <span className="presence-avatar">C</span>
              <span className="presence-name">Carol</span>
              <span className="presence-cursor" />
            </div>
          </div>
        </div>
      </section>

      {/* Trusted by / Social proof */}
      <section className="social-proof container animate-in">
        <p className="proof-label">Built with proven technology</p>
        <div className="tech-logos">
          {['Yjs', 'Socket.IO', 'PostgreSQL', 'Redis', 'TypeScript'].map(tech => (
            <span key={tech} className="tech-badge">{tech}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
