import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { auth, signOut } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/hub/Logo';
import { UserMenu } from '@/components/hub/UserMenu';
import { OnlineCount } from '@/components/social/OnlineCount';

export async function HubNav() {
  const session = await auth();
  const user = session?.user as
    | { id?: string; email?: string | null; nickname?: string | null }
    | undefined;

  let profile: { nickname: string; slug: string | null; avatar: string | null } | null = null;
  if (user?.id) {
    const db = getDb();
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: {
        nickname: true,
        slug: true,
        settings: { select: { avatar: true } },
      },
    });
    const nickname = row?.nickname || user.nickname || user.email || 'Moi';
    profile = {
      nickname,
      slug: row?.slug ?? null,
      avatar: row?.settings?.avatar ?? null,
    };
  }

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  const t = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[color:var(--color-bg-950)]/70 backdrop-blur-xl">
      <nav className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-500)]"
          aria-label="TabSwitch — accueil"
        >
          <Logo />
        </Link>

        <div className="flex items-center gap-3">
          <OnlineCount />
          {profile ? (
            <UserMenu
              nickname={profile.nickname}
              slug={profile.slug}
              avatar={profile.avatar}
              signOutAction={signOutAction}
              labels={{
                menu: t('accountMenu'),
                profile: t('profile'),
                ideas: t('ideas'),
                settings: t('settings'),
                signout: t('signout'),
              }}
            />
          ) : (
            <Button asChild variant="primary" size="sm">
              <Link href="/signin">{t('signin')}</Link>
            </Button>
          )}
        </div>
      </nav>
    </header>
  );
}
