/**
 * CollabDoc — Real-time collaborative document backed by Yjs CRDT.
 *
 * Public API:
 *   doc.set(['path', 'to', 'key'], value)   — set a value at a nested path
 *   doc.get(['path', 'to', 'key'])          — read a value
 *   doc.delete(['path', 'to', 'key'])       — delete a key
 *   doc.getText('fieldName')                — get a Y.Text for rich text collab
 *   doc.getDocumentState()                  — snapshot as plain JSON
 *
 * Under the hood:
 *   - Y.Doc stores all state as Y.Map (nested) and Y.Text fields
 *   - YjsSocketProvider handles sync/awareness over Socket.IO
 *   - HLC is no longer needed — Yjs has its own logical clock
 *   - No LWW conflict resolution — Yjs CRDTs handle convergence
 */

import { io, Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { YjsSocketProvider, Awareness, type AwarenessUser } from './y-provider';

// ─── Types ────────────────────────────────────────────────────

interface CollabDocEvents {
  change: [payload: { origin: 'local' | 'remote' }];
  connect: [];
  disconnect: [reason: string];
  synced: [];
  error: [err: any];
  awareness: [states: Map<number, AwarenessUser>];
  [key: string]: any[];
}

class EventEmitter<Events extends Record<string, any[]>> {
  private listeners: { [K in keyof Events]?: ((...args: Events[K]) => void)[] } = {};

  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    (this.listeners[event] as ((...args: Events[K]) => void)[]).push(listener);
  }

  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = (this.listeners[event] as ((...args: Events[K]) => void)[]).filter(
      (l) => l !== listener
    ) as ((...args: Events[K]) => void)[];
  }

  emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    if (!this.listeners[event]) return;
    const current = [...(this.listeners[event] as ((...args: Events[K]) => void)[])];
    current.forEach((listener) => {
      try { listener(...args); } catch (e) { console.error(`Error in ${String(event)} listener:`, e); }
    });
  }
}

export type Path = (string | number)[];

export interface CollabDocConfig {
  roomId: string;
  serverUrl: string;
  /** User info for presence (name, color) */
  user?: { name: string; color: string };
  /** Socket.IO auth token (JWT) — optional */
  token?: string;
}

// ─── CollabDoc ────────────────────────────────────────────────

export default class CollabDoc extends EventEmitter<CollabDocEvents> {
  private roomId: string;
  private serverUrl: string;
  private socket: Socket;
  private ydoc: Y.Doc;
  private provider: YjsSocketProvider | null = null;
  private connected: boolean = false;
  private synced: boolean = false;
  private user: { name: string; color: string };
  private token?: string;

  /** The root Y.Map — all set/get/delete operate on this */
  private rootMap: Y.Map<any>;

  constructor({ roomId, serverUrl, user, token }: CollabDocConfig) {
    super();
    this.roomId = roomId;
    this.serverUrl = serverUrl;
    this.user = user ?? { name: `User-${Math.random().toString(36).substr(2, 5)}`, color: randomColor() };
    this.token = token;

    this.ydoc = new Y.Doc();
    this.rootMap = this.ydoc.getMap('root');

    // Observe all deep changes on root map
    this.rootMap.observeDeep((events, txn) => {
      const origin = txn.origin === 'remote' ? 'remote' : 'local';
      this.emit('change', { origin });
    });

    this.socket = io(this.serverUrl, {
      autoConnect: false,
      transports: ['websocket'],
      auth: this.token ? { token: this.token } : undefined,
    });

    this.socket.on('connect', () => {
      this.connected = true;
      this.emit('connect');

      // Start Yjs sync
      this.provider = new YjsSocketProvider(this.socket, this.roomId, this.ydoc);

      this.provider.on('synced', () => {
        this.synced = true;
        this.emit('synced');
      });

      // Forward awareness updates
      this.provider.awareness.on('update', () => {
        this.emit('awareness', this.provider!.awareness.getStates());
      });

      // Listen for awareness queries from newly joined users
      this.socket.on('query_awareness', (roomId: string) => {
        console.log('[SDK] query_awareness received:', roomId);
        if (roomId === this.roomId && this.provider) {
          this.provider.broadcastAwareness();
        }
      });

      // Join room, then request sync
      this.socket.emit('join_room', this.roomId);
      this.provider.requestSync();

      // Set our presence
      this.provider.awareness.setLocalState({ user: this.user });
      this.provider.broadcastAwareness();
    });

    this.socket.on('disconnect', (reason: string) => {
      this.connected = false;
      this.synced = false;
      this.socket.off('query_awareness');
      if (this.provider) {
        this.provider.destroy();
        this.provider = null;
      }
      this.emit('disconnect', reason);
    });

    this.socket.on('connect_error', (err: Error) => {
      this.emit('error', err);
    });
  }

  // ─── Connection ─────────────────────────────────────────────

  public connect() {
    if (!this.connected) {
      this.socket.connect();
    }
  }

  public disconnect() {
    if (this.provider) {
      // Send awareness removal
      this.provider.awareness.setLocalState(null);
      this.provider.broadcastAwareness();
      this.provider.destroy();
      this.provider = null;
    }
    this.socket.disconnect();
    this.connected = false;
    this.synced = false;
  }

