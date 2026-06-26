import { useParams } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';

/**
 * DocumentEditor — Collaborative text editor using a local Y.Doc.
 * 
 * This demo works standalone (no server required).
 * When server is running, replace with the real CollabDoc SDK.
 */
export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>();
  const [doc] = useState(() => new Y.Doc());
  const yText = useRef(doc.getText('content'));
  const yMeta = useRef(doc.getMap('meta'));
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [wordCount, setWordCount] = useState(0);

  // Simulated presence
  const [users] = useState([
    { name: 'You', color: '#60a5fa', active: true },
    { name: 'Alice', color: '#7c5cfc', active: true },
    { name: 'Bob', color: '#34d399', active: false },
  ]);

  // Initialize document
  useEffect(() => {
    const docTitle = id?.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) ?? 'Untitled';
    
    if (yText.current.length === 0) {
      yText.current.insert(0, `# ${docTitle}\n\nStart writing your document here.\n\nThis editor uses Yjs CRDTs for conflict-free real-time collaboration.\nOpen this page in multiple tabs to see it in action!\n`);
    }
    if (!yMeta.current.get('title')) {
      yMeta.current.set('title', docTitle);
    }

    setText(yText.current.toString());
    setTitle(yMeta.current.get('title') as string || docTitle);

    const textObs = () => {
      const t = yText.current.toString();
      setText(t);
      setWordCount(t.trim() ? t.trim().split(/\s+/).length : 0);
    };
    const metaObs = () => setTitle(yMeta.current.get('title') as string || '');

    yText.current.observe(textObs);
    yMeta.current.observe(metaObs);
    textObs(); // initial count

    return () => {
      yText.current.unobserve(textObs);
      yMeta.current.unobserve(metaObs);
      doc.destroy();
    };
  }, [id, doc]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    doc.transact(() => {
      yText.current.delete(0, yText.current.length);
      yText.current.insert(0, newValue);
    });
  }, [doc]);

  const handleTitleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    yMeta.current.set('title', e.target.value);
  }, []);

  const handleCursorMove = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const lines = ta.value.substring(0, pos).split('\n');
    setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
  }, []);

  return (
    <div className="editor-page">
      {/* Top bar */}
      <header className="editor-topbar">
        <div className="editor-title-area">
          <input
            type="text"
            className="editor-title-input"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled Document"
          />
          <span className="editor-save-status">
            <span className="save-dot" /> Auto-saved
          </span>
        </div>

        <div className="editor-presence">
          {users.filter(u => u.active).map(u => (
            <div
              key={u.name}
              className="editor-user-avatar"
              style={{ background: u.color }}
              title={u.name}
            >
              {u.name[0]}
            </div>
          ))}
          <span className="editor-user-count">
            {users.filter(u => u.active).length} online
          </span>
        </div>
      </header>

      {/* Editor body */}
      <div className="editor-body">
        <div className="editor-gutter">
          {text.split('\n').map((_, i) => (
            <span
              key={i}
              className={`line-num ${cursorPos.line === i + 1 ? 'active' : ''}`}
            >
              {i + 1}
            </span>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          className="editor-textarea"
          value={text}
          onChange={handleTextChange}
          onKeyUp={handleCursorMove}
          onClick={handleCursorMove}
          spellCheck={false}
          autoFocus
        />
      </div>

      {/* Status bar */}
      <footer className="editor-statusbar">
        <span className="status-item">
          <span className="status-dot green" /> Connected
        </span>
        <span className="status-item">CRDT: Yjs</span>
        <span className="status-item">Ln {cursorPos.line}, Col {cursorPos.col}</span>
        <span className="status-item">{wordCount} words</span>
        <span className="status-item">{text.length} chars</span>
      </footer>
    </div>
  );
}
