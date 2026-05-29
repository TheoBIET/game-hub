'use client';

import { useEffect, useState } from 'react';

/**
 * Secondes restantes jusqu'à `deadlineAt` (ms epoch serveur). `serverTime` (ms
 * epoch du snapshot) corrige le décalage d'horloge client/serveur.
 */
export function useCountdown(deadlineAt: number | undefined, serverTime: number | undefined): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (deadlineAt == null) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [deadlineAt]);
  if (deadlineAt == null) return 0;
  const offset = serverTime != null ? serverTime - Date.now() : 0;
  const remainingMs = deadlineAt - (Date.now() + offset);
  return Math.max(0, Math.ceil(remainingMs / 1000));
}
