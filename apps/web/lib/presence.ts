'use client';

import { create } from 'zustand';
import type { FriendState } from '@tabswitch/types';
import { getSocket } from './socket';

/**
 * Social-layer client store. Holds:
 *   - `globalOnline`: latest server-side player count (throttled 2s server-side)
 *   - `friends`: a map of mutual friends, keyed by userId, only populated when
 *     they are currently online (we delete on `presence:friend:offline`)
 *
 * The store doesn't own the socket lifecycle — `PresenceBootstrap` mounts
 * once near the root of the authenticated tree, calls `presence:hello`, and
 * subscribes to the diff events.
 */
export interface PresenceState {
  ready: boolean;
  globalOnline: number;
  friends: Record<string, FriendState>;
  /** Reset internal state (used on sign-out or hot reload). */
  reset: () => void;
  /** Apply the initial snapshot returned by `presence:hello`. */
  applySnapshot: (input: { globalOnline: number; friends: FriendState[] }) => void;
  upsertFriend: (f: FriendState) => void;
  removeFriend: (userId: string) => void;
  setGlobal: (count: number) => void;
}

export const usePresence = create<PresenceState>((set) => ({
  ready: false,
  globalOnline: 0,
  friends: {},
  reset: () => set({ ready: false, globalOnline: 0, friends: {} }),
  applySnapshot: ({ globalOnline, friends }) => {
    const map: Record<string, FriendState> = {};
    for (const f of friends) map[f.userId] = f;
    set({ ready: true, globalOnline, friends: map });
  },
  upsertFriend: (f) =>
    set((s) => ({ friends: { ...s.friends, [f.userId]: f } })),
  removeFriend: (userId) =>
    set((s) => {
      if (!(userId in s.friends)) return s;
      const next = { ...s.friends };
      delete next[userId];
      return { friends: next };
    }),
  setGlobal: (count) => set({ globalOnline: count }),
}));

/**
 * Idempotent subscription to all presence-related socket events. Returns a
 * teardown. Safe to call from a `useEffect` in a top-level client component.
 */
export function subscribePresence(isAuthenticated: boolean): () => void {
  const socket = getSocket();

  const onGlobal = (payload: { count: number }) => {
    usePresence.getState().setGlobal(payload.count);
  };
  const onFriend = (state: FriendState) => {
    usePresence.getState().upsertFriend(state);
  };
  const onFriendOffline = (payload: { userId: string }) => {
    usePresence.getState().removeFriend(payload.userId);
  };

  socket.on('presence:global', onGlobal);
  socket.on('presence:friend', onFriend);
  socket.on('presence:friend:offline', onFriendOffline);

  function sayHello(): void {
    socket.emit('presence:hello', {}, (ack) => {
      if (!ack.ok) return;
      usePresence.getState().applySnapshot(ack.data);
    });
  }

  // Send the hello on every (re)connect — covers initial mount, network
  // reconnect, and server restart. We do this for guests too (server returns
  // `globalOnline` so the badge updates without requiring a login).
  if (socket.connected) sayHello();
  socket.on('connect', sayHello);

  // Lazy-pull on focus too (covers sleeping tabs that didn't get the throttled
  // global update).
  function onVisibility(): void {
    if (document.visibilityState === 'visible' && socket.connected) sayHello();
  }
  document.addEventListener('visibilitychange', onVisibility);

  // Idle detection — only meaningful for authenticated users.
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let isIdle = false;
  const IDLE_AFTER_MS = 3 * 60_000;

  function setIdleState(idle: boolean): void {
    if (idle === isIdle) return;
    isIdle = idle;
    socket.emit('presence:setIdle', { idle }, () => {});
  }
  function bumpIdle(): void {
    if (!isAuthenticated) return;
    if (idleTimer) clearTimeout(idleTimer);
    setIdleState(false);
    idleTimer = setTimeout(() => setIdleState(true), IDLE_AFTER_MS);
  }
  const idleEvents = ['mousemove', 'keydown', 'scroll', 'touchstart'] as const;
  for (const ev of idleEvents) {
    window.addEventListener(ev, bumpIdle, { passive: true });
  }
  bumpIdle();

  return () => {
    socket.off('presence:global', onGlobal);
    socket.off('presence:friend', onFriend);
    socket.off('presence:friend:offline', onFriendOffline);
    socket.off('connect', sayHello);
    document.removeEventListener('visibilitychange', onVisibility);
    for (const ev of idleEvents) window.removeEventListener(ev, bumpIdle);
    if (idleTimer) clearTimeout(idleTimer);
  };
}
