import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { requireTarget } from "@timesprime/server/auth/requirePermission";
import { transition, type MoveFields } from "@timesprime/server/repositories/stories";
import { PRE_PUBLISH_STATES } from "@timesprime/shared/config/desk";
import { audited, badRequest, gateStory, readBody, staffLabel, storyTarget, type Params } from "../../../_lib/desk";

// A story's details, apart from its text (Panel 2 design §3): the slug, the embargo and the
// legal-review flag, which the pre-publish checklist reads. Set before publication only, so a live
// story's address never changes. Changing an approved story's details voids the approval, as saving
// its text does: four-eyes holds for what is published. Only a holder of article.approve may clear
// the legal-review flag. Recorded in the story's history as "details", and audited.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/details"].POST;

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gateStory(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  if (!PRE_PUBLISH_STATES.includes(story.workflow_state)) {
    return NextResponse.json({ error: "A story's details are set before it is published.", code: "wrong_state" }, { status: 409 });
  }

  const fields: MoveFields = {};
  if ("slug" in body) {
    const slug = body.slug === null || body.slug === "" ? null : typeof body.slug === "string" ? body.slug.trim().toLowerCase() : undefined;
    if (slug === undefined || (slug !== null && (slug.length > 80 || !SLUG.test(slug)))) {
      return badRequest("slug: lowercase letters, digits and single hyphens, at most 80 characters.");
    }
    fields.slug = slug;
  }
  if ("embargo_until" in body) {
    const at = body.embargo_until === null || body.embargo_until === "" ? null : typeof body.embargo_until === "string" ? Date.parse(body.embargo_until) : NaN;
    if (at !== null && !Number.isFinite(at)) return badRequest("embargo_until must be a time, or null.");
    fields.embargo_until = at === null ? null : new Date(at).toISOString();
  }
  if ("legal_review_required" in body) {
    if (typeof body.legal_review_required !== "boolean") return badRequest("legal_review_required must be true or false.");
    if (story.legal_review_required && !body.legal_review_required) {
      const clearing = await requireTarget(actor, { ...RULE, permissions: ["article.approve"] }, storyTarget(story));
      if (!clearing.ok) return clearing.response;
    }
    fields.legal_review_required = body.legal_review_required;
  }
  if (Object.keys(fields).length === 0) return badRequest("Name a detail to change: slug, embargo_until or legal_review_required.");

  const to = story.workflow_state === "approved" ? "desk_review" : story.workflow_state;
  if (to !== story.workflow_state) Object.assign(fields, { approved_by: null, approved_revision_id: null });

  const result = await audited(
    actor,
    { action: "story.details", story },
    () => transition({ storyId: story.id, action: "details", from: story.workflow_state, to, actorId: actor.userId, actorLabel: staffLabel(actor), reason: null, fields }),
    (updated) => ({ state: updated.workflow_state, slug: updated.slug, embargo_until: updated.embargo_until, legal_review_required: updated.legal_review_required })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ story: result.value });
}
