'use client';

import type { LobbySnapshot } from '@tabswitch/types';
import type { GifBattleClientView } from '@tabswitch/gif-battle';
import { Card } from '@/components/ui/Card';
import { useCountdown } from './useCountdown';
import { useGifBattleEvents } from './useGifBattleEvents';
import { GifPicker } from './GifPicker';
import { SubmissionGrid } from './SubmissionGrid';
import { RoundResults } from './RoundResults';
import { GameEndScreen } from './GameEndScreen';

export function GifBattleGame({ snapshot }: { snapshot: LobbySnapshot }) {
  const view = snapshot.gameState as GifBattleClientView | null | undefined;
  const round = view?.currentRound;
  const secondsLeft = useCountdown(round?.deadlineAt, snapshot.serverTime);
  const { results, gameEnded, reactions } = useGifBattleEvents(round?.number);

  if (!view) {
    return <Card><p className="text-center text-sm">Chargement…</p></Card>;
  }

  switch (view.status) {
    case 'ROUND_INTRO':
      return (
        <Card>
          <div className="py-10 text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-fg-muted)]">
              Manche {round?.number} / {view.settings.rounds}
            </div>
            <p className="font-display mt-3 text-3xl font-bold">{round?.themeText}</p>
            <p className="mt-4 text-5xl font-extrabold tabular-nums">{secondsLeft}</p>
          </div>
        </Card>
      );
    case 'ROUND_PICKING':
      return <GifPicker view={view} secondsLeft={secondsLeft} />;
    case 'ROUND_PRE_REVEAL':
      return (
        <Card>
          <div className="py-10 text-center">
            <div className="text-xs uppercase tracking-[0.3em] text-[color:var(--color-fg-muted)]">
              Révélation imminente…
            </div>
            <p className="font-display mt-3 text-2xl font-bold">{round?.themeText}</p>
          </div>
        </Card>
      );
    case 'ROUND_REVEALING':
    case 'ROUND_VOTING':
      return <SubmissionGrid view={view} secondsLeft={secondsLeft} reactions={reactions} />;
    case 'ROUND_RESULTS':
      return results ? (
        <RoundResults results={results} />
      ) : (
        <Card><p className="text-center text-sm">Calcul des votes…</p></Card>
      );
    case 'GAME_END':
      return gameEnded ? (
        <GameEndScreen payload={gameEnded} isHost={snapshot.you.isHost} />
      ) : (
        <Card><p className="text-center text-sm">Fin de partie…</p></Card>
      );
    case 'WAITING':
      return <Card><p className="text-center text-sm">Préparation de la partie…</p></Card>;
    default:
      return <Card><p className="text-center text-sm">En attente…</p></Card>;
  }
}
