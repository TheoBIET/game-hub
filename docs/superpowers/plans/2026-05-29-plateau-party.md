# Plateau Party — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un jeu de plateau type Mario Party (2–8 joueurs) qui orchestre les mini-jeux existants comme sous-parties imbriquées, avec un plateau généré aléatoirement à chaque partie.

**Architecture:** Nouveau package `packages/games/plateau` qui exporte un `GameRoom` (pattern identique à tictactoe/connect4). La FSM plateau tourne dans la même room Socket.IO que le lobby. Les mini-jeux sont invoqués en mode "inline" (pas de nouvelle room) via un mécanisme `pendingMinigame` embarqué dans le snapshot. Le client React vit dans `apps/web/components/games/plateau/`.

**Tech Stack:** TypeScript, Zod, Vitest, React 19, Tailwind v4, SVG pour le plateau, framer-motion pour les animations de pion.

---

## Fichiers créés / modifiés

### Nouveau package `packages/games/plateau/`
- `package.json` — déclaration du package workspace
- `tsconfig.json` — config TS (copie de tictactoe)
- `src/types.ts` — tous les types TS du jeu (BoardCell, PlateauState, PlateauClientView, events, etc.)
- `src/generator.ts` — génération aléatoire du plateau avec contraintes
- `src/generator.test.ts` — tests unitaires du générateur
- `src/fsm.ts` — logique FSM pure (transitions, effets de case, mini-jeu inline)
- `src/fsm.test.ts` — tests unitaires FSM
- `src/room.ts` — `PlateauRoom` qui implémente `GameRoom`
- `src/definition.ts` — `plateauDefinition: GameDefinition`
- `src/index.ts` — barrel export

### Modifications serveur
- `apps/server/package.json` — ajouter `"@tabswitch/plateau": "workspace:*"`
- `apps/server/src/games/registry.ts` — importer et enregistrer `plateauDefinition`

### Nouveau dossier client `apps/web/components/games/plateau/`
- `PlateauGame.tsx` — racine, route selon `snapshot.phase`
- `PlateauBoard.tsx` — rendu SVG du plateau (cases colorées, chemins, pions/avatars)
- `PlateauSidebar.tsx` — ordre de tour, avatars, log des 5 derniers événements
- `DiceRoller.tsx` — animation dé 1–6 + bouton "Lancer"
- `overlays/CaseEffectOverlay.tsx` — banner animé pour bonus/malus/safe
- `overlays/VoteOverlay.tsx` — grille de vote avec countdown
- `overlays/SwapOverlay.tsx` — sélection de cible pour échange
- `overlays/GameOverScreen.tsx` — podium final
- `overlays/MinigameOverlay.tsx` — wrapper fullscreen pour le mini-jeu imbriqué

### Modifications client
- `apps/web/components/games/GameRoomShell.tsx` — ajouter `'plateau'` au type `SupportedGame`, brancher `<PlateauGame>` dans `GameView`
- `apps/web/components/games/GameSettingsPanel.tsx` — ajouter `<PlateauSettings>` (composant inline minimal)
- `apps/web/lib/constants.ts` — ajouter `plateau` dans `GAME_LABELS`
- `apps/web/package.json` — ajouter `"@tabswitch/plateau": "workspace:*"`

---

## Task 1 : Types du jeu (`packages/games/plateau/src/types.ts`)

**Files:**
- Create: `packages/games/plateau/src/types.ts`

- [ ] **Step 1 : Créer le fichier de types**

```typescript
// packages/games/plateau/src/types.ts

export type CellType = 'start' | 'normal' | 'bonus' | 'malus' | 'safe' | 'event' | 'finish';
export type EventType = 'minigame' | 'vote' | 'swap';

export type PlateauPhase =
  | 'LOBBY'
  | 'ROLLING'
  | 'MOVING'
  | 'CASE_EFFECT'
  | 'MINIGAME_EVENT'       // event minigame (case event)
  | 'VOTE'                 // event vote (case event)
  | 'SWAP'                 // event swap (case event)
  | 'MINIGAME_END_OF_TURN' // mini-jeu fin de tour
  | 'NEXT_TURN'
  | 'GAME_OVER';

export interface BoardCell {
  id: string;
  index: number;           // 0 = start, N = finish
  position: { x: number; y: number }; // coordonnées SVG (0-800)
  neighbors: string[];     // ids des cases suivantes (1 ou 2 si fourche)
  type: CellType;
  event?: EventType;
}

export interface PlateauPlayer {
  id: string;
  nickname: string;
  avatarSeed: string;
  cellId: string;          // case courante
  protected: boolean;      // case safe active (absorbe 1 malus)
  skipsNextTurn: boolean;  // effet de vote : passe son prochain tour
  arrivedAt: number | null; // tour d'arrivée si GAME_OVER (pour classement)
}

export type VoteOption = 'reculer' | 'passer_tour' | 'echanger_dernier';

export type PendingEvent =
  | {
      type: 'minigame';
      gameType: string;
      miniState: unknown;   // état interne de la FSM du mini-jeu
      winnerId: string | null;
    }
  | {
      type: 'vote';
      targetPlayerId: string;
      votes: Record<string, VoteOption>; // voterId → option
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
  playerOrder: string[];         // ids dans l'ordre de jeu
  activeIndex: number;
  dice: Record<string, number>;  // playerId → résultat dé
  movedPlayers: string[];        // joueurs ayant déjà bougé ce tour
}

export interface PlateauState {
  board: BoardCell[];
  cellMap: Map<string, BoardCell>; // lookup rapide id → cell
  players: PlateauPlayer[];
  phase: PlateauPhase;
  turn: TurnState;
  pendingEvent: PendingEvent | null;
  eventLog: string[];              // 5 derniers messages
}

// ---- Vue client (pas de Map, serialisable JSON) ----

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

// ---- Constantes d'events Socket.IO ----

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
```

- [ ] **Step 2 : Vérifier — pas de compilation à ce stade, juste confirmer que le fichier est créé**

```bash
ls packages/games/plateau/src/
```

Expected: `types.ts`

---

## Task 2 : Générateur de plateau (`packages/games/plateau/src/generator.ts`)

**Files:**
- Create: `packages/games/plateau/src/generator.ts`
- Create: `packages/games/plateau/src/generator.test.ts`

- [ ] **Step 1 : Écrire les tests (TDD)**

```typescript
// packages/games/plateau/src/generator.test.ts
import { describe, it, expect } from 'vitest';
import { generateBoard } from './generator.js';

describe('generateBoard', () => {
  it('produit exactement 40 cases', () => {
    const board = generateBoard();
    expect(board).toHaveLength(40);
  });

  it('la case 0 est start et la case 39 est finish', () => {
    const board = generateBoard();
    expect(board[0]!.type).toBe('start');
    expect(board[39]!.type).toBe('finish');
  });

  it('pas 2 events consécutifs', () => {
    for (let i = 0; i < 20; i++) {
      const board = generateBoard();
      for (let j = 0; j < board.length - 1; j++) {
        if (board[j]!.type === 'event') {
          expect(board[j + 1]!.type).not.toBe('event');
        }
      }
    }
  });

  it('pas 2 malus consécutifs', () => {
    for (let i = 0; i < 20; i++) {
      const board = generateBoard();
      for (let j = 0; j < board.length - 1; j++) {
        if (board[j]!.type === 'malus') {
          expect(board[j + 1]!.type).not.toBe('malus');
        }
      }
    }
  });

  it('minimum 2 cases normal entre deux events', () => {
    for (let i = 0; i < 20; i++) {
      const board = generateBoard();
      let normalsSinceLastEvent = 999;
      for (const cell of board) {
        if (cell.type === 'event') {
          expect(normalsSinceLastEvent).toBeGreaterThanOrEqual(2);
          normalsSinceLastEvent = 0;
        } else if (cell.type === 'normal') {
          normalsSinceLastEvent++;
        }
        // bonus/malus/safe ne reset pas le compteur (seuls les normal comptent)
      }
    }
  });

  it('case avant finish est normal', () => {
    const board = generateBoard();
    expect(board[38]!.type).toBe('normal');
  });

  it('chaque case a au moins un voisin', () => {
    const board = generateBoard();
    // toutes sauf finish
    for (const cell of board.slice(0, 39)) {
      expect(cell.neighbors.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('les ids des voisins existent dans le board', () => {
    const board = generateBoard();
    const ids = new Set(board.map(c => c.id));
    for (const cell of board) {
      for (const nId of cell.neighbors) {
        expect(ids.has(nId)).toBe(true);
      }
    }
  });

  it('events ont un champ event défini', () => {
    const board = generateBoard();
    const events = board.filter(c => c.type === 'event');
    for (const cell of events) {
      expect(['minigame', 'vote', 'swap']).toContain(cell.event);
    }
  });

  it('distribution approximative (50 générations)', () => {
    const counts = { normal: 0, bonus: 0, malus: 0, safe: 0, event: 0 };
    const N = 50;
    for (let i = 0; i < N; i++) {
      const board = generateBoard();
      for (const cell of board.slice(1, 39)) { // ignorer start et finish
        if (cell.type in counts) counts[cell.type as keyof typeof counts]++;
      }
    }
    const total = N * 38;
    // normal > 40%
    expect(counts.normal / total).toBeGreaterThan(0.40);
    // events < 20%
    expect(counts.event / total).toBeLessThan(0.20);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour confirmer qu'ils échouent**

```bash
cd packages/games/plateau && pnpm test 2>&1 | head -20
```

Expected: erreur `Cannot find module './generator.js'`

- [ ] **Step 3 : Écrire le générateur**

```typescript
// packages/games/plateau/src/generator.ts
import type { BoardCell, CellType, EventType } from './types.js';

