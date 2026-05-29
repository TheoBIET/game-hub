export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/gif', 'image/png', 'image/jpeg', 'image/webp'] as const;
export type AvatarMime = (typeof AVATAR_MIME_TYPES)[number];

const DATA_URI_RE = /^data:(image\/(?:gif|png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export type AvatarValidation =
  | { ok: true; mime: AvatarMime; bytes: number }
  | { ok: false; reason: 'wrongFormat' | 'tooLarge' };

/**
 * Validates a base64 data URI submitted as an avatar. We re-check on the
 * server because the client is untrusted: MIME, base64 shape, and decoded
 * size all need to clear the bar before we touch the DB.
 */
export function validateAvatarDataUri(dataUri: string): AvatarValidation {
  const match = DATA_URI_RE.exec(dataUri);
  if (!match) return { ok: false, reason: 'wrongFormat' };
  const mime = match[1] as AvatarMime;
  if (!AVATAR_MIME_TYPES.includes(mime)) return { ok: false, reason: 'wrongFormat' };
  const base64 = match[2]!;
  // Decoded byte length: 3 bytes per 4 base64 chars, minus padding.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  const bytes = Math.floor((base64.length * 3) / 4) - padding;
  if (bytes > AVATAR_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  return { ok: true, mime, bytes };
}
