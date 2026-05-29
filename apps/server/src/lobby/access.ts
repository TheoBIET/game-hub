/**
 * Lobby access control. Centralized here so it can be unit-tested in isolation
 * from the socket handler. The join handler calls `checkAccess` before adding
 * a player to the room.
 *
 * Guests (no userId) are allowed only in `public` mode. `private` is reserved
 * for invitations (PR 3): without a `bypassAcl` flag, no one can walk in.
 */
import type { LobbyAccessMode } from '@tabswitch/types';

export type AccessDecision =
  | { ok: true }
  | { ok: false; code: 'ACCESS_DENIED' | 'NOT_FRIEND'; message: string };

export interface AccessContext {
  accessMode: LobbyAccessMode;
  hostUserId: string | undefined;
  joinerUserId: string | undefined;
  /** Pre-resolved by the caller (cache lookup) — keeps `checkAccess` sync + pure. */
  isMutualFriend: boolean;
  /** Set when the join is consuming a valid invitation (PR 3). */
  bypassAcl?: boolean;
}

export function checkAccess(ctx: AccessContext): AccessDecision {
  if (ctx.bypassAcl) return { ok: true };
  if (ctx.accessMode === 'public') return { ok: true };

  if (ctx.accessMode === 'private') {
    return {
      ok: false,
      code: 'ACCESS_DENIED',
      message: 'Cette room est privée. Il te faut une invitation.',
    };
  }

  // friends mode
  if (!ctx.joinerUserId || !ctx.hostUserId) {
    return {
      ok: false,
      code: 'ACCESS_DENIED',
      message: 'Cette room est réservée aux amis du host — connecte-toi pour rejoindre.',
    };
  }
  if (!ctx.isMutualFriend) {
    return {
      ok: false,
      code: 'NOT_FRIEND',
      message: 'Seuls les amis du host peuvent rejoindre cette room.',
    };
  }
  return { ok: true };
}
