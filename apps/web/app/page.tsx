import Link from 'next/link';
import { Gamepad2, Zap, Users, Github, ArrowRight } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { ToastViewport } from '@/components/ui/Toast';
import { GameCard } from '@/components/hub/GameCard';
import { HubNav } from '@/components/hub/HubNav';
import { SiteFooter } from '@/components/hub/SiteFooter';
import { Button } from '@/components/ui/Button';
import { JoinByCode } from '@/components/hub/JoinByCode';
import { Avatar } from '@/components/ui/Avatar';
import { gameLabel } from '@/lib/constants';

const GAMES = [
  {
    gameType: 'gif-battle',
    title: 'GIF Battle',
    tagline: 'Le party game où ton meme parle pour toi.',
    status: 'beta' as const,
    accentFrom: '#8b5cf6',
    accentTo: '#d946ef',
    minPlayers: 3,
    maxPlayers: 10,
    duration: '~10 min',
    emoji: '🎬',
  },
  {
    gameType: 'tictactoe',
    title: 'Tic-Tac-Toe',
    tagline: 'Le classique. Joue à 2 ou contre l’IA.',
    status: 'live' as const,
    accentFrom: '#06b6d4',
    accentTo: '#10b981',
    minPlayers: 1,
    maxPlayers: 2,
    duration: '~2 min',
    emoji: '⊕',
  },
  {
    gameType: 'connect4',
    title: 'Connect 4',
    tagline: "Aligne 4 jetons. Joue a 2 ou contre l'IA.",
    status: 'live' as const,
    accentFrom: '#ef4444',
    accentTo: '#fbbf24',
    minPlayers: 1,
    maxPlayers: 2,
    duration: '~5 min',
    emoji: '🔴',
  },
  {
    gameType: 'rps',
    title: 'Pierre-Feuille-Ciseaux',
    tagline: 'Best-of classique. Solo (IA random) ou à 2.',
    status: 'live' as const,
    accentFrom: '#f97316',
    accentTo: '#facc15',
    minPlayers: 1,
    maxPlayers: 2,
    duration: '~1 min',
    emoji: '✊',
  },
  {
    gameType: 'plateau',
    title: 'Plateau Party',
    tagline: 'Lancez les dés, traversez le plateau, remportez les défis !',
    status: 'live' as const,
    accentFrom: '#a855f7',
    accentTo: '#ec4899',
    minPlayers: 2,
    maxPlayers: 8,
    duration: '~20 min',
    emoji: '🎲',
  },
];

export default async function HubLanding() {
  const session = await auth();
  const user = session?.user as
    | { id?: string; nickname?: string | null; email?: string | null }
    | undefined;

  let me: { slug: string; nickname: string } | null = null;
  let recent: Array<{
    id: string;
    gameType: string;
    roomCode: string;
    outcome: 'won' | 'lost' | 'draw';
    playedAt: Date;
  }> = [];
  let totalWins = 0;

  if (user?.id) {
    try {
      const db = getDb();
      const [profile, last3, wins] = await Promise.all([
        db.user.findUnique({
          where: { id: user.id },
          select: { slug: true, nickname: true },
        }),
        db.gameSession.findMany({
          where: { userId: user.id },
          orderBy: { playedAt: 'desc' },
          take: 3,
        }),
        db.gameSession.count({ where: { userId: user.id, outcome: 'won' } }),
      ]);
      if (profile?.slug && profile.nickname) {
        me = { slug: profile.slug, nickname: profile.nickname };
      }
      recent = last3;
      totalWins = wins;
    } catch (err) {
      // DB unreachable or schema not pushed — render homepage as guest rather
      // than crashing the whole tree. The error surfaces in server logs.
      console.error('[hub] homepage personalization failed', err);
    }
  }

  const isSignedInWithoutProfile = !!user?.id && !me;

  return (
    <div className="flex min-h-dvh flex-col">
      <HubNav />
      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-10">
        <ToastViewport />

        <header className="flex flex-col items-center pt-6 text-center sm:pt-12">
          <span className="animate-rise inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[color:var(--color-fg-muted)]">
            <Gamepad2 size={14} className="text-[color:var(--color-accent-500)]" aria-hidden="true" />
            {GAMES.length} jeux · 100% open source
          </span>

          <h1 className="font-display animate-rise mt-5 bg-gradient-to-br from-white via-white to-fuchsia-300 bg-clip-text text-6xl font-extrabold leading-[0.95] text-transparent sm:text-8xl">
            TabSwitch
          </h1>

          <p
            className="animate-rise mt-4 max-w-xl text-balance text-lg font-medium text-[color:var(--color-fg)] sm:text-xl"
            style={{ animationDelay: '60ms' }}
          >
            Le hub de mini-jeux multijoueur. Une room en deux clics, et c&apos;est parti.
          </p>
          <p
            className="animate-rise mt-2 max-w-md text-balance text-sm text-[color:var(--color-fg-muted)]"
            style={{ animationDelay: '120ms' }}
          >
            Joue avec tes potes, sans inscription. Gratuit et contributeur-friendly.
          </p>

          <div
            className="animate-rise mt-7 flex flex-col items-center gap-3 sm:flex-row"
            style={{ animationDelay: '180ms' }}
          >
            <Button asChild variant="accent" size="lg">
              <Link href="#games">
                Voir les jeux
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/ideas">Proposer un jeu</Link>
            </Button>
          </div>

          <ul
            className="animate-rise mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-[color:var(--color-fg-muted)]"
            style={{ animationDelay: '240ms' }}
          >
            <li className="flex items-center gap-1.5">
              <Zap size={14} className="text-[color:var(--color-success-500)]" aria-hidden="true" />
              Sans inscription
            </li>
            <li className="flex items-center gap-1.5">
              <Users size={14} className="text-[color:var(--color-info-500)]" aria-hidden="true" />
              Multijoueur en temps réel
            </li>
            <li className="flex items-center gap-1.5">
              <Github size={14} className="text-[color:var(--color-primary-500)]" aria-hidden="true" />
              Open source
            </li>
          </ul>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {me ? (
              <MeStrip me={me} totalWins={totalWins} recent={recent} />
            ) : isSignedInWithoutProfile ? (
              <OnboardingNudge />
            ) : (
              <AnonCta />
            )}
          </div>
          <div className="lg:col-span-1">
            <JoinByCode />
          </div>
        </section>

        <section
          id="games"
          className="grid scroll-mt-24 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {GAMES.map((g) => (
            <GameCard
              key={g.gameType}
              href={`/games/${g.gameType}`}
              title={g.title}
              tagline={g.tagline}
              status="live"
              accentFrom={g.accentFrom}
              accentTo={g.accentTo}
              minPlayers={g.minPlayers}
              maxPlayers={g.maxPlayers}
              duration={g.duration}
              emoji={g.emoji}
            />
          ))}
          <GameCard
            href="/ideas"
            title="Propose un jeu"
            tagline="Une idée géniale ? Balance-la, vote pour celles des autres."
            status="cta"
            accentFrom="#10b981"
            accentTo="#84cc16"
            emoji="💡"
          />
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold sm:text-2xl">Tu veux ajouter ton jeu ?</h2>
              <p className="mt-1 text-sm text-[color:var(--color-fg-muted)]">
                Crée un package dans <code>packages/games/&lt;ton-jeu&gt;</code>, implémente
                l&apos;interface <code>GameRoom</code>, et enregistre-le dans le registre serveur.
              </p>
            </div>
            <Button asChild variant="accent" size="lg">
              <Link href="/ideas">Boîte à idées →</Link>
            </Button>
          </div>
        </section>

      </main>
      <SiteFooter />
    </div>
  );
}

