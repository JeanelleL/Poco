// What we ask about the child, and how Poco turns each answer into behavior.
// Rule: only ask for something if it changes what Poco does.

export type Pronouns = 'he / him' | 'she / her' | 'they / them';
export const PRONOUNS: readonly Pronouns[] = ['he / him', 'she / her', 'they / them'];

export function objectPronoun(p: Pronouns): string {
  return p === 'he / him' ? 'him' : p === 'she / her' ? 'her' : 'them';
}

/** Tag question Poco adds when talking about the child: "Maya looks happy, doesn't she?" */
export function tagQuestion(p: Pronouns): string {
  return p === 'he / him' ? "doesn't he" : p === 'she / her' ? "doesn't she" : "don't they";
}

/** "trains, dinosaurs and Bluey" -> ["trains", "dinosaurs", "Bluey"] */
export function splitList(text: string): string[] {
  return text
    .split(/,|;|\n|&|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ---------- Favorite things ---------- */

// Everyday nouns that read better lowercase mid-sentence ("Trains" -> "trains").
// Anything else (e.g. "Bluey") stays as typed.
const COMMON_FAVORITES = ['trains', 'animals', 'dinosaurs', 'music', 'space', 'cars', 'dogs', 'cats', 'drawing'];

/** First favorite, ready to drop into a sentence, or null if none given. */
export function firstFavorite(text: string): string | null {
  const fav = splitList(text)[0];
  if (!fav) return null;
  return COMMON_FAVORITES.includes(fav.toLowerCase()) ? fav.toLowerCase() : fav;
}

/* ---------- Calming strategies ---------- */

const CALMING_KEYWORDS: [RegExp, string][] = [
  [/breath/i, 'take deep breaths'],
  [/count/i, 'count slowly to five'],
  [/quiet|alone|break/i, 'have some quiet time'],
  [/song|music|sing/i, 'listen to a favorite song'],
  [/squeez|fidget|stress ball/i, 'squeeze something soft'],
];

/** Verb phrase for "When I feel upset, I ___.", from the first strategy given. Null if none. */
export function calmingPhrase(text: string): string | null {
  const first = splitList(text)[0];
  if (!first) return null;
  const known = CALMING_KEYWORDS.find(([re]) => re.test(first));
  if (known) return known[1];
  return `try ${first.charAt(0).toLowerCase()}${first.slice(1)}`;
}
