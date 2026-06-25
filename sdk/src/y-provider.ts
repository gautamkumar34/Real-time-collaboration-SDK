/**
 * YjsSocketProvider — bridges a Yjs Y.Doc with a Socket.IO connection.
 *
 * Handles the sync protocol:
 *   1. On connect → send our state vector (sync_step1)
 *   2. Server responds with missing updates (sync_step2)
 *   3. Local changes → send binary update to server
 *   4. Remote updates → apply to local Y.Doc
 *
 * Also manages Awareness (cursors, presence) as a separate channel.
 */

import * as Y from 'yjs';
import { Socket } from 'socket.io-client';

// ─── Awareness (lightweight presence) ─────────────────────────

export interface AwarenessUser {
  clientId: number;
  user?: { name: string; color: string };
  cursor?: { path: string; offset: number } | null;
  [key: string]: any;
}

export class Awareness {
  public doc: Y.Doc;
  public clientID: number;
  private states: Map<number, AwarenessUser> = new Map();
  private localState: Record<string, any> = {};
  private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

  constructor(doc: Y.Doc) {
    this.doc = doc;
    this.clientID = doc.clientID;
  }

  setLocalState(state: Record<string, any> | null) {
    if (state === null) {
      this.states.delete(this.clientID);
      this.localState = {};
    } else {
      this.localState = { ...state };
      this.states.set(this.clientID, { clientId: this.clientID, ...this.localState });
    }
    this.emit('update', [{ added: [], updated: [this.clientID], removed: [] }]);
  }

  setLocalStateField(field: string, value: any) {
    this.localState[field] = value;
    this.states.set(this.clientID, { clientId: this.clientID, ...this.localState });
    this.emit('update', [{ added: [], updated: [this.clientID], removed: [] }]);
  }

  getLocalState(): Record<string, any> {
    return { ...this.localState };
  }

  getStates(): Map<number, AwarenessUser> {
    return this.states;
  }

  /** Apply remote awareness update */
  applyUpdate(data: { clientId: number; state: Record<string, any> | null }) {
    const { clientId, state } = data;
    if (clientId === this.clientID) return; // skip self

    const isNew = !this.states.has(clientId);

    if (state === null) {
      this.states.delete(clientId);
      this.emit('update', [{ added: [], updated: [], removed: [clientId] }]);
    } else {
      this.states.set(clientId, { clientId, ...state });
      this.emit('update', [{
        added: isNew ? [clientId] : [],
        updated: isNew ? [] : [clientId],
        removed: [],
      }]);
    }
  }

  /** Remove a client (disconnected) */
  removeClient(clientId: number) {
    if (this.states.has(clientId)) {
      this.states.delete(clientId);
      this.emit('update', [{ added: [], updated: [], removed: [clientId] }]);
    }
  }

  on(event: string, fn: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(fn);
  }

  off(event: string, fn: (...args: any[]) => void) {
    const fns = this.listeners.get(event);
    if (fns) this.listeners.set(event, fns.filter(f => f !== fn));
  }

  private emit(event: string, args: any[]) {
    const fns = this.listeners.get(event);
    if (fns) fns.forEach(fn => fn(...args));
  }

  destroy() {
    this.states.clear();
    this.listeners.clear();
  }
}

// ─── Yjs ↔ Socket.IO Sync Provider ───────────────────────────

export class YjsSocketProvider {
  public doc: Y.Doc;
  public awareness: Awareness;
  private socket: Socket;
  private roomId: string;
  private synced: boolean = false;
  private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

  // Store handler refs for proper cleanup
  private _onDocUpdate: (update: Uint8Array, origin: any) => void;
  private _onSyncStep2: (...args: any[]) => void;
  private _onYjsUpdate: (...args: any[]) => void;
  private _onAwarenessUpdate: (...args: any[]) => void;
  private _onAwarenessRemove: (...args: any[]) => void;

  constructor(socket: Socket, roomId: string, doc: Y.Doc) {
    this.socket = socket;
    this.roomId = roomId;
    this.doc = doc;
    this.awareness = new Awareness(doc);

    // Create bound handlers
    this._onDocUpdate = (update: Uint8Array, origin: any) => {
      if (origin !== 'remote') {
        this.socket.emit('yjs_update', this.roomId, Array.from(update));
      }
    };

    this._onSyncStep2 = (roomId: string, update: number[]) => {
      if (roomId !== this.roomId) return;
      Y.applyUpdate(this.doc, new Uint8Array(update), 'remote');
      this.synced = true;
      this.emit('synced');
    };

    this._onYjsUpdate = (roomId: string, update: number[]) => {
      if (roomId !== this.roomId) return;
      Y.applyUpdate(this.doc, new Uint8Array(update), 'remote');
    };

    this._onAwarenessUpdate = (roomId: string, data: { clientId: number; state: any }) => {
      if (roomId !== this.roomId) return;
      this.awareness.applyUpdate(data);
    };

    this._onAwarenessRemove = (roomId: string, clientId: number) => {
      if (roomId !== this.roomId) return;
      this.awareness.removeClient(clientId);
    };

    // Attach listeners
    this.doc.on('update', this._onDocUpdate);
    this.socket.on('yjs_sync_step2', this._onSyncStep2);
    this.socket.on('yjs_update', this._onYjsUpdate);
    this.socket.on('awareness_update', this._onAwarenessUpdate);
    this.socket.on('awareness_remove', this._onAwarenessRemove);
  }

  /** Start sync: send our state vector to server */
  requestSync() {
    const sv = Y.encodeStateVector(this.doc);
    this.socket.emit('yjs_sync_step1', this.roomId, Array.from(sv));
  }

  /** Broadcast local awareness state */
  broadcastAwareness() {
    this.socket.emit('awareness_update', this.roomId, {
      clientId: this.awareness.clientID,
      state: this.awareness.getLocalState(),
    });
  }

  get isSynced(): boolean {
    return this.synced;
  }

  // ─── Simple event emitter ──────────────────

  on(event: string, fn: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(fn);
  }

  off(event: string, fn: (...args: any[]) => void) {
    const fns = this.listeners.get(event);
    if (fns) this.listeners.set(event, fns.filter(f => f !== fn));
  }

  private emit(event: string) {
    const fns = this.listeners.get(event);
    if (fns) fns.forEach(fn => fn());
  }

  destroy() {
    this.doc.off('update', this._onDocUpdate);
    this.socket.off('yjs_sync_step2', this._onSyncStep2);
    this.socket.off('yjs_update', this._onYjsUpdate);
    this.socket.off('awareness_update', this._onAwarenessUpdate);
    this.socket.off('awareness_remove', this._onAwarenessRemove);
    this.awareness.destroy();
    this.listeners.clear();
  }
}
