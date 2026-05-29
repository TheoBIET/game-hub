import { notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { HubNav } from '@/components/hub/HubNav';
import { SiteFooter } from '@/components/hub/SiteFooter';
import { gameLabel, HISTORY_PAGE_SIZE } from '@/lib/constants';
import { FollowButton } from './FollowButton';

export const metadata = {
  title: 'Profil — TabSwitch',
};

export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? '1') | 0);

  const db = getDb();
  const target = await db.user.findUnique({
    where: { slug },
    select: {
      id: true,
      nickname: true,
      slug: true,
      createdAt: true,
      settings: { select: { avatar: true } },
    },
  });
  if (!target || !target.nickname || !target.slug) notFound();

  const session = await auth();
  const viewerId = (session?.user as { id?: string } | undefined)?.id;
  const isSelf = viewerId === target.id;

  const [history, totalHistory, winsByGame, followersCount, followingCount, isFollowing] =
    await Promise.all([
      db.gameSession.findMany({
        where: { userId: target.id },
        orderBy: { playedAt: 'desc' },
        skip: (page - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
      }),
      db.gameSession.count({ where: { userId: target.id } }),
      db.gameSession.groupBy({
        by: ['gameType'],
        where: { userId: target.id, outcome: 'won' },
        _count: { _all: true },
      }),
      db.follow.count({ where: { followingId: target.id } }),
      db.follow.count({ where: { followerId: target.id } }),
      viewerId && !isSelf
        ? db.follow
            .findUnique({
              where: { followerId_followingId: { followerId: viewerId, followingId: target.id } },
              select: { followerId: true },
            })
            .then((r) => !!r)
        : Promise.resolve(false),
    ]);

  const totalPages = Math.max(1, Math.ceil(totalHistory / HISTORY_PAGE_SIZE));

  return (
    <div className="flex min-h-dvh flex-col">
      <HubNav />
      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
        <ProfileHeader
          nickname={target.nickname}
          slug={target.slug}
          avatar={target.settings?.avatar ?? null}
          createdAt={target.createdAt}
          followersCount={followersCount}
          followingCount={followingCount}
          showFollow={!!viewerId && !isSelf}
          isFollowing={isFollowing}
        />
        <WinsSection winsByGame={winsByGame} />
        <HistorySection rows={history} page={page} totalPages={totalPages} slug={target.slug} />
      </main>
      <SiteFooter />
    </div>
  );
}

function ProfileHeader({
  nickname,
  slug,
  avatar,
  createdAt,
  followersCount,
  followingCount,
  showFollow,
  isFollowing,
}: {
  nickname: string;
  slug: string;
  avatar: string | null;
  createdAt: Date;
  followersCount: number;
  followingCount: number;
  showFollow: boolean;
  isFollowing: boolean;
}) {
  const joined = new Intl.DateTimeFormat('fr', { month: 'long', year: 'numeric' }).format(createdAt);
  const nf = new Intl.NumberFormat('fr');
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar seed={slug} src={avatar} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-extrabold">{nickname}</h1>
          <p className="truncate text-sm text-[color:var(--color-fg-muted)]">@{slug}</p>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-[color:var(--color-fg-dim)]">
            Membre depuis {joined}
          </p>
        </div>
        {showFollow && <FollowButton slug={slug} initiallyFollowing={isFollowing} />}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:max-w-xs">
        <Stat label="Followers" value={nf.format(followersCount)} />
        <Stat label="Following" value={nf.format(followingCount)} />
      </dl>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
      <dd className="font-display text-2xl font-extrabold tabular-nums leading-none">{value}</dd>
      <dt className="mt-1 text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
        {label}
      </dt>
    </div>
  );
}

function WinsSection({
  winsByGame,
}: {
  winsByGame: Array<{ gameType: string; _count: { _all: number } }>;
}) {
  if (winsByGame.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">Wins</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {winsByGame.map((w) => {
          const { name, emoji } = gameLabel(w.gameType);
          return (
            <span
              key={w.gameType}
              className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-sm"
            >
              {emoji} {name} · <strong>{w._count._all}</strong>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function HistorySection({
  rows,
  page,
  totalPages,
  slug,
}: {
  rows: Array<{
    id: string;
    gameType: string;
    roomCode: string;
    outcome: 'won' | 'lost' | 'draw';
    playedAt: Date;
  }>;
  page: number;
  totalPages: number;
  slug: string;
}) {
  if (rows.length === 0) {
    return (
      <section>
        <h2 className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
          Historique
        </h2>
        <p className="mt-2 text-sm text-[color:var(--color-fg-muted)]">
          Aucune partie jouée pour le moment.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-[color:var(--color-fg-muted)]">
        Historique
      </h2>
      <ul className="mt-2 flex flex-col gap-2">
        {rows.map((row) => {
          const { name, emoji } = gameLabel(row.gameType);
          const when = new Intl.DateTimeFormat('fr', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          }).format(row.playedAt);
          return (
            <li
              key={row.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden>{emoji}</span>
                <span className="font-medium">{name}</span>
                <span className="text-[color:var(--color-fg-muted)]">· room {row.roomCode}</span>
              </span>
              <span className="flex items-center gap-3">
                <OutcomeBadge outcome={row.outcome} />
                <span className="text-xs text-[color:var(--color-fg-muted)]">{when}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {totalPages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-xs">
          {page > 1 ? (
            <Link
              href={`/profile/${slug}?page=${page - 1}`}
              className="text-[color:var(--color-fg-muted)] hover:text-white"
            >
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[color:var(--color-fg-muted)]">
            Page {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={`/profile/${slug}?page=${page + 1}`}
              className="text-[color:var(--color-fg-muted)] hover:text-white"
            >
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

function OutcomeBadge({ outcome }: { outcome: 'won' | 'lost' | 'draw' }) {
  if (outcome === 'won') {
    return (
      <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-semibold text-emerald-300">
        Gagné
      </span>
    );
  }
  if (outcome === 'lost') {
    return (
      <span className="rounded-full bg-rose-400/15 px-2 py-0.5 text-xs font-semibold text-rose-300">
        Perdu
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-[color:var(--color-fg-muted)]">
      Nul
    </span>
  );
}
