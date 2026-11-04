/**
 * @jest-environment node
 *
 * Scope mapping, in its one place (D5, D6, ADR 0003): articles store "english"/"hindi", scopes use
 * "en"/"hi", and an article's section is category[0].
 */

import { articleScope, covers, toScopeLanguage, toStoredLanguage } from "./scope";

describe("toScopeLanguage / toStoredLanguage (D5)", () => {
  test.each([
    ["english", "en"],
    ["hindi", "hi"],
    ["English", "en"],
    [" HINDI ", "hi"],
  ])("%j → %j", (stored, scope) => {
    expect(toScopeLanguage(stored)).toBe(scope);
  });

  test.each([["en"], ["hi"], ["tamil"], [""], [null], [undefined]])("%j has no scope language (only all-language scopes cover it)", (stored) => {
    expect(toScopeLanguage(stored)).toBeNull();
  });

  test("the reverse mapping round-trips", () => {
    expect(toStoredLanguage("en")).toBe("english");
    expect(toStoredLanguage("hi")).toBe("hindi");
    expect(toScopeLanguage(toStoredLanguage("hi"))).toBe("hi");
  });
});

describe("articleScope: the section is category[0] (D6, ADR 0003)", () => {
  test("language and the first category", () => {
    expect(articleScope({ language: "hindi", category: ["sports", "business"] })).toEqual({ language: "hi", section: "sports" });
  });

  test("the order is the stored order: the first tag wins even if it is broad", () => {
    expect(articleScope({ language: "english", category: ["top", "sports"] })).toEqual({ language: "en", section: "top" });
  });

  test.each([[null], [undefined], [[]]])("no category (%j) means no section", (category) => {
    expect(articleScope({ language: "english", category })).toEqual({ language: "en", section: null });
  });

  test("an unknown language means no language", () => {
    expect(articleScope({ language: "marathi", category: ["politics"] })).toEqual({ language: null, section: "politics" });
  });
});

describe("covers: each scope field is NULL (all) or equal to the target's", () => {
  const t = { language: "hi" as const, section: "sports" };

  test.each([
    [{ language: null, section: null }, true],
    [{ language: "hi", section: null }, true],
    [{ language: "hi", section: "sports" }, true],
    [{ language: null, section: "sports" }, true],
    [{ language: "en", section: null }, false],
    [{ language: "hi", section: "politics" }, false],
    [{ language: "en", section: "sports" }, false],
  ] as const)("scope %j covers hi/sports: %s", (scope, expected) => {
    expect(covers(scope, t)).toBe(expected);
  });

  test("a NULL target field is covered only by a NULL scope field (site-wide objects, unknown language)", () => {
    const siteWide = { language: null, section: null };
    expect(covers({ language: null, section: null }, siteWide)).toBe(true);
    expect(covers({ language: "hi", section: null }, siteWide)).toBe(false);
    expect(covers({ language: null, section: "sports" }, siteWide)).toBe(false);
  });
});
