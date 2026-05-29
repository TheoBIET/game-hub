/**
 * Socket.IO gateway for the social/presence layer. Owns:
 *   - per-socket lifecycle (online on connect, scheduled offline on disconnect)
 *   - room subscriptions for fanout (`user:<userId>`, `friends-of:<friendId>`)
 *   - the `presence:hello` snapshot and the `presence:setIdle` toggle
 *   - throttled `presence:global` broadcasts (2s latch)
 *
 * Note: the `user:<userId>` room is reserved for the user themselves
 * (direct messages, e.g. incoming invites in PR 3). Each user *also* joins
 * `friends-of:<friendId>` for every mutual friend `friendId` — that's how
 * presence diffs reach the right inboxes.
 */
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  FriendState,
  InterServerEvents,
  PresenceSnapshot,
  ServerToClientEvents,
  SocketData,
} from '@tabswitch/types';
import type { Io } from '../io.js';
import { log } from '../log.js';
import { getPresenceStore } from './index.js';
import { getMutualFriends, type MutualFriendInfo } from './friends.js';

type TSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const GLOBAL_THROTTLE_MS = 2_000;

let lastGlobalEmit = 0;
let lastGlobalCount = -1;
let pendingGlobalTimer: NodeJS.Timeout | null = null;

export function broadcastGlobal(io: Io): void {
  const store = getPresenceStore();
  const count = store.globalCount();
  const now = Date.now();
  const elapsed = now - lastGlobalEmit;

  function emit(): void {
    if (count === lastGlobalCount) return;
    lastGlobalCount = count;
    lastGlobalEmit = Date.now();
    io.emit('presence:global', { count });
  }

  if (elapsed >= GLOBAL_THROTTLE_MS) {
    emit();
    return;
  }
  if (pendingGlobalTimer) return;
  pendingGlobalTimer = setTimeout(() => {
    pendingGlobalTimer = null;
    emit();
  }, GLOBAL_THROTTLE_MS - elapsed);
  pendingGlobalTimer.unref?.();
}

function friendStateOf(
  info: MutualFriendInfo,
  state: ReturnType<ReturnType<typeof getPresenceStore>['get']>,
): FriendState | null {
  if (!state) return null;
  return {
    userId: info.userId,
    nickname: info.nickname,
    slug: info.slug,
    avatar: info.avatar,
    status: state.status,
    roomCode: state.roomCode,
    gameType: state.gameType,
    accessMode: state.accessMode,
    since: state.since,
  };
}

function selfStateOf(socket: TSocket): FriendState | null {
  const userId = socket.data.userId;
  if (!userId) return null;
  const store = getPresenceStore();
  const state = store.get(userId);
  if (!state) return null;
  return {
    userId,
    nickname: socket.data.nickname ?? '',
    slug: '',
    avatar: null,
    status: state.status,
    roomCode: state.roomCode,
    gameType: state.gameType,
    accessMode: state.accessMode,
    since: state.since,
  };
}

export function registerPresenceHandlers(io: Io, socket: TSocket): void {
  const userId = socket.data.userId;
  const store = getPresenceStore();

  // Track this socket in the presence store; guests count too (they get
  // anonymous online status with no userId, so they only bump the global
  // tally and never appear in friend lists).
  const ownerKey = userId ?? `guest:${socket.data.playerId}`;
  const wasFirst = store.addSocket(ownerKey, socket.id);

  if (wasFirst) broadcastGlobal(io);

  // Identified user — join their own inbox room so PR3 invites can target
  // them. Friend subscriptions happen on `presence:hello` (snapshot ack).
  if (userId) socket.join(`user:${userId}`);

  socket.on('disconnect', () => {
    const wasLast = store.removeSocket(ownerKey, socket.id);
    if (!wasLast) return;
    // Anti-flicker: wait 5s before flipping offline, in case it's a F5.
    store.scheduleOfflineCheck(ownerKey, () => {
      broadcastGlobal(io);
      if (userId) io.to(`friends-of:${userId}`).emit('presence:friend:offline', { userId });
    });
  });

  socket.on('presence:hello', (_input, ack) => {
    void handleHello(io, socket, ack).catch((err) => {
      log.warn({ err, userId }, 'presence:hello failed');
      ack({ ok: false, code: 'INTERNAL', message: 'presence hello failed' });
    });
  });

  socket.on('presence:setIdle', (input, ack) => {
    if (!userId) {
      ack({ ok: false, code: 'NOT_AUTHED', message: 'guests cannot set idle' });
      return;
    }
    const idle = !!input?.idle;
    const next = store.set(userId, { status: idle ? 'idle' : 'online' });
    if (next) {
      const fs = friendStateOf(
        { userId, nickname: socket.data.nickname ?? '', slug: '', avatar: null },
        next,
      );
      if (fs) io.to(`friends-of:${userId}`).emit('presence:friend', fs);
    }
    ack({ ok: true });
  });
}

async function handleHello(
  io: Io,
  socket: TSocket,
  ack: (response:
    | { ok: true; data: PresenceSnapshot }
    | { ok: false; code: string; message: string }) => void,
): Promise<void> {
  const userId = socket.data.userId;
  const store = getPresenceStore();
  const globalOnline = store.globalCount();

  if (!userId) {
    ack({ ok: true, data: { globalOnline, friends: [] } });
    return;
  }

  // Subscribe my socket to my OWN friends-of room so my future state changes
  // are echoed back to me (useful for multi-tab consistency).
  socket.join(`friends-of:${userId}`);

  const friends = await getMutualFriends(userId);

  // For each mutual friend: subscribe to their friends-of fanout so I get
  // their state changes, and assemble their current state for the snapshot.
  const friendStates: FriendState[] = [];
  for (const f of friends) {
    socket.join(`friends-of:${f.userId}`);
    const s = store.get(f.userId);
    const fs = friendStateOf(f, s);
    if (fs) friendStates.push(fs);
  }

  // Announce my presence to my friends (in case they were already online).
  const myState = selfStateOf(socket);
  if (myState) io.to(`friends-of:${userId}`).emit('presence:friend', myState);

  ack({ ok: true, data: { globalOnline, friends: friendStates } });
}
