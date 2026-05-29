'use client';

import { useEffect, useState } from 'react';
import {
  GIF_BATTLE_SERVER_EVENTS,
  type GameEndedPayload,
  type RoundResultsPayload,
} from '@tabswitch/gif-battle';
import { getSocket, onGameEvent } from '@/lib/socket';

export interface ReactionFlash {
  id: number;
  submissionId: string;
  emoji: string;
}

export interface GifBattleLiveEvents {
  results: RoundResultsPayload | null;
  gameEnded: GameEndedPayload | null;
  reactions: ReactionFlash[];
}

/**
 * Capte les payloads serveur plus riches que le snapshot anonyme :
 * - `round:results` (propriétaires, votes par carte, deltas)
 * - `game:ended` (trophées, scores finaux, shareToken)
 * - `reaction:broadcast` (flashs éphémères)
 */
export function useGifBattleEvents(roundNumber: number | undefined): GifBattleLiveEvents {
  const [results, setResults] = useState<RoundResultsPayload | null>(null);
  const [gameEnded, setGameEnded] = useState<GameEndedPayload | null>(null);
  const [reactions, setReactions] = useState<ReactionFlash[]>([]);

  // Reset des résultats quand une nouvelle manche commence.
  useEffect(() => {
    setResults(null);
  }, [roundNumber]);

  useEffect(() => {
    const socket = getSocket();
    let counter = 0;
    const offResults = onGameEvent<RoundResultsPayload>(
      socket,
      GIF_BATTLE_SERVER_EVENTS.RoundResults,
      (p) => setResults(p),
    );
    const offEnded = onGameEvent<GameEndedPayload>(
      socket,
      GIF_BATTLE_SERVER_EVENTS.GameEnded,
      (p) => setGameEnded(p),
    );
    const offReaction = onGameEvent<{ submissionId: string; emoji: string }>(
      socket,
      GIF_BATTLE_SERVER_EVENTS.ReactionBroadcast,
      (p) => {
        const id = counter++;
        setReactions((rs) => [...rs, { id, submissionId: p.submissionId, emoji: p.emoji }]);
        setTimeout(() => setReactions((rs) => rs.filter((r) => r.id !== id)), 1500);
      },
    );
    return () => {
      offResults();
      offEnded();
      offReaction();
    };
  }, []);

  return { results, gameEnded, reactions };
}
