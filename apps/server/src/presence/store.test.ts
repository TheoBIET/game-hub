import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryPresenceStore, type PresenceStore } from './store.js';

describe('MemoryPresenceStore', () => {
  let store: PresenceStore;

  beforeEach(() => {
    vi.useFakeTimers();
    store = createMemoryPresenceStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('first socket flips the user to online', () => {
    expect(store.addSocket('u1', 's1')).toBe(true);
    expect(store.globalCount()).toBe(1);
    expect(store.get('u1')?.status).toBe('online');
  });

  it('subsequent sockets do not announce a new arrival', () => {
    store.addSocket('u1', 's1');
    expect(store.addSocket('u1', 's2')).toBe(false);
    expect(store.globalCount()).toBe(1);
  });

  it('removing a non-last socket does not flip wasLast', () => {
    store.addSocket('u1', 's1');
    store.addSocket('u1', 's2');
    expect(store.removeSocket('u1', 's1')).toBe(false);
    expect(store.globalCount()).toBe(1);
  });

  it('removing the last socket marks wasLast but keeps state until grace expires', () => {
    store.addSocket('u1', 's1');
    expect(store.removeSocket('u1', 's1')).toBe(true);
    // State is NOT cleared synchronously — only after grace.
    expect(store.get('u1')?.status).toBe('online');
  });

  it('anti-flicker: reconnecting within the grace window keeps the user online', () => {
    store.addSocket('u1', 's1');
    store.removeSocket('u1', 's1');
    const onOffline = vi.fn();
    store.scheduleOfflineCheck('u1', onOffline);

    // Reconnect before timer fires.
    vi.advanceTimersByTime(2_000);
    store.addSocket('u1', 's2');

    vi.advanceTimersByTime(10_000);
    expect(onOffline).not.toHaveBeenCalled();
    expect(store.globalCount()).toBe(1);
  });

  it('flips offline after the 5s grace if no reconnect', () => {
    store.addSocket('u1', 's1');
    store.removeSocket('u1', 's1');
    const onOffline = vi.fn();
    store.scheduleOfflineCheck('u1', onOffline);

    vi.advanceTimersByTime(5_000);
    expect(onOffline).toHaveBeenCalledWith('u1');
    expect(store.globalCount()).toBe(0);
    expect(store.get('u1')).toBeNull();
  });

  it('set merges patches but ignores users who are offline', () => {
    expect(store.set('u1', { status: 'idle' })).toBeNull();
    store.addSocket('u1', 's1');
    const after = store.set('u1', { status: 'in_lobby', roomCode: 'ABCD', gameType: 'tictactoe' });
    expect(after?.status).toBe('in_lobby');
    expect(after?.roomCode).toBe('ABCD');
    expect(after?.gameType).toBe('tictactoe');
  });

  it('set bumps `since` only when the status changes', () => {
    store.addSocket('u1', 's1');
    const t0 = store.get('u1')!.since;
    vi.advanceTimersByTime(1_000);
    const same = store.set('u1', { roomCode: 'AAAA' });
    expect(same?.since).toBe(t0);
    vi.advanceTimersByTime(1_000);
    const flipped = store.set('u1', { status: 'idle' });
    expect(flipped?.since).toBeGreaterThan(t0);
  });

  it('globalCount counts distinct users, not sockets', () => {
    store.addSocket('u1', 's1');
    store.addSocket('u1', 's2');
    store.addSocket('u2', 's3');
    expect(store.globalCount()).toBe(2);
    expect(store._debug()).toEqual({ users: 2, sockets: 3 });
  });
});
