/**
 * Every control on the admin dashboard has an accessible name (Definition of done, item 10). axe
 * found three selects without one on /admin (e2e/accessibility.spec.ts); the edit dialog's two had
 * the same defect. A visible label is tied to its select; a select without one is named.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import ArticlesTable from "./ArticlesTable";
import BreakingNewsManager from "./BreakingNewsManager";
import { ThemeProvider } from "@timesprime/ui/ThemeContext";

const article = {
  id: "a-1",
  article_id: "n-1",
  title: "A headline",
  description: null,
  image_url: null,
  link: null,
  source_name: "Source",
  category: ["sports"],
  language: "english",
  created_at: new Date().toISOString(),
};

beforeEach(() => {
  global.fetch = jest.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (String(url).startsWith("/api/admin/articles") ? { articles: [article], total: 1, page: 1, totalPages: 1 } : { items: [] }),
  })) as unknown as typeof fetch;
});

const renderIn = async (node: React.ReactNode) => {
  await act(async () => {
    render(<ThemeProvider>{node}</ThemeProvider>);
  });
};

test("the breaking banner's expiry select is named", async () => {
  await renderIn(<BreakingNewsManager />);
  expect(screen.getByRole("combobox", { name: "Banner expiry" })).toBeInTheDocument();
});

test("the article list's category filter is named", async () => {
  await renderIn(<ArticlesTable />);
  expect(screen.getByRole("combobox", { name: "Filter by category" })).toBeInTheDocument();
});

test("the edit dialog's Category and Language labels name their selects", async () => {
  await renderIn(<ArticlesTable />);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Edit A headline" }));
  });
  expect(screen.getByRole("combobox", { name: "Category" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
});
