import type { BoardCell, CellType, EventType } from './types.js';

const TOTAL = 40;
const INNER_COUNT = 38;

const RATIOS: { type: CellType; count: number }[] = [
  { type: 'bonus', count: 6 },
  { type: 'malus', count: 6 },
  { type: 'safe', count: 3 },
  { type: 'event', count: 5 },
  { type: 'normal', count: 18 },
];

const EVENT_TYPES: EventType[] = ['minigame', 'vote', 'swap', 'minigame', 'vote'];

function uid(index: number): string {
  return `cell-${index}`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildTypeSequence(): CellType[] {
  // Stratégie : placer les events en premier dans des positions garantissant
  // >= 2 cases NORMALES entre chaque event. Ensuite remplir les positions libres
  // avec malus (non-adjacents entre eux), puis bonus, safe, normal.

  const result: CellType[] = new Array(INNER_COUNT).fill('normal') as CellType[];
  // Forcer la dernière case (avant finish) à normal
  result[INNER_COUNT - 1] = 'normal';

  // Placer 5 events : chaque event a 2 slots "normal réservés" avant le prochain event.
  // On travaille sur [0, INNER_COUNT-2] pour protéger la dernière case.
  const protectedLast = INNER_COUNT - 1;
  const eventPositions = placeEventsWithNormalGap(5, protectedLast);
  for (const pos of eventPositions) {
    result[pos] = 'event';
  }
  // Marquer les cases qui DOIVENT rester normal (les 2 cases après chaque event
  // qui servent de "gap") — elles ne seront pas remplacées
  const normalLocked = new Set<number>();
  for (const pos of eventPositions) {
    for (let g = 1; g <= 2; g++) {
      const gapPos = pos + g;
      if (gapPos < protectedLast && result[gapPos] === 'normal') {
        normalLocked.add(gapPos);
      }
    }
  }
  normalLocked.add(protectedLast);

  // Positions libres (normal non-locked) pour placer malus, bonus, safe
  const freePositions = result
    .map((t, i) => (t === 'normal' && !normalLocked.has(i) ? i : -1))
    .filter((i) => i >= 0);

  // Placer malus (6) : non-adjacents entre eux
  const malusPositions = pickNonAdjacentPositions(6, freePositions);
  const malusSet = new Set(malusPositions);
  for (const pos of malusPositions) result[pos] = 'malus';

  // Positions restantes après malus
  const afterMalus = freePositions.filter((p) => !malusSet.has(p));
  const shuffledAfter = shuffle(afterMalus);

  // Placer bonus (6) et safe (3)
  for (let i = 0; i < 6 && i < shuffledAfter.length; i++) {
    result[shuffledAfter[i]!] = 'bonus';
  }
  for (let i = 6; i < 9 && i < shuffledAfter.length; i++) {
    result[shuffledAfter[i]!] = 'safe';
  }

  return result;
}

// Place `count` events dans [0, maxExcl) avec au moins 2 normals entre chaque event
// (c'est-à-dire un gap d'au moins 3 indices entre deux events consécutifs).
function placeEventsWithNormalGap(count: number, maxExcl: number): number[] {
  // Tenter 500 fois de trouver des positions aléatoires valides
  for (let attempt = 0; attempt < 500; attempt++) {
    const candidates = shuffle(Array.from({ length: maxExcl }, (_, i) => i));
    const selected: number[] = [];
    for (const pos of candidates) {
      // Vérifier qu'il y a au moins 3 d'écart avec chaque event déjà placé
      if (selected.every((p) => Math.abs(p - pos) >= 3)) {
        selected.push(pos);
        if (selected.length === count) return selected;
      }
    }
  }
  // Fallback déterministe : espacer uniformément
  const step = Math.floor(maxExcl / (count + 1));
  return Array.from({ length: count }, (_, i) => step * (i + 1));
}

// Choisir `count` positions parmi `available` sans adjacence (distance > 1)
function pickNonAdjacentPositions(count: number, available: number[]): number[] {
  const shuffled = shuffle(available);
  const result: number[] = [];
  for (const pos of shuffled) {
    if (result.every((p) => Math.abs(p - pos) > 1)) {
      result.push(pos);
      if (result.length === count) break;
    }
  }
  // Fallback si pas assez
  if (result.length < count) {
    for (const pos of shuffled) {
      if (!result.includes(pos)) {
        result.push(pos);
        if (result.length === count) break;
      }
    }
  }
  return result;
}

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

  for (let i = 0; i < TOTAL - 1; i++) {
    cells[i]!.neighbors = [uid(i + 1)];
  }
  cells[TOTAL - 1]!.neighbors = [];

  addFork(cells, 12, 15, 16);
  addFork(cells, 22, 25, 26);

  return cells;
}

function addFork(cells: BoardCell[], forkIdx: number, altIdx: number, rejoinIdx: number): void {
  const forkCell = cells[forkIdx];
  const altCell = cells[altIdx];
  const rejoinCell = cells[rejoinIdx];
  if (!forkCell || !altCell || !rejoinCell) return;

  forkCell.neighbors = [uid(forkIdx + 1), uid(altIdx)];
  altCell.neighbors = [uid(rejoinIdx)];
}
