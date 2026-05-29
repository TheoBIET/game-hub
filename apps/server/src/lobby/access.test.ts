import { describe, expect, it } from 'vitest';
import { checkAccess } from './access.js';

describe('checkAccess', () => {
  it('public mode lets everyone in', () => {
    expect(
      checkAccess({
        accessMode: 'public',
        hostUserId: 'h',
        joinerUserId: 'j',
        isMutualFriend: false,
      }),
    ).toEqual({ ok: true });
    expect(
      checkAccess({
        accessMode: 'public',
        hostUserId: 'h',
        joinerUserId: undefined,
        isMutualFriend: false,
      }),
    ).toEqual({ ok: true });
  });

  it('private mode rejects everyone without bypass', () => {
    const decision = checkAccess({
      accessMode: 'private',
      hostUserId: 'h',
      joinerUserId: 'h',
      isMutualFriend: true,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe('ACCESS_DENIED');
  });

  it('bypassAcl always wins', () => {
    expect(
      checkAccess({
        accessMode: 'private',
        hostUserId: 'h',
        joinerUserId: 'j',
        isMutualFriend: false,
        bypassAcl: true,
      }),
    ).toEqual({ ok: true });
  });

  it('friends mode rejects guests', () => {
    const decision = checkAccess({
      accessMode: 'friends',
      hostUserId: 'h',
      joinerUserId: undefined,
      isMutualFriend: false,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe('ACCESS_DENIED');
  });

  it('friends mode rejects non-mutual followers', () => {
    const decision = checkAccess({
      accessMode: 'friends',
      hostUserId: 'h',
      joinerUserId: 'j',
      isMutualFriend: false,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe('NOT_FRIEND');
  });

  it('friends mode accepts mutual friends', () => {
    expect(
      checkAccess({
        accessMode: 'friends',
        hostUserId: 'h',
        joinerUserId: 'j',
        isMutualFriend: true,
      }),
    ).toEqual({ ok: true });
  });

  it('friends mode rejects when host is anonymous (no userId)', () => {
    const decision = checkAccess({
      accessMode: 'friends',
      hostUserId: undefined,
      joinerUserId: 'j',
      isMutualFriend: true,
    });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.code).toBe('ACCESS_DENIED');
  });
});
