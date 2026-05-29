import {
  DEFAULTS,
} from './constants.js';
import { computeRanks, tallyRound } from './scoring.js';
import { ALL_SEED_THEMES, pickRandomTheme } from './themes.js';
import type {
  AnonymousSubmission,
  FinalScoreEntry,
  GameEndedPayload,
  GifBattleClientView,
  GifBattleState,
  RoundResultsPayload,
} from './state.js';
import { ulid } from 'ulid';

export interface FsmError {
  code: string;
  message: string;
}

/** Initialize a fresh first round (idempotent if currentRound exists with same number). */
export function transitionToRoundIntro(
  state: GifBattleState,
  themePool: import('./themes.js').SeedTheme[],
): GifBattleState {
  const usedIds = new Set(state.history.map((h) => h.themeId));
  const localePool =
    themePool.length > 0
      ? themePool
      : ALL_SEED_THEMES.filter((t) => t.locale === state.settings.locale);
  const chosen = pickRandomTheme(localePool, usedIds);

  const number = (state.currentRound?.number ?? state.history.length) + 1;
  const now = Date.now();
  const introMs = DEFAULTS.introSeconds * 1000;
  state.status = 'ROUND_INTRO';
  state.currentRound = {
    number,
    themeId: chosen.id,
    themeText: chosen.text,
    startedAt: now,
    deadlineAt: now + introMs,
    submissions: [],
    votes: [],
    winnerSubmissionIds: [],
  };
  return state;
}

export function transitionToPicking(state: GifBattleState): GifBattleState {
  if (state.status !== 'ROUND_INTRO' || !state.currentRound) return state;
  const now = Date.now();
  state.currentRound.startedAt = now;
  state.currentRound.deadlineAt = now + state.settings.pickSeconds * 1000;
  state.status = 'ROUND_PICKING';
  return state;
}

export function transitionToPreReveal(state: GifBattleState): GifBattleState {
  if (state.status !== 'ROUND_PICKING' || !state.currentRound) return state;
  state.status = 'ROUND_PRE_REVEAL';
  state.currentRound.deadlineAt = Date.now() + DEFAULTS.preRevealSeconds * 1000;
  return state;
}

export function transitionToRevealing(state: GifBattleState): GifBattleState {
  if (state.status !== 'ROUND_PRE_REVEAL' || !state.currentRound) return state;
  state.status = 'ROUND_REVEALING';
  const staggerMs = state.currentRound.submissions.length * DEFAULTS.revealStaggerMsPerCard;
  const baseRevealMs = 4000;
  state.currentRound.deadlineAt = Date.now() + baseRevealMs + staggerMs;
  return state;
}

export function transitionToVoting(state: GifBattleState): GifBattleState {
  if (state.status !== 'ROUND_REVEALING' || !state.currentRound) return state;
  state.status = 'ROUND_VOTING';
  state.currentRound.deadlineAt = Date.now() + state.settings.voteSeconds * 1000;
  return state;
}

export function tallyAndTransitionToResults(
  state: GifBattleState,
  roundParticipations: Map<string, number>,
): { state: GifBattleState; results: RoundResultsPayload } | null {
  if (state.status !== 'ROUND_VOTING' || !state.currentRound) return null;
  const activePlayers = state.players.filter((p) => !p.isSpectator);
  const preRanks = computeRanks(activePlayers);
  const tally = tallyRound({
    round: state.currentRound,
    players: activePlayers,
    preRoundRanks: preRanks,
    roundParticipations,
  });
  state.currentRound.winnerSubmissionIds = tally.winnerSubmissionIds;

  for (const d of tally.scoreDeltas) {
    const p = state.players.find((pl) => pl.id === d.playerId);
    if (p) {
      p.score = d.newScore;
      p.streak = d.newStreak;
    }
  }

  state.status = 'ROUND_RESULTS';
  state.currentRound.deadlineAt = Date.now() + DEFAULTS.resultsSeconds * 1000;

  const voteCountsBySub = new Map<string, string[]>();
  for (const s of state.currentRound.submissions) voteCountsBySub.set(s.id, []);
  for (const v of state.currentRound.votes) {
    const arr = voteCountsBySub.get(v.submissionId);
    if (arr) arr.push(v.voterId);
  }
  const winnerSet = new Set(tally.winnerSubmissionIds);
  const results: RoundResultsPayload = {
    roundNumber: state.currentRound.number,
    submissions: state.currentRound.submissions.map((s) => {
      const player = state.players.find((p) => p.id === s.playerId);
      const voters = voteCountsBySub.get(s.id) ?? [];
      return {
        id: s.id,
        gifUrl: s.gifUrl,
        previewUrl: s.previewUrl,
        width: s.width,
        height: s.height,
        playerId: s.playerId,
        nickname: player?.nickname ?? 'Inconnu',
        voteCount: voters.length,
        voters,
        isWinner: winnerSet.has(s.id),
      };
    }),
    winnerSubmissionIds: tally.winnerSubmissionIds,
    scoreDeltas: tally.scoreDeltas,
  };

  return { state, results };
}

