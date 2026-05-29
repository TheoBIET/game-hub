'use client';

import { useState } from 'react';
import {
  GIF_BATTLE_EVENTS,
  REACTION_EMOJIS,
  type GifBattleClientView,
} from '@tabswitch/gif-battle';
import { gameAction, getSocket } from '@/lib/socket';
import type { ReactionFlash } from './useGifBattleEvents';

const EMOJI_GLYPH: Record<string, string> = {
  sparkles: '✨',
  laugh: '😂',
  skull: '💀',
  fire: '🔥',
  cry: '😭',
  clown: '🤡',
};

export function SubmissionGrid({
  view,
  secondsLeft,
  reactions,
}: {
  view: GifBattleClientView;
  secondsLeft: number;
  reactions: ReactionFlash[];
}) {
  const [pendingVote, setPendingVote] = useState(false);
  const round = view.currentRound;
  if (!round) return null;
  const voting = view.status === 'ROUND_VOTING';
  const myVote = view.you.votedSubmissionId;

  async function vote(submissionId: string) {
    if (!voting) return;
    if (submissionId === view.you.mySubmissionId) return;
    if (pendingVote) return;
    setPendingVote(true);
    try {
      const event = myVote === submissionId ? GIF_BATTLE_EVENTS.RoundUnvote : GIF_BATTLE_EVENTS.RoundVote;
      const ack = await gameAction(getSocket(), event, { submissionId });
      if (!ack.ok) alert(ack.message);
    } finally {
      setPendingVote(false);
    }
  }

  async function react(submissionId: string, emoji: string) {
    await gameAction(getSocket(), GIF_BATTLE_EVENTS.ReactionSend, { submissionId, emoji });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="text-center text-xs uppercase tracking-[0.3em] text-[color:var(--color-fg-muted)]">
        {voting ? `Vote · ${secondsLeft}s` : 'Révélation…'} · {round.themeText}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {round.submissions.map((sub, i) => {
          const isMine = sub.id === view.you.mySubmissionId;
          const isVoted = myVote === sub.id;
          const flashes = reactions.filter((r) => r.submissionId === sub.id);
          return (
            <div
              key={sub.id}
              className={`relative overflow-hidden rounded-xl border transition animate-rise ${
                isVoted ? 'border-emerald-400 ring-2 ring-emerald-400' : 'border-white/10'
              }`}
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <button
                type="button"
                onClick={() => vote(sub.id)}
                disabled={!voting || isMine || pendingVote}
                className="block w-full disabled:cursor-default"
                title={isMine ? 'Ton GIF' : voting ? (isVoted ? 'Retirer le vote' : 'Voter') : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sub.gifUrl || sub.previewUrl} alt="gif" className="h-48 w-full object-contain bg-black/40" />
              </button>
              {isMine && (
                <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] uppercase tracking-wider">
                  toi
                </span>
              )}
              {flashes.map((f) => (
                <span key={f.id} className="absolute right-2 top-2 animate-bounce text-2xl">
                  {EMOJI_GLYPH[f.emoji] ?? '✨'}
                </span>
              ))}
              <div className="flex justify-center gap-1 bg-black/30 py-1">
                {REACTION_EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => react(sub.id, emoji)}
                    className="rounded px-1 text-lg transition hover:scale-125"
                    aria-label={`réagir ${emoji}`}
                  >
                    {EMOJI_GLYPH[emoji]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