const TOTAL = 40;
const INNER_COUNT = 38; // cases 1..38 (index 1 to 38 inclus)

// Ratios appliqués aux 38 cases intermédiaires
const RATIOS: { type: CellType; count: number }[] = [
  { type: 'bonus',  count: 6  },
  { type: 'malus',  count: 6  },
  { type: 'safe',   count: 3  },
  { type: 'event',  count: 5  },
  { type: 'normal', count: 18 }, // complète jusqu'à 38
];

const EVENT_TYPES: EventType[] = ['minigame', 'vote', 'swap', 'minigame', 'vote'];

function uid(index: number): string {
  return `cell-${index}`;
}

// Fisher-Yates shuffle
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildTypeSequence(): CellType[] {
  const pool: CellType[] = [];
  for (const { type, count } of RATIOS) {
    for (let i = 0; i < count; i++) pool.push(type);
  }
  // Ajuster si pool < INNER_COUNT (arrondi)
  while (pool.length < INNER_COUNT) pool.push('normal');

  // Shuffle puis appliquer les contraintes
  let candidate = shuffle(pool);
  let attempts = 0;
  while (!satisfiesConstraints(candidate) && attempts < 200) {
    candidate = shuffle(pool);
    attempts++;
  }
  // Si toujours invalide après 200 tentatives, forcer la contrainte manuellement
  if (!satisfiesConstraints(candidate)) {
    candidate = forceConstraints(candidate);
  }
  return candidate;
}

function satisfiesConstraints(seq: CellType[]): boolean {
  let normalsSinceLastEvent = 999;
  for (let i = 0; i < seq.length; i++) {
    const type = seq[i]!;
    // Pas 2 malus consécutifs
    if (type === 'malus' && seq[i - 1] === 'malus') return false;
    // Pas 2 events consécutifs + minimum 2 normal entre events
    if (type === 'event') {
      if (normalsSinceLastEvent < 2) return false;
      normalsSinceLastEvent = 0;
    } else if (type === 'normal') {
      normalsSinceLastEvent++;
    }
  }
  // Dernière case (index 37 = avant finish) doit être normal
  if (seq[seq.length - 1] !== 'normal') return false;
  return true;
}

function forceConstraints(seq: CellType[]): CellType[] {
  const result = [...seq];
  // Forcer la dernière case à normal
  const lastNormalIdx = [...result].reverse().findIndex(t => t === 'normal');
  if (lastNormalIdx !== -1 && result[result.length - 1] !== 'normal') {
    const realIdx = result.length - 1 - lastNormalIdx;
    [result[result.length - 1], result[realIdx]] = [result[realIdx]!, result[result.length - 1]!];
  }
  // Séparer les events consécutifs
  for (let i = 0; i < result.length - 1; i++) {
    if (result[i] === 'event' && (result[i + 1] === 'event' || result[i + 1] === 'malus')) {
      // Trouver un normal ailleurs et swapper
      for (let j = i + 2; j < result.length; j++) {
        if (result[j] === 'normal') {
          [result[i + 1], result[j]] = [result[j]!, result[i + 1]!];
          break;
        }
      }
    }
  }
  return result;
}

// Génère des coordonnées SVG pour un chemin principal en serpentin
function buildPositions(count: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const cols = 8;
  const rows = Math.ceil(count / cols);
  const cellW = 80;
  const cellH = 100;
  let idx = 0;
  for (let row = 0; row < rows; row++) {
    const leftToRight = row % 2 === 0;
    for (let col = 0; col < cols && idx < count; col++, idx++) {
      const c = leftToRight ? col : cols - 1 - col;
      positions.push({
        x: 40 + c * cellW,
        y: 40 + row * cellH,
      });
    }
  }
  return positions;
}

export function generateBoard(): BoardCell[] {
  const typeSeq = buildTypeSequence();
  const allTypes: CellType[] = ['start', ...typeSeq, 'finish'];
  const positions = buildPositions(TOTAL);

  // Distribuer les EventTypes aux cases event
  const eventTypesShuffled = shuffle([...EVENT_TYPES]);
  let eventIdx = 0;

  const cells: BoardCell[] = allTypes.map((type, i) => {
    const cell: BoardCell = {
      id: uid(i),
      index: i,
      position: positions[i]!,
      neighbors: [],
      type,
    };
    if (type === 'event') {
      cell.event = eventTypesShuffled[eventIdx % eventTypesShuffled.length];
      eventIdx++;
    }
    return cell;
  });

  // Relier les cases séquentiellement (chemin linéaire de base)
  for (let i = 0; i < TOTAL - 1; i++) {
    cells[i]!.neighbors = [uid(i + 1)];
  }
  // La dernière (finish) n'a pas de voisins
  cells[TOTAL - 1]!.neighbors = [];

  // Ajouter 2 embranchements entre les index 10 et 30
  // Fourche A : index 12 → cases 13 et 15 (bypass 14)
  // Fourche B : index 22 → cases 23 et 25 (bypass 24)
  // Les deux chemins se rejoignent à la case suivante
  addFork(cells, 12, 15, 16);
  addFork(cells, 22, 25, 26);

  return cells;
}

