import { BEST_OF_OPTIONS, type BestOf } from '@tabswitch/types';

/** Number of GameSession rows per profile history page. */
export const HISTORY_PAGE_SIZE = 20;

interface GameMeta {
  name: string;
  emoji: string;
  minPlayers: number;
  maxPlayers: number;
  bestOfOptions: readonly BestOf[];
}

/** Human-readable labels for game types. MUST match `apps/server/src/games/registry.ts`. */
export const GAME_LABELS: Record<string, GameMeta> = {
  'gif-battle': {
    name: 'GIF Battle',
    emoji: '🎬',
    minPlayers: 3,
    maxPlayers: 10,
    bestOfOptions: [],
  },
  tictactoe: {
    name: 'Tic-Tac-Toe',
    emoji: '⊕',
    minPlayers: 1,
    maxPlayers: 2,
    bestOfOptions: BEST_OF_OPTIONS,
  },
  connect4: {
    name: 'Connect 4',
    emoji: '🔴',
    minPlayers: 1,
    maxPlayers: 2,
    bestOfOptions: [1, 3],
  },
  rps: {
    name: 'Pierre-Feuille-Ciseaux',
    emoji: '✊',
    minPlayers: 1,
    maxPlayers: 2,
    bestOfOptions: BEST_OF_OPTIONS,
  },
  plateau: {
    name: 'Plateau Party',
    emoji: '🎲',
    minPlayers: 2,
    maxPlayers: 8,
    bestOfOptions: [],
  },
};

export function gameLabel(gameType: string): GameMeta {
  return (
    GAME_LABELS[gameType] ?? {
      name: gameType,
      emoji: '🎮',
      minPlayers: 2,
      maxPlayers: 8,
      bestOfOptions: [],
    }
  );
}
