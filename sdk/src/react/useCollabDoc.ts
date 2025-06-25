// sdk/src/react/useCollabDoc.ts

import { useState, useEffect, useMemo } from 'react'; 
import CollabDoc, { CollabDocConfig, Path, Operation } from '../collab-doc'; 

interface UseCollabDocReturn {
    docState: Record<string, any>;
    doc: CollabDoc | null;
    isConnected: boolean;
    isSynced: boolean;
    isLive: boolean; 
    pause: () => void; 
    resume: () => void; 
    error: Error | null;
}

export function useCollabDoc(options: CollabDocConfig): UseCollabDocReturn {
    const [collabDoc, setCollabDoc] = useState<CollabDoc | null>(null);
    const [docState, setDocState] = useState<Record<string, any>>({});
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isSynced, setIsSynced] = useState<boolean>(false);
    const [isLive, setIsLive] = useState<boolean>(true); 
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        const newDoc = new CollabDoc(options);
        setCollabDoc(newDoc);
        setError(null); 
        newDoc.connect();

        const changeHandler = () => {
            setDocState(newDoc.getDocumentState());
        };

        const connectHandler = () => {
            setIsConnected(true);
        };

        const disconnectHandler = (reason: string) => {
            setIsConnected(false);
            setIsSynced(false); 
        };

        const syncedHandler = () => {
            setIsSynced(true);
            setDocState(newDoc.getDocumentState());
        };

        const errorHandler = (err: any) => {
            setError(err instanceof Error ? err : new Error(String(err)));
        };

        const pauseHandler = () => {
            setIsLive(false);
        };

        const resumeHandler = () => {
            setIsLive(true);
        };

        newDoc.on('change', changeHandler);
        newDoc.on('connect', connectHandler);
        newDoc.on('disconnect', disconnectHandler);
        newDoc.on('synced', syncedHandler); 
        newDoc.on('error', errorHandler);
        newDoc.on('pause', pauseHandler);
        newDoc.on('resume', resumeHandler);

        return () => {
            console.log(`[useCollabDoc Hook] Cleaning up CollabDoc listeners for room: ${options.roomId}`);
            newDoc.off('change', changeHandler);
            newDoc.off('connect', connectHandler);
            newDoc.off('disconnect', disconnectHandler);
            newDoc.off('synced', syncedHandler);
            newDoc.off('error', errorHandler);
            newDoc.off('pause', pauseHandler);
            newDoc.off('resume', resumeHandler);

            newDoc.disconnect();
            setCollabDoc(null); 
            setIsConnected(false); 
            setIsSynced(false);
            setIsLive(true); 
        };
    }, [options.roomId, options.actorId, options.serverUrl]);

    useEffect(() => {
        if (collabDoc && !isSynced) { 
            setDocState(collabDoc.getDocumentState());
        }
    }, [collabDoc, isSynced]);

    const api = useMemo(() => ({
        pause: () => collabDoc?.pause(),
        resume: () => collabDoc?.resume(),
    }), [collabDoc]);

    return {
        docState,
        doc: collabDoc,
        isConnected,
        isSynced,
        isLive,
        pause: api.pause,
        resume: api.resume,
        error,
    };
}