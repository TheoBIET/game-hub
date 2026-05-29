'use client';

import type { LobbySnapshot } from '@tabswitch/types';
import { Connect4Settings } from './connect4/Connect4Settings';
import { GifBattleSettings } from './gif-battle/GifBattleSettings';
import { RpsSettings } from './rps/RpsSettings';
import { TicTacToeSettings } from './tictactoe/TicTacToeSettings';
import { PlateauSettings } from './plateau/PlateauSettings';

export function GameSettingsPanel({
  gameType,
  snapshot,
}: {
  gameType: string;
  snapshot: LobbySnapshot;
}) {
  if (gameType === 'tictactoe') return <TicTacToeSettings snapshot={snapshot} />;
  if (gameType === 'connect4') return <Connect4Settings snapshot={snapshot} />;
  if (gameType === 'rps') return <RpsSettings snapshot={snapshot} />;
<<<<<<< HEAD
  if (gameType === 'plateau') return <PlateauSettings snapshot={snapshot} />;
=======
  if (gameType === 'gif-battle') return <GifBattleSettings snapshot={snapshot} />;
>>>>>>> 86e7cf1 (feat(web): branche l'UI gif-battle, retire le placeholder)
  return null;
}
