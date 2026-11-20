/**
 * The reader's breaking-news banner (Panel 3, M1): it asks for the reader's language, labels itself
 * in that language, and shows nothing when nothing is live.
 */

import { act, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";
import { LanguageProvider } from "@/context/LanguageContext";
import BreakingNewsBanner from "./BreakingNewsBanner";

const item = (text: string, language: "en" | "hi" | null) => ({ id: text, text, is_active: true, expires_at: null, created_at: "2026-11-19T00:00:00Z", language });

let answer: { items: unknown[] } = { items: [] };
const fetchMock = jest.fn(async () => ({ ok: true, json: async () => answer }));

beforeEach(() => {
  answer = { items: [] };
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
});

async function show() {
  await act(async () =>
    render(
      <ThemeProvider>
        <LanguageProvider>
          <BreakingNewsBanner />
        </LanguageProvider>
      </ThemeProvider>,
    ),
  );
}

test("an English reader: asks for English, and the label is BREAKING", async () => {
  answer = { items: [item("Polls close at 6", "en")] };
  await show();
  expect(fetchMock).toHaveBeenCalledWith("/api/news/breaking-news?language=en");
  expect(await screen.findByText(/BREAKING/)).toBeInTheDocument();
  expect(screen.getAllByText("Polls close at 6").length).toBeGreaterThan(0);
});

test("a Hindi reader: asks for Hindi, and the label is in Hindi", async () => {
  localStorage.setItem("timesprime_language", "hi");
  answer = { items: [item("मतदान शाम 6 बजे तक", "hi")] };
  await show();
  expect(fetchMock).toHaveBeenLastCalledWith("/api/news/breaking-news?language=hi");
  const label = await screen.findByText(/ब्रेकिंग न्यूज़/);
  expect(label).toHaveAttribute("lang", "hi");
});

test("nothing live: nothing is shown", async () => {
  await show();
  expect(screen.queryByText(/BREAKING/)).not.toBeInTheDocument();
});
