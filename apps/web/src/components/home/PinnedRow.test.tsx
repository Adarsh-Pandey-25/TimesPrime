/**
 * The pinned row (Panel 3, M2): the server's English pins as they are; for a Hindi reader, the Hindi
 * pins from /api/news/pins instead; nothing at all when no pin is live.
 */

import { act, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/context/LanguageContext";
import type { PinnedStory } from "@timesprime/shared/config/frontPage";
import PinnedRow from "./PinnedRow";

const pinned = (over: Partial<PinnedStory> = {}): PinnedStory => ({
  slot: 1,
  path: "/sports/the-final-42",
  language: "en",
  headline: "India win the final",
  dek: "A late goal.",
  bylines: ["Asha Rao", "Vikram Singh"],
  time: "20 Nov 2026, 10:00 am IST",
  image: null,
  drawing: "/placeholders/sports-thumb.svg",
  until: "2099-01-01T00:00:00Z",
  ...over,
});

let answer: { pins: unknown[] } = { pins: [] };
const fetchMock = jest.fn(async () => ({ ok: true, json: async () => answer }));

beforeEach(() => {
  answer = { pins: [] };
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  localStorage.clear();
});

async function show(initial: PinnedStory[], section: string | null = null) {
  await act(async () =>
    render(
      <LanguageProvider>
        <PinnedRow initial={initial} section={section} />
      </LanguageProvider>
    )
  );
}

test("English: the server's pins, each card a link to its story, with its byline and time; nothing fetched", async () => {
  await show([pinned(), pinned({ slot: 2, path: "/sports/semi-41", headline: "The semi-final", bylines: [], dek: null, time: null })]);
  expect(screen.getByRole("heading", { name: "Editors' picks" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "India win the final" })).toHaveAttribute("href", "/sports/the-final-42");
  expect(screen.getByText("By Asha Rao and Vikram Singh · 20 Nov 2026, 10:00 am IST")).toBeInTheDocument();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("Hindi: the Hindi pins of the same page, under a Hindi heading", async () => {
  localStorage.setItem("timesprime_language", "hi");
  answer = { pins: [pinned({ path: "/hi/sports/final-43", language: "hi", headline: "भारत ने फाइनल जीता", bylines: ["आशा राव"] })] };
  await show([pinned()], "sports");
  expect(fetchMock).toHaveBeenCalledWith("/api/news/pins?language=hi&section=sports", expect.anything());
  expect(await screen.findByRole("link", { name: "भारत ने फाइनल जीता" })).toHaveAttribute("href", "/hi/sports/final-43");
  expect(screen.getByRole("heading", { name: "संपादकों की पसंद" }).closest("section")).toHaveAttribute("lang", "hi");
  expect(screen.queryByText("India win the final")).toBeNull();
});

test("the home page asks for no section", async () => {
  localStorage.setItem("timesprime_language", "hi");
  await show([]);
  expect(fetchMock).toHaveBeenCalledWith("/api/news/pins?language=hi", expect.anything());
});

test("no live pin, or a failed Hindi read: no row at all", async () => {
  await show([]);
  expect(screen.queryByRole("heading")).toBeNull();
  localStorage.setItem("timesprime_language", "hi");
  fetchMock.mockImplementationOnce(async () => ({ ok: false, json: async () => ({ pins: [] }) }));
  await show([pinned()]);
  expect(screen.queryByText("India win the final")).toBeNull();
  expect(screen.queryByRole("heading")).toBeNull();
});

test("without an image, the card shows its section's drawing, as decoration", async () => {
  await show([pinned()]);
  const drawing = document.querySelector('img[src="/placeholders/sports-thumb.svg"]');
  expect(drawing).toHaveAttribute("alt", "");
});

test("a pin's image is its 4:3 crop, AVIF and WebP, with its alt text", async () => {
  const image = { alt: "The winning goal", avif: "/media/a-480.avif 480w", webp: "/media/a-480.webp 480w", src: "/media/a-480.webp", width: 480, height: 360 };
  await show([pinned({ image })]);
  const img = screen.getByRole("img", { name: "The winning goal" });
  expect(img).toHaveAttribute("src", "/media/a-480.webp");
  expect(img.closest("picture")?.querySelector('source[type="image/avif"]')).toHaveAttribute("srcset", "/media/a-480.avif 480w");
});
