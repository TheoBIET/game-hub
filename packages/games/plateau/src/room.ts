// packages/games/plateau/src/room.ts
import { z } from 'zod';
import type { GameContext, GameHandlerResult, GameRoom } from '@tabswitch/types';
import { generateBoard } from './generator.js';
import {
  buildInitialState,
  applyRoll,
  applyMove,
  applyCaseEffect,
  applyVote,
  resolveVote,
  applySwap,
  advanceTurn,
  buildClientViewFor,
} from './fsm.js';
import type {
  PlateauState,
  PlateauClientView,
  PlateauPlayer,
  VoteOption,
} from './types.js';
import { PLATEAU_EVENTS } from './types.js';

const ROLL_TIMEOUT_MS = 5_000;
const VOTE_TIMEOUT_MS = 20_000;
const SWAP_TIMEOUT_MS = 15_000;
const INTER_PHASE_MS = 1_500;

const MINI_GAME_TYPES = ['tictactoe', 'connect4', 'rps'];

const ChoosePathSchema = z.object({ cellId: z.string().min(1) });
const VoteSchema = z.object({ option: z.enum(['reculer', 'passer_tour', 'echanger_dernier']) });
const SwapTargetSchema = z.object({ targetId: z.string().min(1) });

export class PlateauRoom implements GameRoom<PlateauClientView> {
  readonly gameType = 'plateau';
  readonly roomCode: string;

  private state!: PlateauState;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(private readonly ctx: GameContext) {
    this.roomCode = ctx.roomCode;
  }

  onJoin(_playerId: string): void {
    if (this.state) this.ctx.broadcastState();
  }

  onLeave(playerId: string, _reason: 'leave' | 'kick' | 'timeout'): void {
    if (!this.state || this.state.phase === 'GAME_OVER') return;
    const playerOrder = this.state.turn.playerOrder.filter((id) => id !== playerId);
    const players = this.state.players.filter((p) => p.id !== playerId);
    this.state = {
      ...this.state,
      players,
      turn: {
        ...this.state.turn,
        playerOrder,
        activeIndex: Math.min(this.state.turn.activeIndex, Math.max(0, playerOrder.length - 1)),
      },
    };
    if (players.length < 2) {
      this.state = { ...this.state, phase: 'GAME_OVER' };
      this.ctx.broadcastState();
      this.ctx.endGame();
      return;
    }
    this.ctx.broadcastState();
  }

