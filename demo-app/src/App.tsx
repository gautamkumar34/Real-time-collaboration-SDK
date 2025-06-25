import React, { useState, useEffect } from 'react';
import { useCollabDoc } from '../../sdk/src/react/useCollabDoc';
import logo from './assets/icons8-docs-50 (1).png';
import './App.css';

function App() {
    const roomId = 'my-first-collab-document';
    const [actorId] = useState(() => `client-${Math.random().toString(36).substring(2, 9)}`);
    const serverUrl = 'http://localhost:8080';

    const {
        docState,
        doc,
        isConnected,
        isSynced,
        isLive,
        pause,
        resume,
        error
    } = useCollabDoc({ roomId, actorId, serverUrl });

    const [editorContent, setEditorContent] = useState<string>('');

    useEffect(() => {
        const currentDocContent = docState?.content || '';
        if (editorContent !== currentDocContent) {
            setEditorContent(currentDocContent);
        }
    }, [docState]); 

    const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setEditorContent(newContent); // Update local state immediately for responsiveness

        if (doc) {
            doc.set(['content'], newContent);
        }
    };

    const handleToggleLiveMode = () => {
        if (!doc) return;
        if (isLive) {
            pause();
        } else {
            resume();
        }
    };

    if (error) {
        return (
            <div className="container">
                <h1>Collab Document Demo</h1>
                <p className="status error">Error: {error.message || 'An unknown error occurred.'}</p>
                <p>Please ensure the server is running at {serverUrl}</p>
            </div>
        );
    }

    if (!isSynced) {
        return (
            <div className="container">
                <h1>Collab Document Demo</h1>
                <p>Client ID: {actorId}</p>
                <p className="status connecting">Connecting to document '{roomId}'...</p>
                <p className="status connecting">Status: {isConnected ? 'Connected, Syncing...' : 'Disconnected'}</p>
            </div>
        );
    }

    return (
        <div className="container">
          <div className='Header'>
            <div className='logo'>
                <img src= {logo} alt="" />
                <h2>CollabDoc</h2>
            </div>
            <div className="status-bar">
                <span className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
                    Connection: {isConnected ? 'Online' : 'Offline'}
                </span>
                <span className={`status ${isSynced ? 'synced' : 'unsynced'}`}>
                    Sync: {isSynced ? 'Synced' : 'Not Synced'}
                </span>
                <span className={`status ${isLive ? 'live-on' : 'live-off'}`}>
                    Live Mode: {isLive ? 'ON' : 'OFF (Paused)'}
                </span>
                <div className="controls">
                    <button
                      onClick={handleToggleLiveMode}
                      disabled={!isConnected}
                      className={`toggle-button ${isLive ? 'pause' : 'resume'}`}
                    >
                      {isLive ? 'Pause Live Updates' : 'Resume Live Updates'}
                      </button>
                </div>
            </div>

          </div>
            <p>Client ID: <span className="actor-id">{actorId}</span></p>
            <p>Room: <span className="room-id">{roomId}</span></p>

            <div className="editor-section">
                <h2>Document Content</h2>
                <textarea
                    value={editorContent}
                    onChange={handleEditorChange}
                    placeholder="Start typing your collaborative document here..."
                    rows={25}
                    className="collab-editor"
                    disabled={!isConnected}
                />
            </div>

            <div className="debug-section">
                <h2>Raw Document State (JSON)</h2>
                <pre className="debug-json">
                    {JSON.stringify(docState, null, 2)}
                </pre>
            </div>
        </div>
    );
}

export default App;