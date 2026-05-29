const PROFANITY = ['putain', 'salaud', 'connard', 'enculé']; // remplacer par un vrai modérateur plus tard

export function looksAbusive(text: string): boolean {
  const t = text.toLowerCase();
  return PROFANITY.some((w) => t.includes(w));
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 160);
}
