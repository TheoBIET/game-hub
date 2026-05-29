import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { isAppTheme, THEME_COOKIE, type AppTheme } from '@/lib/theme';
import { ThemeSync } from '@/components/hub/ThemeSync';
import './globals.css';

export const metadata: Metadata = {
  title: 'TabSwitch — Hub de mini-jeux multijoueur',
  description:
    "Un hub open source de mini-jeux multijoueur. GIF Battle, Tic-Tac-Toe et plus. Architecture room-based, contributeur-friendly.",
  metadataBase: new URL('https://tabswitch.fun'),
  openGraph: {
    title: 'TabSwitch',
    description: 'Hub de mini-jeux multijoueur open source.',
    type: 'website',
  },
};

/**
 * NB: we used to refresh the tabswitch_session JWT from this Server Component,
 * but Next 15 forbids `cookies().set()` outside Server Actions / Route Handlers.
 * The JWT is now refreshed by `/api/auth/session` (POST), which the WS client
 * (`CreateRoomForm`, `GameRoomShell`) calls before opening a socket. That's
 * sufficient because the server only needs `userId` at socket-connect time.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages, theme] = await Promise.all([
    getLocale(),
    getMessages(),
    resolveTheme(),
  ]);

  return (
    <html lang={locale} data-theme={theme} suppressHydrationWarning>
      <body className="relative min-h-dvh">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeSync theme={theme} />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

async function resolveTheme(): Promise<AppTheme> {
  const session = await auth().catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (userId) {
    try {
      const db = getDb();
      const settings = await db.userSettings.findUnique({
        where: { userId },
        select: { theme: true },
      });
      if (settings?.theme && isAppTheme(settings.theme)) return settings.theme;
    } catch {
      // fall through
    }
  }
  const cookie = (await cookies()).get(THEME_COOKIE)?.value;
  if (isAppTheme(cookie)) return cookie;
  return 'system';
}
