/**
 * Social-layer types: presence, friends-online, and (later) invitations.
 * Game-agnostic — never imported by game packages.
 */

export type PresenceStatus = 'online' | 'idle' | 'in_lobby' | 'in_game' | 'offline';

export type LobbyAccessMode = 'public' | 'friends' | 'private';

/**
 * One friend's public-facing presence row, sent to the client.
 * `roomCode` and `accessMode` are set when status is `in_lobby`; cleared otherwise.
 */
export interface FriendState {
  userId: string;
  nickname: string;
  slug: string;
  avatar: string | null;
  status: PresenceStatus;
  roomCode: string | null;
  gameType: string | null;
  accessMode: LobbyAccessMode | null;
  /** When the current status began (ms epoch). */
  since: number;
}

/**
 * Compact identity of a mutual friend — enough to render a row in the dock
 * when they're offline (no live state to attach).
 */
export interface FriendInfo {
  userId: string;
  nickname: string;
  slug: string;
  avatar: string | null;
}

export interface PresenceSnapshot {
  globalOnline: number;
  /** Live state for the friends currently in the presence store. */
  friends: FriendState[];
  /** Mutual friends not currently online — rendered grayed-out in the dock. */
  offlineFriends: FriendInfo[];
}

export interface GlobalPresenceUpdate {
  count: number;
}

/**
 * Ephemeral invitation pushed to a friend's open socket. Not persisted — if
 * the friend isn't online at `invite:send` time, the server rejects with
 * `FRIEND_OFFLINE`. TTL is 60 s from creation; the server emits
 * `invite:expired` to the recipient when it lapses.
 */
export interface Invite {
  inviteId: string;
  fromUserId: string;
  fromNickname: string;
  fromSlug: string;
  fromAvatar: string | null;
  roomCode: string;
  gameType: string;
  expiresAt: number;
}
