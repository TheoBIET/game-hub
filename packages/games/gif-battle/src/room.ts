import { ulid } from 'ulid';
import { deriveOutcomes } from './outcomes.js';
import { loadThemePool } from './themes.js';
import type { SeedTheme } from './themes.js';
import type {
  GameContext,
  GameHandlerResult,
  GameRoom,
} from '@tabswitch/types';
import { DEFAULTS, GIF_HOST_ALLOWLIST } from './constants.js';
import {
  ReactionSchema,
  RoomSettingsPartialSchema,
  RoundSubmitSchema,
  RoundVoteSchema,
  GIF_BATTLE_EVENTS,
  GIF_BATTLE_SERVER_EVENTS,
} from './events.js';
import {
  allActiveSubmitted,
  allActiveVoted,
  buildClientViewFor,
  submissionCount,
  tallyAndTransitionToResults,
  transitionAfterResults,
  transitionToPicking,
  transitionToPreReveal,
  transitionToRevealing,
  transitionToRoundIntro,
  transitionToVoting,
  voteCount,
} from './fsm.js';
import type {
  GifBattleClientView,
  GifBattleSettings,
  GifBattleState,
} from './state.js';

const DEFAULT_SETTINGS: GifBattleSettings = {
  rounds: DEFAULTS.rounds,
  pickSeconds: DEFAULTS.pickSeconds,
  voteSeconds: DEFAULTS.voteSeconds,
  mode: 'classic',
  locale: 'fr',
  gifRating: 'pg',
};

export class GifBattleRoom implements GameRoom<GifBattleClientView> {
  readonly gameType = 'gif-battle';
  readonly roomCode: string;

  private state: GifBattleState;
  private participations = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private themePool: SeedTheme[] = [];

  constructor(private readonly ctx: GameContext) {
    this.roomCode = ctx.roomCode;
    this.state = {
      status: 'WAITING',
      settings: { ...DEFAULT_SETTINGS },
      players: [],
      history: [],
    };
    this.syncPlayers();
  }

  // ============ GameRoom contract ============

  onJoin(_playerId: string): void {
    this.syncPlayers();
    this.ctx.broadcastState();
  }

  onLeave(_playerId: string, _reason: 'leave' | 'kick' | 'timeout'): void {
    this.syncPlayers();
    if (this.state.status !== 'WAITING' && this.state.status !== 'GAME_END') {
      this.checkPhaseCompletion();
    }
    this.ctx.broadcastState();
  }

  async onStart(): Promise<void> {
    if (this.state.status !== 'WAITING') return;
    this.syncPlayers();
    this.themePool = await loadThemePool(this.state.settings.locale);
    this.startRound();
  }

  onEnd(): void {
    this.cancelTimer();
  }

  dispose(): void {
    this.cancelTimer();
  }

  getStateFor(playerId: string): GifBattleClientView {
    return buildClientViewFor(this.state, playerId);
  }

  async handleEvent(
    playerId: string,
    event: string,
    payload: unknown,
  ): Promise<GameHandlerResult> {
    switch (event) {
      case GIF_BATTLE_EVENTS.RoundSubmit:
        return this.handleSubmit(playerId, payload);
      case GIF_BATTLE_EVENTS.RoundVote:
        return this.handleVote(playerId, payload);
      case GIF_BATTLE_EVENTS.RoundUnvote:
        return this.handleUnvote(playerId);
      case GIF_BATTLE_EVENTS.ReactionSend:
        return this.handleReaction(playerId, payload);
      case GIF_BATTLE_EVENTS.SettingsUpdate:
        return this.handleSettingsUpdate(payload);
      default:
        return { ok: false, code: 'UNKNOWN_EVENT', message: `Unknown event: ${event}` };
    }
  }

  // ============ Handlers ============

