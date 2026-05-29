import type { Locale } from './state.js';

export interface SeedTheme {
  id: string;
  locale: Locale;
  text: string;
  category: 'tech' | 'work' | 'family' | 'internet' | 'absurd' | 'meta' | 'community';
}

export const SEED_THEMES_FR: SeedTheme[] = [
  { id: 'fr-001', locale: 'fr', text: 'quand le dev push sur main le vendredi', category: 'tech' },
  { id: 'fr-002', locale: 'fr', text: 'moi devant les impôts', category: 'absurd' },
  { id: 'fr-003', locale: 'fr', text: 'quand mamie découvre ChatGPT', category: 'family' },
  { id: 'fr-004', locale: 'fr', text: 'la tête du support quand tu dis "ça marche chez moi"', category: 'tech' },
  { id: 'fr-005', locale: 'fr', text: 'réunion Teams à 8h58', category: 'work' },
  { id: 'fr-006', locale: 'fr', text: 'quand tu vois 47 unread Slack au réveil', category: 'work' },
  { id: 'fr-007', locale: 'fr', text: 'le PO qui dit "ce sera rapide"', category: 'work' },
  { id: 'fr-008', locale: 'fr', text: 'toi à la fin d\'un sprint review', category: 'work' },
  { id: 'fr-009', locale: 'fr', text: 'quand le designer dit "petit tweak"', category: 'work' },
  { id: 'fr-010', locale: 'fr', text: 'moi quand le linter passe au premier coup', category: 'tech' },
  { id: 'fr-011', locale: 'fr', text: 'le scrum master qui demande "et toi cette semaine ?"', category: 'work' },
  { id: 'fr-012', locale: 'fr', text: 'quand le client envoie un mail à 17h59', category: 'work' },
  { id: 'fr-013', locale: 'fr', text: 'toi devant le bouton "deploy to prod"', category: 'tech' },
  { id: 'fr-014', locale: 'fr', text: 'la team data quand on parle de RGPD', category: 'tech' },
  { id: 'fr-015', locale: 'fr', text: 'le stagiaire à son premier code review', category: 'tech' },
  { id: 'fr-016', locale: 'fr', text: 'quand Cursor te propose une suggestion absurde', category: 'tech' },
  { id: 'fr-017', locale: 'fr', text: 'ta tête quand la CI passe vert', category: 'tech' },
  { id: 'fr-018', locale: 'fr', text: 'la review en visio sans caméra', category: 'work' },
  { id: 'fr-019', locale: 'fr', text: 'ton chat quand tu fais standup', category: 'absurd' },
  { id: 'fr-020', locale: 'fr', text: 'la team marketing qui découvre les analytics', category: 'work' },
  { id: 'fr-021', locale: 'fr', text: 'moi en open space à 16h59 le vendredi', category: 'work' },
  { id: 'fr-022', locale: 'fr', text: 'quand t\'ouvres ton PR avec 47 conflits', category: 'tech' },
  { id: 'fr-023', locale: 'fr', text: 'la réaction quand l\'IA hallucine ta réponse', category: 'tech' },
  { id: 'fr-024', locale: 'fr', text: 'toi en visio quand on te demande de "te présenter"', category: 'work' },
  { id: 'fr-025', locale: 'fr', text: 'quand le wifi coupe en pleine démo', category: 'absurd' },
  { id: 'fr-026', locale: 'fr', text: 'la team RH quand tu poses 3 semaines en août', category: 'work' },
  { id: 'fr-027', locale: 'fr', text: 'ta réaction quand le test E2E flake encore', category: 'tech' },
  { id: 'fr-028', locale: 'fr', text: 'moi devant un Notion avec 47 sous-pages', category: 'work' },
  { id: 'fr-029', locale: 'fr', text: 'quand quelqu\'un dit "petit point de 5 min"', category: 'work' },
  { id: 'fr-030', locale: 'fr', text: 'la dev qui découvre useEffect a 4 dépendances', category: 'tech' },
  { id: 'fr-031', locale: 'fr', text: 'mon visage quand npm install dure 12 minutes', category: 'tech' },
  { id: 'fr-032', locale: 'fr', text: 'quand t\'arrives en retard à ta soutenance Zoom', category: 'absurd' },
  { id: 'fr-033', locale: 'fr', text: 'tonton qui débat de l\'IA au repas de Noël', category: 'family' },
  { id: 'fr-034', locale: 'fr', text: 'la team prod quand y a une alerte à 3h du mat', category: 'tech' },
  { id: 'fr-035', locale: 'fr', text: 'toi en réunion quand on parle de "synergies"', category: 'work' },
  { id: 'fr-036', locale: 'fr', text: 'quand le boss dit "on va faire simple"', category: 'work' },
  { id: 'fr-037', locale: 'fr', text: 'ta réaction quand un junior optimise prématurément', category: 'tech' },
  { id: 'fr-038', locale: 'fr', text: 'moi quand quelqu\'un push sans tester', category: 'tech' },
  { id: 'fr-039', locale: 'fr', text: 'le designer face à l\'implémentation finale', category: 'work' },
  { id: 'fr-040', locale: 'fr', text: 'quand t\'expliques git rebase à quelqu\'un', category: 'tech' },
];

