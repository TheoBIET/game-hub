import { describe, expect, it } from 'vitest';
import { DEFAULTS, ROUNDS_OPTIONS } from './constants.js';

describe('rounds config', () => {
  it('propose 10 manches', () => {
    expect(ROUNDS_OPTIONS).toContain(10);
  });
  it('défaut à 10 manches', () => {
    expect(DEFAULTS.rounds).toBe(10);
  });
});
