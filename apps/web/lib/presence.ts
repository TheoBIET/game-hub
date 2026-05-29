'use client';

import { create } from 'zustand';
import type { FriendInfo, FriendState, Invite } from '@tabswitch/types';
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
  /** Live FriendState for mutual friends who are currently online. */
  friends: Record<string, FriendState>;
  /** Mutual friends not currently online — kept around to render in the dock. */
  offlineFriends: Record<string, FriendInfo>;
  /** Incoming invitations currently displayed (TTL-driven dismissal). */
  incomingInvites: Invite[];
  /** Reset internal state (used on sign-out or hot reload). */
  reset: () => void;
  /** Apply the initial snapshot returned by `presence:hello`. */
  applySnapshot: (input: {
    globalOnline: number;
    friends: FriendState[];
    offlineFriends: FriendInfo[];
  }) => void;
  upsertFriend: (f: FriendState) => void;
  removeFriend: (userId: string) => void;
  setGlobal: (count: number) => void;
  addInvite: (invite: Invite) => void;
  removeInvite: (inviteId: string) => void;
}

export const usePresence = create<PresenceState>((set) => ({
  ready: false,
  globalOnline: 0,
  friends: {},
  offlineFriends: {},
  incomingInvites: [],
  reset: () =>
    set({
      ready: false,
      globalOnline: 0,
      friends: {},
      offlineFriends: {},
      incomingInvites: [],
    }),
  applySnapshot: ({ globalOnline, friends, offlineFriends }) => {
    const onlineMap: Record<string, FriendState> = {};
    for (const f of friends) onlineMap[f.userId] = f;
    const offlineMap: Record<string, FriendInfo> = {};
    for (const f of offlineFriends) offlineMap[f.userId] = f;
    set({ ready: true, globalOnline, friends: onlineMap, offlineFriends: offlineMap });
  },
  upsertFriend: (f) =>
    set((s) => {
      // The friend came online — also pull them out of the offline list.
      const offline = { ...s.offlineFriends };
      delete offline[f.userId];
      return { friends: { ...s.friends, [f.userId]: f }, offlineFriends: offline };
    }),
  removeFriend: (userId) =>
    set((s) => {
      const current = s.friends[userId];
      if (!current) return s;
      // Demote: keep the row in `offlineFriends` so they stay visible (grayed).
      const friends = { ...s.friends };
      delete friends[userId];
      const offlineFriends = {
        ...s.offlineFriends,
        [userId]: {
          userId,
          nickname: current.nickname,
          slug: current.slug,
          avatar: current.avatar,
        },
      };
      return { friends, offlineFriends };
    }),
  setGlobal: (count) => set({ globalOnline: count }),
  addInvite: (invite) =>
    set((s) => {
      // De-dupe by inviteId in case the server retries the push.
      if (s.incomingInvites.some((i) => i.inviteId === invite.inviteId)) return s;
      return { incomingInvites: [...s.incomingInvites, invite] };
    }),
  removeInvite: (inviteId) =>
    set((s) => ({ incomingInvites: s.incomingInvites.filter((i) => i.inviteId !== inviteId) })),
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

  const onIncomingInvite = (invite: Invite) => {
    usePresence.getState().addInvite(invite);
  };
  const onInviteExpired = (payload: { inviteId: string }) => {
    usePresence.getState().removeInvite(payload.inviteId);
  };

  socket.on('presence:global', onGlobal);
  socket.on('presence:friend', onFriend);
  socket.on('presence:friend:offline', onFriendOffline);
  socket.on('invite:incoming', onIncomingInvite);
  socket.on('invite:expired', onInviteExpired);

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
    socket.off('invite:incoming', onIncomingInvite);
    socket.off('invite:expired', onInviteExpired);
    socket.off('connect', sayHello);
    document.removeEventListener('visibilitychange', onVisibility);
    for (const ev of idleEvents) window.removeEventListener(ev, bumpIdle);
    if (idleTimer) clearTimeout(idleTimer);
  };
}
