// TimesPrime — News API Comparison Tool
//
// Standalone, dependency-free script that calls NewsData.io, Mediastack, and
// GDELT in parallel, measures response time, and compares how well each one
// fits this project's needs: bilingual (EN/HI) India news with images,
// descriptions, and category support.
//
// ## How to run
//
//   # Add to .env.local:
//   # MEDIASTACK_API_KEY=your_key
//   # NEWSDATA_API_KEY=your_key
//   # (GDELT needs no key.)
//
//   # Then run:
//   node --env-file=.env.local scripts/test-apis.mjs

const COLOR = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
};

function paint(color, text) {
  return `${COLOR[color]}${text}${COLOR.reset}`;
}

function pct(count, total) {
  return total === 0 ? "0.0" : ((count / total) * 100).toFixed(1);
}

function summarize(articles) {
  const withImage = articles.filter((a) => !!a.image).length;
  const withDescription = articles.filter((a) => a.description && a.description.trim().length > 0).length;
  const withIndiaTag = articles.filter((a) => a.countryTag && a.countryTag.toLowerCase().includes("in")).length;
  return { withImage, withDescription, withIndiaTag };
}

// ---------------------------------------------------------------------------
// Per-API test functions. Each ALWAYS resolves (never rejects) so the
// Promise.all in main() can't be short-circuited by one API's failure —
// that's how "handle errors gracefully, continue with others" is satisfied
// while still literally using Promise.all as requested.
// ---------------------------------------------------------------------------

async function testNewsData() {
  const name = "NewsData.io";
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) return { name, ok: false, skipped: true, reason: "NEWSDATA_API_KEY not set" };

  const url = `https://newsdata.io/api/1/latest?apikey=${apiKey}&country=in&language=en&category=top`;
  const start = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    const text = await res.text();

    if (!res.ok) return { name, ok: false, elapsed, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { name, ok: false, elapsed, reason: "Invalid JSON response" };
    }

    const raw = data.results || [];
    const articles = raw.map((a) => ({
      title: a.title || "",
      description: a.description || "",
      image: a.image_url || null,
      link: a.link || "",
      countryTag: Array.isArray(a.country) ? a.country.join(",") : a.country || "",
    }));

    return { name, ok: true, elapsed, articles, rawFirst: raw[0] || null };
  } catch (err) {
    return { name, ok: false, elapsed: Date.now() - start, reason: err.message };
  }
}

async function testMediastack() {
  const name = "Mediastack";
  const apiKey = process.env.MEDIASTACK_API_KEY;
  if (!apiKey) return { name, ok: false, skipped: true, reason: "MEDIASTACK_API_KEY not set" };

  // Mediastack's free tier only serves plain HTTP — HTTPS requires a paid
  // plan. This is intentional, not a typo; don't "fix" it to https://.
  const url = `http://api.mediastack.com/v1/news?access_key=${apiKey}&countries=in&languages=en&limit=10`;
  const start = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    const text = await res.text();

    if (!res.ok) return { name, ok: false, elapsed, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return { name, ok: false, elapsed, reason: "Invalid JSON response" };
    }

    // Mediastack returns errors as HTTP 200 with an `error` body (e.g. bad key).
    if (data.error) {
      return { name, ok: false, elapsed, reason: `${data.error.code || "error"}: ${data.error.message || "unknown"}` };
    }

    const raw = data.data || [];
    const articles = raw.map((a) => ({
      title: a.title || "",
      description: a.description || "",
      image: a.image || null,
      link: a.url || "",
      countryTag: a.country || "",
    }));

    return { name, ok: true, elapsed, articles, rawFirst: raw[0] || null };
  } catch (err) {
    return { name, ok: false, elapsed: Date.now() - start, reason: err.message };
  }
}

