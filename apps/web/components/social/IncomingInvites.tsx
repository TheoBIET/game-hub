'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import type { Invite } from '@tabswitch/types';
import { Avatar } from '@/components/ui/Avatar';
import { getSocket } from '@/lib/socket';
import { usePresence } from '@/lib/presence';
import { playInviteCue } from '@/lib/sound';

const GAME_LABEL: Record<string, string> = {
  'gif-battle': 'GIF Battle',
  tictactoe: 'Tic-Tac-Toe',
  connect4: 'Connect 4',
  rps: 'Pierre-Feuille-Ciseaux',
};

/**
 * Stack of incoming invite toasts, top-center on desktop / top-full on mobile.
 * One <InviteCard> per pending invite. Plays a brief audio cue on arrival.
 */
export function IncomingInvites() {
  const invites = usePresence((s) => s.incomingInvites);

  // Play cue on every new invite (compare against previous render's id set).
  const previousIds = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const currentIds = new Set(invites.map((i) => i.inviteId));
    for (const id of currentIds) {
      if (!previousIds.current.has(id)) {
        playInviteCue();
        break;
      }
    }
    previousIds.current = currentIds;
  }, [invites]);

  if (invites.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-20 z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      <AnimatePresence>
        {invites.map((invite) => (
          <InviteCard key={invite.inviteId} invite={invite} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function InviteCard({ invite }: { invite: Invite }) {
  const t = useTranslations('social.invite');
  const removeInvite = usePresence((s) => s.removeInvite);
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const expiresIn = Math.max(0, Math.round((invite.expiresAt - Date.now()) / 1000));
  const [seconds, setSeconds] = React.useState(expiresIn);
  React.useEffect(() => {
    const t = setInterval(() => {
      const remaining = Math.max(0, Math.round((invite.expiresAt - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) {
        clearInterval(t);
        // The server-side TTL emits invite:expired, which removes us anyway,
        // but bail eagerly to avoid a flash of the "0s" countdown.
        removeInvite(invite.inviteId);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [invite.expiresAt, invite.inviteId, removeInvite]);

  function accept() {
    if (submitting) return;
    setSubmitting(true);
    getSocket().emit('invite:accept', { inviteId: invite.inviteId }, (ack) => {
      setSubmitting(false);
      removeInvite(invite.inviteId);
      if (ack.ok) router.push(`/r/${ack.data.roomCode}`);
    });
  }

  function decline() {
    if (submitting) return;
    getSocket().emit('invite:decline', { inviteId: invite.inviteId }, () => {});
    removeInvite(invite.inviteId);
  }

  const gameName = GAME_LABEL[invite.gameType] ?? invite.gameType;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-fuchsia-400/30 bg-[color:var(--color-bg-900)]/95 px-3 py-2.5 shadow-2xl backdrop-blur-xl"
      role="alert"
    >
      <Avatar seed={invite.fromSlug || invite.fromUserId} src={invite.fromAvatar} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[color:var(--color-fg)]">
          <strong>{invite.fromNickname}</strong>{' '}
          {t('invitesYou', { game: gameName })}
        </p>
        <p className="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-muted)]">
          {t('expiresIn', { seconds })}
        </p>
      </div>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          onClick={decline}
          disabled={submitting}
          className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-[color:var(--color-fg-muted)] transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 disabled:opacity-50"
        >
          {t('decline')}
        </button>
        <button
          type="button"
          onClick={accept}
          disabled={submitting}
          className="rounded-md bg-[color:var(--color-accent-500)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[color:var(--color-accent-600)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)] disabled:opacity-50"
        >
          {t('accept')}
        </button>
      </div>
    </motion.div>
  );
}
