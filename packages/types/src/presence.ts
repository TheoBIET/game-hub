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
