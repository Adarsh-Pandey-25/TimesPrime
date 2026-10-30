/**
 * Thin wrapper around the free, unofficial Google Translate web endpoint
 * (translate.googleapis.com/translate_a/single) — the same one
 * translate.google.com's own page calls, not a documented/supported
 * product. No API key, but also no SLA: Google can rate-limit or change
 * the response shape without notice. Fine for this app's low-volume
 * "translate one article's text on demand" use case; not something to
 * build critical infrastructure on.
 */

const TRANSLATE_ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const BATCH_CONCURRENCY = 4;

/**
 * Translates a single string. Empty/whitespace-only input is returned
 * as-is without a network call.
 */
export async function translateText(
  text: string,
  target: string,
  source: string = "auto"
): Promise<string> {
  if (!text || !text.trim()) return text;

  const params = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });

  // This endpoint reliably 429s a server-side fetch() with no/generic
  // User-Agent — verified directly: the exact same request succeeds via
  // curl (which sends its own UA) and fails without one. A browser-like
  // UA is required, not optional, for this specific unofficial endpoint.
  const res = await fetch(`${TRANSLATE_ENDPOINT}?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Translate request failed with status ${res.status}`);
  }

  const data = await res.json();
  // Response shape: [[[translatedChunk, originalChunk, ...], ...], ...] —
  // long input gets split into multiple chunks that need to be
  // concatenated back into one string.
  const segments = data?.[0];
  if (!Array.isArray(segments)) {
    throw new Error("Unexpected translate response shape.");
  }

  return segments.map((segment: unknown[]) => (Array.isArray(segment) ? segment[0] ?? "" : "")).join("");
}

/**
 * Translates an array of strings concurrently (bounded by
 * BATCH_CONCURRENCY), falling back to the original string for any
 * individual item that fails — one bad translation never fails the whole
 * batch.
 */
export async function translateBatch(texts: string[], target: string): Promise<string[]> {
  const results = new Array<string>(texts.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= texts.length) return;
      try {
        results[i] = await translateText(texts[i], target);
      } catch (err) {
        console.error(`Translation failed for item ${i}:`, err);
        results[i] = texts[i];
      }
    }
  }

  const workerCount = Math.min(BATCH_CONCURRENCY, texts.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
