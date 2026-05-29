import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { defaultLocale, isAppLocale, LOCALE_COOKIE } from './config';

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  const messages = (await import(`../messages/${locale}.json`)).default;
  return { locale, messages };
});

async function resolveLocale() {
  const session = await auth().catch(() => null);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (userId) {
    try {
      const db = getDb();
      const settings = await db.userSettings.findUnique({
        where: { userId },
        select: { locale: true },
      });
      if (settings?.locale && isAppLocale(settings.locale)) return settings.locale;
    } catch {
      // Fall through to cookie / default.
    }
  }
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isAppLocale(cookie)) return cookie;
  return defaultLocale;
}
