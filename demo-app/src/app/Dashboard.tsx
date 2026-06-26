import { Link } from 'react-router-dom';

export default function Dashboard() {
  const recentDocs = [
    { id: 'getting-started', title: 'Getting Started', emoji: '📝', updated: '2 min ago', collaborators: 3 },
    { id: 'meeting-notes', title: 'Meeting Notes', emoji: '📋', updated: '1 hour ago', collaborators: 2 },
    { id: 'project-plan', title: 'Project Plan', emoji: '📊', updated: '3 hours ago', collaborators: 5 },
  ];

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Welcome back 👋</h1>
          <p className="text-secondary">Here are your recent documents</p>
        </div>
      </header>

      {/* Stats */}
      <div className="dashboard-stats">
        {[
          { label: 'Documents', value: '3', icon: '📄' },
          { label: 'Active Now', value: '2', icon: '🟢' },
          { label: 'Collaborators', value: '8', icon: '👥' },
        ].map(stat => (
          <div key={stat.label} className="dash-stat-card">
            <span className="dash-stat-icon">{stat.icon}</span>
            <div>
              <span className="dash-stat-value">{stat.value}</span>
              <span className="dash-stat-label">{stat.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Documents */}
      <section className="dashboard-section">
        <h2>Recent Documents</h2>
        <div className="doc-grid">
          {recentDocs.map(doc => (
            <Link key={doc.id} to={`/app/doc/${doc.id}`} className="doc-card">
              <div className="doc-card-header">
                <span className="doc-emoji">{doc.emoji}</span>
                <span className="doc-meta">{doc.updated}</span>
              </div>
              <h3 className="doc-title">{doc.title}</h3>
              <div className="doc-card-footer">
                <div className="doc-avatars">
                  {Array.from({ length: Math.min(doc.collaborators, 3) }, (_, i) => (
                    <div
                      key={i}
                      className="doc-avatar"
                      style={{
                        background: ['var(--accent)', 'var(--green)', 'var(--pink)'][i],
                        zIndex: 3 - i,
                      }}
                    />
                  ))}
                  {doc.collaborators > 3 && (
                    <span className="doc-avatar-more">+{doc.collaborators - 3}</span>
                  )}
                </div>
                <span className="doc-collab-count">{doc.collaborators} collaborators</span>
              </div>
            </Link>
          ))}

          {/* New document card */}
          <Link to={`/app/doc/doc-${Date.now()}`} className="doc-card doc-card-new">
            <span className="doc-new-icon">+</span>
            <h3>New Document</h3>
          </Link>
        </div>
      </section>
    </div>
  );
}
