import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useCollabDoc } from '../../../sdk/src/react/useCollabDoc';
import { getSavedDocuments, saveDocuments } from './AppLayout';
import { getCaretCoordinates } from '../utils/getCaretCoordinates';
import { useAuth } from './AuthContext';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

const ShareIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px', color: 'var(--green)' }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * DocumentEditor — Collaborative text editor using the real CollabDoc SDK.
 */
export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordCount, setWordCount] = useState(0);
  const [toastMessage, setToastMessage] = useState('');

  // 1. Generate/load local user details
  const { user, session } = useAuth();
  
  const currentUser = useMemo(() => {
    if (user) {
      const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
      const colors = ['#0070f3', '#34d399', '#f472b6', '#7928ca', '#f5a623', '#22d3ee', '#ec4899'];
      // Deterministic color based on name string
      const colorIndex = name.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) % colors.length;
      const color = colors[colorIndex];
      return { name, color };
    }
    return { name: 'Guest', color: '#888888' };
  }, [user]);

  // 2. Connect to the real server using the SDK hook
  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
  const { doc: collabDoc, isConnected, isSynced, presence } = useCollabDoc({
    roomId: id || 'default-room',
    serverUrl,
    user: currentUser,
    token: session?.access_token,
  });

  // Ensure this document is saved in the local list (e.g. if joined via share link)
  useEffect(() => {
    if (!id) return;
    const docs = getSavedDocuments();
    if (!docs.some(d => d.id === id)) {
      const docTitle = id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const newDoc = {
        id,
        title: docTitle,
        type: 'doc',
        updated: 'Just now',
        collaborators: 1,
      };
      saveDocuments([newDoc, ...docs]);
    }
  }, [id]);

  // Sync document title to the localStorage list when it changes
  useEffect(() => {
    if (!id || !title) return;
    const docs = getSavedDocuments();
    const updatedDocs = docs.map(d => {
      if (d.id === id && d.title !== title) {
        return { ...d, title, updated: 'Just now' };
      }
      return d;
    });
    const changed = JSON.stringify(docs) !== JSON.stringify(updatedDocs);
    if (changed) {
      saveDocuments(updatedDocs);
    }
  }, [id, title]);

  // 3. Initialize and sync document content
  useEffect(() => {
    if (!collabDoc || !id) return;

    const ydoc = collabDoc.getYDoc();
    const yText = collabDoc.getText('content');
    const yMeta = ydoc.getMap('meta');

    // Default title: fetch from local storage if created with a custom title, otherwise fallback
    const savedDocs = getSavedDocuments();
    const existingDoc = savedDocs.find(d => d.id === id);
    const docTitle = existingDoc?.title || id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Only initialize with default template content once the server sync has completed and the document is empty!
    if (isSynced && yText.length === 0) {
      collabDoc.getYDoc().transact(() => {
        yText.insert(0, `# ${docTitle}\n\nStart writing your document here.\n\nThis editor uses Yjs CRDTs for conflict-free real-time collaboration.\n`);
        yMeta.set('title', docTitle);
      });
    }

    setText(yText.toString());
    setTitle(yMeta.get('title') as string || docTitle);
    setWordCount(yText.toString().trim() ? yText.toString().trim().split(/\s+/).length : 0);

    const textObs = () => {
      const t = yText.toString();
      setText(t);
      setWordCount(t.trim() ? t.trim().split(/\s+/).length : 0);
    };

    const metaObs = () => {
      setTitle(yMeta.get('title') as string || docTitle);
    };

    yText.observe(textObs);
    yMeta.observe(metaObs);

    return () => {
      yText.unobserve(textObs);
      yMeta.unobserve(metaObs);
    };
  }, [collabDoc, id, isSynced]);

  // 4. Handle text edits with prefix-suffix incremental diffing
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!collabDoc) return;
    const yText = collabDoc.getText('content');
    const newValue = e.target.value;
    const oldValue = yText.toString();

    // Find common prefix
    let commonPrefixLen = 0;
    while (
      commonPrefixLen < oldValue.length &&
      commonPrefixLen < newValue.length &&
      oldValue[commonPrefixLen] === newValue[commonPrefixLen]
    ) {
      commonPrefixLen++;
    }

    // Find common suffix
    let commonSuffixLen = 0;
    while (
      commonSuffixLen < oldValue.length - commonPrefixLen &&
      commonSuffixLen < newValue.length - commonPrefixLen &&
      oldValue[oldValue.length - 1 - commonSuffixLen] === newValue[newValue.length - 1 - commonSuffixLen]
    ) {
      commonSuffixLen++;
    }

    const deleteCount = oldValue.length - commonPrefixLen - commonSuffixLen;
    const insertText = newValue.substring(commonPrefixLen, newValue.length - commonSuffixLen);

    collabDoc.getYDoc().transact(() => {
      if (deleteCount > 0) {
        yText.delete(commonPrefixLen, deleteCount);
      }
      if (insertText.length > 0) {
        yText.insert(commonPrefixLen, insertText);
      }
    });
  }, [collabDoc]);

  // 5. Handle title edits
  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!collabDoc) return;
    const yMeta = collabDoc.getYDoc().getMap('meta');
    yMeta.set('title', e.target.value);
  }, [collabDoc]);

  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lines = ta.value.substring(0, pos).split('\n');
    setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
    if (collabDoc) {
      collabDoc.setCursor({ path: 'content', offset: pos });
    }
  }, [collabDoc]);

  // 6. Handle copying share links
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setToastMessage('Link copied to clipboard!');
    setTimeout(() => setToastMessage(''), 3000);
  };

  // Get active online users from presence
  const activeUsers = Array.from(presence.entries())
    .map(([clientId, state]) => ({
      id: clientId,
      name: state.user?.name || `User ${clientId}`,
      color: state.user?.color || '#888888',
      isSelf: clientId === collabDoc?.getAwareness()?.clientID,
      cursorOffset: state.cursor?.offset,
    }));

  const [remoteCursors, setRemoteCursors] = useState<any[]>([]);

  // Calculate remote cursor positions
  const updateRemoteCursors = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    
    const cursors = activeUsers
      .filter(u => !u.isSelf && typeof u.cursorOffset === 'number')
      .map(u => {
        const coords = getCaretCoordinates(ta, u.cursorOffset!);
        return {
          ...u,
          top: coords.top - ta.scrollTop,
          left: coords.left - ta.scrollLeft,
          height: coords.height
        };
      });
      
    setRemoteCursors(cursors);
  }, [activeUsers]);

  // Update cursors when presence changes or textarea scrolls
  useEffect(() => {
    updateRemoteCursors();
  }, [updateRemoteCursors]);

  return (
    <div className="editor-page">
      {/* Top bar */}
      <header className="editor-topbar">
        <div className="editor-title-area">
          <Link to="/app" className="editor-back-btn" title="Back to Dashboard">
            <BackIcon />
          </Link>
          <input
            type="text"
            className="editor-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled Document"
          />
          <span className="editor-save-status">
            <span className={`status-pulse-dot ${isConnected ? 'green' : 'red'}`} />
            {isConnected ? 'Sync Active' : 'Connecting...'}
          </span>
        </div>

        <div className="editor-presence">
          <div className="presence-avatars-list">
            {activeUsers.map(u => (
              <div
                key={u.id}
                className="editor-user-avatar"
                style={{ 
                  background: u.color,
                  border: u.isSelf ? '2px solid var(--text-primary)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontWeight: 'bold'
                }}
                title={`${u.name} ${u.isSelf ? '(You)' : ''}`}
              >
                {u.name[0].toUpperCase()}
              </div>
            ))}
          </div>
          <span className="editor-user-count">
            {activeUsers.length} online
          </span>
          <button className="btn btn-primary btn-sm share-btn" onClick={handleShare}>
            <ShareIcon />
            Share Link
          </button>
        </div>
      </header>

      {/* Editor body */}
      <div className="editor-body">
        <div className="editor-gutter">
          {(text || '').split('\n').map((_, i) => (
            <span
              key={i}
              className={`line-num ${cursorPos.line === i + 1 ? 'active' : ''}`}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <div style={{ position: 'relative', flex: 1, display: 'flex', overflow: 'hidden' }}>
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={text}
            onChange={handleTextChange}
            onKeyUp={handleCursorMove}
            onMouseDown={handleCursorMove}
            onClick={handleCursorMove}
            onSelect={handleCursorMove}
            onScroll={updateRemoteCursors}
            spellCheck={false}
            autoFocus
          />
          {remoteCursors.map(cursor => (
            <div
              key={cursor.id}
              className="remote-cursor"
              style={{
                top: `${cursor.top}px`,
                left: `${cursor.left}px`,
                height: `${cursor.height || 20}px`,
                '--cursor-color': cursor.color,
              } as React.CSSProperties}
            >
              <div className="remote-cursor-name">{cursor.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Status bar */}
      <footer className="editor-statusbar">
        <span className="status-item">
          <span className={`status-dot ${isConnected ? 'green' : 'red'}`} />
          {isConnected ? 'Connected' : 'Offline'}
        </span>
        <span className="status-item">Server: {serverUrl}</span>
        <span className="status-item">CRDT: Yjs</span>
        <span className="status-item">Ln {cursorPos.line}, Col {cursorPos.col}</span>
        <span className="status-item">{wordCount} words</span>
        <span className="status-item">{(text || '').length} chars</span>
      </footer>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-notification animate-in glass">
          <CheckIcon />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
