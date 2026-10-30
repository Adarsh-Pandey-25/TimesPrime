import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { supabase } from "@/server/supabase";

const MODEL = "claude-haiku-4-5"; // cheapest tier, same as chat route — good fit for a short classification task
const BATCH_SIZE = 20;

// Only these category tags are ever evaluated — "top"/"general" are
// cross-topic by design (see applyArticleFilters in db.ts) and were never
// part of the category-mismatch problem this classifier addresses.
const CLASSIFIABLE_CATEGORIES = new Set([
  "business",
  "technology",
  "sports",
  "entertainment",
  "health",
  "science",
  "world",
  "india",
]);

interface ClassifiableRow {
  article_id: string;
  title: string;
  description?: string | null;
  category?: string[] | null;
}

interface ClassificationResult {
  id: string;
  mismatched: string[];
}

// Cached for the process lifetime — avoids spending on Haiku calls whose
// results could never be saved if the category_mismatches migration
// (see database/schema.sql) hasn't been run yet in this environment.
let columnExists: boolean | null = null;

async function ensureColumnExists(): Promise<boolean> {
  if (columnExists !== null) return columnExists;
  const { error } = await supabase.from("articles").select("category_mismatches").limit(1);
  columnExists = !error;
  if (!columnExists) {
    console.warn(
      "category_mismatches column not found — run the migration in database/schema.sql to enable category classification."
    );
  }
  return columnExists;
}

function buildPrompt(batch: { id: string; title: string; description: string; categories: string[] }[]): string {
  return `For each article below, identify which of its assigned category tags the article's content does NOT genuinely relate to (for example, a local transit/civic story tagged "technology" with no real technology content). Only flag a tag as mismatched when it is clearly unrelated to the article's actual subject — when in doubt, do not flag it.

Respond with ONLY a JSON array and no other text: [{"id": "...", "mismatched": ["category", ...]}, ...]. Use an empty "mismatched" array when every assigned tag genuinely fits.

Articles:
${JSON.stringify(batch, null, 2)}`;
}

async function classifyBatch(
  client: Anthropic,
  batch: { id: string; title: string; description: string; categories: string[] }[]
): Promise<ClassificationResult[]> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: buildPrompt(batch) }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  return JSON.parse(jsonMatch[0]);
}

/**
 * Classifies which of each article's category tags it doesn't genuinely
 * belong to, and stores the result once per article (never re-classifies a
 * row that already has a non-null category_mismatches). Fails open on any
 * error — an unclassified or failed article keeps category_mismatches at
 * null, which every read-path filter treats as "no mismatches", i.e.
 * visible everywhere it's tagged. Never hides content because a
 * classification call failed.
 *
 * Deliberately fire-and-forget from the caller's perspective: this runs
 * after articles are already saved and served, so Haiku's latency never
 * blocks a user-facing news request.
 */
export async function classifyCategoryRelevance(rows: ClassifiableRow[]): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || rows.length === 0) return;

  if (!(await ensureColumnExists())) return;

  const items = rows
    .map((r) => ({
      id: r.article_id,
      title: r.title,
      description: (r.description || "").slice(0, 300),
      categories: (r.category || []).filter((c) => CLASSIFIABLE_CATEGORIES.has(c)),
    }))
    .filter((r) => r.categories.length > 0);

  if (items.length === 0) return;

  const client = new Anthropic({ apiKey });

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    try {
      const results = await classifyBatch(client, batch);
      for (const result of results) {
        if (!result?.id) continue;
        const { error } = await supabase
          .from("articles")
          .update({ category_mismatches: result.mismatched || [] })
          .eq("article_id", result.id);
        if (error) {
          console.error("Failed to store category classification:", error.message);
        }
      }
    } catch (err) {
      // Fail open: this batch stays unclassified (category_mismatches null),
      // which reads as "no mismatches" everywhere — never hide content
      // because the classifier errored or timed out.
      console.error("Category classification batch failed:", err);
      Sentry.captureException(err, { tags: { source: "anthropic" }, extra: { operation: "classifyCategoryRelevance" } });
    }
  }
}
