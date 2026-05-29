/**
 * Single-process in-memory presence store. Source of truth for who is online
 * and what they're doing. A Redis-backed implementation can be swapped in
 * later by satisfying the `PresenceStore` interface — see PresenceState shape.
 *
 * Multi-tab handling: a user is online while at least one of their sockets is
 * registered. When the last socket disconnects, we schedule a 5s flip to
 * `offline` to absorb F5 reloads without a flicker.
 */
import type { LobbyAccessMode, PresenceStatus } from '@tabswitch/types';

const OFFLINE_GRACE_MS = 5_000;

export interface PresenceState {
  status: PresenceStatus;
  /** When the current status began (ms epoch). */
  since: number;
  /** Set when status is `in_lobby` or `in_game`. */
  roomCode: string | null;
  gameType: string | null;
  accessMode: LobbyAccessMode | null;
}

export interface PresenceStore {
  /** Register a socket for a user. Returns true if this is the user's first socket (i.e. they just came online). */
  addSocket(userId: string, socketId: string): boolean;
  /** Unregister a socket. Returns true if this was the user's last socket (i.e. they are now considered for offline-grace). */
  removeSocket(userId: string, socketId: string): boolean;
  /** Schedule an offline transition after the grace period if the user still has no sockets. Returns true if the user actually went offline. */
  scheduleOfflineCheck(userId: string, onOffline: (userId: string) => void): void;
  /** Replace the user's presence state (e.g. setIdle, setInRoom). No-op if the user is offline. */
  set(userId: string, patch: Partial<PresenceState>): PresenceState | null;
  get(userId: string): PresenceState | null;
  /** Number of distinct users currently online (status !== offline). */
  globalCount(): number;
  /** For tests / observability. */
  _debug(): { users: number; sockets: number };
}

export function createMemoryPresenceStore(): PresenceStore {
  const states = new Map<string, PresenceState>();
  const sockets = new Map<string, Set<string>>();
  const offlineTimers = new Map<string, NodeJS.Timeout>();

  function clearOfflineTimer(userId: string): void {
    const t = offlineTimers.get(userId);
    if (t) {
      clearTimeout(t);
      offlineTimers.delete(userId);
    }
  }

  return {
    addSocket(userId, socketId) {
      clearOfflineTimer(userId);
      let set = sockets.get(userId);
      const wasAbsent = !set || set.size === 0;
      if (!set) {
        set = new Set();
        sockets.set(userId, set);
      }
      set.add(socketId);
      if (wasAbsent && !states.has(userId)) {
        states.set(userId, {
          status: 'online',
          since: Date.now(),
          roomCode: null,
          gameType: null,
          accessMode: null,
        });
      }
      return wasAbsent;
    },

    removeSocket(userId, socketId) {
      const set = sockets.get(userId);
      if (!set) return false;
      set.delete(socketId);
      if (set.size === 0) {
        sockets.delete(userId);
        return true;
      }
      return false;
    },

    scheduleOfflineCheck(userId, onOffline) {
      clearOfflineTimer(userId);
      const t = setTimeout(() => {
        offlineTimers.delete(userId);
        const set = sockets.get(userId);
        if (set && set.size > 0) return;
        if (states.delete(userId)) onOffline(userId);
      }, OFFLINE_GRACE_MS);
      t.unref?.();
      offlineTimers.set(userId, t);
    },

    set(userId, patch) {
      const current = states.get(userId);
      if (!current) return null;
      const next: PresenceState = {
        status: patch.status ?? current.status,
        since: patch.status && patch.status !== current.status ? Date.now() : current.since,
        roomCode: patch.roomCode !== undefined ? patch.roomCode : current.roomCode,
        gameType: patch.gameType !== undefined ? patch.gameType : current.gameType,
        accessMode: patch.accessMode !== undefined ? patch.accessMode : current.accessMode,
      };
      states.set(userId, next);
      return next;
    },

    get(userId) {
      return states.get(userId) ?? null;
    },

    globalCount() {
      return states.size;
    },

    _debug() {
      let socketCount = 0;
      for (const s of sockets.values()) socketCount += s.size;
      return { users: states.size, sockets: socketCount };
    },
  };
}