function addFork(cells: BoardCell[], forkIdx: number, altIdx: number, rejoinIdx: number): void {
  const forkCell = cells[forkIdx];
  const altCell = cells[altIdx];
  const rejoinCell = cells[rejoinIdx];
  if (!forkCell || !altCell || !rejoinCell) return;

  // La fourche pointe vers le chemin normal ET vers le chemin alternatif
  forkCell.neighbors = [uid(forkIdx + 1), uid(altIdx)];
  // Le chemin alternatif rejoint le chemin principal
  altCell.neighbors = [uid(rejoinIdx)];
}
```

- [ ] **Step 4 : Lancer les tests**

```bash
cd packages/games/plateau && pnpm test
```

Expected: tous les tests `generateBoard` passent (certains peuvent nécessiter un ajustement du compteur de normal si la distribution aléatoire est serrée — relancer si flaky)

- [ ] **Step 5 : Commit**

```bash
git add packages/games/plateau/src/types.ts packages/games/plateau/src/generator.ts packages/games/plateau/src/generator.test.ts
git commit -m "feat(plateau): types + générateur de plateau avec contraintes"
```

---

## Task 3 : Package setup (`package.json`, `tsconfig.json`, `src/index.ts`)

**Files:**
- Create: `packages/games/plateau/package.json`
- Create: `packages/games/plateau/tsconfig.json`
- Create: `packages/games/plateau/src/index.ts`

- [ ] **Step 1 : Créer `package.json`**

```json
{
  "name": "@tabswitch/plateau",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "echo skip"
  },
  "dependencies": {
    "@tabswitch/types": "workspace:*",
    "zod": "^3.24.1",
    "ulid": "^2.3.0"
  },
  "devDependencies": {
    "@tabswitch/config": "workspace:*",
    "@types/node": "^22.10.5",
    "typescript": "^5.7.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2 : Créer `tsconfig.json`**

```json
{
  "extends": "@tabswitch/config/tsconfig/node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3 : Créer `src/index.ts`** (barrel — on le complétera au fil des tasks)

```typescript
// packages/games/plateau/src/index.ts
export * from './types.js';
export * from './generator.js';
```

- [ ] **Step 4 : Installer les dépendances**

```bash
cd /mnt/c/Users/faime/tabswitch && pnpm install
```

Expected: `Done` sans erreur

- [ ] **Step 5 : Vérifier que le package compile**

```bash
cd packages/games/plateau && pnpm typecheck
```

Expected: aucune erreur TS

- [ ] **Step 6 : Commit**

```bash
git add packages/games/plateau/package.json packages/games/plateau/tsconfig.json packages/games/plateau/src/index.ts
git commit -m "feat(plateau): setup package workspace"
```

---

## Task 4 : FSM pure (`packages/games/plateau/src/fsm.ts`)

**Files:**
- Create: `packages/games/plateau/src/fsm.ts`
- Create: `packages/games/plateau/src/fsm.test.ts`

La FSM est un ensemble de fonctions pures (pas de classe, pas de timers) qui prennent un `PlateauState` et retournent un nouveau `PlateauState`. Les timers sont gérés par `PlateauRoom`.

- [ ] **Step 1 : Écrire les tests**

```typescript
// packages/games/plateau/src/fsm.test.ts
import { describe, it, expect } from 'vitest';
import { generateBoard } from './generator.js';
import {
  buildInitialState,
  applyRoll,
  applyMove,
  applyCaseEffect,
  applyVote,
  applySwap,
  advanceTurn,
  buildClientViewFor,
  findCellById,
  movePawnSteps,
} from './fsm.js';

function makePlayers(ids: string[]) {
  return ids.map((id, i) => ({
    id,
    nickname: `Player${i}`,
    avatarSeed: id,
    cellId: 'cell-0',
    protected: false,
    skipsNextTurn: false,
    arrivedAt: null,
  }));
}

describe('buildInitialState', () => {
  it('crée un état ROLLING avec les joueurs donnés', () => {
    const board = generateBoard();
    const players = makePlayers(['p1', 'p2']);
    const state = buildInitialState(board, players);
    expect(state.phase).toBe('ROLLING');
    expect(state.players).toHaveLength(2);
    expect(state.turn.number).toBe(1);
    expect(state.players[0]!.cellId).toBe('cell-0');
  });
});

describe('applyRoll', () => {
  it('enregistre le résultat du dé pour le joueur', () => {
    const board = generateBoard();
    const state = buildInitialState(board, makePlayers(['p1', 'p2']));
    const newState = applyRoll(state, 'p1', 4);
    expect(newState.turn.dice['p1']).toBe(4);
  });

  it('passe en MOVING quand tous les joueurs ont lancé', () => {
    const board = generateBoard();
    let state = buildInitialState(board, makePlayers(['p1', 'p2']));
    state = applyRoll(state, 'p1', 3);
    state = applyRoll(state, 'p2', 5);
    expect(state.phase).toBe('MOVING');
  });

  it('reste en ROLLING si tous n'ont pas encore lancé', () => {
    const board = generateBoard();
    let state = buildInitialState(board, makePlayers(['p1', 'p2']));
    state = applyRoll(state, 'p1', 3);
    expect(state.phase).toBe('ROLLING');
  });
});

describe('movePawnSteps', () => {
  it('déplace un pion de N cases', () => {
    const board = generateBoard();
    const newCellId = movePawnSteps(board, 'cell-0', 3);
    expect(newCellId).toBe('cell-3');
  });

  it('s'arrête à finish si on dépasse', () => {
    const board = generateBoard();
    const lastId = `cell-39`;
    const result = movePawnSteps(board, 'cell-37', 5);
    expect(result).toBe(lastId);
  });
});

describe('applyMove', () => {
  it('déplace le premier joueur et enregistre movedPlayers', () => {
    const board = generateBoard();
    let state = buildInitialState(board, makePlayers(['p1', 'p2']));
    state = applyRoll(state, 'p1', 2);
    state = applyRoll(state, 'p2', 3);
    // phase = MOVING
    const newState = applyMove(state, 'p1');
    expect(newState.players.find(p => p.id === 'p1')!.cellId).toBe('cell-2');
    expect(newState.turn.movedPlayers).toContain('p1');
  });
});

describe('applyCaseEffect — bonus', () => {
  it('avance le joueur de 3 cases supplémentaires', () => {
    const board = generateBoard();
    // Forcer le joueur sur une case bonus
    const bonusCell = board.find(c => c.type === 'bonus');
    if (!bonusCell) return; // skip si pas de case bonus (très improbable)
    const players = makePlayers(['p1']);
    players[0]!.cellId = bonusCell.id;
    const state = buildInitialState(board, players);
    const newState = applyCaseEffect(state, 'p1');
    const player = newState.players.find(p => p.id === 'p1')!;
    const expectedIndex = Math.min(bonusCell.index + 3, 39);
    expect(findCellById(board, player.cellId)!.index).toBe(expectedIndex);
  });
});

describe('applyCaseEffect — malus avec protection', () => {
  it('absorbe le malus si le joueur est protected', () => {
    const board = generateBoard();
    const malusCell = board.find(c => c.type === 'malus');
    if (!malusCell) return;
    const players = makePlayers(['p1']);
    players[0]!.cellId = malusCell.id;
    players[0]!.protected = true;
    const state = buildInitialState(board, players);
    const newState = applyCaseEffect(state, 'p1');
    const player = newState.players.find(p => p.id === 'p1')!;
    // Ne recule pas
    expect(player.cellId).toBe(malusCell.id);
    // Flag consommé
    expect(player.protected).toBe(false);
  });
});

describe('applyVote', () => {
  it('enregistre le vote d'un joueur', () => {
    const board = generateBoard();
    const state = buildInitialState(board, makePlayers(['p1', 'p2', 'p3']));
    const stateWithVote = {
      ...state,
      phase: 'VOTE' as const,
      pendingEvent: {
        type: 'vote' as const,
        targetPlayerId: 'p1',
        votes: {},
        deadlineMs: Date.now() + 20000,
      },
    };
    const newState = applyVote(stateWithVote, 'p2', 'reculer');
    expect((newState.pendingEvent as { votes: Record<string, string> }).votes['p2']).toBe('reculer');
  });
});

describe('applySwap', () => {
  it('échange les positions de deux joueurs', () => {
    const board = generateBoard();
    const players = makePlayers(['p1', 'p2']);
    players[0]!.cellId = 'cell-5';
    players[1]!.cellId = 'cell-10';
    const state = buildInitialState(board, players);
    const stateWithSwap = {
      ...state,
      phase: 'SWAP' as const,
      pendingEvent: {
        type: 'swap' as const,
        initiatorId: 'p1',
        targetId: 'p2',
        deadlineMs: Date.now() + 15000,
      },
    };
    const newState = applySwap(stateWithSwap);
    const p1 = newState.players.find(p => p.id === 'p1')!;
    const p2 = newState.players.find(p => p.id === 'p2')!;
    expect(p1.cellId).toBe('cell-10');
    expect(p2.cellId).toBe('cell-5');
  });
});

describe('advanceTurn', () => {
  it('remet phase à ROLLING et vide le dé', () => {
    const board = generateBoard();
    const state = buildInitialState(board, makePlayers(['p1', 'p2']));
    const newState = advanceTurn(state);
    expect(newState.phase).toBe('ROLLING');
    expect(newState.turn.dice).toEqual({});
    expect(newState.turn.movedPlayers).toEqual([]);
    expect(newState.turn.number).toBe(2);
  });
});

