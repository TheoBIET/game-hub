'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { getDb } from '@tabswitch/db';
import { isAppLocale, LOCALE_COOKIE, type AppLocale } from '@/i18n/config';
import { isAppTheme, THEME_COOKIE, type AppTheme } from '@/lib/theme';
import { validateAvatarDataUri } from '@/lib/avatar';

export type SettingsResult = { ok: true } | { ok: false; error: SettingsError };

export type SettingsError = 'unauthorized' | 'tooLarge' | 'wrongFormat' | 'server';

type UpdateInput = {
  locale: AppLocale;
  theme: AppTheme;
  avatar?: string | null;
};

const COOKIE_OPTS = {
  path: '/',
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 24 * 365,
};

async function requireUserId(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function updatePreferences(input: UpdateInput): Promise<SettingsResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: 'unauthorized' };

  if (!isAppLocale(input.locale) || !isAppTheme(input.theme)) {
    return { ok: false, error: 'wrongFormat' };
  }

  let avatar: string | null | undefined = input.avatar;
  if (typeof avatar === 'string' && avatar.length > 0) {
    const v = validateAvatarDataUri(avatar);
    if (!v.ok) return { ok: false, error: v.reason };
  } else if (avatar === '') {
    avatar = null;
  }

  try {
    const db = getDb();
    await db.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        locale: input.locale,
        theme: input.theme,
        avatar: avatar ?? null,
      },
      update: {
        locale: input.locale,
        theme: input.theme,
        ...(avatar === undefined ? {} : { avatar }),
      },
    });
  } catch (err) {
    console.error('[settings] persist failed', err);
    return { ok: false, error: 'server' };
  }

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, input.locale, COOKIE_OPTS);
  jar.set(THEME_COOKIE, input.theme, COOKIE_OPTS);

  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true };
}

export async function removeAvatar(): Promise<SettingsResult> {
  const userId = await requireUserId();
  if (!userId) return { ok: false, error: 'unauthorized' };
  try {
    const db = getDb();
    await db.userSettings.upsert({
      where: { userId },
      create: { userId, avatar: null },
      update: { avatar: null },
    });
  } catch (err) {
    console.error('[settings] remove avatar failed', err);
    return { ok: false, error: 'server' };
  }
  revalidatePath('/settings');
  revalidatePath('/');
  return { ok: true };
}
