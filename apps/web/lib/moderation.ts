const PROFANITY = ['putain', 'salaud', 'connard', 'enculé']; // remplacer par un vrai modérateur plus tard

export function looksAbusive(text: string): boolean {
  const t = text.toLowerCase();
  return PROFANITY.some((w) => t.includes(w));
}
