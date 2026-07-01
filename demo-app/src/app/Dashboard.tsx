import { Link, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getSavedDocuments, saveDocuments, type DocumentItem } from './AppLayout';
import { DocIcon } from '../components/DocIcon';

const PulseIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
  </svg>
);

const FileTextIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <path d="M10 9H8" />
    <path d="M16 13H8" />
    <path d="M16 17H8" />
  </svg>
);

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const NewCardIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px' }}>
    <circle cx="12" cy="12" r="10" />
    <path d="M8 12h8" />
    <path d="M12 8v8" />
  </svg>
);
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocumentItem[]>(() => getSavedDocuments());
  const [roomCounts, setRoomCounts] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('doc');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirmId(id);
  };

  const executeDelete = async () => {
    if (!deleteConfirmId) return;
    const id = deleteConfirmId;
    setDeleteConfirmId(null);
    
    const updatedDocs = docs.filter(d => d.id !== id);
    saveDocuments(updatedDocs);
    setDocs(updatedDocs);

    try {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
      await fetch(`${serverUrl}/api/doc/${id}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error('Failed to delete document from backend', err);
    }
  };

  useEffect(() => {
    const handleUpdate = () => {
      setDocs(getSavedDocuments());
    };
    window.addEventListener('collab-docs-changed', handleUpdate);
    return () => window.removeEventListener('collab-docs-changed', handleUpdate);
  }, []);

  useEffect(() => {
    // Fetch live user counts per document room from the backend
    const fetchRoomCounts = async () => {
      try {
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
        const res = await fetch(`${serverUrl}/api/rooms`);
        if (res.ok) {
          const counts = await res.json();
          setRoomCounts(counts);
        }
      } catch (err) {
        console.error('Failed to fetch room counts', err);
      }
    };

    fetchRoomCounts();
    const interval = setInterval(fetchRoomCounts, 5000); // refresh every 5s
    return () => clearInterval(interval);
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
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div>
          <h1>Welcome back</h1>
          <p className="text-secondary">Here are your collaborative documents</p>
        </div>
      </header>

      {/* Stats */}
      <div className="dashboard-stats">
        {[
          { label: 'Documents', value: String(docs.length), icon: <FileTextIcon /> },
          { label: 'Active Collaboration', value: 'Live Sync', icon: <PulseIcon /> },
          { label: 'Active Users', value: 'Multiplayer', icon: <UsersIcon /> },
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
          {docs.map(doc => (
            <div 
              key={doc.id} 
              onClick={() => navigate(`/app/doc/${doc.id}`)} 
              className="doc-card animate-in"
              style={{ cursor: 'pointer' }}
            >
              <div className="doc-card-header">
                <span className="doc-emoji">
                  <DocIcon type={doc.type || 'doc'} size={20} />
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="doc-meta">{doc.updated}</span>
                  <button 
                    className="doc-delete-btn" 
                    onClick={(e) => handleDeleteClick(e, doc.id)}
                    title="Delete document"
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }}
                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--red)'}
                    onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              <h3 className="doc-title">{doc.title}</h3>
              <div className="doc-card-footer">
                <div className="doc-avatars">
                  {Array.from({ length: Math.min(roomCounts[doc.id] || 0, 3) }, (_, i) => (
                    <div
                      key={i}
                      className="doc-avatar"
                      style={{
                        background: ['var(--green)', 'var(--blue)', 'var(--pink)'][i],
                        zIndex: 3 - i,
                      }}
                    />
                  ))}
                  {(roomCounts[doc.id] || 0) > 3 && (
                    <span className="doc-avatar-more">+{(roomCounts[doc.id] || 0) - 3}</span>
                  )}
                </div>
                <span className="doc-collab-count">{roomCounts[doc.id] || 0} online</span>
              </div>
            </div>
          ))}

          {/* New document card */}
          <button onClick={() => setModalOpen(true)} className="doc-card doc-card-new">
            <NewCardIcon />
            <h3>New Document</h3>
          </button>
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
          <div className="modal-content glass" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 style={{ color: 'var(--red)', marginBottom: '16px' }}>Delete Document</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete this document? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button className="btn" style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }} onClick={() => setDeleteConfirmId(null)}>
                Cancel
              </button>
              <button className="btn" style={{ background: 'var(--red)', color: 'white', border: 'none' }} onClick={executeDelete}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
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