export const SEED_THEMES_EN: SeedTheme[] = [
  { id: 'en-001', locale: 'en', text: 'when the dev pushes to main on Friday', category: 'tech' },
  { id: 'en-002', locale: 'en', text: 'me at 9am Monday morning', category: 'work' },
  { id: 'en-003', locale: 'en', text: 'when grandma discovers ChatGPT', category: 'family' },
  { id: 'en-004', locale: 'en', text: 'the support team when you say "works on my machine"', category: 'tech' },
  { id: 'en-005', locale: 'en', text: 'Teams meeting at 8:58 AM', category: 'work' },
  { id: 'en-006', locale: 'en', text: 'when you see 47 unread Slacks at wake-up', category: 'work' },
  { id: 'en-007', locale: 'en', text: 'PM saying "this will be quick"', category: 'work' },
  { id: 'en-008', locale: 'en', text: 'you at the end of sprint review', category: 'work' },
  { id: 'en-009', locale: 'en', text: 'when the designer says "small tweak"', category: 'work' },
  { id: 'en-010', locale: 'en', text: 'me when the linter passes first try', category: 'tech' },
];

export const ALL_SEED_THEMES: SeedTheme[] = [...SEED_THEMES_FR, ...SEED_THEMES_EN];

/** Loader optionnel injecté par le serveur pour charger les phrases de la DB. */
export type CommunityPhraseLoader = (locale: Locale) => Promise<SeedTheme[]>;

let communityLoader: CommunityPhraseLoader | null = null;

/** Branché une fois au boot serveur. `null` désactive (tests / dev sans DB). */
export function setCommunityPhraseLoader(fn: CommunityPhraseLoader | null): void {
  communityLoader = fn;
}

/**
 * Pool de thèmes pour une locale : seed statique + phrases communautaires
 * (si un loader est branché). Tout échec du loader retombe sur le seed seul.
 */
export async function loadThemePool(locale: Locale): Promise<SeedTheme[]> {
  const base = ALL_SEED_THEMES.filter((t) => t.locale === locale);
  if (!communityLoader) return base;
  try {
    const community = await communityLoader(locale);
    return [...base, ...community];
  } catch {
    return base;
  }
}

/** Pioche un thème dans `pool`, en évitant `alreadyUsed` tant que possible. */
export function pickRandomTheme(pool: SeedTheme[], alreadyUsed: ReadonlySet<string>): SeedTheme {
  const fresh = pool.filter((t) => !alreadyUsed.has(t.id));
  const candidates = fresh.length > 0 ? fresh : pool;
  return candidates[Math.floor(Math.random() * candidates.length)]!;
}
