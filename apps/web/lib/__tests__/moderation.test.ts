import { describe, expect, it } from 'vitest';
import { looksAbusive, slugify } from '../moderation';

describe('looksAbusive', () => {
  it('détecte la profanité (insensible à la casse)', () => {
    expect(looksAbusive('espèce de CONNARD')).toBe(true);
  });
  it('laisse passer un texte sain', () => {
    expect(looksAbusive('quand le chat fait tomber le verre')).toBe(false);
  });
});

describe('slugify', () => {
  it('normalise accents/espaces/casse', () => {
    expect(slugify('Quand Mamie Découvre  ChatGPT')).toBe('quand-mamie-decouvre-chatgpt');
  });
});
