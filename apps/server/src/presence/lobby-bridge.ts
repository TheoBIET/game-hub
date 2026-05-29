/**
 * Glue between the lobby/room layer and the presence store. The lobby handlers
 * call these helpers at the right moments (join, leave, start, end, access
 * mode change) so the friends-of:* rooms get an up-to-date FriendState.
 *
 * Guests (no userId) are silently ignored — they have no friends to notify
 * and they don't appear in anyone's dock.
 */
import type { FriendState, LobbyAccessMode, PresenceStatus } from '@tabswitch/types';
import type { Io } from '../io.js';
import { getPresenceStore } from './index.js';
import { getMutualFriends } from './friends.js';

interface LobbyContext {
  roomCode: string;
  gameType: string;
  accessMode: LobbyAccessMode;
}

interface UserContext {
  userId: string;
  nickname: string;
}

async function emitFriendStateFor(
  io: Io,
  user: UserContext,
  status: PresenceStatus,
  lobby: LobbyContext | null,
): Promise<void> {
  const store = getPresenceStore();
  const next = store.set(user.userId, {
    status,
    roomCode: lobby?.roomCode ?? null,
    gameType: lobby?.gameType ?? null,
    accessMode: lobby?.accessMode ?? null,
  });
  if (!next) return;

  // Pull profile bits from the friends cache (cheap when populated). If the
  // user has no friends list cached we still emit with slug='' and avatar=null
  // — the client only ever uses these fields for FRIENDS, and a stranger
  // glancing at the event in DevTools doesn't gain anything from them.
  const fs: FriendState = {
    userId: user.userId,
    nickname: user.nickname,
    slug: '',
    avatar: null,
    status: next.status,
    roomCode: next.roomCode,
    gameType: next.gameType,
    accessMode: next.accessMode,
    since: next.since,
  };
  io.to(`friends-of:${user.userId}`).emit('presence:friend', fs);
}

/**
 * Generic helper for re-sync paths (e.g. a player reconnects to a room while
 * the game is already PLAYING — they should appear as `in_game`, not `online`).
 */
export async function syncToLobbyStatus(
  io: Io,
  user: UserContext,
  status: 'in_lobby' | 'in_game',
  lobby: LobbyContext,
): Promise<void> {
  await emitFriendStateFor(io, user, status, lobby);
}

/** Called from lobby:create and lobby:join after the player joins the room. */
export async function onEnterLobby(
  io: Io,
  user: UserContext,
  lobby: LobbyContext,
): Promise<void> {
  await emitFriendStateFor(io, user, 'in_lobby', lobby);
}

/** Called when a user leaves a room (leave, kick, disconnect cleanup). */
export async function onLeaveLobby(io: Io, user: UserContext): Promise<void> {
  await emitFriendStateFor(io, user, 'online', null);
}

/** Called from lobby:start. Toggles every authenticated player in the room to `in_game`. */
export async function onLobbyStart(
  io: Io,
  users: UserContext[],
  lobby: LobbyContext,
): Promise<void> {
  await Promise.all(users.map((u) => emitFriendStateFor(io, u, 'in_game', lobby)));
}

/** Called when a game ends — players are still in the room but the lifecycle changes. */
export async function onLobbyEnd(
  io: Io,
  users: UserContext[],
  lobby: LobbyContext,
): Promise<void> {
  await Promise.all(users.map((u) => emitFriendStateFor(io, u, 'in_lobby', lobby)));
}

/**
 * Called after `lobby:setAccessMode`. Re-emits the FriendState for every
 * authenticated player in the room so their friends see the new accessMode
 * (e.g. dock button switches between "Rejoindre" and "🔒 Privé").
 */
export async function onAccessModeChanged(
  io: Io,
  users: UserContext[],
  lobby: LobbyContext,
): Promise<void> {
  await Promise.all(users.map((u) => emitFriendStateFor(io, u, 'in_lobby', lobby)));
}

/**
 * Best-effort warm-up: ensure the friends cache for `userId` is populated.
 * Called on socket connect for authenticated users to avoid the first lookup
 * happening inside a hot path.
 */
export async function warmFriendsCache(userId: string): Promise<void> {
  try {
    await getMutualFriends(userId);
  } catch {
    /* tolerated */
  }
}
