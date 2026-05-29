import type { Socket } from 'socket.io';
import { ulid } from 'ulid';
import {
  LobbyCreateSchema,
  LobbyJoinSchema,
  LobbyKickSchema,
  HostTransferSchema,
  MAX_SPECTATORS,
  type ClientToServerEvents,
  type InterServerEvents,
  type LobbyPlayer,
  type ServerToClientEvents,
  type SocketData,
} from '@tabswitch/types';
import type { Io } from '../io.js';
import { log } from '../log.js';
import { LIMITS, consume } from '../rate-limit.js';
import { roomChannel } from '../channels.js';
import { getGameDefinition } from '../games/registry.js';
import {
  buildSnapshotFor,
  createRoom,
  deleteRoom,
  findRoomForPlayer,
  getRoom,
  publicPlayerOf,
  resetGame,
} from '../room-manager.js';
import { checkAccess } from '../lobby/access.js';
import { broadcastLobbyState } from '../lobby/broadcast.js';
import { areMutualFriends } from '../presence/friends.js';
import {
  onAccessModeChanged,
  onEnterLobby,
  onLeaveLobby,
  onLobbyStart,
  syncToLobbyStatus,
} from '../presence/lobby-bridge.js';
import { z } from 'zod';

const SetAccessModeSchema = z.object({
  mode: z.enum(['public', 'friends', 'private']),
});

type TSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

function ackErr(code: string, message: string, retryable = false) {
  return { ok: false as const, code, message, retryable };
}
function ackOk(): { ok: true };
function ackOk<T extends Record<string, unknown>>(data: T): { ok: true; data: T };
function ackOk<T extends Record<string, unknown>>(data?: T) {
  return data ? { ok: true as const, data } : { ok: true as const };
}

function mkPlayer(args: {
  id: string;
  nickname: string;
  isHost: boolean;
  isSpectator?: boolean;
  userId?: string;
}): LobbyPlayer {
  return {
    id: args.id,
    nickname: args.nickname,
    avatarSeed: args.id.slice(-8),
    isHost: args.isHost,
    isConnected: true,
    isSpectator: args.isSpectator ?? false,
    joinedAt: Date.now(),
    ...(args.userId ? { userId: args.userId } : {}),
  };
}

