import {
  CATEGORY_MAP,
  mapCategory,
  containsHindiScript,
  containsNonLatinIndicScript,
  filterArticlesByLanguageScript,
  dedupeArticlesByTitle,
} from "./newsConfig";
import { Article } from "@/types";

function makeArticle(overrides: Partial<Article> & Pick<Article, "article_id" | "title">): Article {
  return {
    link: "https://example.com",
    pubDate: new Date().toISOString(),
    ...overrides,
  };
}

describe("CATEGORY_MAP / mapCategory", () => {
  it("contains the expected category keys", () => {
    for (const key of [
      "general",
      "tech",
      "technology",
      "business",
      "sports",
      "entertainment",
      "science",
      "health",
      "politics",
      "world",
    ]) {
      expect(CATEGORY_MAP).toHaveProperty(key);
    }
  });

  it("maps 'general' to NewsData.io's 'top' category", () => {
    expect(mapCategory("general")).toBe("top");
  });

  it("maps both 'tech' and 'technology' to the same NewsData.io category", () => {
    expect(mapCategory("tech")).toBe("technology");
    expect(mapCategory("technology")).toBe("technology");
  });

  it("is case-insensitive", () => {
    expect(mapCategory("TECH")).toBe("technology");
  });

  it("passes through an unrecognized category unchanged", () => {
    expect(mapCategory("some-unmapped-category")).toBe("some-unmapped-category");
  });
});

describe("containsHindiScript", () => {
  it("correctly identifies Devanagari text", () => {
    expect(containsHindiScript("यह एक हिंदी वाक्य है")).toBe(true);
  });

  it("correctly passes Latin text (returns false)", () => {
    expect(containsHindiScript("This is an English sentence")).toBe(false);
  });

  it("handles null/undefined/empty input safely", () => {
    expect(containsHindiScript(null)).toBe(false);
    expect(containsHindiScript(undefined)).toBe(false);
    expect(containsHindiScript("")).toBe(false);
  });
});

describe("containsNonLatinIndicScript", () => {
  it("detects Devanagari (Hindi)", () => {
    expect(containsNonLatinIndicScript("यह एक हिंदी वाक्य है")).toBe(true);
  });

  it("detects Odia", () => {
    expect(containsNonLatinIndicScript("ପ୍ରଧାନମନ୍ତ୍ରୀଙ୍କୁ ଭେଟିଲେ")).toBe(true);
  });

  it("detects Bengali, Tamil, Telugu, Kannada, Malayalam, Gujarati, and Gurmukhi", () => {
    expect(containsNonLatinIndicScript("এটি একটি বাংলা বাক্য")).toBe(true); // Bengali
    expect(containsNonLatinIndicScript("இது ஒரு தமிழ் வாக்கியம்")).toBe(true); // Tamil
    expect(containsNonLatinIndicScript("ఇది ఒక తెలుగు వాక్యం")).toBe(true); // Telugu
    expect(containsNonLatinIndicScript("ಇದು ಒಂದು ಕನ್ನಡ ವಾಕ್ಯ")).toBe(true); // Kannada
    expect(containsNonLatinIndicScript("ഇത് ഒരു മലയാളം വാചകമാണ്")).toBe(true); // Malayalam
    expect(containsNonLatinIndicScript("આ એક ગુજરાતી વાક્ય છે")).toBe(true); // Gujarati
    expect(containsNonLatinIndicScript("ਇਹ ਇੱਕ ਪੰਜਾਬੀ ਵਾਕ ਹੈ")).toBe(true); // Gurmukhi/Punjabi
  });

  it("returns false for pure Latin text", () => {
    expect(containsNonLatinIndicScript("This is an English sentence")).toBe(false);
  });

  it("handles null/undefined/empty input safely", () => {
    expect(containsNonLatinIndicScript(null)).toBe(false);
    expect(containsNonLatinIndicScript(undefined)).toBe(false);
    expect(containsNonLatinIndicScript("")).toBe(false);
  });
});

describe("filterArticlesByLanguageScript", () => {
  const articles = [
    makeArticle({ article_id: "1", title: "English Headline" }),
    makeArticle({ article_id: "2", title: "हिंदी समाचार शीर्षक" }),
    // Odia — a real leak found live: NewsData.io aggregates Odisha regional
    // publishers whose titles are neither Devanagari nor Latin. This app has
    // no Odia reading experience, so it belongs in neither feed.
    makeArticle({ article_id: "3", title: "ପ୍ରଧାନମନ୍ତ୍ରୀଙ୍କୁ ଭେଟିଲେ ଉପମୁଖ୍ୟମନ୍ତ୍ରୀ" }),
  ];

  it("keeps only Hindi-script titles when language is 'hi'", () => {
    const result = filterArticlesByLanguageScript(articles, "hi");
    expect(result.map((a) => a.article_id)).toEqual(["2"]);
  });

  it("keeps only Latin-script titles when language is not 'hi', excluding other Indic scripts", () => {
    const result = filterArticlesByLanguageScript(articles, "en");
    expect(result.map((a) => a.article_id)).toEqual(["1"]);
  });
});

describe("dedupeArticlesByTitle", () => {
  it("removes duplicates by normalized (trimmed, lowercased) title", () => {
    const articles = [
      makeArticle({ article_id: "1", title: "Breaking News" }),
      makeArticle({ article_id: "2", title: "breaking news" }),
      makeArticle({ article_id: "3", title: "  Breaking News  " }),
      makeArticle({ article_id: "4", title: "Different Story" }),
    ];
    const result = dedupeArticlesByTitle(articles);
    expect(result.map((a) => a.article_id)).toEqual(["1", "4"]);
  });

  it("returns an empty array for empty input", () => {
    expect(dedupeArticlesByTitle([])).toEqual([]);
  });
});
