import "server-only";

import sharp from "sharp";
import {
  RENDITION_FORMATS,
  RENDITION_RATIOS,
  renditionHeight,
  renditionKey,
  renditionWidths,
  type Rendition,
  type RenditionFormat,
  type RenditionRatio,
} from "@timesprime/shared/config/media";
import { mediaStorage } from "../../lib/mediaStorage";
import { listPendingRenditions, recordRenditions } from "../../repositories/media";

/**
 * The renditions of the Desk's images (Panel 2 design §7), made by the worker's make-renditions job
 * every RENDITIONS_TICK_MINUTES. A run takes the images that have none yet, oldest first; for each it
 * reads the original from the storage, makes every crop (16:9, 4:3, 1:1) at its widths in AVIF and
 * WebP with sharp, puts them under `renditions/<id>/`, and records them on the image.
 *
 * sharp writes no metadata unless asked, so a rendition carries no EXIF (which can hold where a
 * photo was taken). The original keeps it, and stays in the back office.
 *
 * An image sharp cannot read or convert, or too small for a crop, is recorded with no renditions: it
 * is not tried again, and the library shows it as failed (upload it again). A failure of the storage
 * or the database leaves the image waiting, and the next run tries it again.
 */

/** The images a run takes, and the time after which it starts no new one (the service allows 240 s). */
export const RENDITIONS_BATCH = 20;
export const RENDITIONS_BUDGET_MS = 180_000;

/**
 * The renditions are cut from one upright copy of the original whose shorter side is at most this:
 * twice the widest rendition, so the original is decoded once, not for every rendition, and even a
 * long panorama keeps enough height for its crops.
 */
const WORKING_SIDE = 2880;
const QUALITY: Record<RenditionFormat, number> = { avif: 50, webp: 75 };
export const RENDITION_CONTENT_TYPES: Record<RenditionFormat, string> = { avif: "image/avif", webp: "image/webp" };

/** The file itself is the problem: recorded as failed, never tried again. */
export class UnusableImageError extends Error {}

export interface RenderedFile {
  rendition: Rendition;
  body: Uint8Array;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every rendition of one original, and the original's size once turned upright. Writes nothing. */
export async function renderRenditions(id: string, original: Uint8Array): Promise<{ width: number; height: number; files: RenderedFile[] }> {
  try {
    const meta = await sharp(original, { failOn: "error" }).metadata();
    const { width, height } = meta.autoOrient;
    const working = await sharp(original, { failOn: "error" })
      .autoOrient()
      .resize({ width: WORKING_SIDE, height: WORKING_SIDE, fit: "outside", withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const raw = { width: working.info.width, height: working.info.height, channels: working.info.channels };

    const files: RenderedFile[] = [];
    for (const ratio of Object.keys(RENDITION_RATIOS) as RenditionRatio[]) {
      // Measured on the copy the crops are cut from, so no rendition is ever enlarged.
      const widths = renditionWidths(ratio, raw.width, raw.height);
      if (widths.length === 0) throw new UnusableImageError(`too small for a ${ratio} crop (${width} x ${height})`);
      for (const w of widths) {
        const h = renditionHeight(ratio, w);
        const crop = await sharp(working.data, { raw })
          .resize(w, h, { fit: "cover", position: sharp.strategy.attention })
          .raw()
          .toBuffer({ resolveWithObject: true });
        const cropRaw = { width: crop.info.width, height: crop.info.height, channels: crop.info.channels };
        for (const format of RENDITION_FORMATS) {
          const image = sharp(crop.data, { raw: cropRaw });
          const body = await (format === "avif" ? image.avif({ quality: QUALITY.avif }) : image.webp({ quality: QUALITY.webp })).toBuffer();
          files.push({
            rendition: { key: renditionKey(id, ratio, w, format), ratio, format, width: w, height: h, bytes: body.length },
            body: new Uint8Array(body),
          });
        }
      }
    }
    return { width, height, files };
  } catch (err) {
    if (err instanceof UnusableImageError) throw err;
    throw new UnusableImageError(`sharp could not convert it: ${messageOf(err)}`);
  }
}

export interface RenditionsRun {
  made: string[];
  /** Recorded with no renditions: the library shows them as failed. */
  unusable: Array<{ id: string; error: string }>;
  /** Left waiting for the next run (the storage or the database failed). */
  failed: Array<{ id: string; error: string }>;
  /** More images wait than this run finished. */
  more: boolean;
}

/** One run of the worker's job. Throws only when the waiting images cannot be listed. */
export async function makePendingRenditions(
  options: { batch?: number; budgetMs?: number; clock?: () => number } = {}
): Promise<RenditionsRun> {
  const { batch = RENDITIONS_BATCH, budgetMs = RENDITIONS_BUDGET_MS, clock = Date.now } = options;
  const started = clock();
  const pending = await listPendingRenditions(batch + 1);
  const run: RenditionsRun = { made: [], unusable: [], failed: [], more: pending.length > batch };
  const storage = mediaStorage();

  for (const image of pending.slice(0, batch)) {
    if (clock() - started >= budgetMs) {
      run.more = true;
      break;
    }
    try {
      const original = await storage.get(image.storage_key);
      let rendered: Awaited<ReturnType<typeof renderRenditions>>;
      try {
        if (!original) throw new UnusableImageError("the original file is missing");
        rendered = await renderRenditions(image.id, original);
      } catch (err) {
        if (!(err instanceof UnusableImageError)) throw err;
        await recordRenditions(image.id, { renditions: [] });
        run.unusable.push({ id: image.id, error: err.message });
        continue;
      }
      for (const file of rendered.files) {
        await storage.put(file.rendition.key, file.body, RENDITION_CONTENT_TYPES[file.rendition.format]);
      }
      await recordRenditions(image.id, { renditions: rendered.files.map((f) => f.rendition), width: rendered.width, height: rendered.height });
      run.made.push(image.id);
    } catch (err) {
      run.failed.push({ id: image.id, error: messageOf(err) });
    }
  }
  return run;
}
