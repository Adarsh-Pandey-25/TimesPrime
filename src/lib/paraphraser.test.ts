import { paraphraseTitle, paraphraseText } from "./paraphraser";

describe("paraphraseTitle", () => {
  it("is deterministic — the same input always produces the same output", () => {
    const title = "Company Announces New Product Launch";
    expect(paraphraseTitle(title)).toBe(paraphraseTitle(title));
  });

  it("returns Hindi/Devanagari text unchanged", () => {
    const hindiTitle = "सरकार ने नई नीति की घोषणा की";
    expect(paraphraseTitle(hindiTitle)).toBe(hindiTitle);
  });

  it("returns text with no matching synonym-map keywords unchanged", () => {
    // Deliberately free of every SYNONYM_MAP key and every special-case regex target.
    const title = "The quick brown fox jumps over the lazy dog";
    expect(paraphraseTitle(title)).toBe(title);
  });

  it("returns a string", () => {
    expect(typeof paraphraseTitle("Apple announces new iPhone")).toBe("string");
  });

  it("replaces a known keyword while preserving capitalization", () => {
    const result = paraphraseTitle("Apple Announces New iPhone");
    expect(result).not.toBe("Apple Announces New iPhone");
    expect(result.startsWith("Apple ")).toBe(true);
  });

  it("returns non-string input unchanged", () => {
    expect(paraphraseTitle(null as unknown as string)).toBe(null);
    expect(paraphraseTitle(undefined as unknown as string)).toBe(undefined);
    expect(paraphraseTitle("")).toBe("");
  });
});

describe("paraphraseText", () => {
  it("is deterministic — the same input always produces the same output", () => {
    const text = "The company reports increased revenue this quarter.";
    expect(paraphraseText(text)).toBe(paraphraseText(text));
  });

  it("returns Hindi/Devanagari text unchanged", () => {
    const hindiText = "कंपनी ने बताया कि राजस्व में वृद्धि हुई है।";
    expect(paraphraseText(hindiText)).toBe(hindiText);
  });

  it("returns text with no matching keywords unchanged", () => {
    const text = "This sentence has no special terminology at all";
    expect(paraphraseText(text)).toBe(text);
  });

  it("returns a string", () => {
    expect(typeof paraphraseText("Sales increased this year")).toBe("string");
  });

  it("returns non-string input unchanged", () => {
    expect(paraphraseText(null as unknown as string)).toBe(null);
  });
});
