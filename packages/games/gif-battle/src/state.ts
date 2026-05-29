import type { ReactionEmoji, TrophyKey } from './constants.js';

export type PlayerId = string;
export type SubmissionId = string;
export type ThemeId = string;

export type GameMode = 'classic' | 'reverse' | 'speed' | 'boss';
export type GifRating = 'g' | 'pg' | 'pg13';
export type Locale = 'fr' | 'en';

/** Internal state machine status — game-specific, distinct from the lobby's RoomStatus. */
export type GifBattleStatus =
  | 'WAITING' // game not started yet
  | 'ROUND_INTRO'
  | 'ROUND_PICKING'
  | 'ROUND_PRE_REVEAL'
  | 'ROUND_REVEALING'
  | 'ROUND_VOTING'
  | 'ROUND_RESULTS'
  | 'GAME_END';

export interface GifBattleSettings {
  rounds: number;
  pickSeconds: number;
  voteSeconds: number;
  mode: GameMode;
  locale: Locale;
  gifRating: GifRating;
}

/** Snapshot of a player held by the game (mirrors lobby + tracks score/streak). */
export interface Player {
  id: PlayerId;
  nickname: string;
  isConnected: boolean;
  isSpectator: boolean;
  score: number;
  streak: number;
}

export interface Submission {
  id: SubmissionId;
  playerId: PlayerId;
  gifId: string;
  gifUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  submittedAt: number;
}

export type AnonymousSubmission = Omit<Submission, 'playerId' | 'submittedAt'>;

export interface Vote {
  voterId: PlayerId;
  submissionId: SubmissionId;
  votedAt: number;
}

export interface Round {
  number: number;
  themeId: ThemeId;
  themeText: string;
  startedAt: number;
  deadlineAt: number;
  submissions: Submission[];
  votes: Vote[];
  winnerSubmissionIds: SubmissionId[];
}

/** All the GIF-Battle-specific state held by `GifBattleRoom`. */
export interface GifBattleState {
  status: GifBattleStatus;
  settings: GifBattleSettings;
  players: Player[];
  currentRound?: Round;
  history: Array<{
    number: number;
    themeId: ThemeId;
    themeText: string;
    winnerSubmissionIds: SubmissionId[];
  }>;
}

export interface RoundResultBreakdown {
  basePts: number;
  winnerBonus: number;
  streakBonus: number;
  underdogBonus: number;
  shutoutBonus: number;
  zeroVotePity: number;
}

export interface ScoreDelta {
  playerId: PlayerId;
  delta: number;
  breakdown: RoundResultBreakdown;
  newScore: number;
  newStreak: number;
}

export interface RoundStartedPayload {
  number: number;
  themeId: ThemeId;
  themeText: string;
  startedAt: number;
  deadlineAt: number;
}

export interface RoundResultsPayload {
  roundNumber: number;
  submissions: Array<{
    id: SubmissionId;
    gifUrl: string;
    previewUrl: string;
    width: number;
    height: number;
    playerId: PlayerId;
    nickname: string;
    voteCount: number;
    voters: PlayerId[];
    isWinner: boolean;
  }>;
  winnerSubmissionIds: SubmissionId[];
  scoreDeltas: ScoreDelta[];
}

export interface ReactionBroadcast {
  fromPlayerId: PlayerId;
  submissionId: SubmissionId;
  emoji: ReactionEmoji;
  at: number;
}

export interface FinalScoreEntry {
  playerId: PlayerId;
  nickname: string;
  score: number;
  rank: number;
}

export interface GameEndedPayload {
  finalScores: FinalScoreEntry[];
  trophies: Array<{ playerId: PlayerId; key: TrophyKey; label: string }>;
  shareToken: string;
}

/** Per-recipient view of the game state. Hides info that shouldn't be visible. */
export interface GifBattleClientView {
  status: GifBattleStatus;
  settings: GifBattleSettings;
  players: Player[];
  history: GifBattleState['history'];
  currentRound?:
    | (Omit<Round, 'submissions' | 'votes'> & {
        submissions: AnonymousSubmission[];
        voteCount: number;
      });
  you: {
    submittedThisRound: boolean;
    votedSubmissionId?: SubmissionId;
    mySubmissionId?: SubmissionId;
  };
}
