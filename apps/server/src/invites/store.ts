/**
 * Ephemeral invitation store. Lives entirely in memory (single-process MVP).
 * Each invite carries a 60s TTL; cooldown of 30s per (from, to) pair caps
 * spam. A Redis-backed implementation could swap in by satisfying the same
 * `InviteStore` interface — see PR-1's PresenceStore for the same pattern.
 */
import { ulid } from 'ulid';

export const INVITE_TTL_MS = 60_000;
export const INVITE_COOLDOWN_MS = 30_000;

export interface InviteRecord {
  inviteId: string;
  fromUserId: string;
  fromNickname: string;
  fromSlug: string;
  fromAvatar: string | null;
  toUserId: string;
  roomCode: string;
  gameType: string;
  expiresAt: number;
}

export interface CreateInviteInput {
  fromUserId: string;
  fromNickname: string;
  fromSlug: string;
  fromAvatar: string | null;
  toUserId: string;
  roomCode: string;
  gameType: string;
}

export type CreateInviteResult =
  | { ok: true; invite: InviteRecord }
  | { ok: false; reason: 'COOLDOWN' };

export interface InviteStore {
  create(input: CreateInviteInput, onExpire: (invite: InviteRecord) => void): CreateInviteResult;
  /** Consume the invite if it exists, belongs to `toUserId`, and is unexpired. */
  consume(inviteId: string, toUserId: string): InviteRecord | null;
  /** Manual delete (decline path). Returns the deleted record if it existed. */
  remove(inviteId: string, toUserId: string): InviteRecord | null;
  /** For introspection / tests. */
  size(): number;
}

interface Internal {
  record: InviteRecord;
  timer: NodeJS.Timeout;
}

export function createMemoryInviteStore(): InviteStore {
  const invites = new Map<string, Internal>();
  const cooldown = new Map<string, number>();  // key = `${from}:${to}`

  function cooldownKey(from: string, to: string): string {
    return `${from}:${to}`;
  }

  function clearTimer(slot: Internal): void {
    clearTimeout(slot.timer);
  }

  return {
    create(input, onExpire) {
      const key = cooldownKey(input.fromUserId, input.toUserId);
      const until = cooldown.get(key) ?? 0;
      const now = Date.now();
      if (until > now) return { ok: false, reason: 'COOLDOWN' };

      const inviteId = ulid();
      const record: InviteRecord = {
        inviteId,
        fromUserId: input.fromUserId,
        fromNickname: input.fromNickname,
        fromSlug: input.fromSlug,
        fromAvatar: input.fromAvatar,
        toUserId: input.toUserId,
        roomCode: input.roomCode,
        gameType: input.gameType,
        expiresAt: now + INVITE_TTL_MS,
      };
      const timer = setTimeout(() => {
        const slot = invites.get(inviteId);
        if (!slot) return;
        invites.delete(inviteId);
        onExpire(slot.record);
      }, INVITE_TTL_MS);
      timer.unref?.();
      invites.set(inviteId, { record, timer });
      cooldown.set(key, now + INVITE_COOLDOWN_MS);
      return { ok: true, invite: record };
    },

    consume(inviteId, toUserId) {
      const slot = invites.get(inviteId);
      if (!slot) return null;
      if (slot.record.toUserId !== toUserId) return null;
      if (slot.record.expiresAt <= Date.now()) {
        invites.delete(inviteId);
        clearTimer(slot);
        return null;
      }
      invites.delete(inviteId);
      clearTimer(slot);
      return slot.record;
    },

    remove(inviteId, toUserId) {
      const slot = invites.get(inviteId);
      if (!slot) return null;
      if (slot.record.toUserId !== toUserId) return null;
      invites.delete(inviteId);
      clearTimer(slot);
      return slot.record;
    },

    size() {
      return invites.size;
    },
  };
}

let store: InviteStore | null = null;

export function getInviteStore(): InviteStore {
  if (!store) store = createMemoryInviteStore();
  return store;
}

/** Test helper. */
export function _setInviteStore(s: InviteStore): void {
  store = s;
}