export function registerLobbyHandlers(io: Io, socket: TSocket): void {
  // ============ lobby:create ============
  socket.on('lobby:create', async (input, ack) => {
    try {
      if (!consume(socket, 'lobby:create', 20)) {
        return ack(ackErr('RATE_LIMIT', 'Trop de tentatives.'));
      }
      const parsed = LobbyCreateSchema.safeParse(input);
      if (!parsed.success) {
        return ack(
          ackErr('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Input invalide.'),
        );
      }
      const definition = getGameDefinition(parsed.data.gameType);
      if (!definition) {
        return ack(ackErr('UNKNOWN_GAME', `Jeu inconnu: ${parsed.data.gameType}`));
      }

      // Leave any previous room first
      const previousRoom = findRoomForPlayer(socket.data.playerId);
      if (previousRoom) await leaveRoom(io, socket, previousRoom.lobby.code, 'leave');

      const host = mkPlayer({
        id: socket.data.playerId,
        nickname: parsed.data.nickname,
        isHost: true,
        userId: socket.data.userId,
      });
      const room = createRoom(io, definition, host);

      socket.data.nickname = parsed.data.nickname;
      socket.data.roomCode = room.lobby.code;
      socket.data.isSpectator = false;
      await socket.join(roomChannel(room.lobby.code));

      ack(ackOk({ code: room.lobby.code, playerId: host.id }));
      room.game.onJoin(host.id);
      socket.emit('lobby:state', buildSnapshotFor(room, host.id));
      if (socket.data.userId) {
        void onEnterLobby(
          io,
          { userId: socket.data.userId, nickname: parsed.data.nickname },
          { roomCode: room.lobby.code, gameType: definition.gameType, accessMode: room.lobby.accessMode },
        );
      }
      log.info(
        { code: room.lobby.code, playerId: host.id, gameType: definition.gameType },
        'room created',
      );
    } catch (err) {
      log.error({ err }, 'lobby:create failed');
      ack(ackErr('INTERNAL', 'Erreur interne.'));
    }
  });

  // ============ lobby:join ============
  socket.on('lobby:join', async (input, ack) => {
    try {
      if (!consume(socket, 'lobby:join', 20)) {
        return ack(ackErr('RATE_LIMIT', 'Trop de tentatives.'));
      }
      const parsed = LobbyJoinSchema.safeParse(input);
      if (!parsed.success) {
        return ack(
          ackErr('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Input invalide.'),
        );
      }
      const room = getRoom(parsed.data.code);
      if (!room) return ack(ackErr('NO_ROOM', 'Room introuvable.'));

      // Leave any previous room first
      const previous = findRoomForPlayer(socket.data.playerId);
      if (previous && previous.lobby.code !== room.lobby.code) {
        await leaveRoom(io, socket, previous.lobby.code, 'leave');
      }

      const playerId = socket.data.playerId;
      const asSpec = parsed.data.asSpectator === true;
      const existingActive = room.lobby.players.find((p) => p.id === playerId);
      const existingSpec = room.lobby.spectators.find((p) => p.id === playerId);

      if (existingActive || existingSpec) {
        const ex = existingActive ?? existingSpec!;
        ex.isConnected = true;
        ex.nickname = parsed.data.nickname;
        if (socket.data.userId && !ex.userId) ex.userId = socket.data.userId;
        room.lobby.rev++;
        socket.data.nickname = parsed.data.nickname;
        socket.data.roomCode = room.lobby.code;
        socket.data.isSpectator = !!existingSpec;
        await socket.join(roomChannel(room.lobby.code));
        ack(ackOk({ playerId }));
        broadcastLobbyState(io, room.lobby.code);
        if (socket.data.userId) {
          const status = room.lobby.status === 'PLAYING' ? 'in_game' : 'in_lobby';
          void syncToLobbyStatus(
            io,
            { userId: socket.data.userId, nickname: parsed.data.nickname },
            status,
            { roomCode: room.lobby.code, gameType: room.lobby.gameType, accessMode: room.lobby.accessMode },
          );
        }
        return;
      }

      // ACL gate — skipped for re-joins (above) to avoid kicking a player out
      // if the host swaps the access mode while they're already inside.
      const hostUserId = room.lobby.players.find((p) => p.id === room.lobby.hostId)?.userId;
      const joinerUserId = socket.data.userId;
      const isMutualFriend =
        room.lobby.accessMode === 'friends' && joinerUserId && hostUserId
          ? await areMutualFriends(joinerUserId, hostUserId)
          : false;
      const access = checkAccess({
        accessMode: room.lobby.accessMode,
        hostUserId,
        joinerUserId,
        isMutualFriend,
      });
      if (!access.ok) return ack(ackErr(access.code, access.message));

      const isPlaying = room.lobby.status === 'PLAYING' || room.lobby.status === 'ENDED';
      const wantsSpec = asSpec || isPlaying;
      if (wantsSpec) {
        if (!room.definition.spectatorsAllowed && isPlaying) {
          return ack(ackErr('NO_SPECTATORS', "Ce jeu n'accepte pas les spectateurs."));
        }
        if (room.lobby.spectators.length >= MAX_SPECTATORS) {
          return ack(ackErr('SPECTATORS_FULL', 'Tribune pleine.'));
        }
        const p = mkPlayer({
          id: playerId,
          nickname: parsed.data.nickname,
          isHost: false,
          isSpectator: true,
          userId: socket.data.userId,
        });
        room.lobby.spectators.push(p);
        room.lobby.rev++;
        socket.data.nickname = parsed.data.nickname;
        socket.data.roomCode = room.lobby.code;
        socket.data.isSpectator = true;
        await socket.join(roomChannel(room.lobby.code));
        ack(ackOk({ playerId }));
        io.to(roomChannel(room.lobby.code)).emit('lobby:player:joined', publicPlayerOf(p));
        room.game.onJoin(playerId);
        broadcastLobbyState(io, room.lobby.code);
        if (socket.data.userId) {
          void onEnterLobby(
            io,
            { userId: socket.data.userId, nickname: parsed.data.nickname },
            { roomCode: room.lobby.code, gameType: room.lobby.gameType, accessMode: room.lobby.accessMode },
          );
        }
        return;
      }

      if (room.lobby.players.length >= room.definition.maxPlayers) {
        return ack(ackErr('ROOM_FULL', 'Room pleine. Rejoins en spectateur ?'));
      }
      if (
        room.lobby.players.some(
          (p) => p.nickname.toLowerCase() === parsed.data.nickname.toLowerCase(),
        )
      ) {
        return ack(ackErr('NICK_TAKEN', 'Ce pseudo est déjà pris.'));
      }
      const player = mkPlayer({
        id: playerId,
        nickname: parsed.data.nickname,
        isHost: false,
        userId: socket.data.userId,
      });
      room.lobby.players.push(player);
      room.lobby.rev++;
      socket.data.nickname = parsed.data.nickname;
      socket.data.roomCode = room.lobby.code;
      socket.data.isSpectator = false;
      await socket.join(roomChannel(room.lobby.code));
      ack(ackOk({ playerId }));
      io.to(roomChannel(room.lobby.code)).emit('lobby:player:joined', publicPlayerOf(player));
      room.game.onJoin(playerId);
      broadcastLobbyState(io, room.lobby.code);
      if (socket.data.userId) {
        void onEnterLobby(
          io,
          { userId: socket.data.userId, nickname: parsed.data.nickname },
          { roomCode: room.lobby.code, gameType: room.lobby.gameType, accessMode: room.lobby.accessMode },
        );
      }
      log.info(
        { code: room.lobby.code, playerId, gameType: room.lobby.gameType },
        'player joined',
      );
    } catch (err) {
      log.error({ err }, 'lobby:join failed');
      ack(ackErr('INTERNAL', 'Erreur interne.'));
    }
  });

  // ============ lobby:leave ============
  socket.on('lobby:leave', async (_input, ack) => {
    const code = socket.data.roomCode;
    if (!code) return ack(ackOk());
    await leaveRoom(io, socket, code, 'leave');
    ack(ackOk());
  });

  // ============ lobby:kick ============
  socket.on('lobby:kick', async (input, ack) => {
    const code = socket.data.roomCode;
    if (!code) return ack(ackErr('NO_ROOM', 'Pas dans une room.'));
    const parsed = LobbyKickSchema.safeParse(input);
    if (!parsed.success) return ack(ackErr('BAD_INPUT', 'Input invalide.'));
    const room = getRoom(code);
    if (!room) return ack(ackErr('NO_ROOM', 'Room introuvable.'));
    if (room.lobby.hostId !== socket.data.playerId) {
      return ack(ackErr('NOT_HOST', 'Seul le host peut kick.'));
    }
    if (parsed.data.playerId === socket.data.playerId) {
      return ack(ackErr('SELF_KICK', 'Tu ne peux pas te kick.'));
    }

    await removePlayer(io, code, parsed.data.playerId, 'kick');

    // disconnect the kicked socket from this room channel
    const sockets = await io.in(roomChannel(code)).fetchSockets();
    for (const s of sockets) {
      if (s.data.playerId === parsed.data.playerId) {
        await s.leave(roomChannel(code));
      }
    }
    ack(ackOk());
  });

  // ============ lobby:start ============
  socket.on('lobby:start', async (_input, ack) => {
    const code = socket.data.roomCode;
    if (!code) return ack(ackErr('NO_ROOM', 'Pas dans une room.'));
    const room = getRoom(code);
    if (!room) return ack(ackErr('NO_ROOM', 'Room introuvable.'));
    if (room.lobby.hostId !== socket.data.playerId) {
      return ack(ackErr('NOT_HOST', 'Seul le host peut lancer.'));
    }
    const active = room.lobby.players.filter((p) => !p.isSpectator);
    if (active.length < room.definition.minPlayers) {
      return ack(
        ackErr(
          'NOT_ENOUGH_PLAYERS',
          `Il faut au moins ${room.definition.minPlayers} joueurs.`,
        ),
      );
    }
    if (room.lobby.status === 'ENDED') {
      // rematch: spin up a fresh game instance inside the same lobby
      resetGame(io, code);
    }
    room.lobby.status = 'PLAYING';
    room.lobby.rev++;
    io.to(roomChannel(code)).emit('lobby:status:changed', 'PLAYING');
    try {
      await Promise.resolve(room.game.onStart());
    } catch (err) {
      log.error({ err, code }, 'game.onStart threw');
    }
    broadcastLobbyState(io, code);
    const authedPlayers = room.lobby.players
      .filter((p) => !!p.userId)
      .map((p) => ({ userId: p.userId!, nickname: p.nickname }));
    if (authedPlayers.length > 0) {
      void onLobbyStart(io, authedPlayers, {
        roomCode: code,
        gameType: room.lobby.gameType,
        accessMode: room.lobby.accessMode,
      });
    }
    ack(ackOk());
  });

  // ============ lobby:host:transfer ============
  socket.on('lobby:host:transfer', async (input, ack) => {
    const code = socket.data.roomCode;
    if (!code) return ack(ackErr('NO_ROOM', 'Pas dans une room.'));
    const parsed = HostTransferSchema.safeParse(input);
    if (!parsed.success) return ack(ackErr('BAD_INPUT', 'Input invalide.'));
    const room = getRoom(code);
    if (!room) return ack(ackErr('NO_ROOM', 'Room introuvable.'));
    if (room.lobby.hostId !== socket.data.playerId) {
      return ack(ackErr('NOT_HOST', 'Seul le host peut transférer.'));
    }
    const target = room.lobby.players.find((p) => p.id === parsed.data.newHostId);
    if (!target) return ack(ackErr('BAD_TARGET', 'Joueur introuvable.'));
    for (const p of room.lobby.players) p.isHost = false;
    target.isHost = true;
    room.lobby.hostId = target.id;
    room.lobby.rev++;
    io.to(roomChannel(code)).emit('lobby:host:changed', target.id);
    broadcastLobbyState(io, code);
    ack(ackOk());
  });

  // ============ lobby:setAccessMode ============
  socket.on('lobby:setAccessMode', async (input, ack) => {
    const code = socket.data.roomCode;
    if (!code) return ack(ackErr('NO_ROOM', 'Pas dans une room.'));
    const parsed = SetAccessModeSchema.safeParse(input);
    if (!parsed.success) return ack(ackErr('BAD_INPUT', 'Mode invalide.'));
    const room = getRoom(code);
    if (!room) return ack(ackErr('NO_ROOM', 'Room introuvable.'));
    if (room.lobby.hostId !== socket.data.playerId) {
      return ack(ackErr('NOT_HOST', 'Seul le host peut changer le mode.'));
    }
    if (room.lobby.accessMode === parsed.data.mode) return ack(ackOk());
    room.lobby.accessMode = parsed.data.mode;
    room.lobby.rev++;
    io.to(roomChannel(code)).emit('lobby:accessChanged', {
      roomCode: code,
      mode: parsed.data.mode,
    });
    broadcastLobbyState(io, code);
    const authedPlayers = room.lobby.players
      .filter((p) => !!p.userId)
      .map((p) => ({ userId: p.userId!, nickname: p.nickname }));
    if (authedPlayers.length > 0) {
      void onAccessModeChanged(io, authedPlayers, {
        roomCode: code,
        gameType: room.lobby.gameType,
        accessMode: parsed.data.mode,
      });
    }
    ack(ackOk());
  });

  // ============ disconnect ============
  socket.on('disconnect', async () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = getRoom(code);
    if (!room) return;
    const p =
      room.lobby.players.find((pl) => pl.id === socket.data.playerId) ??
      room.lobby.spectators.find((pl) => pl.id === socket.data.playerId);
    if (!p) return;
    p.isConnected = false;
    room.lobby.rev++;
    broadcastLobbyState(io, code);
  });
}

