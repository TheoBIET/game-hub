/**
 * In-memory registry of active rooms. Single-process only — fine for the
 * scaffold MVP. Migrating to Redis-backed rooms is a deferred follow-up;
 * the GameRoom contract is already isolated from persistence concerns so a
 * future RoomStore interface can swap it in.
 */
import { generateRoomCode } from '@tabswitch/types';
import type {
  GameContext,
  GameDefinition,
  GameOutcomes,
  GameRoom,
  LobbyPlayer,
  LobbyPlayerLite,
  LobbyRoom,
  LobbySnapshot,
  PublicPlayer,
} from '@tabswitch/types';
import { getDb } from '@tabswitch/db';
import type { Io } from './io.js';
import { log } from './log.js';
import { roomChannel } from './channels.js';

export interface RoomInstance {
  readonly lobby: LobbyRoom;
  readonly definition: GameDefinition;
  /** Replaced on rematch (see `resetGame`). */
  game: GameRoom<unknown>;
}

const rooms = new Map<string, RoomInstance>();

export function getRoom(code: string): RoomInstance | undefined {
  return rooms.get(code);
}

export function listAllRooms(): readonly RoomInstance[] {
  return [...rooms.values()];
}

export function deleteRoom(code: string): void {
  const r = rooms.get(code);
  if (!r) return;
  try {
    r.game.dispose?.();
  } catch (err) {
    log.warn({ err, code }, 'room dispose threw');
  }
  rooms.delete(code);
}

/** Find which room a player is currently in (linear scan — MVP-fine). */
export function findRoomForPlayer(playerId: string): RoomInstance | undefined {
  for (const r of rooms.values()) {
    if (r.lobby.players.some((p) => p.id === playerId)) return r;
    if (r.lobby.spectators.some((p) => p.id === playerId)) return r;
  }
  return undefined;
}

function publicPlayerOf(p: LobbyPlayer): PublicPlayer {
  return {
    id: p.id,
    nickname: p.nickname,
    avatarSeed: p.avatarSeed,
    isHost: p.isHost,
    isConnected: p.isConnected,
    isSpectator: p.isSpectator,
  };
}

export function lobbyPlayerLites(lobby: LobbyRoom): LobbyPlayerLite[] {
  return [...lobby.players, ...lobby.spectators].map((p) => ({
    id: p.id,
    nickname: p.nickname,
    isSpectator: p.isSpectator,
    isConnected: p.isConnected,
  }));
}

/**
 * Build a fresh room with a unique code. Caller is responsible for adding the
 * first player (host) afterwards.
 */
export function createRoom(io: Io, definition: GameDefinition, hostPlayer: LobbyPlayer): RoomInstance {
  const code = reserveUniqueCode();
  const lobby: LobbyRoom = {
    code,
    gameType: definition.gameType,
    rev: 1,
    createdAt: Date.now(),
    hostId: hostPlayer.id,
    status: 'LOBBY',
    players: [hostPlayer],
    spectators: [],
    accessMode: 'public',
  };
  // Build the game with a context that closes over `lobby` / `io`.
  const ctx: GameContext = buildGameContext(io, code, () => lobby);
  const game = definition.create(ctx);
  const room: RoomInstance = { lobby, definition, game };
  rooms.set(code, room);
  return room;
}

function reserveUniqueCode(): string {
  for (let i = 0; i < 16; i++) {
    const code = generateRoomCode();
    if (!rooms.has(code)) return code;
  }
  // Astronomically unlikely with 4-char alphabet, but tolerate by extending length.
  throw new Error('Failed to allocate a unique room code');
}

export function buildSnapshotFor(room: RoomInstance, playerId: string): LobbySnapshot {
  const me =
    room.lobby.players.find((p) => p.id === playerId) ??
    room.lobby.spectators.find((p) => p.id === playerId);
  return {
    room: room.lobby,
    gameState: room.game.getStateFor(playerId),
    you: {
      playerId,
      isHost: me?.isHost ?? false,
      isSpectator: me?.isSpectator ?? false,
    },
    serverTime: Date.now(),
  };
}

export { publicPlayerOf };

async function writeGameHistory(
  lobby: LobbyRoom,
  outcomes: GameOutcomes,
): Promise<void> {
  const db = getDb();
  await Promise.allSettled(
    Object.entries(outcomes).flatMap(([playerId, outcome]) => {
      const player = lobby.players.find((p) => p.id === playerId);
      if (!player?.userId) return [];
      return [
        db.gameSession.create({
          data: {
            userId: player.userId,
            gameType: lobby.gameType,
            roomCode: lobby.code,
            outcome,
          },
        }),
      ];
    }),
  );
}

/**
 * Build a fresh game instance inside an existing room (rematch path).
 * The lobby members and code are preserved; the game state is wiped.
 */
export function resetGame(io: Io, code: string): void {
  const room = rooms.get(code);
  if (!room) return;
  try {
    room.game.dispose?.();
  } catch {
    /* ignore */
  }
  const ctx: GameContext = buildGameContext(io, code, () => room.lobby);
  room.game = room.definition.create(ctx);
}

/**
 * Build a `GameContext` that bridges a `GameRoom` to socket.io. The factory
 * takes a `getLobby` lambda so it always sees the latest lobby reference even
 * if it's mutated by the lobby handlers (push/remove player, etc.).
 */
function buildGameContext(io: Io, code: string, getLobby: () => LobbyRoom): GameContext {
  return {
    roomCode: code,
    broadcast(event, payload) {
      io.to(roomChannel(code)).emit('game:event', { event, payload });
    },
    emitTo(playerId, event, payload) {
      const sockets = io.sockets.adapter.rooms.get(roomChannel(code));
      if (!sockets) return;
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (!s) continue;
        if (s.data.playerId === playerId) {
          s.emit('game:event', { event, payload });
        }
      }
    },
    broadcastState() {
      const room = rooms.get(code);
      if (!room) return;
      const sockets = io.sockets.adapter.rooms.get(roomChannel(code));
      if (!sockets) return;
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (!s) continue;
        const pid = s.data.playerId;
        if (!pid) continue;
        s.emit('lobby:state', buildSnapshotFor(room, pid));
      }
    },
    endGame(outcomes) {
      const lobby = getLobby();
      if (lobby.status !== 'PLAYING') return; // idempotent
      lobby.status = 'ENDED';
      lobby.rev++;
      io.to(roomChannel(code)).emit('lobby:status:changed', 'ENDED');
      if (outcomes && Object.keys(outcomes).length > 0) {
        void writeGameHistory(lobby, outcomes).catch((err) =>
          log.warn({ err, code }, 'history write failed (DB unavailable?)'),
        );
      }
    },
    listPlayers() {
      return lobbyPlayerLites(getLobby());
    },
  };
}
