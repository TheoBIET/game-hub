'use client';

import * as React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { FriendState } from '@tabswitch/types';
import { Avatar } from '@/components/ui/Avatar';
import { getSocket } from '@/lib/socket';
import { useLobby } from '@/lib/store';
import { cn } from '@/lib/utils';

const DOT_BY_STATUS: Record<FriendState['status'], string> = {
  online: 'bg-emerald-400',
  idle: 'bg-amber-400',
  in_lobby: 'bg-fuchsia-400',
  in_game: 'bg-fuchsia-400',
  offline: 'bg-zinc-500',
};

function gameLabel(gameType: string | null): string {
  if (!gameType) return '';
  switch (gameType) {
    case 'gif-battle':
      return 'GIF Battle';
    case 'tictactoe':
      return 'Tic-Tac-Toe';
    case 'connect4':
      return 'Connect 4';
    case 'rps':
      return 'PFC';
    default:
      return gameType;
  }
}

export function FriendRow({ friend }: { friend: FriendState }) {
  const t = useTranslations('social.dock');
  const snapshot = useLobby((s) => s.snapshot);
  const setToast = useLobby((s) => s.setToast);
  const myRoomCode = snapshot?.room.code ?? null;
  const [sending, setSending] = React.useState(false);

  function invite() {
    if (sending) return;
    setSending(true);
    getSocket().emit('invite:send', { toUserId: friend.userId }, (ack) => {
      setSending(false);
      if (ack.ok) {
        setToast({
          id: `invite-${ack.data.inviteId}`,
          kind: 'success',
          text: t('inviteSent', { nickname: friend.nickname }),
        });
      } else {
        setToast({
          id: `invite-err-${Date.now()}`,
          kind: 'error',
          text: ack.message ?? t('inviteError'),
        });
      }
    });
  }

  const subtitle = (() => {
    if (friend.status === 'in_lobby' || friend.status === 'in_game') {
      const game = gameLabel(friend.gameType);
      return friend.roomCode ? `${game} · ${friend.roomCode}` : game;
    }
    if (friend.status === 'idle') return t('statusIdle');
    if (friend.status === 'offline') return t('statusOffline');
    return t('statusOnline');
  })();

  const action = (() => {
    if (friend.status === 'in_lobby' && friend.accessMode !== 'private') {
      return (
        <Link
          href={`/r/${friend.roomCode}`}
          className="rounded-md bg-[color:var(--color-accent-500)]/15 px-2.5 py-1 text-xs font-medium text-[color:var(--color-accent-300)] transition-colors hover:bg-[color:var(--color-accent-500)]/25"
        >
          {t('actionJoin')} →
        </Link>
      );
    }
    if (friend.status === 'in_lobby' && friend.accessMode === 'private') {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-[color:var(--color-fg-muted)]">
          🔒 {t('badgePrivate')}
        </span>
      );
    }
    if (friend.status === 'in_game') {
      return (
        <span className="inline-flex items-center rounded-md bg-white/[0.05] px-2 py-1 text-xs text-[color:var(--color-fg-muted)]">
          {t('badgeInGame')}
        </span>
      );
    }
    if (friend.status === 'online' || friend.status === 'idle') {
      const canInvite = !!myRoomCode;
      return (
        <button
          type="button"
          onClick={invite}
          disabled={!canInvite || sending}
          title={canInvite ? t('inviteTooltip', { nickname: friend.nickname }) : t('inviteTooltipNoLobby')}
          className={cn(
            'rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]',
            canInvite
              ? 'text-[color:var(--color-fg)] hover:bg-white/[0.06]'
              : 'text-[color:var(--color-fg-muted)] opacity-60',
          )}
        >
          {sending ? '…' : t('actionInvite')}
        </button>
      );
    }
    return null;
  })();

  const isOffline = friend.status === 'offline';

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.03]',
        isOffline && 'opacity-60',
      )}
    >
      <Link
        href={`/profile/${friend.slug}`}
        className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]"
        aria-label={friend.nickname}
      >
        <Avatar
          seed={friend.slug || friend.userId}
          src={friend.avatar}
          size={36}
          className={isOffline ? 'grayscale' : undefined}
        />
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-[color:var(--color-bg-950)]',
            DOT_BY_STATUS[friend.status],
          )}
          aria-hidden="true"
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/profile/${friend.slug}`}
          className="block truncate text-sm font-medium text-[color:var(--color-fg)] hover:underline"
        >
          {friend.nickname}
        </Link>
        <p className="truncate text-xs italic text-[color:var(--color-fg-muted)]">{subtitle}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </li>
  );
}