function MeStrip({
  me,
  totalWins,
  recent,
}: {
  me: { slug: string; nickname: string };
  totalWins: number;
  recent: Array<{
    id: string;
    gameType: string;
    roomCode: string;
    outcome: 'won' | 'lost' | 'draw';
    playedAt: Date;
  }>;
}) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={`/profile/${me.slug}`} className="flex items-center gap-3">
          <Avatar seed={me.slug} size={40} />
          <div>
            <div className="text-sm">
              Salut <strong>{me.nickname}</strong>
            </div>
            <div className="text-xs text-[color:var(--color-fg-muted)]">@{me.slug}</div>
          </div>
        </Link>
        <span className="ml-auto rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          {totalWins} win{totalWins !== 1 ? 's' : ''}
        </span>
      </div>
      {recent.length > 0 ? (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
            Tes 3 dernières parties
          </div>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {recent.map((row) => {
              const { name, emoji } = gameLabel(row.gameType);
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{emoji}</span>
                    <span>{name}</span>
                  </span>
                  <OutcomePill outcome={row.outcome} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-xs text-[color:var(--color-fg-muted)]">
          Tu n&apos;as pas encore joué. Lance ta première partie ↓
        </p>
      )}
    </section>
  );
}

function AnonCta() {
  return (
    <section className="flex h-full flex-col items-start justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-sm font-semibold">Crée un compte pour suivre tes parties</h2>
        <p className="mt-1 text-xs text-[color:var(--color-fg-muted)]">
          Magic link par email, pas de mot de passe.
        </p>
      </div>
      <Button asChild variant="primary">
        <Link href="/signin">Commencer →</Link>
      </Button>
    </section>
  );
}

function OnboardingNudge() {
  return (
    <section className="flex h-full flex-col items-start justify-between gap-3 rounded-2xl border border-fuchsia-400/30 bg-fuchsia-400/[0.05] p-5 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-sm font-semibold">Termine ton profil</h2>
        <p className="mt-1 text-xs text-[color:var(--color-fg-muted)]">
          Choisis ton pseudo pour voir tes parties dans ton profil.
        </p>
      </div>
      <Button asChild variant="accent">
        <Link href="/onboarding">Continuer →</Link>
      </Button>
    </section>
  );
}

function OutcomePill({ outcome }: { outcome: 'won' | 'lost' | 'draw' }) {
  if (outcome === 'won')
    return <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 font-semibold text-emerald-300">W</span>;
  if (outcome === 'lost')
    return <span className="rounded bg-rose-400/15 px-1.5 py-0.5 font-semibold text-rose-300">L</span>;
  return <span className="rounded bg-white/10 px-1.5 py-0.5 font-semibold text-[color:var(--color-fg-muted)]">N</span>;
}
