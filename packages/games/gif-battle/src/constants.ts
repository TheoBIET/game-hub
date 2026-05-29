export const MIN_PLAYERS_TO_START = 3;
export const MAX_PLAYERS = 10;

export const PICK_SECONDS_OPTIONS = [30, 45, 60] as const;
export const VOTE_SECONDS_OPTIONS = [20, 30, 45] as const;
export const ROUNDS_OPTIONS = [3, 5, 8, 10, 15, 20] as const;

export const DEFAULTS = {
  rounds: 10 as const,
  pickSeconds: 45 as const,
  voteSeconds: 30 as const,
  introSeconds: 3,
  preRevealSeconds: 1.5,
  revealStaggerMsPerCard: 120,
  resultsSeconds: 8,
} as const;

export const LATE_SUBMISSION_GRACE_MS = 200;

export const SCORE = {
  pointsPerVote: 100,
  winnerBonus: 50,
  underdogBonus: 25,
  shutoutBonus: 50,
  zeroVotePity: 10,
  streakMin: 2,
} as const;

export const REACTION_EMOJIS = ['sparkles', 'laugh', 'skull', 'fire', 'cry', 'clown'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export const GIF_HOST_ALLOWLIST = [
  'media.tenor.com',
  'media1.tenor.com',
  'media2.tenor.com',
  'c.tenor.com',
  'media.giphy.com',
  'i.giphy.com',
  'media0.giphy.com',
  'media1.giphy.com',
  'media2.giphy.com',
  'media3.giphy.com',
  'media4.giphy.com',
] as const;

export const TROPHY_KEYS = [
  'mvp',
  'speed_demon',
  'last_but_best',
  'sniper',
  'bottom_tier',
  'underdog_magic',
] as const;
export type TrophyKey = (typeof TROPHY_KEYS)[number];
