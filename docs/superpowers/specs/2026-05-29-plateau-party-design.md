# Plateau Party — Design Spec

> Spec de design · 2026-05-29 · TabSwitch

## Contexte

TabSwitch est un hub de mini-jeux multijoueur (Next.js 15 + Socket.IO + Redis). Les jeux existants (TicTacToe, Connect4, RPS, GIF Battle) partagent une architecture commune : registry serveur, FSM Redis, protocole `game:action` / `game:event`, composant React branché dans `GameRoomShell`.

Le Plateau Party s'ajoute comme un nouveau game type dans cette registry. Sa particularité : il orchestre les autres mini-jeux comme sous-parties imbriquées.

## Objectifs

1. Plateau de jeu généré aléatoirement, 2–8 joueurs, avatars comme pions.
2. Tour par tour : chaque joueur lance son dé, se déplace, résout l'effet de sa case.
3. Un mini-jeu aléatoire (parmi les jeux existants) à la fin de chaque tour complet.
4. Cases événements (mini-jeu immédiat, vote, échange de position).
5. Premier à atteindre la case `finish` gagne.
6. Plateau équilibré régénéré à chaque partie.

## Non-objectifs (follow-ups)

- Mode équipe.
- Mini-jeux dédiés plateau (plus courts, 30–60s).
- Modération, replays, stats persistantes.
- Reconnexion avancée (même comportement que les jeux existants).

---

## Plateau — Structure

Le plateau est un graphe orienté de ~40 cases, généré côté serveur au démarrage de chaque partie (phase `LOBBY`).

### Propriétés d'une case

```ts
type BoardCell = {
  id: string;
  position: { x: number; y: number }; // coordonnées SVG pour l'affichage
  neighbors: string[];                 // ids des cases suivantes (1 ou 2 si embranchement)
  type: CellType;
  event?: EventType;                   // présent uniquement si type === 'event'
};

type CellType = 'start' | 'normal' | 'bonus' | 'malus' | 'safe' | 'event' | 'finish';
type EventType = 'minigame' | 'vote' | 'swap';
```

### Distribution des 38 cases intermédiaires

| Type    | Ratio | ~Nombre |
|---------|-------|---------|
| normal  | 50%   | 19      |
| bonus   | 15%   | 6       |
| malus   | 15%   | 6       |
| safe    | 8%    | 3       |
| event   | 12%   | 4–5     |

Les events sont répartis équitablement entre `minigame`, `vote`, `swap`.

### Contraintes d'équilibre (appliquées à la génération)

- Jamais 2 cases `event` consécutives.
- Jamais 2 cases `malus` consécutives.
- Minimum 2 cases `normal` entre deux events.
- Les embranchements (2–3 fourches, entre les cases 10 et 30) ont toujours au moins une case `normal` juste après la fourche.
- La case juste avant `finish` est toujours `normal`.
- Les embranchements se rejoignent toujours avant la case `finish`.

Le plateau généré est sérialisé dans Redis avec le reste de l'état de la partie.

---

## FSM — Phases

```
LOBBY → ROLLING → MOVING → CASE_EFFECT → [EVENT?] → MINIGAME_END_OF_TURN → NEXT_TURN → [GAME_OVER]
```

### Détail des phases

**LOBBY**
Attente des joueurs. L'hôte génère le plateau et lance la partie. Le snapshot initial (plateau + positions de départ) est envoyé à tous les clients au join.

**ROLLING**
Chaque joueur lance son dé (1d6) dans l'ordre du tour. Timeout 5s puis lancer automatique. Tous les joueurs ont lancé → passage à `MOVING`.

**MOVING**
Les pions se déplacent dans l'ordre. Si un joueur atterrit sur un embranchement, il choisit sa direction (10s timeout → aléatoire). Un joueur qui atteint `finish` déclenche `GAME_OVER`. Sinon, résolution de l'effet de la case (`CASE_EFFECT`).

**CASE_EFFECT**
Résolution selon le type de case :
- `normal` → rien
- `bonus` → avance de 3 cases supplémentaires
- `malus` → recule de 3 cases (minimum : case `start`)
- `safe` → le joueur est protégé contre le prochain malus (flag `protected: true`)
- `event` → déclenche l'événement correspondant (voir ci-dessous)

Un joueur avec `protected: true` ignore un `malus` ou un effet négatif de `vote`, le flag est consommé.

**Événements de case (`event`)**

| Type      | Résolution |
|-----------|-----------|
| `minigame` | Mini-jeu immédiat pour tous les joueurs. Le gagnant avance de 2 cases. |
| `vote`     | Les autres joueurs votent (20s) pour infliger un effet au joueur sur la case : recule 3 cases, passe son prochain tour, ou échange forcé avec le dernier. Majorité gagne, égalité → aléatoire. |
| `swap`     | Le joueur sur la case choisit avec quel autre joueur il échange sa position (15s timeout → aléatoire). |

**MINIGAME_END_OF_TURN**
Après que tous les joueurs ont joué leur case, un mini-jeu aléatoire (parmi les jeux disponibles dans la registry) est lancé pour tout le monde. Le gagnant avance de 2 cases. Si un joueur déclenche `GAME_OVER` pendant cette phase bonus, la partie s'arrête.

**NEXT_TURN**
Passage au tour suivant. Ordre circulaire, le joueur suivant dans la liste devient actif. Retour à `ROLLING`.

