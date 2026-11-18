import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { setCredits, type StoryRow } from "@timesprime/server/repositories/stories";
import { CREDIT_ROLES, CREDITS_MAX, PRE_PUBLISH_STATES, type CreditRole } from "@timesprime/shared/config/desk";
import { audited, badRequest, gateStory, readBody, staffLabel, type Params } from "../../../_lib/desk";

// A story's credits (Panel 2 design §2 and §7): its bylines, additional reporting and translator,
// each an author record, in the order the reader's page shows them. Set with article.edit, in the
// story's desk, before publication only, so a live page's credits never change unseen. Setting them
// on an approved story voids the approval, as a change to its details does (desk_set_credits does
// both in one transaction). Audited, and in the story's history.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/stories/[id]/credits"].POST;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const gated = await gateStory(request, RULE, id);
  if (!gated.ok) return gated.response;
  const { actor, story } = gated;

  if (!PRE_PUBLISH_STATES.includes(story.workflow_state)) {
    return NextResponse.json({ error: "A story's credits are set before it is published.", code: "wrong_state" }, { status: 409 });
  }
  const list = Array.isArray(body.credits) ? body.credits : null;
  if (!list || list.length > CREDITS_MAX) return badRequest(`credits: a list of at most ${CREDITS_MAX}.`);
  const credits: Array<{ author_id: string; role: CreditRole }> = [];
  for (const item of list) {
    const author = typeof item?.author_id === "string" ? item.author_id : "";
    const role = typeof item?.role === "string" ? item.role : "";
    if (!UUID.test(author) || !(CREDIT_ROLES as readonly string[]).includes(role)) {
      return badRequest(`Each credit names an author_id and a role (${CREDIT_ROLES.join(", ")}).`);
    }
    if (credits.some((c) => c.author_id === author && c.role === role)) return badRequest("An author is credited once in each role.");
    credits.push({ author_id: author, role: role as CreditRole });
  }

  const result = await audited<StoryRow>(
    actor,
    { action: "story.credits", story },
    () => setCredits({ storyId: story.id, from: story.workflow_state, actorId: actor.userId as string, actorLabel: staffLabel(actor), credits }),
    (updated) => ({ state: updated.workflow_state, credits })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ story: result.value });
}
