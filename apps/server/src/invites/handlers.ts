/**
 * Socket.IO handlers for direct invitations between mutual friends.
 *
 *  - `invite:send`   : sender must be authenticated, in a lobby, and a mutual
 *                      friend of the target. Target must currently be online.
 *                      30s per-pair cooldown enforced by the store.
 *  - `invite:accept` : recipient consumes the invite (one-shot). Server joins
 *                      them into the room with ACL bypassed.
 *  - `invite:decline`: recipient drops the invite (no side effect besides
 *                      freeing the slot).
 *
 * Expiry is handled by the store via a `setTimeout` callback that emits
 * `invite:expired` to the recipient's `user:<userId>` room so the toast can
 * dismiss itself.
 */
import { z } from 'zod';
import type { Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  Invite,
  ServerToClientEvents,
  SocketData,
} from '@tabswitch/types';
import type { Io } from '../io.js';
import { log } from '../log.js';
import { consume } from '../rate-limit.js';
import { findRoomForPlayer, getRoom } from '../room-manager.js';
import { areMutualFriends, getMutualFriends } from '../presence/friends.js';
import { getDb } from '@tabswitch/db';
import { getPresenceStore } from '../presence/index.js';
import { performFreshJoin } from '../lobby/join.js';
import { leaveRoom } from '../handlers/lobby.js';
import { getInviteStore } from './store.js';

type TSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const SendSchema = z.object({ toUserId: z.string().min(1).max(64) });
const InviteIdSchema = z.object({ inviteId: z.string().min(1).max(64) });

function ackErr(code: string, message: string) {
  return { ok: false as const, code, message, retryable: false };
}
function ackOk(): { ok: true };
function ackOk<T extends Record<string, unknown>>(data: T): { ok: true; data: T };
function ackOk<T extends Record<string, unknown>>(data?: T) {
  return data ? { ok: true as const, data } : { ok: true as const };
}

function inviteToWire(record: {
  inviteId: string;
  fromUserId: string;
  fromNickname: string;
  fromSlug: string;
  fromAvatar: string | null;
  roomCode: string;
  gameType: string;
  expiresAt: number;
}): Invite {
  return {
    inviteId: record.inviteId,
    fromUserId: record.fromUserId,
    fromNickname: record.fromNickname,
    fromSlug: record.fromSlug,
    fromAvatar: record.fromAvatar,
    roomCode: record.roomCode,
    gameType: record.gameType,
    expiresAt: record.expiresAt,
  };
}

