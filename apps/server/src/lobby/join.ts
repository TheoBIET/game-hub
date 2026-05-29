/**
 * Reusable player-insertion routine shared by `lobby:join` (with ACL check)
 * and `invite:accept` (ACL bypassed). Encapsulates the side effects: room
 * mutation, socket.data update, room-channel join, broadcasts, and the
 * presence bridge call.
 *
 * Caller is responsible for the pre-flight checks specific to its flow:
 *   - lobby:join handles rate limit, input parsing, reconnect path, ACL.
 *   - invite:accept handles invite consumption.
 *
 * This helper assumes the *fresh-join* path (the caller already established
 * that the user isn't already in the room).
 */
import type { Socket } from 'socket.io';
import {
  MAX_SPECTATORS,
  type ClientToServerEvents,
  type InterServerEvents,
  type LobbyPlayer,
  type ServerToClientEvents,
  type SocketData,
} from '@tabswitch/types';
import type { Io } from '../io.js';
import { roomChannel } from '../channels.js';
import { getRoom, publicPlayerOf, type RoomInstance } from '../room-manager.js';
import { onEnterLobby } from '../presence/lobby-bridge.js';
import { broadcastLobbyState } from './broadcast.js';
import { log } from '../log.js';

type TSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export type JoinResult =
  | { ok: true; playerId: string }
  | {
      ok: false;
      code: 'NO_ROOM' | 'ROOM_FULL' | 'NICK_TAKEN' | 'NO_SPECTATORS' | 'SPECTATORS_FULL';
      message: string;
    };

export interface JoinOptions {
  /** When true, the room is PLAYING/ENDED and the player should be added as a spectator. */
  asSpectator?: boolean;
}

export async function performFreshJoin(
  io: Io,
  socket: TSocket,
  code: string,
  nickname: string,
  opts: JoinOptions = {},
): Promise<JoinResult> {
  const room = getRoom(code);
  if (!room) return { ok: false, code: 'NO_ROOM', message: 'Room introuvable.' };

  const playerId = socket.data.playerId;
  const isPlaying = room.lobby.status === 'PLAYING' || room.lobby.status === 'ENDED';
  const wantsSpec = opts.asSpectator === true || isPlaying;

  if (wantsSpec) return joinAsSpectator(io, socket, room, nickname, playerId, isPlaying);
  return joinAsActivePlayer(io, socket, room, nickname, playerId);
}

async function joinAsSpectator(
  io: Io,
  socket: TSocket,
  room: RoomInstance,
  nickname: string,
  playerId: string,
  isPlaying: boolean,
): Promise<JoinResult> {
  if (!room.definition.spectatorsAllowed && isPlaying) {
    return { ok: false, code: 'NO_SPECTATORS', message: "Ce jeu n'accepte pas les spectateurs." };
  }
  if (room.lobby.spectators.length >= MAX_SPECTATORS) {
    return { ok: false, code: 'SPECTATORS_FULL', message: 'Tribune pleine.' };
  }
  const p = makePlayer(playerId, nickname, true, socket.data.userId);
  room.lobby.spectators.push(p);
  finalizeJoin(io, socket, room, p, nickname, true);
  return { ok: true, playerId };
}

async function joinAsActivePlayer(
  io: Io,
  socket: TSocket,
  room: RoomInstance,
  nickname: string,
  playerId: string,
): Promise<JoinResult> {
  if (room.lobby.players.length >= room.definition.maxPlayers) {
    return { ok: false, code: 'ROOM_FULL', message: 'Room pleine. Rejoins en spectateur ?' };
  }
  if (
    room.lobby.players.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())
  ) {
    return { ok: false, code: 'NICK_TAKEN', message: 'Ce pseudo est déjà pris.' };
  }
  const p = makePlayer(playerId, nickname, false, socket.data.userId);
  room.lobby.players.push(p);
  finalizeJoin(io, socket, room, p, nickname, false);
  return { ok: true, playerId };
}

function makePlayer(
  id: string,
  nickname: string,
  isSpectator: boolean,
  userId: string | undefined,
): LobbyPlayer {
  return {
    id,
    nickname,
    avatarSeed: id.slice(-8),
    isHost: false,
    isConnected: true,
    isSpectator,
    joinedAt: Date.now(),
    ...(userId ? { userId } : {}),
  };
}

function finalizeJoin(
  io: Io,
  socket: TSocket,
  room: RoomInstance,
  player: LobbyPlayer,
  nickname: string,
  isSpectator: boolean,
): void {
  room.lobby.rev++;
  socket.data.nickname = nickname;
  socket.data.roomCode = room.lobby.code;
  socket.data.isSpectator = isSpectator;
  void socket.join(roomChannel(room.lobby.code));
  io.to(roomChannel(room.lobby.code)).emit('lobby:player:joined', publicPlayerOf(player));
  try {
    room.game.onJoin(player.id);
  } catch (err) {
    log.error({ err, code: room.lobby.code }, 'game.onJoin threw');
  }
  broadcastLobbyState(io, room.lobby.code);
  if (socket.data.userId) {
    void onEnterLobby(
      io,
      { userId: socket.data.userId, nickname },
      {
        roomCode: room.lobby.code,
        gameType: room.lobby.gameType,
        accessMode: room.lobby.accessMode,
      },
    );
  }
}
