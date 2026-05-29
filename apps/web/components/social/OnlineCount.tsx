'use client';

import { useTranslations } from 'next-intl';
import { usePresence } from '@/lib/presence';

/**
 * Discreet "● N en ligne" badge in the HubNav. The dot pulses while connected.
 * Renders nothing until the first snapshot arrives, to avoid a "0" flash.
 */
export function OnlineCount() {
  const ready = usePresence((s) => s.ready);
  const count = usePresence((s) => s.globalOnline);
  const t = useTranslations('social');

  if (!ready) return null;

  return (
    <span
      className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-[color:var(--color-fg-muted)] sm:inline-flex"
      title={t('onlineTooltip')}
      aria-live="polite"
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      {t('onlineCount', { count })}
    </span>
  );
}
