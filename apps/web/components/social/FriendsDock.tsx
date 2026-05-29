'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Users, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePresence } from '@/lib/presence';
import { FriendRow } from './FriendRow';
import { cn } from '@/lib/utils';

/**
 * Floating friends dock — bottom-right FAB that expands into a side-sheet
 * (right slide-in on desktop, bottom-sheet on mobile). Only shown for
 * authenticated users; the parent gates rendering via `isAuthenticated`.
 *
 * PR2 displays online mutual-followers only (offline ones aren't loaded —
 * they'd require a separate endpoint we don't have yet). The invite button
 * is shown disabled with a "coming soon" tooltip in preparation for PR3.
 */
export function FriendsDock() {
  const [open, setOpen] = React.useState(false);
  const friends = usePresence((s) => s.friends);
  const ready = usePresence((s) => s.ready);
  const t = useTranslations('social.dock');

  const list = React.useMemo(() => {
    return Object.values(friends).sort((a, b) => {
      // in_lobby first, then online, then idle, then in_game.
      const rank: Record<string, number> = { in_lobby: 0, online: 1, in_game: 2, idle: 3 };
      const ra = rank[a.status] ?? 4;
      const rb = rank[b.status] ?? 4;
      if (ra !== rb) return ra - rb;
      return a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' });
    });
  }, [friends]);

  // Close on Escape.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Render nothing until we have the initial snapshot — avoids a flash of
  // "0 amis en ligne" before the socket replies.
  if (!ready) return null;

  const count = list.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="friends-dock-panel"
        aria-label={t('toggle', { count })}
        title={t('toggle', { count })}
        className={cn(
          'fixed bottom-4 right-4 z-40 flex h-12 items-center gap-2 rounded-full border border-white/10 bg-[color:var(--color-bg-900)]/90 px-3 shadow-xl backdrop-blur-lg transition-all hover:bg-[color:var(--color-bg-800)]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]',
          open && 'opacity-0 pointer-events-none',
        )}
      >
        <Users size={18} className="text-[color:var(--color-fg)]" aria-hidden="true" />
        <span className="text-sm font-semibold text-[color:var(--color-fg)]">{count}</span>
        {count > 0 && (
          <span className="relative -ml-0.5 inline-flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Mobile backdrop. */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 sm:hidden"
              aria-hidden="true"
            />
            <motion.div
              key="panel"
              id="friends-dock-panel"
              role="dialog"
              aria-modal="true"
              aria-label={t('panelTitle')}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed bottom-4 right-4 z-50 flex max-h-[min(72vh,560px)] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[color:var(--color-bg-900)]/95 shadow-2xl backdrop-blur-xl sm:right-4"
            >
              <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Users size={16} className="text-[color:var(--color-accent-300)]" aria-hidden="true" />
                  {t('panelTitle')}
                  <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-normal text-[color:var(--color-fg-muted)]">
                    {count}
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md p-1.5 text-[color:var(--color-fg-muted)] transition-colors hover:bg-white/[0.06] hover:text-[color:var(--color-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]"
                  aria-label={t('close')}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto p-2">
                {count === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                    <Users size={28} className="text-[color:var(--color-fg-muted)]/50" aria-hidden="true" />
                    <p className="text-sm font-medium text-[color:var(--color-fg)]">{t('emptyTitle')}</p>
                    <p className="text-xs text-[color:var(--color-fg-muted)]">{t('emptyHint')}</p>
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {list.map((f) => (
                      <FriendRow key={f.userId} friend={f} />
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