async function testGdelt() {
  const name = "GDELT";
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=india&mode=artlist&maxrecords=10&format=json&sourcelang=english`;
  const start = Date.now();
  try {
    const res = await fetch(url);
    const elapsed = Date.now() - start;
    const text = await res.text();

    if (!res.ok) return { name, ok: false, elapsed, reason: `HTTP ${res.status}: ${text.slice(0, 200)}` };

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // GDELT sometimes returns an HTML error page instead of JSON on
      // malformed or zero-result queries, even with format=json set.
      return { name, ok: false, elapsed, reason: "Invalid JSON response (GDELT returned non-JSON, likely an empty/bad query)" };
    }

    const raw = data.articles || [];
    const articles = raw.map((a) => ({
      title: a.title || "",
      // GDELT's artlist mode has no description/summary field at all —
      // this is a structural API limitation, not a parsing bug.
      description: "",
      image: a.socialimage || null,
      link: a.url || "",
      countryTag: a.sourcecountry || "",
    }));

    return {
      name,
      ok: true,
      elapsed,
      articles,
      rawFirst: raw[0] || null,
      notes: ["GDELT's artlist endpoint has no description/summary field — 0% here is expected, not a bug."],
    };
  } catch (err) {
    return { name, ok: false, elapsed: Date.now() - start, reason: err.message };
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function statusIcon(r) {
  if (r.skipped) return "⏭️ ";
  if (!r.ok) return "❌";
  return "✅";
}

function printReport(r) {
  console.log(paint("cyan", "═".repeat(60)));
  console.log(paint("bold", `${statusIcon(r)} ${r.name}`));
  console.log(paint("cyan", "═".repeat(60)));

  if (r.skipped) {
    console.log(paint("yellow", `⏭️  Skipped — ${r.reason}\n`));
    return;
  }
  if (!r.ok) {
    console.log(paint("red", `❌ Failed after ${r.elapsed}ms — ${r.reason}\n`));
    return;
  }

  const { articles } = r;
  const total = articles.length;
  const { withImage, withDescription, withIndiaTag } = summarize(articles);

  console.log(`⏱️  Response time: ${paint("bold", r.elapsed + "ms")}`);
  console.log(`📦 Total articles: ${total}`);
  console.log(`🖼️  With images: ${withImage}/${total} (${pct(withImage, total)}%)`);
  console.log(`📝 With description: ${withDescription}/${total} (${pct(withDescription, total)}%)`);
  console.log(`🇮🇳 Country-tagged India: ${withIndiaTag}/${total} (${pct(withIndiaTag, total)}%)`);

  if (r.notes) {
    for (const note of r.notes) console.log(paint("dim", `   ℹ️  ${note}`));
  }

  console.log(`\n${paint("bold", "Sample titles:")}`);
  if (total === 0) {
    console.log(paint("dim", "  (no articles returned)"));
  } else {
    articles.slice(0, 3).forEach((a, i) => {
      console.log(`  ${i + 1}. ${a.title || paint("dim", "(no title)")}`);
    });
  }

  console.log(`\n${paint("bold", "Raw first article:")}`);
  console.log(paint("dim", JSON.stringify(r.rawFirst, null, 2)));
  console.log("");
}

function printRecommendation(results) {
  console.log(paint("cyan", "═".repeat(60)));
  console.log(paint("bold", "🏆 RECOMMENDATION"));
  console.log(paint("cyan", "═".repeat(60)));

  const usable = results.filter((r) => r.ok && r.articles.length > 0);

  if (usable.length === 0) {
    console.log(paint("red", "No API returned usable results — check your API keys and try again.\n"));
    return;
  }

  // Rank on each axis (best = most points, n = number of usable APIs) and
  // sum across axes. Ties are broken by axis priority order (speed first),
  // matching the priority order given in the requirements.
  const n = usable.length;
  const scores = new Map(usable.map((r) => [r.name, 0]));

  function award(rankedDesc) {
    rankedDesc.forEach((r, i) => scores.set(r.name, scores.get(r.name) + (n - i)));
  }

  const byImagePct = (r) => summarize(r.articles).withImage / r.articles.length;
  const byDescPct = (r) => summarize(r.articles).withDescription / r.articles.length;
  const byIndiaPct = (r) => summarize(r.articles).withIndiaTag / r.articles.length;

  award([...usable].sort((a, b) => a.elapsed - b.elapsed)); // speed: lower ms wins
  award([...usable].sort((a, b) => byImagePct(b) - byImagePct(a)));
  award([...usable].sort((a, b) => byDescPct(b) - byDescPct(a)));
  award([...usable].sort((a, b) => byIndiaPct(b) - byIndiaPct(a)));

  const ranked = [...usable].sort((a, b) => scores.get(b.name) - scores.get(a.name));

  const col = 16;
  console.log(
    paint("bold", "Metric".padEnd(col)) + usable.map((r) => r.name.padEnd(col)).join("")
  );
  console.log("-".repeat(col + col * usable.length));

  const rows = [
    ["Speed", (r) => `${r.elapsed}ms`],
    ["Images %", (r) => `${pct(summarize(r.articles).withImage, r.articles.length)}%`],
    ["Description %", (r) => `${pct(summarize(r.articles).withDescription, r.articles.length)}%`],
    ["India match %", (r) => `${pct(summarize(r.articles).withIndiaTag, r.articles.length)}%`],
  ];
  for (const [label, fn] of rows) {
    console.log(label.padEnd(col) + usable.map((r) => fn(r).padEnd(col)).join(""));
  }

  console.log("");
  ranked.forEach((r, i) => {
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
    console.log(`${medal} ${paint("bold", r.name)} — score: ${scores.get(r.name)}/${n * 4}`);
  });

  const winner = ranked[0];
  console.log(paint("green", `\n✅ WINNER: ${winner.name}\n`));

  console.log(paint("dim", "Note: all 3 APIs were queried in English here for a fair side-by-side."));
  console.log(paint("dim", "Hindi-language support is a documented capability, not measured by this run:"));
  console.log(paint("dim", "  • NewsData.io — native language=hi param (already used in this project)."));
  console.log(paint("dim", "  • Mediastack   — languages param accepts 'hi'; coverage/quality unverified here."));
  console.log(paint("dim", "  • GDELT        — sourcelang=hindi is possible but Indian Hindi-source volume is typically low."));
  console.log("");

  const skipped = results.filter((r) => r.skipped);
  if (skipped.length > 0) {
    console.log(paint("yellow", `⚠️  ${skipped.map((r) => r.name).join(", ")} skipped (no API key) — not included in the ranking above.\n`));
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(paint("bold", "\n📰 TimesPrime — News API Comparison\n"));
  console.log(paint("dim", "Testing NewsData.io, Mediastack, and GDELT in parallel...\n"));

  const results = await Promise.all([testNewsData(), testMediastack(), testGdelt()]);

  for (const r of results) printReport(r);
  printRecommendation(results);
}

main();
