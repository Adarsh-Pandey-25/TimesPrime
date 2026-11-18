import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission, requireTarget } from "@timesprime/server/auth/requirePermission";
import { mediaStorage } from "@timesprime/server/lib/mediaStorage";
import { getMedia, type MediaRow } from "@timesprime/server/repositories/media";
import { deskFailure, type Params } from "../../../_lib/desk";

// An image's original (Panel 2 design §7), for staff in the image's desk, as the library is. It
// keeps the camera's metadata (EXIF can say where a photo was taken), so it never reaches readers:
// they get the renditions the worker makes without it, and CloudFront serves /media/renditions/*
// alone. A read, so not audited, as opening a story is not.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/media/[id]/original"].GET;

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;

  let image: MediaRow | null;
  try {
    image = id ? await getMedia(id) : null;
  } catch (err) {
    return deskFailure(err, "getMedia");
  }
  if (!image) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const scoped = await requireTarget(gate.actor, RULE, { language: image.language, section: image.section });
  if (!scoped.ok) return scoped.response;

  let body: Uint8Array | null;
  try {
    body = await mediaStorage().get(image.storage_key);
  } catch (err) {
    return deskFailure(err, "getOriginal");
  }
  if (!body) return NextResponse.json({ error: "The image's file is missing." }, { status: 404 });
  return new Response(body as BodyInit, {
    headers: {
      "content-type": image.content_type,
      // Staff only: kept by their browser for a while, never by a shared cache.
      "cache-control": "private, max-age=600",
      "x-content-type-options": "nosniff",
    },
  });
}
