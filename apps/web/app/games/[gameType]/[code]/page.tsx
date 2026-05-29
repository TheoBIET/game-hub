import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { GameRoomShell } from '@/components/games/GameRoomShell';

const SUPPORTED_GAMES = ['gif-battle', 'tictactoe', 'connect4', 'rps', 'plateau'] as const;
type SupportedGame = (typeof SUPPORTED_GAMES)[number];

export default async function GameRoomPage({
  params,
}: {
  params: Promise<{ gameType: string; code: string }>;
}) {
  const { gameType, code } = await params;
  if (!(SUPPORTED_GAMES as readonly string[]).includes(gameType)) notFound();
  const cleanCode = code.toUpperCase();
  if (!/^[A-Z]{4}$/.test(cleanCode)) notFound();

  // Pre-fill the join form with the signed-in user's profile nickname so
  // logged-in players don't get asked to retype it. Falls back to empty for
  // guests or if NextAuth / DB is unavailable in dev.
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
    // signed out or auth/db unavailable — render as guest
  }

  return (
    <GameRoomShell
      gameType={gameType as SupportedGame}
      code={cleanCode}
      profileNickname={profileNickname}
    />
  );
}
