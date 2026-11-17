// A stand-in for Supabase's REST API, for the browser tests in CI only (playwright.config.ts).
//
// Since R1-12 the reader site reads stories from the database alone, and CI has no database (no
// `.env`, and the tests are read-only anyway). This answers the reader's article reads with three
// fixed stories, so the front-page test checks the real path: database rows, rendered as links to
// article pages; and the Desk story page's reads with two published stories. Every other read gets
// an empty list; nothing is ever written. Locally the tests run against the real database in the
// root `.env`, and this is not started.

import http from "node:http";

// The port is the first argument (playwright.config.ts passes it), so the stand-in reads no env.
const port = Number(process.argv[2] || 3199);
const now = Date.now();

const story = (n, title, category) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  // Letters and digits, like NewsData's ids, so the stories get R2's addresses.
  article_id: `stub000${n}`,
  title,
  link: `https://publisher.example/stub-${n}`,
  description: `${title}: a fixed story for the browser tests.`,
  content: null,
  pub_date: new Date(now - n * 60_000).toISOString(),
  image_url: null,
  source_id: "publisher_example",
  source_name: "Publisher Example",
  category: [category],
  country: ["in"],
  language: "english",
  created_at: new Date(now - n * 60_000).toISOString(),
  category_mismatches: null,
});

const ARTICLES = [
  story(1, "Parliament passes the annual budget", "top"),
  story(2, "Monsoon reaches the southern coast early", "top"),
  story(3, "Markets close higher after a quiet week", "business"),
];

// Panel 2 (M3): two published Desk stories, one English and one Hindi, as the reader's story page
// reads them (packages/server/src/repositories/stories.ts, getPublishedStory): the story's columns,
// its published revision and its bylines, embedded.
const deskStory = (n, language, slug, headline, text) => ({
  id: `10000000-0000-4000-8000-00000000000${n}`,
  public_id: 100 + n,
  language,
  section: "india",
  format: "news",
  slug,
  correction_note: null,
  first_published_at: new Date(now - 3_600_000).toISOString(),
  published_at: new Date(now - 3_600_000).toISOString(),
  workflow_state: "published",
  embargo_until: null,
  published_revision_id: `20000000-0000-4000-8000-00000000000${n}`,
  revision: {
    id: `20000000-0000-4000-8000-00000000000${n}`,
    story_id: `10000000-0000-4000-8000-00000000000${n}`,
    headline,
    dek: null,
    seo_title: null,
    seo_description: null,
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  },
  bylines: [],
});

const DESK_STORIES = [
  deskStory(1, "en", "parliament-debates-the-budget", "Parliament debates the budget", "The debate ran late into the night."),
  deskStory(2, "hi", "sansad-mein-bajat-par-bahas", "संसद में बजट पर बहस", "बहस देर रात तक चली।"),
];

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://stub");
    const table = { "/rest/v1/articles": ARTICLES, "/rest/v1/stories": DESK_STORIES }[url.pathname];
    // The article and story pages ask for one row by an exact link, article_id or public_id
    // (?link=eq.<v>): honour those, so an unknown story is not found. The feed's reads take every
    // story. Other filters are ignored; the story page checks the row itself.
    let rows = req.method === "GET" && table ? table : [];
    for (const column of ["link", "article_id", "public_id"]) {
      const filter = url.searchParams.get(column);
      if (filter?.startsWith("eq.")) rows = rows.filter((row) => String(row[column]) === filter.slice(3));
    }
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Range": rows.length ? `0-${rows.length - 1}/${rows.length}` : "*/0",
    });
    res.end(req.method === "HEAD" ? undefined : JSON.stringify(rows));
  })
  .listen(port, () => console.log(`supabase stub on http://localhost:${port}`));
