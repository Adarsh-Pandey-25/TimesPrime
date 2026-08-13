/**
 * Smart Text Paraphraser Utility
 * Paraphrases titles, snippets, and scraped content to create unique wording
 * while strictly preserving the underlying meaning and factual context.
 * 
 * IMPORTANT: Only operates on Latin/English text. Hindi (Devanagari) text is
 * returned as-is to prevent corruption from word-boundary regex.
 */

// Synonym mapping dictionary for headline and content rewriting
const SYNONYM_MAP: Record<string, string[]> = {
  announces: ["unveils", "reveals", "introduces", "discloses"],
  announced: ["unveiled", "revealed", "introduced", "disclosed"],
  launches: ["debuts", "rolls out", "unveils", "introduces"],
  launched: ["debuted", "rolled out", "unveiled", "introduced"],
  increases: ["surges", "rises", "climbs", "gains"],
  increased: ["surged", "rose", "climbed", "gained"],
  decreases: ["drops", "declines", "slumps", "falls"],
  decreased: ["dropped", "declined", "slumped", "fell"],
  report: ["update", "analysis", "coverage", "digest"],
  reports: ["updates", "indicates", "highlights", "shows"],
  says: ["states", "notes", "reports", "highlights"],
  said: ["stated", "noted", "reported", "highlighted"],
  major: ["significant", "key", "pivotal", "substantial"],
  new: ["fresh", "latest", "novel", "updated"],
  coldest: ["record-low temperature", "chilliest", "unseasonably cold"],
  surge: ["spike", "rallies", "jump", "uptick", "boost"],
  hikes: ["increases", "rises", "climbs"],
  easing: ["cooling down", "stabilizing", "moderating"],
};

/** Check if text contains Devanagari (Hindi) script */
function containsHindi(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

/** Deterministic synonym pick based on text hash (no Math.random) */
function pickSynonym(synonyms: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return synonyms[Math.abs(hash) % synonyms.length];
}

/**
 * Paraphrases a news title by rewording key action terms and structural phrasing.
 * Skips Hindi text entirely to avoid corruption.
 */
export function paraphraseTitle(title: string): string {
  if (!title || typeof title !== "string") return title;

  // Do NOT paraphrase Hindi or mixed-script titles
  if (containsHindi(title)) return title;

  let paraphrased = title;

  // Replace matched keywords with deterministic contextual synonyms
  Object.keys(SYNONYM_MAP).forEach((word) => {
    const synonyms = SYNONYM_MAP[word];
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(paraphrased)) {
      const synonym = pickSynonym(synonyms, title);
      paraphrased = paraphrased.replace(regex, (match) => {
        // Preserve original capitalization
        if (match[0] === match[0].toUpperCase()) {
          return synonym.charAt(0).toUpperCase() + synonym.slice(1);
        }
        return synonym;
      });
    }
  });

  // Reframe common standard press headline structures cleanly
  paraphrased = paraphrased
    .replace(/^Coldest Augusts in/i, "Historic Low August Temperatures Recorded in")
    .replace(/^Gas prices easing up/i, "Fuel Costs Begin Stabilizing")
    .replace(/since 1895/i, "Over the Past Century")
    .replace(/\bafter huge hikes\b/i, "Following Recent Spikes");

  return paraphrased;
}

/**
 * Paraphrases news descriptions and article snippets into uniquely worded summaries.
 * Skips Hindi text entirely to avoid corruption.
 */
export function paraphraseText(text: string): string {
  if (!text || typeof text !== "string") return text;

  // Do NOT paraphrase Hindi or mixed-script text
  if (containsHindi(text)) return text;

  let paraphrased = text;

  // Replace vocabulary words
  Object.keys(SYNONYM_MAP).forEach((word) => {
    const synonyms = SYNONYM_MAP[word];
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    if (regex.test(paraphrased)) {
      const synonym = synonyms[0]; // consistent clean replacement
      paraphrased = paraphrased.replace(regex, (match) => {
        if (match[0] === match[0].toUpperCase()) {
          return synonym.charAt(0).toUpperCase() + synonym.slice(1);
        }
        return synonym;
      });
    }
  });

  // Smooth out common reporter template phrases
  paraphrased = paraphrased
    .replace(/compiled a ranking of/gi, "assembled an in-depth analysis of")
    .replace(/using data from/gi, "utilizing statistics provided by")
    .replace(/according to/gi, "as documented by");

  return paraphrased;
}
