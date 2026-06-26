import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';

/**
 * DemoPlayground — a self-contained collaborative text editor demo.
 * Uses a local Y.Doc so it works without a running server.
 * Two "virtual clients" simulated side-by-side.
 */
export default function DemoPlayground() {
  const [doc] = useState(() => new Y.Doc());
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const yText = useRef(doc.getText('demo'));

  // Simulated remote users
  const [remoteUsers] = useState([
    { name: 'Alice', color: '#7c5cfc', status: 'editing' },
    { name: 'Bob', color: '#34d399', status: 'viewing' },
  ]);

  useEffect(() => {
    // Initialize with some content
    if (yText.current.length === 0) {
      yText.current.insert(0, 'Welcome to CollabDoc! 🚀\n\nThis is a live demo of the Yjs CRDT engine.\nStart typing to see real-time collaboration in action.\n\nEvery keystroke is a CRDT operation — \nno conflicts, no data loss, even offline.');
    }
    setText(yText.current.toString());

    const observer = () => setText(yText.current.toString());
    yText.current.observe(observer);
    return () => yText.current.unobserve(observer);
  }, [doc]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const oldValue = yText.current.toString();

    // Simple diff: delete all, insert new (good enough for a demo)
    doc.transact(() => {
      yText.current.delete(0, oldValue.length);
      yText.current.insert(0, newValue);
    });
  }, [doc]);

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
            This editor is powered by Yjs CRDTs. Open this page in another tab
            to see multi-client sync in action.
          </p>
        </div>

        <div className="demo-container animate-in-up" style={{ animationDelay: '200ms' }}>
          {/* Presence bar */}
          <div className="demo-presence-bar">
            <div className="presence-indicators">
              <div className="presence-dot you" style={{ background: '#60a5fa' }}>
                <span className="presence-tooltip">You</span>
              </div>
              {remoteUsers.map(u => (
                <div key={u.name} className="presence-dot" style={{ background: u.color }}>
                  <span className="presence-tooltip">{u.name}</span>
                </div>
              ))}
            </div>
            <span className="presence-count">{remoteUsers.length + 1} online</span>
          </div>

          {/* Editor */}
          <div className="demo-editor-wrapper">
            <div className="editor-gutter">
              {text.split('\n').map((_, i) => (
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
              <span className="status-dot green" />
              Connected
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
