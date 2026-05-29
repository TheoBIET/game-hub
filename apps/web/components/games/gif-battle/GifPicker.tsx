'use client';

import { useEffect, useState } from 'react';
import { GIF_BATTLE_EVENTS, type GifBattleClientView } from '@tabswitch/gif-battle';
import { gameAction, getSocket } from '@/lib/socket';

interface GifResult {
  id: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  description?: string;
}

export function GifPicker({ view, secondsLeft }: { view: GifBattleClientView; secondsLeft: number }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const round = view.currentRound;
  const submitted = view.you.submittedThisRound;

  useEffect(() => {
    let active = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          locale: view.settings.locale,
          rating: view.settings.gifRating,
        });
        const res = await fetch(`/api/gif/search?${params.toString()}`);
        const data = await res.json();
        if (active) setResults(data.results ?? []);
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 350);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [query, view.settings.locale, view.settings.gifRating]);

  async function choose(g: GifResult) {
    setSubmittingId(g.id);
    const ack = await gameAction(getSocket(), GIF_BATTLE_EVENTS.RoundSubmit, {
      gifId: g.id,
      gifUrl: g.url,
      previewUrl: g.previewUrl,
      width: g.width,
      height: g.height,
    });
    setSubmittingId(null);
    if (!ack.ok) alert(ack.message);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
        <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-fg-muted)]">
          Manche {round?.number} · {secondsLeft}s
        </div>
        <p className="font-display mt-2 text-2xl font-bold">{round?.themeText}</p>
        {submitted && <p className="mt-2 text-sm text-emerald-300">✓ GIF soumis — tu peux encore changer</p>}
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cherche un GIF…"
        className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-white/40"
      />

      {loading && results.length === 0 ? (
        <p className="text-center text-sm text-[color:var(--color-fg-muted)]">Recherche…</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {results.map((g) => {
            const isMine = view.you.submittedThisRound;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => choose(g)}
                disabled={submittingId !== null}
                className={`group relative overflow-hidden rounded-xl border border-white/10 transition hover:border-white/40 ${
                  submittingId === g.id ? 'animate-pulse ring-2 ring-emerald-400' : ''
                }`}
                title={g.description}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.previewUrl} alt={g.description ?? 'gif'} className="h-32 w-full object-cover" loading="lazy" />
                <span className="pointer-events-none absolute inset-0 hidden items-center justify-center bg-black/40 text-sm font-semibold group-hover:flex">
                  {isMine ? 'Remplacer' : 'Choisir'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