// ============ helpers used by both lobby & dispatch ============

export async function leaveRoom(
  io: Io,
  socket: TSocket,
  code: string,
  reason: 'leave' | 'kick' | 'timeout',
): Promise<void> {
  await removePlayer(io, code, socket.data.playerId, reason);
  socket.data.roomCode = undefined;
  await socket.leave(roomChannel(code));
}

export async function removePlayer(
  io: Io,
  code: string,
  playerId: string,
  reason: 'leave' | 'kick' | 'timeout',
): Promise<void> {
  const room = getRoom(code);
  if (!room) return;
  const wasHost = room.lobby.hostId === playerId;
  const leaver =
    room.lobby.players.find((p) => p.id === playerId) ??
    room.lobby.spectators.find((p) => p.id === playerId);
  room.lobby.players = room.lobby.players.filter((p) => p.id !== playerId);
  room.lobby.spectators = room.lobby.spectators.filter((p) => p.id !== playerId);
  room.lobby.rev++;
  if (leaver?.userId) {
    void onLeaveLobby(io, { userId: leaver.userId, nickname: leaver.nickname });
  }
  if (wasHost && room.lobby.players.length > 0) {
    const sorted = [...room.lobby.players].sort((a, b) => a.joinedAt - b.joinedAt);
    const newHost = sorted[0]!;
    newHost.isHost = true;
    room.lobby.hostId = newHost.id;
    io.to(roomChannel(code)).emit('lobby:host:changed', newHost.id);
  }
  io.to(roomChannel(code)).emit('lobby:player:left', playerId, reason);
  try {
    await Promise.resolve(room.game.onLeave(playerId, reason));
  } catch (err) {
    log.error({ err, code }, 'game.onLeave threw');
  }
  broadcastLobbyState(io, code);

  // GC empty rooms
  if (room.lobby.players.length === 0 && room.lobby.spectators.length === 0) {
    deleteRoom(code);
    log.info({ code }, 'room garbage-collected');
  }
}

export { broadcastLobbyState } from '../lobby/broadcast.js';

