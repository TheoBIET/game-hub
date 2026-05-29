'use client';

import { useTransition } from 'react';
import { Globe2, Lock, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { LobbyAccessMode } from '@tabswitch/types';
import { getSocket } from '@/lib/socket';
import { useLobby } from '@/lib/store';
import { cn } from '@/lib/utils';

const MODES: ReadonlyArray<{
  value: LobbyAccessMode;
  iconKey: 'public' | 'friends' | 'private';
}> = [
  { value: 'public', iconKey: 'public' },
  { value: 'friends', iconKey: 'friends' },
  { value: 'private', iconKey: 'private' },
];

function Icon({ k }: { k: 'public' | 'friends' | 'private' }) {
  if (k === 'public') return <Globe2 size={14} aria-hidden="true" />;
  if (k === 'friends') return <Users size={14} aria-hidden="true" />;
  return <Lock size={14} aria-hidden="true" />;
}

/**
 * Host-only segmented control to switch the lobby between public / friends /
 * private. Optimistic UI: we flip the local snapshot immediately and revert
 * on server error.
 */
export function AccessModeToggle({ mode }: { mode: LobbyAccessMode }) {
  const t = useTranslations('lobby.access');
  const setToast = useLobby((s) => s.setToast);
  const [pending, startTransition] = useTransition();

  function change(next: LobbyAccessMode) {
    if (next === mode || pending) return;
    startTransition(() => {
      getSocket().emit('lobby:setAccessMode', { mode: next }, (ack) => {
        if (!ack.ok) {
          setToast({
            id: `acl-err-${Date.now()}`,
            kind: 'error',
            text: ack.message ?? t('error'),
          });
        }
      });
    });
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('label')}
      className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1"
    >
      {MODES.map((m) => {
        const active = m.value === mode;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={pending}
            onClick={() => change(m.value)}
            title={t(`tooltip.${m.value}`)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]',
              active
                ? 'bg-[color:var(--color-accent-500)]/20 text-[color:var(--color-accent-200)]'
                : 'text-[color:var(--color-fg-muted)] hover:bg-white/[0.06]',
              pending && 'opacity-60',
            )}
          >
            <Icon k={m.iconKey} />
            <span className="hidden sm:inline">{t(`label_${m.value}`)}</span>
          </button>
        );
      })}
    </div>
  );
}