  // ─── Key-Value API (operates on root Y.Map) ────────────────

  public set(path: Path, value: any): void {
    this.ydoc.transact(() => {
      const { parent, key } = this.navigateToParent(path, true);
      if (parent instanceof Y.Map) {
        parent.set(String(key), toYjsValue(value));
      } else if (parent instanceof Y.Array && typeof key === 'number') {
        // For arrays, replace the element
        if (key < parent.length) {
          parent.delete(key, 1);
          parent.insert(key, [toYjsValue(value)]);
        } else {
          parent.push([toYjsValue(value)]);
        }
      }
    });
  }

  public get(path: Path): any {
    const { parent, key } = this.navigateToParent(path, false);
    if (!parent) return undefined;

    let raw: any;
    if (parent instanceof Y.Map) {
      raw = parent.get(String(key));
    } else if (parent instanceof Y.Array && typeof key === 'number') {
      raw = parent.get(key);
    } else {
      return undefined;
    }

    return fromYjsValue(raw);
  }

  public delete(path: Path): void {
    this.ydoc.transact(() => {
      const { parent, key } = this.navigateToParent(path, false);
      if (!parent) return;

      if (parent instanceof Y.Map) {
        parent.delete(String(key));
      } else if (parent instanceof Y.Array && typeof key === 'number') {
        if (key < parent.length) {
          parent.delete(key, 1);
        }
      }
    });
  }

  // ─── Rich Text API ─────────────────────────────────────────

  /** Get a Y.Text for collaborative rich text editing (e.g., Tiptap, ProseMirror) */
  public getText(name: string): Y.Text {
    return this.ydoc.getText(name);
  }

  /** Get the underlying Y.Doc for advanced use cases */
  public getYDoc(): Y.Doc {
    return this.ydoc;
  }

  // ─── State ──────────────────────────────────────────────────

  public getDocumentState(): Record<string, any> {
    return fromYjsValue(this.rootMap) as Record<string, any>;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public isSynced(): boolean {
    return this.synced;
  }

  // ─── Presence ───────────────────────────────────────────────

  public getAwareness(): Awareness | null {
    return this.provider?.awareness ?? null;
  }

  /** Update cursor position in awareness */
  public setCursor(cursor: { path: string; offset: number } | null): void {
    this.provider?.awareness.setLocalStateField('cursor', cursor);
    this.provider?.broadcastAwareness();
  }

  /** Get all connected users' awareness states */
  public getPresence(): Map<number, AwarenessUser> {
    return this.provider?.awareness.getStates() ?? new Map();
  }

  // ─── Path Navigation ───────────────────────────────────────

  /**
   * Navigate a path like ['users', 0, 'name'] to find the parent container
   * and the final key. If `createMissing` is true, creates intermediate
   * Y.Map / Y.Array nodes as needed.
   */
  private navigateToParent(
    path: Path,
    createMissing: boolean
  ): { parent: Y.Map<any> | Y.Array<any> | null; key: string | number } {
    if (path.length === 0) return { parent: null, key: '' };

    let current: any = this.rootMap;
    for (let i = 0; i < path.length - 1; i++) {
      const segment = path[i];
      let next: any;

      if (current instanceof Y.Map) {
        next = current.get(String(segment));
      } else if (current instanceof Y.Array && typeof segment === 'number') {
        next = current.get(segment);
      } else {
        if (!createMissing) return { parent: null, key: path[path.length - 1] };
        return { parent: null, key: path[path.length - 1] };
      }

      if (next === undefined || next === null) {
        if (!createMissing) return { parent: null, key: path[path.length - 1] };
        // Create intermediate: next segment determines if Map or Array
        const nextSegment = path[i + 1];
        next = typeof nextSegment === 'number' ? new Y.Array() : new Y.Map();
        if (current instanceof Y.Map) {
          current.set(String(segment), next);
        } else if (current instanceof Y.Array && typeof segment === 'number') {
          current.push([next]);
        }
      }

      current = next;
    }

    return { parent: current, key: path[path.length - 1] };
  }
}

// ─── Yjs Value Conversion Helpers ─────────────────────────────

/** Convert a plain JS value to a Yjs-compatible value */
function toYjsValue(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value; // primitives pass through
  if (Array.isArray(value)) {
    const arr = new Y.Array();
    arr.push(value.map(toYjsValue));
    return arr;
  }
  // Plain object → Y.Map
  const map = new Y.Map();
  for (const [k, v] of Object.entries(value)) {
    map.set(k, toYjsValue(v));
  }
  return map;
}

/** Convert a Yjs value back to plain JS */
function fromYjsValue(value: any): any {
  if (value instanceof Y.Map) {
    const obj: Record<string, any> = {};
    value.forEach((v: any, k: string) => {
      obj[k] = fromYjsValue(v);
    });
    return obj;
  }
  if (value instanceof Y.Array) {
    return value.toArray().map(fromYjsValue);
  }
  if (value instanceof Y.Text) {
    return value.toString();
  }
  return value;
}

/** Generate a random hex color for presence */
function randomColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F0B27A', '#82E0AA',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ─── Re-exports ───────────────────────────────────────────────
export type { AwarenessUser } from './y-provider';
export { Awareness } from './y-provider';