export function registerInviteHandlers(io: Io, socket: TSocket): void {
  socket.on('invite:send', async (input, ack) => {
    try {
      if (!consume(socket, 'invite:send', 30)) {
        return ack(ackErr('RATE_LIMIT', 'Trop de tentatives.'));
      }
      const parsed = SendSchema.safeParse(input);
      if (!parsed.success) return ack(ackErr('BAD_INPUT', 'toUserId requis.'));

      const fromUserId = socket.data.userId;
      if (!fromUserId) {
        return ack(ackErr('NOT_AUTHED', 'Connecte-toi pour inviter quelqu’un.'));
      }
      if (fromUserId === parsed.data.toUserId) {
        return ack(ackErr('SELF_INVITE', 'Tu ne peux pas t’inviter toi-même.'));
      }

      // Sender must be in a room — the invite carries that room's code.
      const currentRoom = findRoomForPlayer(socket.data.playerId);
      if (!currentRoom) {
        return ack(ackErr('NO_ROOM', 'Crée un lobby avant d’inviter.'));
      }

      // Mutual friendship is the consent gate (no Block model yet).
      const mutual = await areMutualFriends(fromUserId, parsed.data.toUserId);
      if (!mutual) return ack(ackErr('NOT_FRIEND', 'Cette personne n’est pas dans tes amis.'));

      // Target must be currently online — we don't persist invites.
      const presence = getPresenceStore().get(parsed.data.toUserId);
      if (!presence) return ack(ackErr('FRIEND_OFFLINE', 'Ton ami n’est pas en ligne.'));

      // Pull the sender's public profile (nickname/slug/avatar) so the toast
      // shows their canonical identity, not the per-game nickname.
      const profile = await getDb()
        .user.findUnique({
          where: { id: fromUserId },
          select: {
            nickname: true,
            slug: true,
            settings: { select: { avatar: true } },
          },
        })
        .catch(() => null);

      const created = getInviteStore().create(
        {
          fromUserId,
          fromNickname: profile?.nickname || socket.data.nickname || 'Quelqu’un',
          fromSlug: profile?.slug ?? '',
          fromAvatar: profile?.settings?.avatar ?? null,
          toUserId: parsed.data.toUserId,
          roomCode: currentRoom.lobby.code,
          gameType: currentRoom.lobby.gameType,
        },
        (expired) => {
          io.to(`user:${expired.toUserId}`).emit('invite:expired', {
            inviteId: expired.inviteId,
          });
        },
      );
      if (!created.ok) {
        return ack(ackErr('RATE_LIMITED', 'Patiente un peu avant de réinviter.'));
      }

      io.to(`user:${parsed.data.toUserId}`).emit('invite:incoming', inviteToWire(created.invite));
      log.info(
        {
          from: fromUserId,
          to: parsed.data.toUserId,
          room: currentRoom.lobby.code,
          inviteId: created.invite.inviteId,
        },
        'invite sent',
      );
      ack(ackOk({ inviteId: created.invite.inviteId }));
    } catch (err) {
      log.error({ err }, 'invite:send failed');
      ack(ackErr('INTERNAL', 'Erreur interne.'));
    }
  });

  socket.on('invite:accept', async (input, ack) => {
    try {
      const parsed = InviteIdSchema.safeParse(input);
      if (!parsed.success) return ack(ackErr('BAD_INPUT', 'inviteId requis.'));
      const toUserId = socket.data.userId;
      if (!toUserId) return ack(ackErr('NOT_AUTHED', 'Connecte-toi pour accepter.'));

      const record = getInviteStore().consume(parsed.data.inviteId, toUserId);
      if (!record) return ack(ackErr('INVITE_EXPIRED', 'Invitation expirée ou déjà utilisée.'));

      // Make sure the room still exists.
      const room = getRoom(record.roomCode);
      if (!room) return ack(ackErr('NO_ROOM', 'La room n’existe plus.'));

      // Leave any previous room first (mirrors lobby:join semantics).
      const previous = findRoomForPlayer(socket.data.playerId);
      if (previous && previous.lobby.code !== record.roomCode) {
        await leaveRoom(io, socket, previous.lobby.code, 'leave');
      }

      // Already in this room? Just ack — client navigates regardless.
      const playerId = socket.data.playerId;
      const already =
        room.lobby.players.some((p) => p.id === playerId) ||
        room.lobby.spectators.some((p) => p.id === playerId);
      if (already) return ack(ackOk({ roomCode: record.roomCode }));

      // Pick a nickname: socket's current → recipient's own profile slug
      // (loaded from `getMutualFriends(fromUserId)` which is symmetric) →
      // 'Invité' as a last resort. The user can change it later via re-join.
      let nickname = socket.data.nickname?.trim() || '';
      if (!nickname) {
        const back = await getMutualFriends(record.fromUserId);
        const me = back.find((f) => f.userId === toUserId);
        nickname = me?.nickname || me?.slug || 'Invité';
      }

      const result = await performFreshJoin(io, socket, record.roomCode, nickname);
      if (!result.ok) return ack(ackErr(result.code, result.message));
      ack(ackOk({ roomCode: record.roomCode }));
      log.info(
        { from: record.fromUserId, to: toUserId, room: record.roomCode },
        'invite accepted',
      );
    } catch (err) {
      log.error({ err }, 'invite:accept failed');
      ack(ackErr('INTERNAL', 'Erreur interne.'));
    }
  });

  socket.on('invite:decline', (input, ack) => {
    const parsed = InviteIdSchema.safeParse(input);
    if (!parsed.success) return ack(ackErr('BAD_INPUT', 'inviteId requis.'));
    const toUserId = socket.data.userId;
    if (!toUserId) return ack(ackErr('NOT_AUTHED', 'Connecte-toi.'));
    getInviteStore().remove(parsed.data.inviteId, toUserId);
    ack(ackOk());
  });
}
