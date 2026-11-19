// The breaking-news banner's languages (Panel 3, M1; design §2 and §3, approved 19 Nov 2026). An
// item is for English, for Hindi, or for both (null). A Desk Editor sets their own language's items;
// an item for both languages is site-wide, so only an unscoped grant sets it (question 4). Client-safe:
// the reader's banner, the admin's manager and the routes all read it.

export const BANNER_LANGUAGES = ["en", "hi"] as const;
export type BannerLanguage = (typeof BANNER_LANGUAGES)[number];

export const isBannerLanguage = (value: unknown): value is BannerLanguage => value === "en" || value === "hi";

/** The banner's label, in the reader's language. */
export const BANNER_LABEL: Record<BannerLanguage, string> = { en: "BREAKING", hi: "ब्रेकिंग न्यूज़" };

/** What an item is for, as the back office says it. */
export const bannerLanguageName = (language: BannerLanguage | null) =>
  language === "en" ? "English" : language === "hi" ? "Hindi" : "Both languages";

/** Whether a reader of `language` sees an item: its own language's items and those for both. */
export const bannerShows = (item: { language: BannerLanguage | null }, language: BannerLanguage) =>
  item.language === null || item.language === language;