describe('buildClientViewFor', () => {
  it('inclut isActivePlayer correctement', () => {
    const board = generateBoard();
    const state = buildInitialState(board, makePlayers(['p1', 'p2']));
    const view = buildClientViewFor(state, 'p1');
    expect(view.you.playerId).toBe('p1');
    // Le premier joueur dans l'ordre est actif en ROLLING
    expect(view.you.isActivePlayer).toBe(true);

    const view2 = buildClientViewFor(state, 'p2');
    expect(view2.you.isActivePlayer).toBe(false);
  });
});
```

- [ ] **Step 2 : Lancer les tests pour confirmer l'échec**

```bash
cd packages/games/plateau && pnpm test 2>&1 | head -20
```

Expected: `Cannot find module './fsm.js'`

- [ ] **Step 3 : Écrire `fsm.ts`**

```typescript
// packages/games/plateau/src/fsm.ts
import type {
  PlateauState,
  PlateauPlayer,
  PlateauPhase,
  BoardCell,
  PendingEvent,
  VoteOption,
  PlateauClientView,
  ClientPendingEvent,
} from './types.js';

export function buildInitialState(
  board: BoardCell[],
  players: PlateauPlayer[],
): PlateauState {
  const cellMap = new Map(board.map((c) => [c.id, c]));
  const startCell = board[0]!;
  const initialPlayers = players.map((p) => ({
    ...p,
    cellId: startCell.id,
    protected: false,
    skipsNextTurn: false,
    arrivedAt: null,
  }));

  return {
    board,
    cellMap,
    players: initialPlayers,
    phase: 'ROLLING',
    turn: {
      number: 1,
      playerOrder: players.map((p) => p.id),
      activeIndex: 0,
      dice: {},
      movedPlayers: [],
    },
    pendingEvent: null,
    eventLog: [],
  };
}

export function findCellById(board: BoardCell[], id: string): BoardCell | undefined {
  return board.find((c) => c.id === id);
}

// Déplace un pion de `steps` cases en suivant neighbors[0] (chemin principal)
export function movePawnSteps(board: BoardCell[], fromId: string, steps: number): string {
  const cellMap = new Map(board.map((c) => [c.id, c]));
  let current = fromId;
  for (let i = 0; i < steps; i++) {
    const cell = cellMap.get(current);
    if (!cell || cell.neighbors.length === 0) break;
    current = cell.neighbors[0]!;
  }
  return current;
}

// Déplace de `steps` cases en suivant le chemin principal, mais s'arrête à finish
function movePawn(state: PlateauState, playerId: string, steps: number): PlateauState {
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    const newCellId = movePawnSteps(state.board, p.cellId, steps);
    return { ...p, cellId: newCellId };
  });
  return { ...state, players };
}

export function applyRoll(state: PlateauState, playerId: string, roll: number): PlateauState {
  const dice = { ...state.turn.dice, [playerId]: roll };
  const allRolled = state.turn.playerOrder.every((id) => id in dice);
  return {
    ...state,
    turn: { ...state.turn, dice },
    phase: allRolled ? 'MOVING' : 'ROLLING',
  };
}

export function applyMove(state: PlateauState, playerId: string): PlateauState {
  const roll = state.turn.dice[playerId] ?? 0;
  let newState = movePawn(state, playerId, roll);
  const movedPlayers = [...state.turn.movedPlayers, playerId];
  newState = {
    ...newState,
    turn: { ...newState.turn, movedPlayers },
  };

  // Vérifier si ce joueur a atteint finish
  const player = newState.players.find((p) => p.id === playerId)!;
  const cell = newState.cellMap.get(player.cellId);
  if (cell?.type === 'finish') {
    const players = newState.players.map((p) =>
      p.id === playerId ? { ...p, arrivedAt: state.turn.number } : p
    );
    newState = { ...newState, players };
    // Vérifier GAME_OVER
    const allArrived = players.every((p) => p.arrivedAt !== null);
    if (allArrived) {
      return { ...newState, phase: 'GAME_OVER' };
    }
  }

  return newState;
}

export function applyCaseEffect(state: PlateauState, playerId: string): PlateauState {
  const player = state.players.find((p) => p.id === playerId)!;
  const cell = state.cellMap.get(player.cellId);
  if (!cell) return state;

  const log = [...state.eventLog];

  switch (cell.type) {
    case 'bonus': {
      const newState = movePawn(state, playerId, 3);
      log.push(`${player.nickname} avance de 3 cases bonus !`);
      return { ...newState, eventLog: log.slice(-5) };
    }
    case 'malus': {
      if (player.protected) {
        const players = state.players.map((p) =>
          p.id === playerId ? { ...p, protected: false } : p
        );
        log.push(`${player.nickname} est protégé — malus absorbé !`);
        return { ...state, players, eventLog: log.slice(-5) };
      }
      const newState = movePawn(state, playerId, -3);
      log.push(`${player.nickname} recule de 3 cases.`);
      return { ...newState, eventLog: log.slice(-5) };
    }
    case 'safe': {
      const players = state.players.map((p) =>
        p.id === playerId ? { ...p, protected: true } : p
      );
      log.push(`${player.nickname} est maintenant protégé !`);
      return { ...state, players, eventLog: log.slice(-5) };
    }
    case 'event': {
      if (cell.event === 'vote') {
        const pendingEvent: PendingEvent = {
          type: 'vote',
          targetPlayerId: playerId,
          votes: {},
          deadlineMs: Date.now() + 20000,
        };
        return { ...state, phase: 'VOTE', pendingEvent, eventLog: log.slice(-5) };
      }
      if (cell.event === 'swap') {
        const pendingEvent: PendingEvent = {
          type: 'swap',
          initiatorId: playerId,
          targetId: null,
          deadlineMs: Date.now() + 15000,
        };
        return { ...state, phase: 'SWAP', pendingEvent, eventLog: log.slice(-5) };
      }
      if (cell.event === 'minigame') {
        const pendingEvent: PendingEvent = {
          type: 'minigame',
          gameType: '',  // sera rempli par PlateauRoom
          miniState: null,
          winnerId: null,
        };
        return { ...state, phase: 'MINIGAME_EVENT', pendingEvent, eventLog: log.slice(-5) };
      }
      return state;
    }
    default:
      return state;
  }
}

// Recule de `steps` cases (minimum case 0 = start)
function movePawnBack(state: PlateauState, playerId: string, steps: number): PlateauState {
  const player = state.players.find((p) => p.id === playerId)!;
  const currentCell = state.cellMap.get(player.cellId);
  if (!currentCell) return state;
  const targetIndex = Math.max(0, currentCell.index - steps);
  const targetCell = state.board[targetIndex];
  if (!targetCell) return state;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, cellId: targetCell.id } : p
  );
  return { ...state, players };
}

export function applyVote(
  state: PlateauState,
  voterId: string,
  option: VoteOption,
): PlateauState {
  if (!state.pendingEvent || state.pendingEvent.type !== 'vote') return state;
  const votes = { ...state.pendingEvent.votes, [voterId]: option };
  const pendingEvent: PendingEvent = { ...state.pendingEvent, votes };
  return { ...state, pendingEvent };
}

export function resolveVote(state: PlateauState): PlateauState {
  if (!state.pendingEvent || state.pendingEvent.type !== 'vote') return state;
  const { targetPlayerId, votes } = state.pendingEvent;
  const target = state.players.find((p) => p.id === targetPlayerId)!;

  // Tally
  const tally: Record<VoteOption, number> = {
    reculer: 0,
    passer_tour: 0,
    echanger_dernier: 0,
  };
  for (const v of Object.values(votes)) tally[v]++;

  // Trouver l'option majoritaire (égalité → aléatoire)
  const options: VoteOption[] = ['reculer', 'passer_tour', 'echanger_dernier'];
  const maxVotes = Math.max(...options.map((o) => tally[o]));
  const winners = options.filter((o) => tally[o] === maxVotes);
  const chosen = winners[Math.floor(Math.random() * winners.length)]!;

  const log = [...state.eventLog, `Vote : ${chosen} pour ${target.nickname}`];
  let newState = { ...state, pendingEvent: null, eventLog: log.slice(-5) };

  if (chosen === 'reculer') {
    if (target.protected) {
      const players = newState.players.map((p) =>
        p.id === targetPlayerId ? { ...p, protected: false } : p
      );
      newState = { ...newState, players };
    } else {
      newState = movePawnBack(newState, targetPlayerId, 3);
    }
  } else if (chosen === 'passer_tour') {
    const players = newState.players.map((p) =>
      p.id === targetPlayerId ? { ...p, skipsNextTurn: true } : p
    );
    newState = { ...newState, players };
  } else if (chosen === 'echanger_dernier') {
    // Trouver le joueur le plus en retard
    const sorted = [...newState.players].sort(
      (a, b) => {
        const ca = newState.cellMap.get(a.cellId);
        const cb = newState.cellMap.get(b.cellId);
        return (ca?.index ?? 0) - (cb?.index ?? 0);
      }
    );
    const last = sorted.find((p) => p.id !== targetPlayerId);
    if (last) {
      const tCell = newState.cellMap.get(target.cellId)!.id;
      const lCell = newState.cellMap.get(last.cellId)!.id;
      const players = newState.players.map((p) => {
        if (p.id === targetPlayerId) return { ...p, cellId: lCell };
        if (p.id === last.id) return { ...p, cellId: tCell };
        return p;
      });
      newState = { ...newState, players };
    }
  }

  return newState;
}

