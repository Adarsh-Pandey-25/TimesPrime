/**
 * @jest-environment node
 *
 * A Desk story as readers see it (Panel 2 design §6): headline, dek, bylines, times, text and the
 * correction note, labelled in the story's own language.
 */

import { renderToStaticMarkup } from "react-dom/server";
import type { PublishedStory } from "@timesprime/shared/types";
import StoryArticle from "./StoryArticle";

const story = (over: Partial<PublishedStory> = {}): PublishedStory => ({
  id: "s-1",
  public_id: 1024,
  language: "en",
  section: "india",
  format: "news",
  slug: "budget-passes",
  correction_note: null,
  first_published_at: "2026-11-17T08:00:00Z",
  published_at: "2026-11-17T08:00:00Z",
  revision: { headline: "Budget passes", dek: "The house voted.", seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
  bylines: [],
  ...over,
});
const html = (s: PublishedStory) => renderToStaticMarkup(<StoryArticle story={s} />);

test("an English story: its section, headline, dek and publication time", () => {
  const out = html(story());
  expect(out).toContain('<article lang="en"');
  expect(out).toContain('href="/india"');
  expect(out).toContain(">India</a>");
  expect(out).toContain("Budget passes</h1>");
  expect(out).toContain("The house voted.</p>");
  expect(out).toMatch(/Published <time dateTime="2026-11-17T08:00:00Z">17 Nov 2026, 1:30\s?pm IST<\/time>/i);
  expect(out).not.toContain("Updated");
  expect(out).not.toContain("By ");
});

test("bylines in order, and the other credits, joined as a sentence", () => {
  const out = html(
    story({
      bylines: [
        { role: "byline", name: "Asha Rao" },
        { role: "byline", name: "Vikram Singh" },
        { role: "byline", name: "Meera Iyer" },
        { role: "additional_reporting", name: "Ravi Kumar" },
        { role: "translated_by", name: "Neha Joshi" },
      ],
    })
  );
  expect(out).toContain("By Asha Rao, Vikram Singh and Meera Iyer");
  expect(out).toContain("Additional reporting by Ravi Kumar");
  expect(out).toContain("Translated by Neha Joshi");
});

test("an update shows its own time beside the first publication", () => {
  const out = html(story({ published_at: "2026-11-17T10:15:00Z" }));
  expect(out).toMatch(/Updated <time dateTime="2026-11-17T10:15:00Z">/);
});

test("a correction note is shown, under its own heading", () => {
  const out = html(story({ correction_note: "An earlier version gave the wrong vote count." }));
  expect(out).toContain('<h2 id="correction-heading"');
  expect(out).toContain(">Correction</h2>");
  expect(out).toContain("An earlier version gave the wrong vote count.");
});

test("a Hindi story is labelled in Hindi, with no English words around it", () => {
  const out = html(
    story({
      language: "hi",
      correction_note: "पहले संस्करण में गलत संख्या थी।",
      published_at: "2026-11-17T10:15:00Z",
      bylines: [
        { role: "byline", name: "आशा राव" },
        { role: "byline", name: "विक्रम सिंह" },
      ],
      revision: { headline: "संसद में बजट पास", dek: null, seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
    })
  );
  expect(out).toContain('<article lang="hi"');
  expect(out).toContain(">भारत</a>");
  expect(out).toContain("आशा राव और विक्रम सिंह");
  expect(out).toContain("प्रकाशित <time");
  expect(out).toContain("अपडेट <time");
  expect(out).toContain(">सुधार</h2>");
  for (const word of ["By ", "Published", "Updated", "Correction", " and "]) expect(out).not.toContain(word);
});
