import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Demo documents list
  const docs = [
    { id: 'getting-started', title: '📝 Getting Started', updated: '2 min ago' },
    { id: 'meeting-notes', title: '📋 Meeting Notes', updated: '1 hour ago' },
    { id: 'project-plan', title: '📊 Project Plan', updated: '3 hours ago' },
  ];

  return (
    <div className={`app-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <span className="brand-icon">⚡</span>
            {sidebarOpen && <span className="brand-text">CollabDoc</span>}
          </Link>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        <nav className="sidebar-nav">
          <Link
            to="/app"
            className={`sidebar-link ${location.pathname === '/app' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">🏠</span>
            {sidebarOpen && <span>Dashboard</span>}
          </Link>

          <div className="sidebar-section">
            {sidebarOpen && <span className="sidebar-section-title">Documents</span>}
            {docs.map(doc => (
              <Link
                key={doc.id}
                to={`/app/doc/${doc.id}`}
                className={`sidebar-link ${location.pathname.includes(doc.id) ? 'active' : ''}`}
              >
                <span className="sidebar-icon">📄</span>
                {sidebarOpen && (
                  <div className="sidebar-link-content">
                    <span>{doc.title}</span>
                    <span className="sidebar-meta">{doc.updated}</span>
                  </div>
                )}
              </Link>
            ))}
          </div>

          <button
            className="sidebar-link new-doc-btn"
            onClick={() => navigate(`/app/doc/doc-${Date.now()}`)}
          >
            <span className="sidebar-icon">➕</span>
            {sidebarOpen && <span>New Document</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar" style={{ background: 'var(--accent)' }}>D</div>
            {sidebarOpen && (
              <div className="user-info">
                <span className="user-name">Demo User</span>
                <span className="user-status">Online</span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
