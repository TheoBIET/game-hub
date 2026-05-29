import { afterEach, describe, expect, it } from 'vitest';
import {
  ALL_SEED_THEMES,
  loadThemePool,
  pickRandomTheme,
  setCommunityPhraseLoader,
  type SeedTheme,
} from './themes.js';

afterEach(() => setCommunityPhraseLoader(null));

describe('loadThemePool', () => {
  it('sans loader → seed statique filtré par locale', async () => {
    const pool = await loadThemePool('fr');
    expect(pool.length).toBe(ALL_SEED_THEMES.filter((t) => t.locale === 'fr').length);
    expect(pool.every((t) => t.locale === 'fr')).toBe(true);
  });

  it('avec loader → fusionne les phrases communautaires', async () => {
    const extra: SeedTheme[] = [
      { id: 'db-1', locale: 'fr', text: 'phrase communautaire', category: 'community' },
    ];
    setCommunityPhraseLoader(async () => extra);
    const pool = await loadThemePool('fr');
    expect(pool.some((t) => t.id === 'db-1')).toBe(true);
  });

  it('loader qui throw → fallback silencieux sur le seed', async () => {
    setCommunityPhraseLoader(async () => {
      throw new Error('db down');
    });
    const pool = await loadThemePool('fr');
    expect(pool.length).toBeGreaterThan(0);
  });
});

describe('pickRandomTheme', () => {
  it('évite les thèmes déjà utilisés tant que possible', () => {
    const pool: SeedTheme[] = [
      { id: 'a', locale: 'fr', text: 'A', category: 'absurd' },
      { id: 'b', locale: 'fr', text: 'B', category: 'absurd' },
    ];
    const picked = pickRandomTheme(pool, new Set(['a']));
    expect(picked.id).toBe('b');
  });

  it('repioche dans tout le pool si tout est utilisé', () => {
    const pool: SeedTheme[] = [{ id: 'a', locale: 'fr', text: 'A', category: 'absurd' }];
    const picked = pickRandomTheme(pool, new Set(['a']));
    expect(picked.id).toBe('a');
  });
});
