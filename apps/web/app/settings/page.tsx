import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { Card } from '@/components/ui/Card';
import { HubNav } from '@/components/hub/HubNav';
import { SiteFooter } from '@/components/hub/SiteFooter';
import { defaultLocale, isAppLocale } from '@/i18n/config';
import { isAppTheme } from '@/lib/theme';
import { SettingsForm } from './SettingsForm';

export const metadata = {
  title: 'Paramètres — TabSwitch',
};

export default async function SettingsPage() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) redirect('/signin?callbackUrl=/settings');

  const db = getDb();
  const [user, settings] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { nickname: true, slug: true },
    }),
    db.userSettings.findUnique({
      where: { userId },
      select: { locale: true, theme: true, avatar: true },
    }),
  ]);

  const t = await getTranslations('settings');
  const fallbackSeed = user?.slug || user?.nickname || userId;

  return (
    <div className="flex min-h-dvh flex-col">
      <HubNav />
      <main className="relative z-10 mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-10">
        <header>
          <h1 className="font-display text-3xl font-extrabold">{t('title')}</h1>
          <p className="mt-1 text-sm text-[color:var(--color-fg-muted)]">{t('subtitle')}</p>
        </header>
        <Card>
          <SettingsForm
            initialLocale={isAppLocale(settings?.locale) ? settings.locale : defaultLocale}
            initialTheme={isAppTheme(settings?.theme) ? settings.theme : 'system'}
            initialAvatar={settings?.avatar ?? null}
            avatarSeed={fallbackSeed}
          />
        </Card>
      </main>
      <SiteFooter />
    </div>
  );
}
