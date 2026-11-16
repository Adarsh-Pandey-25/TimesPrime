/**
 * The header's search box shows the feed's active search. The feed can change
 * its search without the box: a category menu sub-topic ("Cricket" under
 * Sports) searches, a category clears the search, and so does a URL change.
 * The box used to keep whatever it was first given or last typed.
 */

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@/context/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: jest.fn(), toggleLanguage: jest.fn() }),
}));
jest.mock("@/lib/bookmarks", () => ({ getBookmarks: () => [] }));

import { act, fireEvent, render, screen } from "@testing-library/react";
import Header from "./Header";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";

const ui = (searchQuery: string) => (
  <ThemeProvider>
    <Header searchQuery={searchQuery} />
  </ThemeProvider>
);

const box = () => screen.getByPlaceholderText("Search news, topics, sources...") as HTMLInputElement;

test("the box shows a search the feed started elsewhere, and empties when the feed clears it", async () => {
  const { rerender } = render(ui(""));
  expect(box().value).toBe("");

  await act(async () => rerender(ui("Cricket")));
  expect(box().value).toBe("Cricket");

  await act(async () => rerender(ui("")));
  expect(box().value).toBe("");
});

test("typing is kept while the feed's search does not change", async () => {
  const { rerender } = render(ui("Cricket"));
  fireEvent.change(box(), { target: { value: "Cricket world cup" } });

  await act(async () => rerender(ui("Cricket")));
  expect(box().value).toBe("Cricket world cup");
});