export function applySwap(state: PlateauState): PlateauState {
  if (!state.pendingEvent || state.pendingEvent.type !== 'swap') return state;
  const { initiatorId, targetId } = state.pendingEvent;
  if (!targetId) return { ...state, pendingEvent: null };

  const initiator = state.players.find((p) => p.id === initiatorId)!;
  const target = state.players.find((p) => p.id === targetId)!;
  const iCell = initiator.cellId;
  const tCell = target.cellId;

  const players = state.players.map((p) => {
    if (p.id === initiatorId) return { ...p, cellId: tCell };
    if (p.id === targetId) return { ...p, cellId: iCell };
    return p;
  });
  const log = [...state.eventLog, `${initiator.nickname} échange avec ${target.nickname} !`];
  return { ...state, players, pendingEvent: null, eventLog: log.slice(-5) };
}

export function advanceTurn(state: PlateauState): PlateauState {
  return {
    ...state,
    phase: 'ROLLING',
    turn: {
      ...state.turn,
      number: state.turn.number + 1,
      dice: {},
      movedPlayers: [],
    },
    pendingEvent: null,
  };
}

export function buildClientViewFor(state: PlateauState, playerId: string): PlateauClientView {
  const activePlayerId = state.turn.playerOrder[state.turn.activeIndex] ?? '';
  const pendingEvent: ClientPendingEvent | null = state.pendingEvent
    ? (state.pendingEvent as ClientPendingEvent)
    : null;

  return {
    board: state.board,
    players: state.players,
    phase: state.phase,
    turn: {
      number: state.turn.number,
      playerOrder: state.turn.playerOrder,
      activeIndex: state.turn.activeIndex,
      dice: state.turn.dice,
      movedPlayers: state.turn.movedPlayers,
    },
    pendingEvent,
    eventLog: state.eventLog,
    you: {
      playerId,
      isActivePlayer: playerId === activePlayerId,
    },
  };
}
```

- [ ] **Step 4 : Lancer les tests**

```bash
cd packages/games/plateau && pnpm test
```

Expected: tous les tests `fsm.test.ts` et `generator.test.ts` passent

- [ ] **Step 5 : Commit**

```bash
git add packages/games/plateau/src/fsm.ts packages/games/plateau/src/fsm.test.ts
git commit -m "feat(plateau): FSM pure (transitions, effets de case, swap, vote)"
```

---

## Task 5 : `PlateauRoom` (`packages/games/plateau/src/room.ts`)

**Files:**
- Create: `packages/games/plateau/src/room.ts`
- Create: `packages/games/plateau/src/definition.ts`
- Modify: `packages/games/plateau/src/index.ts`

- [ ] **Step 1 : Écrire `room.ts`**

```typescript
// packages/games/plateau/src/room.ts
import { z } from 'zod';
import { ulid } from 'ulid';
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

