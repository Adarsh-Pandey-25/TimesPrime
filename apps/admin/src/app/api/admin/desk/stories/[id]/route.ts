import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { getRevision, listCredits, listHistory, listOpenPending, readLock } from "@timesprime/server/repositories/stories";
import { previewImages, previewPhotos } from "@timesprime/server/services/desk/storyImages";
import { deskFailure, gateStory, type Params } from "../../_lib/desk";
import { originalUrl } from "../../_lib/media";

// One story for the Desk's story screen (Panel 2 design §4): the story, its current revision, its
// history, its lock, its open two-person requests and its credits. Read in the story's own scope.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]"];

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gated = await gateStory(request, RULES.GET, id);
  if (!gated.ok) return gated.response;
  const { story } = gated;
  try {
    const [revision, history, lock, pending, credits] = await Promise.all([
      story.current_revision_id ? getRevision(story.current_revision_id) : Promise.resolve(null),
      listHistory(story.id),
      readLock(story.id),
      listOpenPending(story.id),
      listCredits(story.id),
    ]);
    // The library's images the revision uses, for the preview and the editor: renditions once made,
    // else the original through the back office.
    const images = revision ? await previewImages(revision.body, story.language, originalUrl) : {};
    // The credited authors' photos, beside the byline as readers will see them (desk-8).
    const photos = await previewPhotos(credits.filter((c) => c.author?.active).map((c) => ({ photoId: c.author?.photo_id ?? null })), story.language, originalUrl);
    return NextResponse.json({ story, revision, history, lock, pending, credits, images, photos });
  } catch (err) {
    return deskFailure(err, "getStory");
  }
}
