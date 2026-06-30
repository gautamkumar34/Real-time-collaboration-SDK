import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { DocIcon } from '../components/DocIcon';

export interface DocumentItem {
  id: string;
  title: string;
  type: string;
  updated: string;
  collaborators: number;
}

const LightningIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

const CollapseIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const ExpandIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export function getSavedDocuments(): DocumentItem[] {
  const data = localStorage.getItem('collab-docs-list');
  if (data) {
    try {
      return JSON.parse(data);
    } catch (e) {}
  }
  
  // Default documents with type identifiers instead of emojis
  const defaults: DocumentItem[] = [
    { id: 'getting-started', title: 'Getting Started', type: 'doc', updated: '2 min ago', collaborators: 1 },
    { id: 'meeting-notes', title: 'Meeting Notes', type: 'list', updated: '1 hour ago', collaborators: 2 },
    { id: 'project-plan', title: 'Project Plan', type: 'chart', updated: '3 hours ago', collaborators: 3 },
  ];
  localStorage.setItem('collab-docs-list', JSON.stringify(defaults));
  return defaults;
}

export function saveDocuments(docs: DocumentItem[]) {
  localStorage.setItem('collab-docs-list', JSON.stringify(docs));
  window.dispatchEvent(new Event('collab-docs-changed'));
}

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [docs, setDocs] = useState<DocumentItem[]>(() => getSavedDocuments());
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('doc');

  // Load current user
  const [currentUser] = useState(() => {
    const stored = localStorage.getItem('collab-doc-user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return { name: 'Demo User', color: '#0070f3' };
  });

  // Listen to changes in documents list
  useEffect(() => {
    const handleUpdate = () => {
      setDocs(getSavedDocuments());
    };
    window.addEventListener('collab-docs-changed', handleUpdate);
    return () => window.removeEventListener('collab-docs-changed', handleUpdate);
  }, []);

  const handleCreate = () => {
    if (!newTitle.trim()) return;
    const newId = `doc-${Date.now()}`;
    const newDoc: DocumentItem = {
      id: newId,
      title: newTitle,
      type: newType,
      updated: 'Just now',
      collaborators: 1,
    };
    saveDocuments([newDoc, ...docs]);
    setModalOpen(false);
    setNewTitle('');
    navigate(`/app/doc/${newId}`);
  };

  const iconOptions = [
    { type: 'doc', label: 'Document' },
    { type: 'list', label: 'List' },
    { type: 'chart', label: 'Chart' },
    { type: 'launch', label: 'Launch' },
    { type: 'idea', label: 'Idea' },
    { type: 'design', label: 'Design' },
    { type: 'work', label: 'Work' },
    { type: 'pin', label: 'Pin' },
  ];

  return (
    <div className={`app-layout ${sidebarOpen ? '' : 'sidebar-collapsed'}`}>
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="sidebar-header">
          <Link to="/" className="sidebar-brand">
            <LightningIcon />
            {sidebarOpen && <span className="brand-text">CollabDoc</span>}
          </Link>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <CollapseIcon /> : <ExpandIcon />}
          </button>
        </div>

        <nav className="sidebar-nav">
          <Link
            to="/app"
            className={`sidebar-link ${location.pathname === '/app' ? 'active' : ''}`}
          >
            <span className="sidebar-icon">
              <HomeIcon />
            </span>
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
                <span className="sidebar-icon">
                  <DocIcon type={doc.type || 'doc'} size={16} />
                </span>
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
            onClick={() => setModalOpen(true)}
          >
            <span className="sidebar-icon">
              <PlusIcon />
            </span>
            {sidebarOpen && <span>New Document</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar" style={{ background: currentUser.color || 'var(--accent)' }}>
              {currentUser.name ? currentUser.name[0].toUpperCase() : 'U'}
            </div>
            {sidebarOpen && (
              <div className="user-info">
                <span className="user-name">{currentUser.name}</span>
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

      {/* New Document Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()}>
            <h3>Create New Document</h3>
            <div className="form-group">
              <label>Document Title</label>
              <input
                type="text"
                className="modal-input"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="My Awesome Plan"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="form-group">
              <label>Select Icon Type</label>
              <div className="emoji-picker-row">
                {iconOptions.map(opt => (
                  <button
                    key={opt.type}
                    type="button"
                    title={opt.label}
                    className={`emoji-choice-btn ${newType === opt.type ? 'selected' : ''}`}
                    onClick={() => setNewType(opt.type)}
                  >
                    <DocIcon type={opt.type} size={18} />
                  </button>
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
