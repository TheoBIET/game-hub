'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LobbySnapshot, PublicPlayer } from '@tabswitch/types';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getSocket } from '@/lib/socket';
import { useLobby, usePrefs } from '@/lib/store';
import { gameLabel } from '@/lib/constants';
import { TicTacToeGame } from '@/components/games/tictactoe/TicTacToeGame';
import { Connect4Game } from '@/components/games/connect4/Connect4Game';
import { RpsGame } from '@/components/games/rps/RpsGame';
import { PlateauGame } from '@/components/games/plateau/PlateauGame';
import { PlaceholderGame } from '@/components/games/PlaceholderGame';
import { GameSettingsPanel } from '@/components/games/GameSettingsPanel';
import { MatchScoreChip } from '@/components/games/MatchScoreChip';

type SupportedGame = 'gif-battle' | 'tictactoe' | 'connect4' | 'rps' | 'plateau';

export function GameRoomShell({
  gameType,
  code,
  profileNickname,
}: {
  gameType: SupportedGame;
  code: string;
  /** Nickname from the signed-in profile, empty string for guests. */
  profileNickname: string;
}) {
  const router = useRouter();
  const { nickname, setNickname } = usePrefs();
  const [formNickname, setFormNickname] = useState(profileNickname || nickname);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const snapshot = useLobby((s) => s.snapshot);
  const setSnapshot = useLobby((s) => s.setSnapshot);
  const setConnected = useLobby((s) => s.setConnected);
  const reset = useLobby((s) => s.reset);

  useEffect(() => {
    return () => {
      reset();
    };
  }, [reset]);

  // Register socket listeners ONCE on mount, BEFORE any join attempt, so the
  // first lobby:state broadcast (fired by the server right after the join ack)
  // is never missed by a re-render race.
  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onState = (s: LobbySnapshot) => setSnapshot(s);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby:state', onState);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:state', onState);
    };
  }, [setConnected, setSnapshot]);

  // Auto-join when the user has a profile nickname (signed-in path). Runs once.
  const autoJoinTried = useRef(false);
  useEffect(() => {
    if (autoJoinTried.current) return;
    if (!profileNickname) return;
    autoJoinTried.current = true;
    void doJoin(profileNickname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileNickname]);

  async function doJoin(asNickname: string) {
    const cleaned = asNickname.trim();
    if (cleaned.length < 1) {
      setErr('Pseudo requis (1-16 chars)');
      return;
    }
    setJoining(true);
    setErr(null);
    setNickname(cleaned);
    await fetch('/api/auth/session', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    const socket = getSocket();
    socket.emit('lobby:join', { code, nickname: cleaned }, (ack) => {
      setJoining(false);
      if (ack.ok) {
        setJoined(true);
      } else {
        setErr(ack.message ?? 'Erreur inconnue');
      }
    });
  }

  function onSubmitJoin(e: React.FormEvent) {
    e.preventDefault();
    void doJoin(formNickname);
  }

  function leave() {
    const socket = getSocket();
    socket.emit('lobby:leave', {}, () => {
      setJoined(false);
      router.push('/');
    });
  }

  if (!joined) {
    return (
      <JoinScreen
        code={code}
        gameType={gameType}
        nickname={formNickname}
        setNickname={setFormNickname}
        joining={joining}
        err={err}
        autoJoining={!!profileNickname && joining && !err}
        onSubmit={onSubmitJoin}
      />
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <RoomHeader code={code} gameType={gameType} snapshot={snapshot} onLeave={leave} />
      {snapshot ? (
        snapshot.room.status === 'LOBBY' ? (
          <LobbyWaitingRoom gameType={gameType} snapshot={snapshot} />
        ) : (
          <GameView gameType={gameType} snapshot={snapshot} />
        )
      ) : (
        <ConnectingState />
      )}
    </main>
  );
}

// ============ Join screen (pre-connection) ============

function JoinScreen({
  code,
  gameType,
  nickname,
  setNickname,
  joining,
  err,
  autoJoining,
  onSubmit,
}: {
  code: string;
  gameType: SupportedGame;
  nickname: string;
  setNickname: (n: string) => void;
  joining: boolean;
  err: string | null;
  autoJoining: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const meta = gameLabel(gameType);
  if (autoJoining) {
    return (
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-stretch justify-center gap-6 px-4 py-12">
        <header className="text-center">
          <div className="text-4xl">{meta.emoji}</div>
          <h1 className="font-display mt-2 text-3xl font-bold">{meta.name}</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-[color:var(--color-fg-muted)]">
            Room <span className="font-mono">{code}</span>
          </p>
        </header>
        <Card>
          <div className="flex items-center gap-3">
            <div className="size-2 animate-pulse rounded-full bg-emerald-400" aria-hidden />
            <p className="text-sm">
              Connexion en tant que <strong>{nickname}</strong>…
            </p>
          </div>
        </Card>
      </main>
    );
  }
  return (
    <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-md flex-col items-stretch justify-center gap-6 px-4 py-12">
      <header className="text-center">
        <div className="text-4xl">{meta.emoji}</div>
        <h1 className="font-display mt-2 text-3xl font-bold">{meta.name}</h1>
        <p className="mt-1 text-xs uppercase tracking-[0.3em] text-[color:var(--color-fg-muted)]">
          Room <span className="font-mono">{code}</span> · {meta.minPlayers}-{meta.maxPlayers} joueurs
        </p>
      </header>
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="nickname"
              className="mb-1 block text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]"
            >
              Ton pseudo dans cette partie
            </label>
            <input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value.slice(0, 16))}
              placeholder="Ex: théo"
              maxLength={16}
              autoComplete="nickname"
              autoFocus
              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 outline-none focus:border-white/40"
            />
          </div>
          <Button type="submit" variant="primary" size="lg" disabled={joining}>
            {joining ? 'Connexion…' : 'Rejoindre la room →'}
          </Button>
          {err && (
            <p className="text-sm text-rose-300" role="alert">
              {err}
            </p>
          )}
        </form>
      </Card>
    </main>
  );
}

// ============ Header (always shown post-join) ============

function RoomHeader({
  code,
  gameType,
  snapshot,
  onLeave,
}: {
  code: string;
  gameType: SupportedGame;
  snapshot: LobbySnapshot | null;
  onLeave: () => void;
}) {
  const meta = gameLabel(gameType);
  const players = snapshot?.room.players ?? [];
  const activeCount = players.filter((p) => !p.isSpectator).length;
  const status = snapshot?.room.status;

  function copyShareLink() {
    if (typeof window === 'undefined') return;
    navigator.clipboard?.writeText(window.location.href).catch(() => {});
  }

  return (
    <header className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          {meta.emoji}
        </span>
        <div>
          <div className="font-display text-xl font-bold leading-none">{meta.name}</div>
          <div className="mt-1 flex items-center gap-2 text-xs text-[color:var(--color-fg-muted)]">
            <span>
              Room <span className="font-mono text-white">{code}</span>
            </span>
            <button
              type="button"
              onClick={copyShareLink}
              className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wider hover:bg-white/10"
              title="Copier le lien"
            >
              copier
            </button>
          </div>
        </div>
      </div>

      <StatusPill status={status} activeCount={activeCount} meta={meta} />

      {(() => {
        const bestOf = (snapshot?.gameState as { bestOf?: number } | null | undefined)?.bestOf ?? 1;
        if (bestOf <= 1) return null;
        const matchScore = (snapshot?.gameState as { matchScore?: { p1: number; p2: number; draws: number } } | null | undefined)?.matchScore;
        const roundNumber = (snapshot?.gameState as { roundNumber?: number } | null | undefined)?.roundNumber ?? 1;
        if (!matchScore) return null;
        const view = snapshot?.gameState as
          | { you?: { mark?: 'X' | 'O' | null; color?: 'red' | 'yellow' | null; seat?: 'p1' | 'p2' | null } }
          | null
          | undefined;
        let seat: 'p1' | 'p2' | null = null;
        if (view?.you?.seat === 'p1' || view?.you?.seat === 'p2') seat = view.you.seat;
        else if (view?.you?.mark === 'X') seat = 'p1';
        else if (view?.you?.mark === 'O') seat = 'p2';
        else if (view?.you?.color === 'red') seat = 'p1';
        else if (view?.you?.color === 'yellow') seat = 'p2';
        return <MatchScoreChip matchScore={matchScore} youSeat={seat} roundNumber={roundNumber} />;
      })()}

      <div className="ml-auto flex gap-2">
        <Button onClick={onLeave} variant="ghost" size="sm">
          Quitter
        </Button>
      </div>
    </header>
  );
}

function StatusPill({
  status,
  activeCount,
  meta,
}: {
  status: 'LOBBY' | 'PLAYING' | 'ENDED' | undefined;
  activeCount: number;
  meta: ReturnType<typeof gameLabel>;
}) {
  if (status === 'PLAYING') {
    return (
      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
        En cours · {activeCount}/{meta.maxPlayers} joueurs
      </span>
    );
  }
  if (status === 'ENDED') {
    return (
      <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold">
        Terminé
      </span>
    );
  }
  return (
    <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold">
      Lobby · {activeCount}/{meta.maxPlayers}
    </span>
  );
}

// ============ Waiting room (LOBBY state) ============

function LobbyWaitingRoom({
  gameType,
  snapshot,
}: {
  gameType: SupportedGame;
  snapshot: LobbySnapshot;
}) {
  const meta = gameLabel(gameType);
  const players = snapshot.room.players;
  const spectators = snapshot.room.spectators;
  const activeCount = players.filter((p) => !p.isSpectator).length;
  const missing = Math.max(0, meta.minPlayers - activeCount);
  const isHost = snapshot.you.isHost;
  const ready = activeCount >= meta.minPlayers;
  // tictactoe: alone = play vs AI. Hint when soloable.
  const soloVsAi = gameType === 'tictactoe' && activeCount === 1 && meta.maxPlayers > 1;

  function start() {
    getSocket().emit('lobby:start', {}, (ack) => {
      if (!ack.ok) alert(ack.message);
    });
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4">
          <PlayerList
            players={players}
            hostId={snapshot.room.hostId}
            youId={snapshot.you.playerId}
            maxPlayers={meta.maxPlayers}
          />
          {spectators.length > 0 && (
            <SpectatorList players={spectators} youId={snapshot.you.playerId} />
          )}
        </div>
      </Card>

      <GameSettingsPanel gameType={gameType} snapshot={snapshot} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-center">
        {ready ? (
          isHost ? (
            <>
              <p className="text-sm">
                {soloVsAi ? 'Tu joues seul — l’IA prendra l’autre place.' : 'Tout le monde est prêt.'}
              </p>
              <Button onClick={start} variant="accent" size="lg" className="mt-3">
                {soloVsAi ? 'Jouer contre 🤖 l’IA' : 'Lancer la partie'}
              </Button>
            </>
          ) : (
            <p className="text-sm text-[color:var(--color-fg-muted)]">
              En attente que le host lance la partie…
            </p>
          )
        ) : (
          <p className="text-sm text-[color:var(--color-fg-muted)]">
            Il faut encore{' '}
            <strong className="text-white">
              {missing} joueur{missing > 1 ? 's' : ''}
            </strong>{' '}
            pour démarrer (minimum {meta.minPlayers}).
            <br />
            Partage le lien ou le code <span className="font-mono">{snapshot.room.code}</span>.
          </p>
        )}
      </div>
    </>
  );
}

function PlayerList({
  players,
  hostId,
  youId,
  maxPlayers,
}: {
  players: readonly PublicPlayer[];
  hostId: string;
  youId: string;
  maxPlayers: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
          Joueurs ({players.length}/{maxPlayers})
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} isHost={p.id === hostId} isYou={p.id === youId} />
        ))}
        {Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, i) => (
          <li
            key={`empty-${i}`}
            className="flex items-center gap-3 rounded-lg border border-dashed border-white/10 bg-white/[0.01] px-3 py-2 text-xs text-[color:var(--color-fg-muted)]"
          >
            Place libre
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpectatorList({
  players,
  youId,
}: {
  players: readonly PublicPlayer[];
  youId: string;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
        Spectateurs ({players.length})
      </h2>
      <ul className="flex flex-wrap gap-2">
        {players.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs"
          >
            <Avatar seed={p.avatarSeed || p.id} size={20} />
            <span>
              {p.nickname}
              {p.id === youId && (
                <span className="ml-1 text-[color:var(--color-fg-muted)]">(toi)</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerRow({
  player,
  isHost,
  isYou,
}: {
  player: PublicPlayer;
  isHost: boolean;
  isYou: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="relative">
        <Avatar seed={player.avatarSeed || player.id} size={32} />
        <span
          className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#0c0c10] ${
            player.isConnected ? 'bg-emerald-400' : 'bg-zinc-500'
          }`}
          title={player.isConnected ? 'Connecté' : 'Déconnecté'}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
          {isHost && <span title="Host">👑</span>}
          <span className="truncate">{player.nickname}</span>
          {isYou && <span className="text-xs text-[color:var(--color-fg-muted)]">(toi)</span>}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[color:var(--color-fg-muted)]">
          {player.isConnected ? 'En ligne' : 'Déconnecté'}
        </div>
      </div>
    </li>
  );
}

// ============ Connecting placeholder (snapshot not yet arrived) ============

function ConnectingState() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-12 text-center">
      <div className="size-3 animate-pulse rounded-full bg-emerald-400" aria-hidden />
      <p className="text-sm text-[color:var(--color-fg-muted)]">Connexion à la room…</p>
    </div>
  );
}

// ============ Game view (PLAYING or ENDED state) ============

function GameView({ gameType, snapshot }: { gameType: SupportedGame; snapshot: LobbySnapshot }) {
  if (gameType === 'tictactoe') return <TicTacToeGame snapshot={snapshot} />;
  if (gameType === 'connect4') return <Connect4Game snapshot={snapshot} />;
  if (gameType === 'rps') return <RpsGame snapshot={snapshot} />;
  if (gameType === 'plateau') return <PlateauGame snapshot={snapshot} />;
  return <PlaceholderGame gameType="gif-battle" />;
}