export function transitionAfterResults(
  state: GifBattleState,
  themePool: import('./themes.js').SeedTheme[],
):
  | { kind: 'NEXT_ROUND'; state: GifBattleState }
  | { kind: 'GAME_END'; state: GifBattleState; payload: GameEndedPayload } {
  if (!state.currentRound) {
    return { kind: 'NEXT_ROUND', state: transitionToRoundIntro(state, themePool) };
  }
  const finished = state.currentRound;
  state.history.push({
    number: finished.number,
    themeId: finished.themeId,
    themeText: finished.themeText,
    winnerSubmissionIds: finished.winnerSubmissionIds,
  });

  if (finished.number >= state.settings.rounds) {
    return { kind: 'GAME_END', state: transitionToGameEnd(state), payload: buildGameEnded(state) };
  }
  return { kind: 'NEXT_ROUND', state: transitionToRoundIntro(state, themePool) };
}

export function transitionToGameEnd(state: GifBattleState): GifBattleState {
  state.status = 'GAME_END';
  state.currentRound = undefined;
  return state;
}

export function buildGameEnded(state: GifBattleState): GameEndedPayload {
  const active = state.players.filter((p) => !p.isSpectator);
  const sorted = [...active].sort((a, b) => b.score - a.score);
  const finalScores: FinalScoreEntry[] = [];
  let rank = 0;
  let lastScore = Number.POSITIVE_INFINITY;
  sorted.forEach((p, i) => {
    if (p.score < lastScore) {
      rank = i + 1;
      lastScore = p.score;
    }
    finalScores.push({ playerId: p.id, nickname: p.nickname, score: p.score, rank });
  });

  const mvp = finalScores[0];
  const trophies: GameEndedPayload['trophies'] = [];
  if (mvp) trophies.push({ playerId: mvp.playerId, key: 'mvp', label: 'MVP' });
  if (finalScores.length > 1) {
    const bottom = finalScores[finalScores.length - 1]!;
    trophies.push({ playerId: bottom.playerId, key: 'bottom_tier', label: 'Bottom Tier' });
  }

  return { finalScores, trophies, shareToken: ulid() };
}

/** Per-recipient view of the game state. */
export function buildClientViewFor(
  state: GifBattleState,
  playerId: string,
): GifBattleClientView {
  let currentRound: GifBattleClientView['currentRound'];
  let submittedThisRound = false;
  let votedSubmissionId: string | undefined;
  let mySubmissionId: string | undefined;

  if (state.currentRound) {
    const showGifs =
      state.status === 'ROUND_REVEALING' ||
      state.status === 'ROUND_VOTING' ||
      state.status === 'ROUND_RESULTS';
    const anonSubs: AnonymousSubmission[] = state.currentRound.submissions.map((s) => ({
      id: s.id,
      gifId: s.gifId,
      gifUrl: showGifs ? s.gifUrl : '',
      previewUrl: showGifs ? s.previewUrl : '',
      width: s.width,
      height: s.height,
    }));

    const myVote = state.currentRound.votes.find((v) => v.voterId === playerId);
    votedSubmissionId = myVote?.submissionId;
    const mySub = state.currentRound.submissions.find((s) => s.playerId === playerId);
    submittedThisRound = mySub != null;
    mySubmissionId = mySub?.id;

    currentRound = {
      number: state.currentRound.number,
      themeId: state.currentRound.themeId,
      themeText: state.currentRound.themeText,
      startedAt: state.currentRound.startedAt,
      deadlineAt: state.currentRound.deadlineAt,
      winnerSubmissionIds: state.currentRound.winnerSubmissionIds,
      submissions: anonSubs,
      voteCount: state.currentRound.votes.length,
    };
  }

  return {
    status: state.status,
    settings: state.settings,
    players: state.players,
    history: state.history,
    currentRound,
    you: { submittedThisRound, votedSubmissionId, mySubmissionId },
  };
}

export function allActiveSubmitted(state: GifBattleState): boolean {
  if (!state.currentRound) return false;
  const active = state.players.filter((p) => !p.isSpectator && p.isConnected);
  if (active.length === 0) return false;
  const submittedIds = new Set(state.currentRound.submissions.map((s) => s.playerId));
  return active.every((p) => submittedIds.has(p.id));
}

export function allActiveVoted(state: GifBattleState): boolean {
  if (!state.currentRound) return false;
  const active = state.players.filter((p) => !p.isSpectator && p.isConnected);
  if (active.length === 0) return false;
  const votersIds = new Set(state.currentRound.votes.map((v) => v.voterId));
  return active.every((p) => votersIds.has(p.id));
}

export function submissionCount(state: GifBattleState): { submitted: number; total: number } {
  const total = state.players.filter((p) => !p.isSpectator && p.isConnected).length;
  const submitted = state.currentRound?.submissions.length ?? 0;
  return { submitted, total };
}

export function voteCount(state: GifBattleState): { voted: number; total: number } {
  const total = state.players.filter((p) => !p.isSpectator && p.isConnected).length;
  const voted = state.currentRound?.votes.length ?? 0;
  return { voted, total };
}
