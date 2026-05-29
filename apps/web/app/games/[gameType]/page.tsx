import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { CreateRoomForm } from '@/components/games/CreateRoomForm';
import { HubNav } from '@/components/hub/HubNav';
import { gameLabel } from '@/lib/constants';

const SUPPORTED_GAMES = ['gif-battle', 'tictactoe', 'connect4', 'rps', 'plateau'] as const;
type SupportedGame = (typeof SUPPORTED_GAMES)[number];

export default async function GameLanding({
  params,
}: {
  params: Promise<{ gameType: string }>;
}) {
  const { gameType } = await params;
  if (!(SUPPORTED_GAMES as readonly string[]).includes(gameType)) {
    notFound();
  }

  // Pre-fill (and lock) the nickname for signed-in users.
  let profileNickname = '';
  try {
    const session = await auth();
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (userId) {
      const db = getDb();
      const me = await db.user.findUnique({
        where: { id: userId },
        select: { nickname: true },
      });
      profileNickname = me?.nickname ?? '';
    }
  } catch {
    // auth/db unavailable — render as guest
  }

  const meta = gameLabel(gameType);

  return (
    <>
      <HubNav />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-8 px-4 py-10">
        <header>
          <div className="text-3xl" aria-hidden>
            {meta.emoji}
          </div>
          <h1 className="font-display mt-1 text-3xl font-bold sm:text-4xl">
            Créer une room — {meta.name}
          </h1>
          <p className="mt-2 text-sm text-[color:var(--color-fg-muted)]">
            On te crée la room et tu n&apos;auras plus qu&apos;à partager le code.
          </p>
        </header>
        <CreateRoomForm gameType={gameType as SupportedGame} profileNickname={profileNickname} />
      </main>
    </>
  );
}
