'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function SentenceProposeModal({ onClose }: { onClose: () => void }) {
  const [fr, setFr] = useState('');
  const [en, setEn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/gif-battle/sentences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sentenceFr: fr, sentenceEn: en }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erreur');
        return;
      }
      setDone(true);
      setFr('');
      setEn('');
    } catch {
      setError('Erreur réseau');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#101014] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">➕ Proposer une phrase</h2>
          <button onClick={onClose} className="text-[color:var(--color-fg-muted)] hover:text-white" aria-label="Fermer">
            ✕
          </button>
        </div>
        <p className="mt-1 text-xs text-[color:var(--color-fg-muted)]">
          Elle sera validée à la main avant d&apos;entrer en rotation.
        </p>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <label className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
            🇫🇷 Version française
            <input
              value={fr}
              onChange={(e) => setFr(e.target.value.slice(0, 140))}
              maxLength={140}
              placeholder="quand le chat fait tomber le verre"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-white/40"
            />
          </label>
          <label className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
            🇬🇧 English version
            <input
              value={en}
              onChange={(e) => setEn(e.target.value.slice(0, 140))}
              maxLength={140}
              placeholder="when the cat knocks the glass off"
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-white/40"
            />
          </label>
          {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
          {done && !error && <p className="text-sm text-emerald-300">✓ Proposée, merci !</p>}
          <Button type="submit" variant="accent" disabled={submitting || fr.trim().length < 4 || en.trim().length < 4}>
            {submitting ? 'Envoi…' : 'Proposer'}
          </Button>
        </form>
      </div>
    </div>
  );
}
