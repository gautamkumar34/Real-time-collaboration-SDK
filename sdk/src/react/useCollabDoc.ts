/**
 * useCollabDoc — React hook for real-time collaborative documents.
 *
 * Returns document state, connection status, presence data,
 * and the CollabDoc instance for direct manipulation.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import CollabDoc, { type CollabDocConfig, type Path, type AwarenessUser } from '../collab-doc';

interface UseCollabDocReturn {
  /** Snapshot of the document as plain JSON */
  docState: Record<string, any>;
  /** The CollabDoc instance — use for set/get/delete/getText */
  doc: CollabDoc | null;
  /** Socket connected? */
  isConnected: boolean;
  /** Initial sync complete? */
  isSynced: boolean;
  /** All connected users' presence states */
  presence: Map<number, AwarenessUser>;
  /** Connection/sync error */
  error: Error | null;
}

export function useCollabDoc(options: CollabDocConfig): UseCollabDocReturn {
  const [doc, setDoc] = useState<CollabDoc | null>(null);
  const [docState, setDocState] = useState<Record<string, any>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isSynced, setIsSynced] = useState(false);
  const [presence, setPresence] = useState<Map<number, AwarenessUser>>(new Map());
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const collabDoc = new CollabDoc(options);
    setDoc(collabDoc);
    setError(null);

    const onchange = () => setDocState(collabDoc.getDocumentState());
    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => { setIsConnected(false); setIsSynced(false); };
    const onSynced = () => { setIsSynced(true); setDocState(collabDoc.getDocumentState()); };
    const onError = (err: any) => setError(err instanceof Error ? err : new Error(String(err)));
    const onAwareness = (states: Map<number, AwarenessUser>) => setPresence(new Map(states));

    collabDoc.on('change', onchange);
    collabDoc.on('connect', onConnect);
    collabDoc.on('disconnect', onDisconnect);
    collabDoc.on('synced', onSynced);
    collabDoc.on('error', onError);
    collabDoc.on('awareness', onAwareness);

    collabDoc.connect();

    return () => {
      collabDoc.off('change', onchange);
      collabDoc.off('connect', onConnect);
      collabDoc.off('disconnect', onDisconnect);
      collabDoc.off('synced', onSynced);
      collabDoc.off('error', onError);
      collabDoc.off('awareness', onAwareness);
      collabDoc.disconnect();
      setDoc(null);
      setIsConnected(false);
      setIsSynced(false);
    };
  }, [options.roomId, options.serverUrl, options.token]);

  return { docState, doc, isConnected, isSynced, presence, error };
}