'use client';

import type { LobbySnapshot } from '@tabswitch/types';
import { Connect4Settings } from './connect4/Connect4Settings';
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
  if (gameType === 'plateau') return <PlateauSettings snapshot={snapshot} />;
  return null;
}
