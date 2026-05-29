/**
 * Social-layer types: presence, friends-online, and (later) invitations.
 * Game-agnostic — never imported by game packages.
 */

export type PresenceStatus = 'online' | 'idle' | 'in_lobby' | 'in_game';

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

export interface PresenceSnapshot {
  globalOnline: number;
  friends: FriendState[];
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
