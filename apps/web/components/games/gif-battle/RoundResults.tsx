'use client';

import type { RoundResultsPayload } from '@tabswitch/gif-battle';

export function RoundResults({ results }: { results: RoundResultsPayload }) {
  const sorted = [...results.submissions].sort((a, b) => b.voteCount - a.voteCount);
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-center text-2xl font-bold">Résultats — manche {results.roundNumber}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sorted.map((sub) => {
          const delta = results.scoreDeltas.find((d) => d.playerId === sub.playerId);
          return (
            <div
              key={sub.id}
              className={`overflow-hidden rounded-xl border ${
                sub.isWinner ? 'border-amber-400 ring-2 ring-amber-400' : 'border-white/10'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sub.gifUrl || sub.previewUrl} alt="gif" className="h-40 w-full object-contain bg-black/40" />
              <div className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">
                  {sub.isWinner && '👑 '}
                  {sub.nickname}
                </span>
                <span className="tabular-nums text-[color:var(--color-fg-muted)]">
                  {sub.voteCount} vote{sub.voteCount > 1 ? 's' : ''}
                  {delta ? ` · +${delta.delta}` : ''}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
