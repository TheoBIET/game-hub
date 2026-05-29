'use client';

import * as React from 'react';
import type { AppTheme } from '@/lib/theme';

type Props = { theme: AppTheme };

/**
 * Keeps `<html data-theme>` in sync when the user picks "system" — flips
 * between `light` and `dark` based on the OS preference. For explicit
 * `light` / `dark` the server already set the right attribute, but we
 * still write it on mount to recover from cookie/auth drift.
 */
export function ThemeSync({ theme }: Props) {
  React.useEffect(() => {
    const root = document.documentElement;
    if (theme !== 'system') {
      root.dataset.theme = theme;
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      root.dataset.theme = media.matches ? 'light' : 'dark';
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return null;
}
