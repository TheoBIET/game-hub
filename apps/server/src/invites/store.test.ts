import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INVITE_COOLDOWN_MS,
  INVITE_TTL_MS,
  createMemoryInviteStore,
  type InviteStore,
} from './store.js';

function baseInput() {
  return {
    fromUserId: 'alice',
    fromNickname: 'Alice',
    fromSlug: 'alice',
    fromAvatar: null,
    toUserId: 'bob',
    roomCode: 'ABCD',
    gameType: 'gif-battle',
  };
}

describe('MemoryInviteStore', () => {
  let store: InviteStore;
  let onExpire: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createMemoryInviteStore();
    onExpire = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('create returns a record with a fresh inviteId', () => {
    const r = store.create(baseInput(), onExpire);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.invite.inviteId).toMatch(/^[0-9A-Z]{26}$/);
    expect(store.size()).toBe(1);
  });

  it('cooldown rejects a second invite from the same pair within 30s', () => {
    expect(store.create(baseInput(), onExpire).ok).toBe(true);
    vi.advanceTimersByTime(INVITE_COOLDOWN_MS - 1);
    const blocked = store.create(baseInput(), onExpire);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('COOLDOWN');
  });

  it('cooldown does not affect a different (from, to) pair', () => {
    expect(store.create(baseInput(), onExpire).ok).toBe(true);
    const other = store.create({ ...baseInput(), toUserId: 'carol' }, onExpire);
    expect(other.ok).toBe(true);
  });

  it('consume returns the record once, then nothing on retry', () => {
    const r = store.create(baseInput(), onExpire);
    if (!r.ok) throw new Error('setup');
    const first = store.consume(r.invite.inviteId, 'bob');
    expect(first?.roomCode).toBe('ABCD');
    expect(store.consume(r.invite.inviteId, 'bob')).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('consume refuses if the wrong recipient asks', () => {
    const r = store.create(baseInput(), onExpire);
    if (!r.ok) throw new Error('setup');
    expect(store.consume(r.invite.inviteId, 'mallory')).toBeNull();
    // The invite is still alive — bob can still claim it.
    expect(store.consume(r.invite.inviteId, 'bob')).not.toBeNull();
  });

  it('TTL elapses → onExpire fires and the record is gone', () => {
    const r = store.create(baseInput(), onExpire);
    if (!r.ok) throw new Error('setup');
    vi.advanceTimersByTime(INVITE_TTL_MS + 10);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(store.size()).toBe(0);
    expect(store.consume(r.invite.inviteId, 'bob')).toBeNull();
  });

  it('consuming clears the TTL timer (no late onExpire)', () => {
    const r = store.create(baseInput(), onExpire);
    if (!r.ok) throw new Error('setup');
    store.consume(r.invite.inviteId, 'bob');
    vi.advanceTimersByTime(INVITE_TTL_MS + 10);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('remove (decline path) also kills the timer', () => {
    const r = store.create(baseInput(), onExpire);
    if (!r.ok) throw new Error('setup');
    expect(store.remove(r.invite.inviteId, 'bob')?.inviteId).toBe(r.invite.inviteId);
    vi.advanceTimersByTime(INVITE_TTL_MS + 10);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
