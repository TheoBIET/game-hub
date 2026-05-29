'use client';

import { useState } from 'react';
import type { GameEndedPayload } from '@tabswitch/gif-battle';
import { Button } from '@/components/ui/Button';
import { getSocket } from '@/lib/socket';

export function GameEndScreen({
  payload,
  isHost,
}: {
  payload: GameEndedPayload;
  isHost: boolean;
}) {
  const [restarting, setRestarting] = useState(false);

  function rematch() {
    setRestarting(true);
    getSocket().emit('lobby:start', {}, (ack) => {
      setRestarting(false);
      if (!ack.ok) alert(ack.message);
    });
  }

  function copyShare() {
    if (typeof window === 'undefined') return;
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
  }

  return (
    <section className="flex flex-col items-center gap-6">
      <h2 className="font-display text-3xl font-extrabold">🏆 Classement final</h2>
      <ol className="w-full max-w-md space-y-2">
        {payload.finalScores.map((p) => {
          const trophies = payload.trophies.filter((t) => t.playerId === p.playerId);
          return (
            <li
              key={p.playerId}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                p.rank === 1 ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.03]'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-[color:var(--color-fg-muted)]">#{p.rank}</span>
                <span className="font-medium">{p.nickname}</span>
                {trophies.map((t) => (
                  <span key={t.key} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase">
                    {t.label}
                  </span>
                ))}
              </span>
              <span className="tabular-nums font-bold">{p.score}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={copyShare}>
          Copier le lien
        </Button>
        {isHost ? (
          <Button variant="accent" onClick={rematch} disabled={restarting}>
            {restarting ? 'Redémarrage…' : 'Rejouer'}
          </Button>
        ) : (
          <p className="self-center text-xs text-[color:var(--color-fg-muted)]">En attente du host…</p>
        )}
      </div>
    </section>
  );
}