**GAME_OVER**
Écran de podium. Classement par ordre d'arrivée à `finish`. Les joueurs non arrivés sont classés par position sur le plateau.

---

## Mini-jeu imbriqué

La FSM plateau ne quitte pas la room Socket.IO. Quand un mini-jeu est requis :

1. La FSM tire aléatoirement un `gameType` parmi les jeux disponibles dans la registry.
2. Elle instancie la FSM de ce mini-jeu inline, avec un snapshot embarqué dans `pendingEvent`.
3. Les événements Socket.IO du mini-jeu sont pipés dans la même room (`game:action` / `game:event`).
4. Quand le mini-jeu émet `game:over`, la FSM plateau récupère le `winnerId`, applique le bonus (+2 cases), et reprend la phase suivante.

Le client détecte la présence d'un mini-jeu via `snapshot.pendingEvent.type === 'minigame'` et affiche le composant correspondant en overlay fullscreen.

---

## État Redis

```ts
type PlateauSnapshot = {
  board: BoardCell[];
  players: {
    id: string;
    avatarUrl: string;
    position: string;   // caseId courant
    protected: boolean; // case safe active
    skipsNextTurn: boolean;
  }[];
  phase: PlateauPhase;
  turn: {
    number: number;
    playerOrder: string[];   // ids dans l'ordre de jeu
    activeIndex: number;     // index dans playerOrder
    dice: Record<string, number>; // résultats dés du tour en cours
    movedPlayers: string[];  // joueurs ayant déjà bougé ce tour
  };
  pendingEvent: PendingEvent | null;
};

type PendingEvent =
  | { type: 'minigame'; gameType: string; miniSnapshot: unknown }
  | { type: 'vote'; targetPlayerId: string; votes: Record<string, VoteOption>; deadline: number }
  | { type: 'swap'; initiatorId: string; targetId: string | null; deadline: number };
```

---

## Événements Socket.IO

Nouveaux événements spécifiques au plateau, en complément du protocole `game:action` / `game:event` existant :

| Événement client → serveur | Description |
|---------------------------|-------------|
| `plateau:roll`            | Le joueur actif lance son dé |
| `plateau:choose-path`     | Choix de direction à un embranchement (`{ cellId }`) |
| `plateau:vote`            | Vote lors d'un event vote (`{ option: VoteOption }`) |
| `plateau:swap-target`     | Cible choisie pour un échange (`{ targetId }`) |

---

## UI Client

Dossier : `apps/web/components/games/plateau/`. Branché dans `GameRoomShell` pour `gameType === 'plateau'`, même convention que TicTacToe.

### Composants

```
plateau/
  PlateauGame.tsx         — racine, route selon snapshot.phase
  PlateauBoard.tsx        — rendu SVG du plateau (cases, chemins, pions)
  PlateauSidebar.tsx      — ordre de tour, avatars, log événements
  DiceRoller.tsx          — animation dé + bouton lancer
  overlays/
    CaseEffectOverlay.tsx — toast/banner effet de case
    VoteOverlay.tsx       — grille de vote
    SwapOverlay.tsx       — sélecteur de cible pour échange
    GameOverScreen.tsx    — podium final
```

### Vue principale — PlateauBoard

Rendu SVG. Les cases sont positionnées via leurs coordonnées `{ x, y }` du JSON. Couleur par type :

| Type    | Couleur  |
|---------|----------|
| normal  | gris     |
| bonus   | vert     |
| malus   | rouge    |
| event   | violet   |
| safe    | bleu     |
| finish  | or       |

Les avatars (photo de profil) flottent sur leur case. Si plusieurs joueurs sur la même case, les avatars sont superposés/décalés légèrement.

### Panneau latéral / bas mobile

- Liste des joueurs dans l'ordre du tour (avatar + numéro de case)
- Indicateur du joueur actif (surligné)
- Bouton "Lancer le dé" — visible uniquement pour le joueur actif en phase `ROLLING`
- Log des 5 derniers événements ("Léa a avancé de 4 cases", "Case bonus !", etc.)

### Overlays par phase

- `CASE_EFFECT` → banner animé avec l'effet
- `MINIGAME` / `MINIGAME_END_OF_TURN` → composant du mini-jeu en overlay fullscreen
- `VOTE` → grille d'avatars + options de vote + countdown
- `SWAP` → liste d'avatars cliquables pour l'initiateur, message d'attente pour les autres
- `GAME_OVER` → podium avec avatars et ordre d'arrivée

---

## Structure serveur

```
apps/server/games/plateau/
  index.ts        — entry point, export du handler vers la registry
  fsm.ts          — FSM principale (phases + transitions)
  generator.ts    — génération aléatoire du plateau avec contraintes
  minigame.ts     — orchestration du mini-jeu imbriqué
  events.ts       — types TypeScript des événements Socket.IO
```

---

## Fichiers à créer / modifier

| Fichier | Action |
|---------|--------|
| `apps/server/games/plateau/` | Créer (nouveau dossier) |
| `apps/server/games/registry.ts` | Ajouter `plateau` |
| `apps/web/components/games/plateau/` | Créer (nouveau dossier) |
| `apps/web/components/games/GameRoomShell.tsx` | Brancher `plateau` → `PlateauGame` |
| `apps/web/components/games/GameSettingsPanel.tsx` | Ajouter settings plateau (nb joueurs) |
| `packages/types/` | Ajouter types `PlateauSnapshot`, `BoardCell`, etc. |