// Mini-jeux disponibles pour le tirage aléatoire fin de tour / event minigame
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
    // Retirer le joueur de l'ordre de tour
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
    // Si plus assez de joueurs, fin de partie
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

  // ---- Handlers ----

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
    // Valider que la cellId est un voisin valide du joueur courant
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, code: 'NOT_FOUND', message: 'Joueur introuvable.' };
    const cell = this.state.cellMap.get(player.cellId);
    if (!cell?.neighbors.includes(parsed.data.cellId)) {
      return { ok: false, code: 'INVALID_PATH', message: 'Case non accessible.' };
    }
    // Appliquer le choix de chemin
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

    // Si tous les non-ciblés ont voté → résoudre
    const voters = this.state.players.filter(
      (p) => p.id !== this.state.pendingEvent!.type && p.id !== (this.state.pendingEvent as { targetPlayerId: string }).targetPlayerId
    );
    const allVoted = voters.every(
      (p) => (this.state.pendingEvent as { votes: Record<string, string> }).votes[p.id]
    );
    if (allVoted) this.resolveCurrentVote();
    return { ok: true };
  }

  private handleSwapTarget(playerId: string, payload: unknown): GameHandlerResult {
    if (this.state.phase !== 'SWAP') {
      return { ok: false, code: 'WRONG_PHASE', message: 'Pas en phase d'échange.' };
    }
    if (!this.state.pendingEvent || this.state.pendingEvent.type !== 'swap') {
      return { ok: false, code: 'NO_SWAP', message: 'Pas d'échange en cours.' };
    }
    if (this.state.pendingEvent.initiatorId !== playerId) {
      return { ok: false, code: 'NOT_INITIATOR', message: 'Ce n'est pas toi qui échanges.' };
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
    this.continueAfterEvent();
    return { ok: true };
  }

  // ---- Orchestration ----

  private scheduleRollTimeout(): void {
    const t = setTimeout(() => {
      if (this.state.phase !== 'ROLLING') return;
      // Auto-roll pour tous les joueurs qui n'ont pas encore lancé
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
    // Déplacer tous les joueurs séquentiellement avec un délai visuel
    const playersToMove = [...this.state.turn.playerOrder];
    let delay = 0;
    for (const playerId of playersToMove) {
      const t = setTimeout(() => {
        if (this.state.phase !== 'MOVING') return;
        this.state = applyMove(this.state, playerId);
        this.ctx.broadcastState();
        if (this.state.phase === 'GAME_OVER') {
          this.endGame();
          return;
        }
      }, delay);
      this.timers.push(t);
      delay += INTER_PHASE_MS;
    }
    // Après tous les déplacements : résoudre les effets de case puis mini-jeu fin de tour
    const t = setTimeout(() => {
      if (this.state.phase === 'GAME_OVER') return;
      this.resolveCaseEffects(this.state.turn.playerOrder);
    }, delay + INTER_PHASE_MS);
    this.timers.push(t);
  }

  private resolveCaseEffects(playerIds: string[]): void {
    // Résoudre l'effet de case de chaque joueur séquentiellement
    for (const playerId of playerIds) {
      this.state = { ...this.state, phase: 'CASE_EFFECT' };
      this.state = applyCaseEffect(this.state, playerId);
      if (this.state.phase === 'VOTE' || this.state.phase === 'SWAP' || this.state.phase === 'MINIGAME_EVENT') {
        // Un événement est en cours — attendre sa résolution
        if (this.state.phase === 'VOTE') this.scheduleVoteTimeout();
        if (this.state.phase === 'SWAP') this.scheduleSwapTimeout();
        if (this.state.phase === 'MINIGAME_EVENT') this.startMinigame('event', playerIds.slice(playerIds.indexOf(playerId) + 1));
        this.ctx.broadcastState();
        return; // la suite sera reprise après résolution
      }
    }
    this.ctx.broadcastState();
    // Tous les effets résolus → mini-jeu fin de tour
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
    // Note: le résultat du mini-jeu est reçu via handleEvent('plateau:minigame-result')
    // Pour l'instant on auto-résout après 60s si pas de résultat
    const t = setTimeout(() => {
      if (this.state.phase !== 'MINIGAME_EVENT' && this.state.phase !== 'MINIGAME_END_OF_TURN') return;
      this.resolveMinigame(null);
    }, 60_000);
    this.timers.push(t);
  }

  private startMinigameEndOfTurn(): void {
    this.startMinigame('end_of_turn');
  }

  resolveMinigame(winnerId: string | null): void {
    if (!this.state.pendingEvent || this.state.pendingEvent.type !== 'minigame') return;
    const { miniState } = this.state.pendingEvent as { miniState: { remainingCaseEffectPlayers?: string[] }; type: 'minigame'; gameType: string; winnerId: string | null };
    const remainingPlayers: string[] = (miniState as { remainingCaseEffectPlayers?: string[] }).remainingCaseEffectPlayers ?? [];

    if (winnerId) {
      this.state = {
        ...this.state,
        pendingEvent: { ...this.state.pendingEvent, winnerId },
      };
      // Bonus +2 cases pour le gagnant
      const winnerCell = this.state.players.find((p) => p.id === winnerId);
      if (winnerCell) {
        const newCellId = this.advancePawn(this.state, winnerId, 2);
        const players = this.state.players.map((p) =>
          p.id === winnerId ? { ...p, cellId: newCellId } : p
        );
        this.state = { ...this.state, players };
      }
    }

    const prevPhase = this.state.phase;
    this.state = { ...this.state, pendingEvent: null };

    if (prevPhase === 'MINIGAME_EVENT' && remainingPlayers.length > 0) {
      // Continuer les effets de case pour les joueurs restants
      this.resolveCaseEffects(remainingPlayers);
    } else {
      // Fin de tour
      this.state = advanceTurn(this.state);
      this.ctx.broadcastState();
      this.scheduleRollTimeout();
    }
  }

  private continueAfterEvent(): void {
    // Appelé après résolution d'un vote ou swap
    this.startMinigameEndOfTurn();
  }

  private resolveCurrentVote(): void {
    this.state = resolveVote(this.state);
    this.ctx.broadcastState();
    this.continueAfterEvent();
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
      // Choisir une cible aléatoire
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
          this.continueAfterEvent();
        }
      }
    }, SWAP_TIMEOUT_MS);
    this.timers.push(t);
  }

  private advancePawn(state: PlateauState, playerId: string, steps: number): string {
    const player = state.players.find((p) => p.id === playerId)!;
    const currentCell = state.cellMap.get(player.cellId);
    if (!currentCell) return player.cellId;
    const targetIndex = Math.min(currentCell.index + steps, state.board.length - 1);
    return state.board[targetIndex]?.id ?? player.cellId;
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
```

- [ ] **Step 2 : Écrire `definition.ts`**

```typescript
// packages/games/plateau/src/definition.ts
import type { GameDefinition } from '@tabswitch/types';
import { PlateauRoom } from './room.js';
import type { PlateauClientView } from './types.js';

export const plateauDefinition: GameDefinition<PlateauClientView> = {
  gameType: 'plateau',
  name: 'Plateau Party',
  tagline: 'Lancez les dés, traversez le plateau, remportez les défis !',
  minPlayers: 2,
  maxPlayers: 8,
  spectatorsAllowed: true,
  create: (ctx) => new PlateauRoom(ctx),
};

export default plateauDefinition;
```

- [ ] **Step 3 : Mettre à jour `src/index.ts`**

```typescript
// packages/games/plateau/src/index.ts
export * from './types.js';
export * from './generator.js';
export * from './fsm.js';
export * from './room.js';
export { plateauDefinition, default } from './definition.js';
```

- [ ] **Step 4 : Vérifier la compilation**

```bash
cd packages/games/plateau && pnpm typecheck
```

Expected: aucune erreur TS

- [ ] **Step 5 : Commit**

```bash
git add packages/games/plateau/src/room.ts packages/games/plateau/src/definition.ts packages/games/plateau/src/index.ts
git commit -m "feat(plateau): PlateauRoom FSM + definition"
```

---

## Task 6 : Enregistrement serveur

**Files:**
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/games/registry.ts`

- [ ] **Step 1 : Ajouter la dépendance dans `apps/server/package.json`**

Dans la section `"dependencies"`, ajouter après `"@tabswitch/gif-battle": "workspace:*"` :

```json
"@tabswitch/plateau": "workspace:*",
```

- [ ] **Step 2 : Enregistrer dans la registry**

Dans `apps/server/src/games/registry.ts`, ajouter :

```typescript
import { plateauDefinition } from '@tabswitch/plateau';
```

Et dans le tableau `ALL_GAMES` :

```typescript
const ALL_GAMES: readonly GameDefinition[] = [
  gifBattleDefinition,
  ticTacToeDefinition,
  connect4Definition,
  rpsDefinition,
  plateauDefinition,
];
```

- [ ] **Step 3 : Installer et vérifier**

```bash
cd /mnt/c/Users/faime/tabswitch && pnpm install && cd apps/server && pnpm typecheck
```

Expected: aucune erreur TS

- [ ] **Step 4 : Commit**

```bash
git add apps/server/package.json apps/server/src/games/registry.ts
git commit -m "feat(plateau): enregistrer plateau dans la registry serveur"
```

---

## Task 7 : Constantes client et `GameRoomShell`

**Files:**
- Modify: `apps/web/lib/constants.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/web/components/games/GameRoomShell.tsx`
- Modify: `apps/web/components/games/GameSettingsPanel.tsx`

- [ ] **Step 1 : Ajouter `plateau` dans `GAME_LABELS` (`apps/web/lib/constants.ts`)**

Dans l'objet `GAME_LABELS`, ajouter :

```typescript
plateau: {
  name: 'Plateau Party',
  emoji: '🎲',
  minPlayers: 2,
  maxPlayers: 8,
  bestOfOptions: [],
},
```

- [ ] **Step 2 : Ajouter la dépendance web (`apps/web/package.json`)**

Dans `"dependencies"`, ajouter après `"@tabswitch/gif-battle": "workspace:*"` :

```json
"@tabswitch/plateau": "workspace:*",
```

- [ ] **Step 3 : Brancher `PlateauGame` dans `GameRoomShell.tsx`**

Changer le type `SupportedGame` :

```typescript
type SupportedGame = 'gif-battle' | 'tictactoe' | 'connect4' | 'rps' | 'plateau';
```

Ajouter l'import en haut du fichier :

```typescript
import { PlateauGame } from '@/components/games/plateau/PlateauGame';
```

Dans la fonction `GameView`, ajouter avant le `return <PlaceholderGame...>` :

```typescript
if (gameType === 'plateau') return <PlateauGame snapshot={snapshot} />;
```

- [ ] **Step 4 : Brancher `PlateauSettings` dans `GameSettingsPanel.tsx`**

```typescript
import { PlateauSettings } from './plateau/PlateauSettings';
// ...
if (gameType === 'plateau') return <PlateauSettings snapshot={snapshot} />;
```

- [ ] **Step 5 : Installer**

```bash
cd /mnt/c/Users/faime/tabswitch && pnpm install
```

- [ ] **Step 6 : Commit**

```bash
git add apps/web/lib/constants.ts apps/web/package.json apps/web/components/games/GameRoomShell.tsx apps/web/components/games/GameSettingsPanel.tsx
git commit -m "feat(plateau): brancher plateau dans GameRoomShell et constantes"
```

---

## Task 8 : Composants React — Settings et structure de base

**Files:**
- Create: `apps/web/components/games/plateau/PlateauSettings.tsx`
- Create: `apps/web/components/games/plateau/PlateauGame.tsx`

- [ ] **Step 1 : Créer `PlateauSettings.tsx`**

```typescript
// apps/web/components/games/plateau/PlateauSettings.tsx
'use client';

import type { LobbySnapshot } from '@tabswitch/types';

export function PlateauSettings({ snapshot }: { snapshot: LobbySnapshot }) {
  // Pas de settings configurables pour l'instant (plateau généré auto, 2-8 joueurs)
  const playerCount = snapshot.room.players.filter((p) => !p.isSpectator).length;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-[color:var(--color-fg-muted)]">
      <p>
        🎲 Le plateau sera généré aléatoirement à chaque partie.{' '}
        <strong className="text-white">{playerCount}/8 joueurs</strong> connectés.
      </p>
    </div>
  );
}
```

- [ ] **Step 2 : Créer `PlateauGame.tsx`** (squelette — on le remplira dans les prochaines tasks)

```typescript
// apps/web/components/games/plateau/PlateauGame.tsx
'use client';

import type { LobbySnapshot } from '@tabswitch/types';
import type { PlateauClientView } from '@tabswitch/plateau';

export function PlateauGame({ snapshot }: { snapshot: LobbySnapshot }) {
  const view = snapshot.gameState as PlateauClientView | null | undefined;

  if (!view) {
    return <div className="rounded-2xl border border-white/10 p-6 text-center">Chargement…</div>;
  }

  if (view.phase === 'GAME_OVER') {
    return <GameOverScreen view={view} />;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex-1">
        <PlateauBoard view={view} />
      </div>
      <div className="w-full lg:w-64">
        <PlateauSidebar view={view} snapshot={snapshot} />
      </div>
    </div>
  );
}

function PlateauBoard({ view }: { view: PlateauClientView }) {
  // Placeholder SVG — sera remplacé dans Task 9
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <svg viewBox="0 0 680 500" className="w-full">
        {view.board.map((cell) => (
          <circle
            key={cell.id}
            cx={cell.position.x}
            cy={cell.position.y}
            r={14}
            fill={CELL_COLOR[cell.type]}
            stroke="rgba(255,255,255,0.2)"
            strokeWidth={1}
          />
        ))}
        {/* Pions */}
        {view.players.map((player, i) => {
          const cell = view.board.find((c) => c.id === player.cellId);
          if (!cell) return null;
          return (
            <circle
              key={player.id}
              cx={cell.position.x + i * 6 - 6}
              cy={cell.position.y}
              r={8}
              fill="white"
              opacity={0.9}
            />
          );
        })}
      </svg>
    </div>
  );
}

const CELL_COLOR: Record<string, string> = {
  start: '#22c55e',
  normal: '#3f3f46',
  bonus: '#16a34a',
  malus: '#dc2626',
  safe: '#2563eb',
  event: '#7c3aed',
  finish: '#eab308',
};

function PlateauSidebar({
  view,
  snapshot,
}: {
  view: PlateauClientView;
  snapshot: LobbySnapshot;
}) {
  const activeId = view.turn.playerOrder[view.turn.activeIndex];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[color:var(--color-fg-muted)]">
        Tour {view.turn.number} · {view.phase}
      </h3>
      <ul className="flex flex-col gap-2">
        {view.players.map((player) => {
          const cell = view.board.find((c) => c.id === player.cellId);
          const isActive = player.id === activeId;
          return (
            <li
              key={player.id}
              className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm ${isActive ? 'bg-white/10' : ''}`}
            >
              <span className="font-medium">{player.nickname}</span>
              <span className="ml-auto text-xs text-[color:var(--color-fg-muted)]">
                case {cell?.index ?? '?'}
              </span>
              {view.turn.dice[player.id] !== undefined && (
                <span className="rounded border border-white/20 px-1 text-xs">
                  🎲{view.turn.dice[player.id]}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {/* Log */}
      <div className="mt-2 flex flex-col gap-1">
        {view.eventLog.map((msg, i) => (
          <p key={i} className="text-[11px] text-[color:var(--color-fg-muted)]">
            {msg}
          </p>
        ))}
      </div>
    </div>
  );
}

function GameOverScreen({ view }: { view: PlateauClientView }) {
  const sorted = [...view.players].sort((a, b) => {
    if (a.arrivedAt !== null && b.arrivedAt !== null) return a.arrivedAt - b.arrivedAt;
    if (a.arrivedAt !== null) return -1;
    if (b.arrivedAt !== null) return 1;
    const ca = view.board.find((c) => c.id === a.cellId);
    const cb = view.board.find((c) => c.id === b.cellId);
    return (cb?.index ?? 0) - (ca?.index ?? 0);
  });

  return (
    <div className="flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
      <h2 className="font-display text-3xl font-bold">Partie terminée !</h2>
      <ol className="flex flex-col gap-3">
        {sorted.map((player, i) => (
          <li key={player.id} className="flex items-center gap-3 text-lg">
            <span className="text-2xl">{['🥇', '🥈', '🥉'][i] ?? `${i + 1}.`}</span>
            <span className="font-semibold">{player.nickname}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 3 : Vérifier la compilation**

```bash
cd apps/web && pnpm typecheck
```

Expected: aucune erreur TS

- [ ] **Step 4 : Commit**

```bash
git add apps/web/components/games/plateau/
git commit -m "feat(plateau): composants React de base (PlateauGame, PlateauSettings)"
```

---

## Task 9 : Overlay dé + vote + swap + mini-jeu

**Files:**
- Create: `apps/web/components/games/plateau/DiceRoller.tsx`
- Create: `apps/web/components/games/plateau/overlays/VoteOverlay.tsx`
- Create: `apps/web/components/games/plateau/overlays/SwapOverlay.tsx`
- Create: `apps/web/components/games/plateau/overlays/MinigameOverlay.tsx`
- Modify: `apps/web/components/games/plateau/PlateauGame.tsx`

- [ ] **Step 1 : Créer `DiceRoller.tsx`**

```typescript
// apps/web/components/games/plateau/DiceRoller.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { gameAction, getSocket } from '@/lib/socket';
import { PLATEAU_EVENTS } from '@tabswitch/plateau';

const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function DiceRoller({
  canRoll,
  result,
}: {
  canRoll: boolean;
  result: number | undefined;
}) {
  const [rolling, setRolling] = useState(false);

  async function roll() {
    if (!canRoll || rolling) return;
    setRolling(true);
    const ack = await gameAction(getSocket(), PLATEAU_EVENTS.Roll, {});
    setRolling(false);
    if (!ack.ok) alert(ack.message);
  }

  return (
    <div className="flex items-center gap-3">
      {result !== undefined ? (
        <span className="text-4xl" aria-label={`Dé : ${result}`}>
          {DICE_FACES[result - 1]}
        </span>
      ) : (
        <span className="text-4xl opacity-30">🎲</span>
      )}
      {canRoll && (
        <Button onClick={roll} variant="accent" disabled={rolling || result !== undefined}>
          {rolling ? 'Lancer…' : 'Lancer le dé'}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Créer `overlays/VoteOverlay.tsx`**

```typescript
// apps/web/components/games/plateau/overlays/VoteOverlay.tsx
'use client';

import { gameAction, getSocket } from '@/lib/socket';
import { PLATEAU_EVENTS } from '@tabswitch/plateau';
import type { PlateauClientView, VoteOption } from '@tabswitch/plateau';
import { Button } from '@/components/ui/Button';

const OPTIONS: { value: VoteOption; label: string }[] = [
  { value: 'reculer', label: '⬅️ Reculer 3 cases' },
  { value: 'passer_tour', label: '⏭ Passer son prochain tour' },
  { value: 'echanger_dernier', label: '🔀 Échanger avec le dernier' },
];

export function VoteOverlay({ view }: { view: PlateauClientView }) {
  if (!view.pendingEvent || view.pendingEvent.type !== 'vote') return null;
  const { targetPlayerId, votes } = view.pendingEvent;
  const target = view.players.find((p) => p.id === targetPlayerId);
  const myVote = votes[view.you.playerId];
  const isTarget = view.you.playerId === targetPlayerId;

  async function vote(option: VoteOption) {
    const ack = await gameAction(getSocket(), PLATEAU_EVENTS.Vote, { option });
    if (!ack.ok) alert(ack.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/10 bg-[#0c0c10] p-6">
        <h2 className="text-center text-xl font-bold">
          Vote contre <span className="text-rose-300">{target?.nickname ?? '?'}</span>
        </h2>
        {isTarget ? (
          <p className="text-center text-sm text-[color:var(--color-fg-muted)]">
            Les autres joueurs votent contre toi…
          </p>
        ) : myVote ? (
          <p className="text-center text-sm text-emerald-300">
            Tu as voté : <strong>{OPTIONS.find((o) => o.value === myVote)?.label}</strong>
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {OPTIONS.map((opt) => (
              <Button key={opt.value} onClick={() => vote(opt.value)} variant="ghost">
                {opt.label}
              </Button>
            ))}
          </div>
        )}
        <p className="text-center text-xs text-[color:var(--color-fg-muted)]">
          {Object.keys(votes).length}/{view.players.length - 1} votes reçus
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3 : Créer `overlays/SwapOverlay.tsx`**

```typescript
// apps/web/components/games/plateau/overlays/SwapOverlay.tsx
'use client';

import { gameAction, getSocket } from '@/lib/socket';
import { PLATEAU_EVENTS } from '@tabswitch/plateau';
import type { PlateauClientView } from '@tabswitch/plateau';
import { Button } from '@/components/ui/Button';

export function SwapOverlay({ view }: { view: PlateauClientView }) {
  if (!view.pendingEvent || view.pendingEvent.type !== 'swap') return null;
  const { initiatorId, targetId } = view.pendingEvent;
  const isInitiator = view.you.playerId === initiatorId;
  const initiator = view.players.find((p) => p.id === initiatorId);

  async function selectTarget(targetPlayerId: string) {
    const ack = await gameAction(getSocket(), PLATEAU_EVENTS.SwapTarget, { targetId: targetPlayerId });
    if (!ack.ok) alert(ack.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-white/10 bg-[#0c0c10] p-6">
        <h2 className="text-center text-xl font-bold">
          {isInitiator ? '🔀 Choisis avec qui échanger' : `${initiator?.nickname ?? '?'} choisit son échange…`}
        </h2>
        {isInitiator && !targetId ? (
          <div className="flex flex-col gap-2">
            {view.players
              .filter((p) => p.id !== initiatorId)
              .map((player) => (
                <Button key={player.id} onClick={() => selectTarget(player.id)} variant="ghost">
                  {player.nickname}{' '}
                  <span className="ml-2 text-xs text-[color:var(--color-fg-muted)]">
                    case {view.board.find((c) => c.id === player.cellId)?.index ?? '?'}
                  </span>
                </Button>
              ))}
          </div>
        ) : (
          <p className="text-center text-sm text-[color:var(--color-fg-muted)]">En attente…</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4 : Créer `overlays/MinigameOverlay.tsx`** (wrapper — le mini-jeu réel est rendu selon `gameType`)

```typescript
// apps/web/components/games/plateau/overlays/MinigameOverlay.tsx
'use client';

import type { LobbySnapshot } from '@tabswitch/types';
import type { PlateauClientView } from '@tabswitch/plateau';
import { TicTacToeGame } from '@/components/games/tictactoe/TicTacToeGame';
import { Connect4Game } from '@/components/games/connect4/Connect4Game';
import { RpsGame } from '@/components/games/rps/RpsGame';

export function MinigameOverlay({
  view,
  snapshot,
}: {
  view: PlateauClientView;
  snapshot: LobbySnapshot;
}) {
  if (
    view.phase !== 'MINIGAME_EVENT' &&
    view.phase !== 'MINIGAME_END_OF_TURN'
  )
    return null;
  if (!view.pendingEvent || view.pendingEvent.type !== 'minigame') return null;

  const { gameType, miniState } = view.pendingEvent;

  // Construire un snapshot partiel pour le mini-jeu (gameState = miniState)
  const miniSnapshot: LobbySnapshot = {
    ...snapshot,
    gameState: miniState,
  };

  let GameComponent: React.FC<{ snapshot: LobbySnapshot }> | null = null;
  if (gameType === 'tictactoe') GameComponent = TicTacToeGame;
  if (gameType === 'connect4') GameComponent = Connect4Game;
  if (gameType === 'rps') GameComponent = RpsGame;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 p-4">
      <div className="mb-4 text-center">
        <p className="text-xs uppercase tracking-widest text-[color:var(--color-fg-muted)]">
          Mini-jeu
        </p>
        <h2 className="font-display text-2xl font-bold capitalize">{gameType.replace(/-/g, ' ')}</h2>
        <p className="text-sm text-[color:var(--color-fg-muted)]">
          Le gagnant avance de 2 cases !
        </p>
      </div>
      <div className="w-full max-w-2xl">
        {GameComponent ? (
          <GameComponent snapshot={miniSnapshot} />
        ) : (
          <p className="text-center text-[color:var(--color-fg-muted)]">Mini-jeu inconnu : {gameType}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5 : Mettre à jour `PlateauGame.tsx`** pour intégrer DiceRoller et overlays

Remplacer le corps de `PlateauGame` (la fonction principale, pas les sous-composants) par :

```typescript
export function PlateauGame({ snapshot }: { snapshot: LobbySnapshot }) {
  const view = snapshot.gameState as PlateauClientView | null | undefined;

  if (!view) {
    return <div className="rounded-2xl border border-white/10 p-6 text-center">Chargement…</div>;
  }

  if (view.phase === 'GAME_OVER') {
    return <GameOverScreen view={view} />;
  }

  const activeId = view.turn.playerOrder[view.turn.activeIndex];
  const myDice = view.turn.dice[view.you.playerId];
  const canRoll = view.phase === 'ROLLING' && myDice === undefined;

  return (
    <>
      {/* Overlays */}
      {view.phase === 'VOTE' && <VoteOverlay view={view} />}
      {view.phase === 'SWAP' && <SwapOverlay view={view} />}
      {(view.phase === 'MINIGAME_EVENT' || view.phase === 'MINIGAME_END_OF_TURN') && (
        <MinigameOverlay view={view} snapshot={snapshot} />
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex-1">
          <PlateauBoard view={view} />
        </div>
        <div className="flex w-full flex-col gap-3 lg:w-64">
          {/* Dé */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <p className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
              {view.phase === 'ROLLING' ? 'Lancez les dés !' : `Phase : ${view.phase}`}
            </p>
            <DiceRoller canRoll={canRoll} result={myDice} />
          </div>
          <PlateauSidebar view={view} snapshot={snapshot} />
        </div>
      </div>
    </>
  );
}
```

Ajouter les imports en haut du fichier :

```typescript
import { DiceRoller } from './DiceRoller';
import { VoteOverlay } from './overlays/VoteOverlay';
import { SwapOverlay } from './overlays/SwapOverlay';
import { MinigameOverlay } from './overlays/MinigameOverlay';
```

- [ ] **Step 6 : Vérifier la compilation**

```bash
cd apps/web && pnpm typecheck
```

Expected: aucune erreur TS

- [ ] **Step 7 : Commit**

```bash
git add apps/web/components/games/plateau/
git commit -m "feat(plateau): DiceRoller, VoteOverlay, SwapOverlay, MinigameOverlay"
```

---

## Task 10 : Vérification end-to-end et typecheck global

**Files:** aucun (vérification uniquement)

- [ ] **Step 1 : Typecheck global**

```bash
cd /mnt/c/Users/faime/tabswitch && pnpm typecheck
```

Expected: aucune erreur dans aucun package

- [ ] **Step 2 : Tests unitaires complets**

```bash
cd /mnt/c/Users/faime/tabswitch && pnpm test
```

Expected: tous les tests passent (generator + fsm au minimum)

- [ ] **Step 3 : Lint**

```bash
cd /mnt/c/Users/faime/tabswitch && pnpm lint
```

Expected: aucune erreur

- [ ] **Step 4 : Commit final**

```bash
git add -A
git commit -m "feat(plateau): Plateau Party complet — plateau, FSM, UI React"
```

---

## Récapitulatif des fichiers créés / modifiés

| Fichier | Action |
|---|---|
| `packages/games/plateau/package.json` | Créé |
| `packages/games/plateau/tsconfig.json` | Créé |
| `packages/games/plateau/src/types.ts` | Créé |
| `packages/games/plateau/src/generator.ts` | Créé |
| `packages/games/plateau/src/generator.test.ts` | Créé |
| `packages/games/plateau/src/fsm.ts` | Créé |
| `packages/games/plateau/src/fsm.test.ts` | Créé |
| `packages/games/plateau/src/room.ts` | Créé |
| `packages/games/plateau/src/definition.ts` | Créé |
| `packages/games/plateau/src/index.ts` | Créé |
| `apps/server/package.json` | Modifié |
| `apps/server/src/games/registry.ts` | Modifié |
| `apps/web/package.json` | Modifié |
| `apps/web/lib/constants.ts` | Modifié |
| `apps/web/components/games/GameRoomShell.tsx` | Modifié |
| `apps/web/components/games/GameSettingsPanel.tsx` | Modifié |
| `apps/web/components/games/plateau/PlateauSettings.tsx` | Créé |
| `apps/web/components/games/plateau/PlateauGame.tsx` | Créé |
| `apps/web/components/games/plateau/DiceRoller.tsx` | Créé |
| `apps/web/components/games/plateau/overlays/VoteOverlay.tsx` | Créé |
| `apps/web/components/games/plateau/overlays/SwapOverlay.tsx` | Créé |
| `apps/web/components/games/plateau/overlays/MinigameOverlay.tsx` | Créé |