  onStart(): void {
    const lobbyPlayers = this.ctx.listPlayers().filter((p) => !p.isSpectator);
    const board = generateBoard();
    const players: PlateauPlayer[] = lobbyPlayers.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarSeed: p.id,
      cellId: 'cell-0',
      protected: false,
      skipsNextTurn: false,
      arrivedAt: null,
    }));
    this.state = buildInitialState(board, players);
    this.ctx.broadcastState();
    this.scheduleRollTimeout();
  }

  onEnd(): void {
    this.clearTimers();
  }

  dispose(): void {
    this.clearTimers();
  }

  getStateFor(playerId: string): PlateauClientView {
    if (!this.state) {
      return {
        board: [],
        players: [],
        phase: 'LOBBY',
        turn: { number: 0, playerOrder: [], activeIndex: 0, dice: {}, movedPlayers: [] },
        pendingEvent: null,
        eventLog: [],
        you: { playerId, isActivePlayer: false },
      };
    }
    return buildClientViewFor(this.state, playerId);
  }

  handleEvent(playerId: string, event: string, payload: unknown): GameHandlerResult {
    switch (event) {
      case PLATEAU_EVENTS.Roll:
        return this.handleRoll(playerId);
      case PLATEAU_EVENTS.ChoosePath:
        return this.handleChoosePath(playerId, payload);
      case PLATEAU_EVENTS.Vote:
        return this.handleVote(playerId, payload);
      case PLATEAU_EVENTS.SwapTarget:
        return this.handleSwapTarget(playerId, payload);
      default:
        return { ok: false, code: 'UNKNOWN_EVENT', message: `Événement inconnu: ${event}` };
    }
  }

  private handleRoll(playerId: string): GameHandlerResult {
    if (this.state.phase !== 'ROLLING') {
      return { ok: false, code: 'WRONG_PHASE', message: 'Pas en phase de lancer.' };
    }
    if (this.state.turn.dice[playerId] !== undefined) {
      return { ok: false, code: 'ALREADY_ROLLED', message: 'Tu as déjà lancé.' };
    }
    const roll = Math.floor(Math.random() * 6) + 1;
    this.state = applyRoll(this.state, playerId, roll);
    this.ctx.broadcastState();

    if (this.state.phase === 'MOVING') {
      this.scheduleMove();
    }
    return { ok: true, data: { roll } };
  }

  private handleChoosePath(playerId: string, payload: unknown): GameHandlerResult {
    if (this.state.phase !== 'MOVING') {
      return { ok: false, code: 'WRONG_PHASE', message: 'Pas en phase de déplacement.' };
    }
    const parsed = ChoosePathSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'BAD_INPUT', message: 'cellId invalide.' };
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, code: 'NOT_FOUND', message: 'Joueur introuvable.' };
    const cell = this.state.cellMap.get(player.cellId);
    if (!cell?.neighbors.includes(parsed.data.cellId)) {
      return { ok: false, code: 'INVALID_PATH', message: 'Case non accessible.' };
    }
    const players = this.state.players.map((p) =>
      p.id === playerId ? { ...p, cellId: parsed.data.cellId } : p
    );
    this.state = { ...this.state, players };
    this.ctx.broadcastState();
    return { ok: true };
  }

  private handleVote(playerId: string, payload: unknown): GameHandlerResult {
    if (this.state.phase !== 'VOTE') {
      return { ok: false, code: 'WRONG_PHASE', message: 'Pas en phase de vote.' };
    }
    if (!this.state.pendingEvent || this.state.pendingEvent.type !== 'vote') {
      return { ok: false, code: 'NO_VOTE', message: 'Pas de vote en cours.' };
    }
    if (this.state.pendingEvent.targetPlayerId === playerId) {
      return { ok: false, code: 'CANT_VOTE_SELF', message: 'Tu ne peux pas voter contre toi.' };
    }
    const parsed = VoteSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'BAD_INPUT', message: 'Option invalide.' };
    this.state = applyVote(this.state, playerId, parsed.data.option as VoteOption);
    this.ctx.broadcastState();

    const targetId = (this.state.pendingEvent as { targetPlayerId: string }).targetPlayerId;
    const voters = this.state.players.filter((p) => p.id !== targetId);
    const allVoted = voters.every(
      (p) => (this.state.pendingEvent as { votes: Record<string, string> }).votes[p.id]
    );
    if (allVoted) this.resolveCurrentVote();
    return { ok: true };
  }

  private handleSwapTarget(playerId: string, payload: unknown): GameHandlerResult {
    if (this.state.phase !== 'SWAP') {
      return { ok: false, code: 'WRONG_PHASE', message: "Pas en phase d'échange." };
    }
    if (!this.state.pendingEvent || this.state.pendingEvent.type !== 'swap') {
      return { ok: false, code: 'NO_SWAP', message: "Pas d'échange en cours." };
    }
    if (this.state.pendingEvent.initiatorId !== playerId) {
      return { ok: false, code: 'NOT_INITIATOR', message: "Ce n'est pas toi qui échanges." };
    }
    const parsed = SwapTargetSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, code: 'BAD_INPUT', message: 'targetId invalide.' };
    const target = this.state.players.find((p) => p.id === parsed.data.targetId);
    if (!target) return { ok: false, code: 'NOT_FOUND', message: 'Joueur cible introuvable.' };
    this.state = {
      ...this.state,
      pendingEvent: { ...this.state.pendingEvent, targetId: parsed.data.targetId },
    };
    this.state = applySwap(this.state);
    this.ctx.broadcastState();
    this.startMinigameEndOfTurn();
    return { ok: true };
  }

  private scheduleRollTimeout(): void {
    const t = setTimeout(() => {
      if (this.state.phase !== 'ROLLING') return;
      for (const playerId of this.state.turn.playerOrder) {
        if (this.state.turn.dice[playerId] === undefined) {
          const roll = Math.floor(Math.random() * 6) + 1;
          this.state = applyRoll(this.state, playerId, roll);
        }
      }
      this.ctx.broadcastState();
      if (this.state.phase === 'MOVING') this.scheduleMove();
    }, ROLL_TIMEOUT_MS);
    this.timers.push(t);
  }

  private scheduleMove(): void {
    const playersToMove = [...this.state.turn.playerOrder];
    let delay = 0;
    for (const playerId of playersToMove) {
      const t = setTimeout(() => {
        if (this.state.phase !== 'MOVING') return;
        this.state = applyMove(this.state, playerId);
        this.ctx.broadcastState();
        if (this.state.phase === 'GAME_OVER') {
          this.endGame();
        }
      }, delay);
      this.timers.push(t);
      delay += INTER_PHASE_MS;
    }
    const t = setTimeout(() => {
      if (this.state.phase === 'GAME_OVER') return;
      this.resolveCaseEffects(this.state.turn.playerOrder);
    }, delay + INTER_PHASE_MS);
    this.timers.push(t);
  }

  private resolveCaseEffects(playerIds: string[]): void {
    for (const playerId of playerIds) {
      this.state = { ...this.state, phase: 'CASE_EFFECT' };
      this.state = applyCaseEffect(this.state, playerId);
      if (
        this.state.phase === 'VOTE' ||
        this.state.phase === 'SWAP' ||
        this.state.phase === 'MINIGAME_EVENT'
      ) {
        if (this.state.phase === 'VOTE') this.scheduleVoteTimeout();
        if (this.state.phase === 'SWAP') this.scheduleSwapTimeout();
        if (this.state.phase === 'MINIGAME_EVENT') {
          this.startMinigame('event', playerIds.slice(playerIds.indexOf(playerId) + 1));
        }
        this.ctx.broadcastState();
        return;
      }
    }
    this.ctx.broadcastState();
    this.startMinigameEndOfTurn();
  }

  private startMinigame(trigger: 'event' | 'end_of_turn', remainingPlayers?: string[]): void {
    const gameType = MINI_GAME_TYPES[Math.floor(Math.random() * MINI_GAME_TYPES.length)]!;
    this.state = {
      ...this.state,
      phase: trigger === 'event' ? 'MINIGAME_EVENT' : 'MINIGAME_END_OF_TURN',
      pendingEvent: {
        type: 'minigame',
        gameType,
        miniState: { remainingCaseEffectPlayers: remainingPlayers ?? [] },
        winnerId: null,
      },
    };
    this.ctx.broadcastState();
    const t = setTimeout(() => {
      if (
        this.state.phase !== 'MINIGAME_EVENT' &&
        this.state.phase !== 'MINIGAME_END_OF_TURN'
      ) return;
      this.resolveMinigame(null);
    }, 60_000);
    this.timers.push(t);
  }

  private startMinigameEndOfTurn(): void {
    this.startMinigame('end_of_turn');
  }

  resolveMinigame(winnerId: string | null): void {
    if (!this.state.pendingEvent || this.state.pendingEvent.type !== 'minigame') return;
    const miniState = this.state.pendingEvent.miniState as {
      remainingCaseEffectPlayers?: string[];
    };
    const remainingPlayers = miniState.remainingCaseEffectPlayers ?? [];

    if (winnerId) {
      const currentCell = this.state.cellMap.get(
        this.state.players.find((p) => p.id === winnerId)?.cellId ?? ''
      );
      if (currentCell) {
        const targetIndex = Math.min(currentCell.index + 2, this.state.board.length - 1);
        const newCellId = this.state.board[targetIndex]?.id;
        if (newCellId) {
          const players = this.state.players.map((p) =>
            p.id === winnerId ? { ...p, cellId: newCellId } : p
          );
          this.state = { ...this.state, players };
        }
      }
    }

    const prevPhase = this.state.phase;
    this.state = { ...this.state, pendingEvent: null };

    if (prevPhase === 'MINIGAME_EVENT' && remainingPlayers.length > 0) {
      this.resolveCaseEffects(remainingPlayers);
    } else {
      this.state = advanceTurn(this.state);
      this.ctx.broadcastState();
      this.scheduleRollTimeout();
    }
  }

  private resolveCurrentVote(): void {
    this.state = resolveVote(this.state);
    this.ctx.broadcastState();
    this.startMinigameEndOfTurn();
  }

  private scheduleVoteTimeout(): void {
    const t = setTimeout(() => {
      if (this.state.phase !== 'VOTE') return;
      this.resolveCurrentVote();
    }, VOTE_TIMEOUT_MS);
    this.timers.push(t);
  }

  private scheduleSwapTimeout(): void {
    const t = setTimeout(() => {
      if (this.state.phase !== 'SWAP') return;
      if (this.state.pendingEvent?.type === 'swap') {
        const initiatorId = this.state.pendingEvent.initiatorId;
        const others = this.state.players.filter((p) => p.id !== initiatorId);
        const target = others[Math.floor(Math.random() * others.length)];
        if (target) {
          this.state = {
            ...this.state,
            pendingEvent: { ...this.state.pendingEvent, targetId: target.id },
          };
          this.state = applySwap(this.state);
          this.ctx.broadcastState();
          this.startMinigameEndOfTurn();
        }
      }
    }, SWAP_TIMEOUT_MS);
    this.timers.push(t);
  }

  private endGame(): void {
    this.clearTimers();
    this.ctx.broadcastState();
    this.ctx.endGame();
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }
}
