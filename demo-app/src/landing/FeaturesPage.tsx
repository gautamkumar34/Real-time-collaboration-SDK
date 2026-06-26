export default function FeaturesPage() {
  const features = [
    {
      icon: '🔄',
      title: 'CRDT-Powered Sync',
      desc: 'Built on Yjs — the industry-standard CRDT library. Edits never conflict, even with poor network.',
      color: 'var(--accent)',
    },
    {
      icon: '👥',
      title: 'Live Presence',
      desc: "See who's online, where their cursor is, and what they're selecting — all in real-time.",
      color: 'var(--green)',
    },
    {
      icon: '🔌',
      title: 'Simple SDK',
      desc: 'Three lines of code to connect. Works with React, Vue, vanilla JS — any framework.',
      color: 'var(--blue)',
    },
    {
      icon: '🏠',
      title: 'Self-Hostable',
      desc: 'Run on your own infrastructure with Docker. No vendor lock-in, no surprise bills.',
      color: 'var(--pink)',
    },
    {
      icon: '🔐',
      title: 'JWT Auth',
      desc: 'Room-scoped tokens with read/write permissions. Integrate with any auth provider.',
      color: 'var(--yellow)',
    },
    {
      icon: '💾',
      title: 'Auto-Persistence',
      desc: 'Postgres or in-memory store. Automatic snapshots and op-log for crash recovery.',
      color: 'var(--cyan)',
    },
  ];

  return (
    <div className="features-page">
      <section className="section container">
        <div className="section-header animate-in-up">
          <span className="badge">Features</span>
          <h1>Everything you need for <span className="gradient-text">multiplayer</span></h1>
          <p className="section-subtitle">
            A complete toolkit for adding real-time collaboration to your app.
            No complex setup, no third-party dependencies.
          </p>
        </div>

        <div className="features-grid stagger">
          {features.map(({ icon, title, desc, color }) => (
            <div key={title} className="feature-card animate-in">
              <span className="feature-icon" style={{ background: `${color}18`, color }}>{icon}</span>
              <h3>{title}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture diagram section */}
      <section className="section container">
        <div className="section-header animate-in-up">
          <h2>How it works</h2>
          <p className="section-subtitle">Simple architecture, powerful results</p>
        </div>

        <div className="arch-diagram animate-in-up">
          <div className="arch-flow">
            <div className="arch-node client-node">
              <span className="arch-label">Your App</span>
              <span className="arch-sub">CollabDoc SDK</span>
            </div>
            <div className="arch-arrow">⇄</div>
            <div className="arch-node server-node">
              <span className="arch-label">CollabDoc Server</span>
              <span className="arch-sub">Socket.IO + Yjs</span>
            </div>
            <div className="arch-arrow">⇄</div>
            <div className="arch-node store-node">
              <span className="arch-label">PostgreSQL</span>
              <span className="arch-sub">Snapshots + Op Log</span>
            </div>
          </div>
          <div className="arch-flow" style={{ marginTop: 'var(--space-md)' }}>
            <div className="arch-node client-node">
              <span className="arch-label">Another Client</span>
              <span className="arch-sub">Same room</span>
            </div>
            <div className="arch-arrow">⇄</div>
            <div className="arch-node server-node">
              <span className="arch-label">Redis Pub/Sub</span>
              <span className="arch-sub">Multi-instance</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
