import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { listRevisions, readLock, saveRevision } from "@timesprime/server/repositories/stories";
import { LOCK_TTL_MS } from "@timesprime/shared/config/desk";
import { storyImagesWellFormed } from "@timesprime/shared/config/media";
import { audited, badRequest, deskFailure, gateStory, readBody, type Params } from "../../../_lib/desk";

// A story's revisions (Panel 2 design §3): the list, and saving a new one. A save never overwrites:
// it adds an immutable revision, refused if someone saved since the editor started (409), or while
// someone else holds the lock.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/revisions"];

const MAX_BODY_CHARS = 500_000;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateStory(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  try {
    return NextResponse.json({ revisions: await listRevisions(gated.story.id) });
  } catch (err) {
    return deskFailure(err, "listRevisions");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gateStory(request, RULES.POST, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  const headline = text(body.headline);
  const doc = body.body;
  if (!headline) return badRequest("A headline is required.");
  if (typeof doc !== "object" || doc === null || Array.isArray(doc) || JSON.stringify(doc).length > MAX_BODY_CHARS) {
    return badRequest("body must be a document of at most 500,000 characters.");
  }
  // Each image names a library image and a crop; the database records its use with the revision.
  if (!storyImagesWellFormed(doc)) return badRequest("An image in the story is not from the media library.");
  const expected = typeof body.expected_revision_id === "string" ? body.expected_revision_id : null;

  try {
    const lock = await readLock(story.id);
    if (lock && lock.holder_id !== actor.userId && Date.now() - Date.parse(lock.heartbeat_at) < LOCK_TTL_MS) {
      return NextResponse.json({ error: "Someone else is editing this story.", code: "locked", holder: lock.holder_id }, { status: 409 });
    }
  } catch (err) {
    return deskFailure(err, "readLock");
  }

  const result = await audited(
    actor,
    { action: "story.save", story },
    () =>
      saveRevision({
        storyId: story.id,
        actorId: actor.userId as string,
        expectedRevisionId: expected,
        headline,
        dek: text(body.dek),
        body: doc,
        seoTitle: text(body.seo_title),
        seoDescription: text(body.seo_description),
        isSubstantive: body.is_substantive === true,
      }),
    (updated) => ({ state: updated.workflow_state, revision: updated.current_revision_id })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ story: result.value });
}
