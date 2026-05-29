/**
 * Wire protocol for the WebSocket layer. Game-agnostic: gameplay events are
 * tunnelled through `game:action` (client→server) and `game:event` (server→client).
 * Lobby events (create / join / leave / kick / start / chat) are typed first-class.
 */
import { z } from 'zod';
import {
  CHAT_MAX_LENGTH,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  NICKNAME_REGEX,
  ROOM_CODE_LENGTH,
} from './constants.js';
import type {
  ChatMessage,
  LobbySnapshot,
  PlayerId,
  PublicPlayer,
} from './lobby.js';
import type {
  FriendState,
  GlobalPresenceUpdate,
  Invite,
  LobbyAccessMode,
  PresenceSnapshot,
} from './presence.js';

// ============ zod input schemas ============

export const NicknameSchema = z
  .string()
  .min(NICKNAME_MIN_LENGTH)
  .max(NICKNAME_MAX_LENGTH)
  .regex(NICKNAME_REGEX, 'Pseudo invalide (lettres, chiffres, espace, _ -)');

export const RoomCodeSchema = z
  .string()
  .length(ROOM_CODE_LENGTH)
  .regex(/^[A-Z]+$/, 'Code de room invalide');

export const GameTypeSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'gameType invalide (kebab-case)');

export const LobbyCreateSchema = z.object({
  gameType: GameTypeSchema,
  nickname: NicknameSchema,
  /** Optional game-specific config blob. Each game validates its own. */
  config: z.unknown().optional(),
});

export const LobbyJoinSchema = z.object({
  code: RoomCodeSchema,
  nickname: NicknameSchema,
  asSpectator: z.boolean().optional(),
});

export const LobbyKickSchema = z.object({ playerId: z.string().min(1) });
export const HostTransferSchema = z.object({ newHostId: z.string().min(1) });

export const ChatSendSchema = z.object({
  text: z.string().min(1).max(CHAT_MAX_LENGTH),
});

export const GameActionSchema = z.object({
  event: z.string().min(1).max(64),
  payload: z.unknown(),
});

export type LobbyCreateInput = z.infer<typeof LobbyCreateSchema>;
export type LobbyJoinInput = z.infer<typeof LobbyJoinSchema>;
export type ChatSendInput = z.infer<typeof ChatSendSchema>;
export type GameActionInput = z.infer<typeof GameActionSchema>;

// ============ ack envelope ============

export type Ok<T = void> = T extends void ? { ok: true } : { ok: true; data: T };
export type Err = { ok: false; code: string; message: string; retryable?: boolean };
export type Ack<T = void> = Ok<T> | Err;
export type AckCb<T = void> = (ack: Ack<T>) => void;

// ============ socket.io event maps ============

export type ClientToServerEvents = {
  'lobby:create': (
    input: LobbyCreateInput,
    ack: AckCb<{ code: string; playerId: PlayerId }>,
  ) => void;
  'lobby:join': (input: LobbyJoinInput, ack: AckCb<{ playerId: PlayerId }>) => void;
  'lobby:leave': (_: Record<string, never>, ack: AckCb) => void;
  'lobby:kick': (input: { playerId: PlayerId }, ack: AckCb) => void;
  'lobby:start': (_: Record<string, never>, ack: AckCb) => void;
  'lobby:host:transfer': (input: { newHostId: PlayerId }, ack: AckCb) => void;
  'chat:send': (input: ChatSendInput, ack: AckCb) => void;
  /** Game-specific actions tunneled through a single handler. */
  'game:action': (input: GameActionInput, ack: AckCb<Record<string, unknown> | undefined>) => void;
  /**
   * Social layer. `presence:hello` is sent by the client right after auth to
   * receive an initial snapshot of friends + global online count, and to opt
   * the socket into presence broadcasts (it will join the `friends-of:<me>`
   * room and subscribe to each mutual friend's `friends-of:<friend>` room).
   * Guests (no userId) get back `{ globalOnline, friends: [] }` and no
   * subscriptions — they still count towards the global tally.
   */
  'presence:hello': (_: Record<string, never>, ack: AckCb<PresenceSnapshot>) => void;
  /** Idle toggle, emitted by the web client from the Page Visibility API. */
  'presence:setIdle': (input: { idle: boolean }, ack: AckCb) => void;
  /** Host-only: change the lobby access mode. */
  'lobby:setAccessMode': (input: { mode: LobbyAccessMode }, ack: AckCb) => void;
  /**
   * Ephemeral invite from the caller's current lobby to a mutual friend.
   * Server validates: friend mutuality, target online, caller in a room,
   * 30s cooldown per (from, to) pair. Returns the minted `inviteId`.
   */
  'invite:send': (
    input: { toUserId: string },
    ack: AckCb<{ inviteId: string }>,
  ) => void;
  /** Consume an invite; on success, the server joins the user into the room (bypassing ACL). */
  'invite:accept': (
    input: { inviteId: string },
    ack: AckCb<{ roomCode: string }>,
  ) => void;
  'invite:decline': (input: { inviteId: string }, ack: AckCb) => void;
};

export type ServerToClientEvents = {
  'lobby:state': (snapshot: LobbySnapshot) => void;
  'lobby:player:joined': (player: PublicPlayer) => void;
  'lobby:player:left': (playerId: PlayerId, reason: 'leave' | 'kick' | 'timeout') => void;
  'lobby:player:updated': (player: PublicPlayer) => void;
  'lobby:host:changed': (newHostId: PlayerId) => void;
  'lobby:status:changed': (status: 'LOBBY' | 'PLAYING' | 'ENDED') => void;
  'chat:message': (payload: ChatMessage) => void;
  /** Game-specific event tunneled through a single handler. */
  'game:event': (payload: { event: string; payload: unknown }) => void;
  /** Social-layer fanout. */
  'presence:friend': (state: FriendState) => void;
  /** A friend has gone offline (no remaining sockets after the grace window). */
  'presence:friend:offline': (payload: { userId: string }) => void;
  'presence:global': (update: GlobalPresenceUpdate) => void;
  /** Broadcast to all room members when the host changes access mode. */
  'lobby:accessChanged': (payload: { roomCode: string; mode: LobbyAccessMode }) => void;
  /** A friend just sent the user an invitation (push to the recipient only). */
  'invite:incoming': (invite: Invite) => void;
  /** The invitation lapsed before being acted on. Recipient should dismiss the toast. */
  'invite:expired': (payload: { inviteId: string }) => void;
  'error': (payload: { code: string; message: string; retryable?: boolean }) => void;
};

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  playerId: PlayerId;
  /** Present when the JWT cookie carries a NextAuth-issued userId. */
  userId?: string;
  nickname?: string;
  roomCode?: string;
  isSpectator?: boolean;
}
