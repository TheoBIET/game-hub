// packages/games/plateau/src/types.ts

export type CellType = 'start' | 'normal' | 'bonus' | 'malus' | 'safe' | 'event' | 'finish';
export type EventType = 'minigame' | 'vote' | 'swap';

export type PlateauPhase =
  | 'LOBBY'
  | 'ROLLING'
  | 'MOVING'
  | 'CASE_EFFECT'
  | 'MINIGAME_EVENT'
  | 'VOTE'
  | 'SWAP'
  | 'MINIGAME_END_OF_TURN'
  | 'NEXT_TURN'
  | 'GAME_OVER';

export interface BoardCell {
  id: string;
  index: number;
  position: { x: number; y: number };
  neighbors: string[];
  type: CellType;
  event?: EventType;
}

export interface PlateauPlayer {
  id: string;
  nickname: string;
  avatarSeed: string;
  cellId: string;
  protected: boolean;
  skipsNextTurn: boolean;
  arrivedAt: number | null;
}

export type VoteOption = 'reculer' | 'passer_tour' | 'echanger_dernier';

export type PendingEvent =
  | {
      type: 'minigame';
      gameType: string;
      miniState: unknown;
      winnerId: string | null;
    }
  | {
      type: 'vote';
      targetPlayerId: string;
      votes: Record<string, VoteOption>;
      deadlineMs: number;
      timeoutHandle?: ReturnType<typeof setTimeout>;
    }
  | {
      type: 'swap';
      initiatorId: string;
      targetId: string | null;
      deadlineMs: number;
      timeoutHandle?: ReturnType<typeof setTimeout>;
    };

export interface TurnState {
  number: number;
  playerOrder: string[];
  activeIndex: number;
  dice: Record<string, number>;
  movedPlayers: string[];
}

export interface PlateauState {
  board: BoardCell[];
  cellMap: Map<string, BoardCell>;
  players: PlateauPlayer[];
  phase: PlateauPhase;
  turn: TurnState;
  pendingEvent: PendingEvent | null;
  eventLog: string[];
}

export interface PlateauClientView {
  board: BoardCell[];
  players: PlateauPlayer[];
  phase: PlateauPhase;
  turn: {
    number: number;
    playerOrder: string[];
    activeIndex: number;
    dice: Record<string, number>;
    movedPlayers: string[];
  };
  pendingEvent: ClientPendingEvent | null;
  eventLog: string[];
  you: {
    playerId: string;
    isActivePlayer: boolean;
  };
}

export type ClientPendingEvent =
  | { type: 'minigame'; gameType: string; miniState: unknown; winnerId: string | null }
  | { type: 'vote'; targetPlayerId: string; votes: Record<string, VoteOption>; deadlineMs: number }
  | { type: 'swap'; initiatorId: string; targetId: string | null; deadlineMs: number };

export const PLATEAU_EVENTS = {
  Roll: 'plateau:roll',
  ChoosePath: 'plateau:choose-path',
  Vote: 'plateau:vote',
  SwapTarget: 'plateau:swap-target',
  SettingsUpdate: 'settings:update',
} as const;

export const PLATEAU_SERVER_EVENTS = {
  PhaseChanged: 'plateau:phase-changed',
  PlayerMoved: 'plateau:player-moved',
  DiceResult: 'plateau:dice-result',
  EventLog: 'plateau:event-log',
} as const;
