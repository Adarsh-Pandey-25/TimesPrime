import "server-only";

/**
 * Reads a JSON request body, refusing it once it passes `maxBytes` (F-010).
 *
 * `request.json()` buffers whatever arrives. This reads the stream itself and
 * cancels it as soon as the total passes the limit, so an oversized body is
 * never held whole, whether Content-Length declares it, lies about it, or is
 * absent (a chunked upload). A declared length over the limit is refused
 * without reading at all. The caller answers 413 for `tooLarge`, and its own
 * 400 otherwise.
 */
export type JsonBodyResult = { ok: true; value: unknown } | { ok: false; tooLarge: boolean };

export async function readJsonBody(request: Request, maxBytes: number): Promise<JsonBodyResult> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, tooLarge: true };

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = request.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, tooLarge: false };
  }
}
