export const APP_THEMES = ['light', 'dark', 'system'] as const;
export type AppTheme = (typeof APP_THEMES)[number];

export const THEME_COOKIE = 'tabswitch_theme';

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === 'string' && (APP_THEMES as readonly string[]).includes(value);
}
