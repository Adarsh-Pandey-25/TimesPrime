import "server-only";

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { mediaStorage, mediaUrl } from "@timesprime/server/lib/mediaStorage";
import { createMedia, listMedia, type MediaRow } from "@timesprime/server/repositories/media";
import { STORY_LANGUAGES } from "@timesprime/shared/config/desk";
import { MEDIA_MAX_BYTES, MEDIA_TYPES, sniffMediaType } from "@timesprime/shared/config/media";
import { isSection } from "@timesprime/shared/config/sections";
import { formRecord, mediaFields } from "../_lib/media";
import { auditedRecord, badRequest, deskFailure, scopesFor } from "../_lib/desk";

// The media library (Panel 2 design §7): the images of the caller's desks, and a new image.
// Uploading rides on article.edit in the desk the image is for; the file's type is read from its
// first bytes, never from its name or header; it is kept by the storage (S3 on the server, a folder
// on a laptop) under a new random key, and its record names the desk, who uploaded it and what is
// known of its credit, licence, alt text and caption. Audited.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/media"];

/** A record as the Desk shows it: with the address its file is served at. */
const withUrl = (row: MediaRow) => ({ ...row, url: mediaUrl(row.storage_key) });

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  const language = params.get("language");
  const section = params.get("section");
  try {
    const { media, total } = await listMedia(
      {
        language: language === "en" || language === "hi" ? language : undefined,
        section: section && isSection(section) ? section : undefined,
        includeRetired: params.get("retired") === "1",
      },
      scopesFor(gate.actor, "article.view_admin", ["F", "S", "R"], new Date()),
      Math.max(1, Number(params.get("page")) || 1)
    );
    return NextResponse.json({ media: media.map(withUrl), total });
  } catch (err) {
    return deskFailure(err, "listMedia");
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  // Refused before the body is read when its size says it is too large (the form adds a little).
  if (Number(request.headers.get("content-length") || 0) > MEDIA_MAX_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The image is larger than 15 MB." }, { status: 413 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Send the image as a form (multipart/form-data).");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return badRequest("file: the image.");
  if (file.size > MEDIA_MAX_BYTES) return NextResponse.json({ error: "The image is larger than 15 MB." }, { status: 413 });

  const record = formRecord(form);
  const language = (STORY_LANGUAGES as readonly string[]).includes(String(record.language)) ? (record.language as "en" | "hi") : null;
  const section = typeof record.section === "string" && isSection(record.section) ? record.section : null;
  if (!language || !section) return badRequest("Name the desk the image is for: language and section.");
  // The image's desk; it will be the caller's upload (uploaded_by), which a Writer's Own needs.
  const scoped = await requireTarget(actor, RULES.POST, { language, section, ownerId: actor.userId });
  if (!scoped.ok) return scoped.response;

  const checked = mediaFields(record);
  if (!checked.ok) return badRequest(checked.error);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffMediaType(bytes.subarray(0, 16));
  if (!type) return badRequest("Only JPEG, PNG, WebP or AVIF images.");

  const id = randomUUID();
  const key = `originals/${id}.${MEDIA_TYPES[type]}`;
  const result = await auditedRecord<MediaRow>(
    actor,
    { action: "media.upload", entityType: "media", entityId: id, target: { language, section }, before: null, reason: null },
    async () => {
      await mediaStorage().put(key, bytes, type);
      return createMedia({ id, storage_key: key, content_type: type, bytes: bytes.length, language, section, uploaded_by: actor.userId as string, ...checked.fields });
    },
    (row) => ({ storage_key: row.storage_key, bytes: row.bytes, content_type: row.content_type })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ media: withUrl(result.value) }, { status: 201 });
}
