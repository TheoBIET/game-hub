/**
 * Mutual-follow lookup. "A is friends with B" when both A→B and B→A exist in
 * the `Follow` table. Cached in-process for 30s to avoid spamming Prisma on
 * reconnects.
 *
 * Cache scope is per-user (mutuals of one user), keyed by userId. Invalidation
 * on follow/unfollow is best-effort (TTL is short enough that it doesn't
 * matter for the dock).
 */
import { getDb } from '@tabswitch/db';

const TTL_MS = 30_000;

interface CacheEntry {
  expiresAt: number;
  pending?: Promise<MutualFriendInfo[]>;
  value?: MutualFriendInfo[];
}

export interface MutualFriendInfo {
  userId: string;
  nickname: string;
  slug: string;
  avatar: string | null;
}

const cache = new Map<string, CacheEntry>();

export async function getMutualFriends(userId: string): Promise<MutualFriendInfo[]> {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached) {
    if (cached.value && cached.expiresAt > now) return cached.value;
    if (cached.pending) return cached.pending;
  }

  const promise = loadMutualFriends(userId).then((value) => {
    cache.set(userId, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  });
  cache.set(userId, { expiresAt: now + TTL_MS, pending: promise });
  try {
    return await promise;
  } catch (err) {
    cache.delete(userId);
    throw err;
  }
}

async function loadMutualFriends(userId: string): Promise<MutualFriendInfo[]> {
  const db = getDb();
  // A is mutual-friends with B when A→B and B→A. Outer condition is A→B
  // (A is the follower). The nested condition is B→A: the User on the
  // `following` side has a follow row pointing back at A.
  const rows = await db.follow.findMany({
    where: {
      followerId: userId,
      following: { follows: { some: { followingId: userId } } },
    },
    select: {
      following: {
        select: {
          id: true,
          nickname: true,
          slug: true,
          settings: { select: { avatar: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const f = row.following;
    if (!f.nickname || !f.slug) return [];
    return [
      {
        userId: f.id,
        nickname: f.nickname,
        slug: f.slug,
        avatar: f.settings?.avatar ?? null,
      },
    ];
  });
}

/** Test helper. */
export function _clearFriendsCache(): void {
  cache.clear();
}

/**
 * Cheap "are A and B mutual friends?" check. We can satisfy this from the
 * cached friend list of A when present — that avoids hitting Prisma at all
 * inside the lobby join hot path.
 */
export async function areMutualFriends(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const cached = cache.get(a);
  if (cached?.value) {
    return cached.value.some((f) => f.userId === b);
  }
  // No cache — load full list (and populate cache as a side effect).
  const list = await getMutualFriends(a);
  return list.some((f) => f.userId === b);
}
