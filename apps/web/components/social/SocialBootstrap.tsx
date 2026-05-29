'use client';

import { useEffect } from 'react';
import { subscribePresence, usePresence } from '@/lib/presence';

/**
 * Mounts once per page load (in HubNav). Refreshes the player JWT cookie
 * (so the realtime server sees `userId` when authenticated), then opens the
 * presence subscription. Tears down on unmount — but in practice the HubNav
 * persists across client navigations, so the socket stays warm.
 */
export function SocialBootstrap({ isAuthenticated }: { isAuthenticated: boolean }) {
  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;

    async function start(): Promise<void> {
      try {
        await fetch('/api/auth/session', { method: 'GET', cache: 'no-store' });
      } catch {
        // Network glitch — proceed anyway; the socket will mint a guest.
      }
      if (cancelled) return;
      teardown = subscribePresence(isAuthenticated);
    }

    void start();

    return () => {
      cancelled = true;
      teardown?.();
      usePresence.getState().reset();
    };
  }, [isAuthenticated]);

  return null;
}
