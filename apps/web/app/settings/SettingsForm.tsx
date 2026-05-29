'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/avatar';
import { locales, type AppLocale } from '@/i18n/config';
import { APP_THEMES, type AppTheme } from '@/lib/theme';
import { updatePreferences, removeAvatar } from './actions';

type Props = {
  initialLocale: AppLocale;
  initialTheme: AppTheme;
  initialAvatar: string | null;
  avatarSeed: string;
};

type Status =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string };

export function SettingsForm({ initialLocale, initialTheme, initialAvatar, avatarSeed }: Props) {
  const t = useTranslations('settings');
  const router = useRouter();
  const [locale, setLocale] = React.useState<AppLocale>(initialLocale);
  const [theme, setTheme] = React.useState<AppTheme>(initialTheme);
  // `null` = clear, `undefined` = unchanged, string = new data URI.
  const [avatar, setAvatar] = React.useState<string | null | undefined>(undefined);
  const [preview, setPreview] = React.useState<string | null>(initialAvatar);
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });
  const fileRef = React.useRef<HTMLInputElement>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
      setStatus({ kind: 'error', message: t('avatar.wrongFormat') });
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setStatus({ kind: 'error', message: t('avatar.tooLarge') });
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setStatus({ kind: 'error', message: t('avatar.readError') });
    reader.onload = () => {
      const dataUri = String(reader.result ?? '');
      setAvatar(dataUri);
      setPreview(dataUri);
      setStatus({ kind: 'idle' });
    };
    reader.readAsDataURL(file);
  }

  async function onRemove() {
    setStatus({ kind: 'saving' });
    const res = await removeAvatar();
    if (!res.ok) {
      setStatus({ kind: 'error', message: t('saveError') });
      return;
    }
    setAvatar(undefined);
    setPreview(null);
    setStatus({ kind: 'success', message: t('avatar.removed') });
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus({ kind: 'saving' });
    const res = await updatePreferences({
      locale,
      theme,
      avatar: avatar === undefined ? undefined : avatar,
    });
    if (!res.ok) {
      const msg =
        res.error === 'tooLarge'
          ? t('avatar.tooLarge')
          : res.error === 'wrongFormat'
            ? t('avatar.wrongFormat')
            : t('saveError');
      setStatus({ kind: 'error', message: msg });
      return;
    }
    setStatus({ kind: 'success', message: t('saved') });
    setAvatar(undefined);
    router.refresh();
  }

  const saving = status.kind === 'saving';

  return (
    <form className="flex flex-col gap-8" onSubmit={onSubmit}>
      <Section heading={t('avatar.heading')} description={t('avatar.description')}>
        <div className="flex items-center gap-4">
          <Avatar seed={avatarSeed} src={preview} size={72} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {t('avatar.upload')}
            </Button>
            {preview && (
              <Button type="button" variant="ghost" size="sm" onClick={onRemove} disabled={saving}>
                {t('avatar.remove')}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_MIME_TYPES.join(',')}
              className="hidden"
              onChange={onPickFile}
            />
          </div>
        </div>
      </Section>

      <Section heading={t('language.heading')} description={t('language.description')}>
        <RadioGroup
          name="locale"
          value={locale}
          onChange={(v) => setLocale(v as AppLocale)}
          options={locales.map((l) => ({ value: l, label: t(`language.${l}`) }))}
        />
      </Section>

      <Section heading={t('theme.heading')} description={t('theme.description')}>
        <RadioGroup
          name="theme"
          value={theme}
          onChange={(v) => setTheme(v as AppTheme)}
          options={APP_THEMES.map((th) => ({ value: th, label: t(`theme.${th}`) }))}
        />
      </Section>

      <div className="flex items-center justify-between gap-3">
        <p
          role="status"
          aria-live="polite"
          className={
            status.kind === 'error'
              ? 'text-sm text-[color:var(--color-danger-500)]'
              : status.kind === 'success'
                ? 'text-sm text-[color:var(--color-success-500)]'
                : 'text-sm text-[color:var(--color-fg-muted)]'
          }
        >
          {status.kind === 'error' || status.kind === 'success' ? status.message : ''}
        </p>
        <Button type="submit" variant="primary" size="md" disabled={saving}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

function Section({
  heading,
  description,
  children,
}: {
  heading: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-lg font-bold">{heading}</h2>
        <p className="text-xs text-[color:var(--color-fg-muted)]">{description}</p>
      </div>
      {children}
    </section>
  );
}

function RadioGroup({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <label
            key={opt.value}
            className={
              'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ' +
              (active
                ? 'border-[color:var(--color-primary-500)] bg-[color:var(--color-primary-500)]/15 text-[color:var(--color-fg)]'
                : 'border-white/10 bg-white/[0.02] text-[color:var(--color-fg-muted)] hover:bg-white/[0.06]')
            }
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="sr-only"
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
}
