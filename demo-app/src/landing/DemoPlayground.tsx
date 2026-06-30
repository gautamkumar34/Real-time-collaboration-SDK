import { useState, useEffect, useRef, useCallback } from 'react';
import { useCollabDoc } from '../../../sdk/src/react/useCollabDoc';

/**
 * DemoPlayground — a collaborative text editor demo on the landing page.
 * Connects to the real collaboration server using the SDK.
 */
export default function DemoPlayground() {
  // Get or create a session user for presence
  const [currentUser] = useState(() => {
    const stored = localStorage.getItem('collab-doc-user');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    const colors = ['#0070f3', '#34d399', '#f472b6', '#7928ca', '#f5a623', '#22d3ee'];
    const names = ['Developer', 'Guest Coder', 'Innovator', 'Designer', 'Hacker', 'Creator'];
    const user = {
      name: `${names[Math.floor(Math.random() * names.length)]} ${Math.floor(Math.random() * 90 + 10)}`,
      color: colors[Math.floor(Math.random() * colors.length)],
    };
    localStorage.setItem('collab-doc-user', JSON.stringify(user));
    return user;
  });

  const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';
  const { doc: collabDoc, isConnected, isSynced, presence } = useCollabDoc({
    roomId: 'demo-playground',
    serverUrl,
    user: currentUser,
  });

  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Synchronize Yjs state to local React state
  useEffect(() => {
    if (!collabDoc) return;
    const yText = collabDoc.getText('demo');

    // Initialize with default text once synced if room is fresh
    if (isSynced && yText.length === 0) {
      yText.insert(
        0,
        'Welcome to CollabDoc!\n\nThis is a LIVE multiplayer demo. Open this page in another browser window to see real-time collaboration in action.\n\nEvery keystroke is synced instantly via Yjs CRDTs!'
      );
    }

    setText(yText.toString());

    const observer = () => {
      setText(yText.toString());
    };
    yText.observe(observer);

    return () => {
      yText.unobserve(observer);
    };
  }, [collabDoc, isSynced]);

  // Handle typing using our smooth character-level diffing algorithm
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!collabDoc) return;
    const yText = collabDoc.getText('demo');
    const newValue = e.target.value;
    const oldValue = yText.toString();

    // Smooth incremental diff updates
    let commonPrefixLen = 0;
    while (
      commonPrefixLen < oldValue.length &&
      commonPrefixLen < newValue.length &&
      oldValue[commonPrefixLen] === newValue[commonPrefixLen]
    ) {
      commonPrefixLen++;
    }

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

  // Map other users dynamically from presence map
  const remoteUsers = Array.from(presence.entries())
    .filter(([clientId]) => clientId !== collabDoc?.getAwareness()?.clientID)
    .map(([_, state]) => ({
      name: state.user?.name || 'Collaborator',
      color: state.user?.color || '#888888',
    }));

  return (
    <div className="demo-page">
      <section className="section container">
        <div className="section-header animate-in-up">
          <span className="badge">
            <span className="badge-dot live" />
            Live Demo
          </span>
          <h1>Try it <span className="gradient-text">right now</span></h1>
          <p className="section-subtitle">
            This editor is powered by the real CollabDoc server. Open this page in another tab
            or share the link with a friend to collaborate in real-time.
          </p>
        </div>

        <div className="demo-container animate-in-up" style={{ animationDelay: '200ms' }}>
          {/* Presence bar */}
          <div className="demo-presence-bar">
            <div className="presence-indicators">
              <div className="presence-dot you" style={{ background: currentUser.color }} title={`You (${currentUser.name})`}>
                <span className="presence-tooltip">You ({currentUser.name})</span>
              </div>
              {remoteUsers.map((u, i) => (
                <div key={i} className="presence-dot" style={{ background: u.color }} title={u.name}>
                  <span className="presence-tooltip">{u.name}</span>
                </div>
              ))}
            </div>
            <span className="presence-count">{remoteUsers.length + 1} online</span>
          </div>

          {/* Editor */}
          <div className="demo-editor-wrapper">
            <div className="editor-gutter">
              {(text || '').split('\n').map((_, i) => (
                <span key={i} className="line-num">{i + 1}</span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              className="demo-editor"
              value={text}
              onChange={handleInput}
              spellCheck={false}
              placeholder="Start typing..."
            />
          </div>

          {/* Status bar */}
          <div className="demo-status-bar">
            <span className="status-item">
              <span className={`status-dot ${isConnected ? 'green' : 'red'}`} />
              {isConnected ? 'Connected' : 'Offline'}
            </span>
            <span className="status-item">
              CRDT: Yjs
            </span>
            <span className="status-item">
              {text.length} chars · {text.split('\n').length} lines
            </span>
          </div>
        </div>

        {/* Code example below */}
        <div className="demo-code-section animate-in-up" style={{ animationDelay: '400ms' }}>
          {/* Note: The mock code example in landing page illustrates general library usage, not our exact internal hook name. Keep as is. */}
          <h3>Integrate in 3 lines</h3>
          <div className="code-window small">
            <div className="code-titlebar">
              <span className="code-dot red" />
              <span className="code-dot yellow" />
              <span className="code-dot green" />
              <span className="code-filename">your-app.tsx</span>
            </div>
            <pre className="code-body"><code>{`import { useCollabDoc } from 'collab-doc/react';
 
 function Editor() {
   const { doc, isConnected, presence } = useCollabDoc({
     roomId: 'my-document',
     serverUrl: 'ws://localhost:8080',
     user: { name: 'Alice', color: '#7c5cfc' },
   });
 
   return <textarea onChange={e => doc?.set(['content'], e.target.value)} />;
 }`}</code></pre>
          </div>
        </div>
      </section>
    </div>
  );
}
