import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { mediaUrl } from "@timesprime/server/lib/mediaStorage";
import { getMedia, updateMedia, type MediaRow } from "@timesprime/server/repositories/media";
import { mediaFields, RIGHTS_FIELDS } from "../../_lib/media";
import { auditedRecord, badRequest, deskFailure, readBody, type Params } from "../../_lib/desk";

// One image's record (Panel 2 design §7), for a holder of media.manage in the image's desk: its
// credit, source, licence, alt text and captions; clearing its rights, which names who cleared it and
// when, and needs a credit, a source and a licence first; retiring it or bringing it back. Changing
// the credit, source or licence voids a clearance, as a later save voids an approval. Never deleted.
// Audited, with the record before and after.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/media/[id]"].PATCH;

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const checked = mediaFields(body);
  if (!checked.ok) return badRequest(checked.error);
  if ("rights_cleared" in body && typeof body.rights_cleared !== "boolean") return badRequest("rights_cleared: true or false.");
  if ("active" in body && typeof body.active !== "boolean") return badRequest("active: true or false.");

  let before: MediaRow | null;
  try {
    before = id ? await getMedia(id) : null;
  } catch (err) {
    return deskFailure(err, "getMedia");
  }
  if (!before) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const scoped = await requireTarget(actor, RULE, { language: before.language, section: before.section });
  if (!scoped.ok) return scoped.response;

  const fields = { ...checked.fields };
  if (typeof body.active === "boolean") fields.active = body.active;
  const rightsChanged = RIGHTS_FIELDS.some((key) => key in fields && fields[key] !== before[key]);
  if (body.rights_cleared === true) {
    const after = { ...before, ...fields };
    if (!after.credit || !after.source || !after.licence) {
      return NextResponse.json({ error: "Rights are cleared once the credit, source and licence are set.", code: "rights_incomplete" }, { status: 422 });
    }
    fields.rights_cleared_by = actor.userId;
    fields.rights_cleared_at = new Date().toISOString();
  } else if (body.rights_cleared === false || rightsChanged) {
    fields.rights_cleared_by = null;
    fields.rights_cleared_at = null;
  }
  if (Object.keys(fields).length === 0) return badRequest("Name a field to change.");

  const result = await auditedRecord<MediaRow | null>(
    actor,
    { action: "media.update", entityType: "media", entityId: before.id, target: { language: before.language, section: before.section }, before: { ...before }, reason: null },
    () => updateMedia(before.id, fields),
    (row) => ({ ...(row ?? {}) })
  );
  if (!result.ok) return result.response;
  if (!result.value) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  return NextResponse.json({ media: { ...result.value, url: mediaUrl(result.value.storage_key) } });
}
