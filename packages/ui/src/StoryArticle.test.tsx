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
  revision: { id: "r-1", headline: "Budget passes", dek: "The house voted.", seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
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

test("in the Desk's preview the section is named, not linked", () => {
  const out = renderToStaticMarkup(<StoryArticle story={story()} sectionLink={false} />);
  expect(out).toContain(">India</span>");
  expect(out).not.toContain('href="/india"');
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
      revision: { id: "r-1", headline: "संसद में बजट पास", dek: null, seo_title: null, seo_description: null, body: { type: "doc", content: [] } },
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

// desk-8: an author's photo beside the byline, from its square rendition; decorative (alt="").
test("each credited author's photo, round, before the byline; none for one the page was not given", () => {
  const PHOTO = "c0ffee00-0000-4000-8000-000000000003";
  const R = `/media/renditions/${PHOTO}`;
  const html = renderToStaticMarkup(
    <StoryArticle
      story={story({
        bylines: [
          { role: "byline", name: "Asha Rao", photoId: PHOTO },
          { role: "byline", name: "Vikram Singh", photoId: "c0ffee00-0000-4000-8000-000000000009" },
        ],
        photos: {
          [PHOTO]: {
            alt: "",
            caption: null,
            credit: null,
            crops: { "1x1": { avif: `${R}/1x1-240.avif 240w, ${R}/1x1-480.avif 480w`, webp: `${R}/1x1-240.webp 240w, ${R}/1x1-480.webp 480w`, src: `${R}/1x1-480.webp`, width: 480, height: 480 } },
          },
        },
      })}
    />
  );
  expect(html).toContain(`<div class="story-byline"><picture><source type="image/avif" srcSet="${R}/1x1-240.avif 240w, ${R}/1x1-480.avif 480w" sizes="40px"/>`);
  expect(html).toContain(`<img src="${R}/1x1-480.webp" alt="" width="40" height="40" loading="lazy" class="story-byline-photo"/></picture><p`);
  expect(html.match(/<picture>/g)).toHaveLength(1);
  expect(html).toContain("Asha Rao and Vikram Singh");
});

test("a photo whose address is not https or a site path is not drawn", () => {
  const PHOTO = "c0ffee00-0000-4000-8000-000000000003";
  const html = renderToStaticMarkup(
    <StoryArticle story={story({ bylines: [{ role: "byline", name: "Asha Rao", photoId: PHOTO }], photos: { [PHOTO]: { alt: "", caption: null, credit: null, crops: {}, fallbackUrl: "javascript:alert(1)" } } })} />
  );
  expect(html).not.toContain("<img");
  expect(html).not.toContain("javascript:");
});

// Panel 7, M2: every correction, from the log, oldest first; the one note before compliance-2.
const CORRECTIONS = [
  { id: "c-1", kind: "correction", text: "An earlier version gave the wrong vote count.", published_at: "2026-11-18T06:00:00Z" },
  { id: "c-2", kind: "clarification", text: "The vote was on Monday, not Tuesday.", published_at: "2026-11-19T06:00:00Z" },
];

test("every correction is shown in order, each with its kind and date, with the way to all corrections", () => {
  const out = html(story({ correction_note: CORRECTIONS[1].text, corrections: CORRECTIONS }));
  expect(out).toContain(">Corrections</h2>");
  expect(out.indexOf("wrong vote count")).toBeLessThan(out.indexOf("not Tuesday"));
  expect(out).toMatch(/Clarification · <time dateTime="2026-11-19T06:00:00Z">/);
  expect(out).toContain('href="/corrections"');
  expect(out).toContain("All our corrections");
});

test("in Hindi, the kinds and the link are in Hindi", () => {
  const out = html(story({ language: "hi", correction_note: "x", corrections: [{ ...CORRECTIONS[1], text: "मतदान सोमवार को हुआ था।" }] }));
  expect(out).toContain("स्पष्टीकरण · <time");
  expect(out).toContain("हमारे सभी सुधार");
  expect(out).not.toContain("Clarification");
});

test("with no corrections from the log, the one correction note is shown as before", () => {
  const out = html(story({ correction_note: "An earlier version gave the wrong vote count.", corrections: undefined }));
  expect(out).toContain(">Correction</h2>");
  expect(out).not.toContain('href="/corrections"');
});