  private handleSubmit(playerId: string, payload: unknown): GameHandlerResult {
    if (this.state.status !== 'ROUND_PICKING' || !this.state.currentRound) {
      return { ok: false, code: 'NOT_PICKING', message: 'Pas la phase de pick.' };
    }
    if (Date.now() > this.state.currentRound.deadlineAt + 200) {
      return { ok: false, code: 'TOO_LATE', message: 'Trop tard pour soumettre.' };
    }
    const parsed = RoundSubmitSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        code: 'BAD_INPUT',
        message: parsed.error.issues[0]?.message ?? 'Input invalide.',
      };
    }
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || player.isSpectator) {
      return { ok: false, code: 'NOT_PLAYER', message: "Tu n'es pas joueur." };
    }
    let urlOk = false;
    try {
      const u = new URL(parsed.data.gifUrl);
      urlOk = (GIF_HOST_ALLOWLIST as readonly string[]).includes(u.host);
    } catch {
      urlOk = false;
    }
    if (!urlOk) {
      return { ok: false, code: 'INVALID_GIF', message: 'Domaine GIF non autorisé.' };
    }
    const existing = this.state.currentRound.submissions.find((s) => s.playerId === playerId);
    let submissionId: string;
    if (existing) {
      existing.gifId = parsed.data.gifId;
      existing.gifUrl = parsed.data.gifUrl;
      existing.previewUrl = parsed.data.previewUrl;
      existing.width = parsed.data.width;
      existing.height = parsed.data.height;
      existing.submittedAt = Date.now();
      submissionId = existing.id;
    } else {
      submissionId = ulid();
      this.state.currentRound.submissions.push({
        id: submissionId,
        playerId,
        ...parsed.data,
        submittedAt: Date.now(),
      });
    }
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundSubmissionCount, submissionCount(this.state));
    this.ctx.broadcastState();
    if (allActiveSubmitted(this.state)) {
      this.cancelTimer();
      this.scheduleTimer(250, () => this.endPicking());
    }
    return { ok: true, data: { submissionId } };
  }

  private handleVote(playerId: string, payload: unknown): GameHandlerResult {
    if (this.state.status !== 'ROUND_VOTING' || !this.state.currentRound) {
      return { ok: false, code: 'NOT_VOTING', message: 'Pas la phase de vote.' };
    }
    const parsed = RoundVoteSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, code: 'BAD_INPUT', message: 'Input invalide.' };
    }
    const voter = this.state.players.find((p) => p.id === playerId);
    if (!voter || voter.isSpectator) {
      return { ok: false, code: 'NOT_PLAYER', message: 'Spectateurs ne votent pas.' };
    }
    const target = this.state.currentRound.submissions.find(
      (s) => s.id === parsed.data.submissionId,
    );
    if (!target) {
      return { ok: false, code: 'BAD_SUBMISSION', message: 'Soumission inconnue.' };
    }
    if (target.playerId === playerId) {
      return { ok: false, code: 'NO_SELF_VOTE', message: 'Pas de vote pour soi.' };
    }
    const idx = this.state.currentRound.votes.findIndex((v) => v.voterId === playerId);
    if (idx >= 0) {
      this.state.currentRound.votes[idx] = {
        voterId: playerId,
        submissionId: parsed.data.submissionId,
        votedAt: Date.now(),
      };
    } else {
      this.state.currentRound.votes.push({
        voterId: playerId,
        submissionId: parsed.data.submissionId,
        votedAt: Date.now(),
      });
    }
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundVoteCount, voteCount(this.state));
    if (allActiveVoted(this.state)) {
      this.cancelTimer();
      this.scheduleTimer(250, () => this.endVoting());
    }
    return { ok: true };
  }

  private handleUnvote(playerId: string): GameHandlerResult {
    if (this.state.status !== 'ROUND_VOTING' || !this.state.currentRound) {
      return { ok: false, code: 'NOT_VOTING', message: 'Pas la phase de vote.' };
    }
    const idx = this.state.currentRound.votes.findIndex((v) => v.voterId === playerId);
    if (idx >= 0) {
      this.state.currentRound.votes.splice(idx, 1);
      this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundVoteCount, voteCount(this.state));
    }
    return { ok: true };
  }

  private handleReaction(playerId: string, payload: unknown): GameHandlerResult {
    const parsed = ReactionSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'BAD_INPUT', message: 'Invalide.' };
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.ReactionBroadcast, {
      fromPlayerId: playerId,
      submissionId: parsed.data.submissionId,
      emoji: parsed.data.emoji,
      at: Date.now(),
    });
    return { ok: true };
  }

  private handleSettingsUpdate(payload: unknown): GameHandlerResult {
    if (this.state.status !== 'WAITING') {
      return { ok: false, code: 'GAME_RUNNING', message: 'Modifiable avant le start.' };
    }
    const parsed = RoomSettingsPartialSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'BAD_INPUT', message: 'Invalide.' };
    this.state.settings = { ...this.state.settings, ...parsed.data };
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.SettingsUpdated, this.state.settings);
    this.ctx.broadcastState();
    return { ok: true };
  }

  // ============ FSM driver ============

  private startRound(): void {
    transitionToRoundIntro(this.state, this.themePool);
    const r = this.state.currentRound!;
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundStarted, {
      number: r.number,
      themeId: r.themeId,
      themeText: r.themeText,
      startedAt: r.startedAt,
      deadlineAt: r.deadlineAt,
    });
    this.ctx.broadcastState();
    this.scheduleTimer(r.deadlineAt - Date.now(), () => this.beginPicking());
  }

  private beginPicking(): void {
    if (this.state.status !== 'ROUND_INTRO') return;
    transitionToPicking(this.state);
    this.ctx.broadcastState();
    this.scheduleTimer(
      this.state.currentRound!.deadlineAt - Date.now(),
      () => this.endPicking(),
    );
  }

  private endPicking(): void {
    if (this.state.status !== 'ROUND_PICKING' || !this.state.currentRound) return;
    for (const sub of this.state.currentRound.submissions) {
      this.participations.set(sub.playerId, (this.participations.get(sub.playerId) ?? 0) + 1);
    }
    if (this.state.currentRound.submissions.length === 0) {
      const out = transitionAfterResults(this.state, this.themePool);
      this.ctx.broadcastState();
      if (out.kind === 'GAME_END') {
        this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.GameEnded, out.payload);
        const outcomes = deriveOutcomes(this.state) ?? {};
        this.ctx.endGame(outcomes);
      } else {
        this.scheduleTimer(500, () => this.startRound());
      }
      return;
    }
    transitionToPreReveal(this.state);
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundPreReveal, undefined);
    this.ctx.broadcastState();
    this.scheduleTimer(
      this.state.currentRound.deadlineAt - Date.now(),
      () => this.beginRevealing(),
    );
  }

  private beginRevealing(): void {
    if (this.state.status !== 'ROUND_PRE_REVEAL' || !this.state.currentRound) return;
    transitionToRevealing(this.state);
    this.ctx.broadcastState();
    const shuffled = [...this.state.currentRound.submissions].sort(() => Math.random() - 0.5);
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundRevealing, {
      submissions: shuffled.map((s) => ({
        id: s.id,
        gifId: s.gifId,
        gifUrl: s.gifUrl,
        previewUrl: s.previewUrl,
        width: s.width,
        height: s.height,
      })),
    });
    this.scheduleTimer(
      this.state.currentRound.deadlineAt - Date.now(),
      () => this.beginVoting(),
    );
  }

  private beginVoting(): void {
    if (this.state.status !== 'ROUND_REVEALING' || !this.state.currentRound) return;
    transitionToVoting(this.state);
    this.ctx.broadcastState();
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundVotingStart, {
      deadlineAt: this.state.currentRound.deadlineAt,
    });
    this.scheduleTimer(
      this.state.currentRound.deadlineAt - Date.now(),
      () => this.endVoting(),
    );
  }

  private endVoting(): void {
    if (this.state.status !== 'ROUND_VOTING' || !this.state.currentRound) return;
    const result = tallyAndTransitionToResults(this.state, this.participations);
    if (!result) return;
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundResults, result.results);
    this.ctx.broadcastState();
    this.scheduleTimer(
      this.state.currentRound!.deadlineAt - Date.now(),
      () => this.advanceFromResults(),
    );
  }

  private advanceFromResults(): void {
    if (this.state.status !== 'ROUND_RESULTS') return;
    const out = transitionAfterResults(this.state, this.themePool);
    if (out.kind === 'GAME_END') {
      this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.GameEnded, out.payload);
      this.ctx.broadcastState();
      const outcomes = deriveOutcomes(this.state) ?? {};
      this.ctx.endGame(outcomes);
      return;
    }
    const r = this.state.currentRound!;
    this.ctx.broadcast(GIF_BATTLE_SERVER_EVENTS.RoundStarted, {
      number: r.number,
      themeId: r.themeId,
      themeText: r.themeText,
      startedAt: r.startedAt,
      deadlineAt: r.deadlineAt,
    });
    this.ctx.broadcastState();
    this.scheduleTimer(r.deadlineAt - Date.now(), () => this.beginPicking());
  }

  // ============ helpers ============

  private syncPlayers(): void {
    const lobby = this.ctx.listPlayers();
    for (const lp of lobby) {
      const existing = this.state.players.find((p) => p.id === lp.id);
      if (existing) {
        existing.nickname = lp.nickname;
        existing.isConnected = lp.isConnected;
        existing.isSpectator = lp.isSpectator;
      } else {
        this.state.players.push({
          id: lp.id,
          nickname: lp.nickname,
          isConnected: lp.isConnected,
          isSpectator: lp.isSpectator,
          score: 0,
          streak: 0,
        });
      }
    }
    this.state.players = this.state.players.filter((p) => lobby.some((lp) => lp.id === p.id));
  }

  private checkPhaseCompletion(): void {
    if (this.state.status === 'ROUND_PICKING' && allActiveSubmitted(this.state)) {
      this.cancelTimer();
      this.scheduleTimer(250, () => this.endPicking());
    } else if (this.state.status === 'ROUND_VOTING' && allActiveVoted(this.state)) {
      this.cancelTimer();
      this.scheduleTimer(250, () => this.endVoting());
    }
  }

  private scheduleTimer(ms: number, fn: () => void): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        fn();
      } catch (err) {
        console.error('[GifBattleRoom] timer error:', err);
      }
    }, Math.max(0, ms));
  }

  private cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
