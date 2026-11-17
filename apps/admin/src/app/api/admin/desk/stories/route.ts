import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { auditUnavailable, beginAudit, finishAudit, requirePermission, requireTarget, type Actor } from "@timesprime/server/auth/requirePermission";
import { createStory, listStories, type DeskScope, type ListFilters } from "@timesprime/server/repositories/stories";
import { DESK_FORMATS, STORY_LANGUAGES, STORY_STATES, type StoryFormat, type StoryLanguage, type StoryState } from "@timesprime/shared/config/desk";
import { isSection } from "@timesprime/shared/config/sections";
import { badRequest, deskFailure, readBody } from "../_lib/desk";

// The Desk's story list and new stories (Panel 2 design §4). Staff only: the rule refuses the shared
// password. The list holds only stories inside the caller's scopes for article.view_admin.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/stories"];

/** The desks the caller may read: each live assignment whose role grants article.view_admin to read. */
function readableScopes(actor: Actor, now: Date): DeskScope[] {
  return (actor.record?.assignments ?? [])
    .filter((a) => a.revokedAt === null && Date.parse(a.expiresAt) > now.getTime())
    .filter((a) => a.grants.some((g) => g.permission === "article.view_admin" && ["F", "S", "R"].includes(g.access)))
    .map((a) => ({ language: a.language, section: a.section }));
}

const oneOf = <T extends string>(value: string | null, allowed: readonly T[]): T | undefined =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const { searchParams } = new URL(request.url);
  const section = searchParams.get("section");
  const filters: ListFilters = {
    language: oneOf<StoryLanguage>(searchParams.get("language"), STORY_LANGUAGES),
    section: section && isSection(section) ? section : undefined,
    state: oneOf<StoryState>(searchParams.get("state"), STORY_STATES),
    createdBy: searchParams.get("mine") === "1" ? (gate.actor.userId ?? undefined) : undefined,
    postHocReviewDue: searchParams.get("post_hoc") === "1" || undefined,
  };
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  try {
    const { stories, total } = await listStories(filters, readableScopes(gate.actor, new Date()), page);
    return NextResponse.json({ stories, total, page });
  } catch (err) {
    return deskFailure(err, "listStories");
  }
}

/** The largest story body the Desk accepts, as JSON text. */
const MAX_BODY_CHARS = 500_000;

export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const actor = gate.actor;

  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const language = oneOf<StoryLanguage>(typeof body.language === "string" ? body.language : null, STORY_LANGUAGES);
  const section = typeof body.section === "string" && isSection(body.section) ? body.section : undefined;
  const format = oneOf<StoryFormat>(typeof body.format === "string" ? body.format : "news", DESK_FORMATS);
  const state = body.state === "pitch" ? "pitch" : "draft";
  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  const dek = typeof body.dek === "string" && body.dek.trim() ? body.dek.trim() : null;
  const doc = body.body ?? { type: "doc", content: [] };
  const translationGroupId = typeof body.translation_group_id === "string" ? body.translation_group_id : null;
  if (!language) return badRequest("language must be en or hi.");
  if (!section) return badRequest("section must be one of the Desk's sections.");
  if (!format) return badRequest("This format is not on the Desk yet.");
  if (!headline) return badRequest("A headline is required.");
  if (typeof doc !== "object" || doc === null || Array.isArray(doc) || JSON.stringify(doc).length > MAX_BODY_CHARS) {
    return badRequest("body must be a document of at most 500,000 characters.");
  }

  // The new story's own desk; it will be the caller's, which a Writer's Own needs.
  const target = { language, section, ownerId: actor.userId };
  const scoped = await requireTarget(actor, RULES.POST, target);
  if (!scoped.ok) return scoped.response;

  const entry = { action: "story.create", entityType: "story", entityId: "new", target, before: null, reason: null };
  const attempt = await beginAudit(actor, entry);
  if (!attempt) return auditUnavailable();
  try {
    const story = await createStory({ actorId: actor.userId as string, language, section, format, state, headline, dek, body: doc, translationGroupId });
    await finishAudit(actor, attempt, "succeeded", { ...entry, entityId: story.id, after: { state: story.workflow_state, revision: story.current_revision_id } });
    return NextResponse.json({ story }, { status: 201 });
  } catch (err) {
    await finishAudit(actor, attempt, "failed", { ...entry, reason: err instanceof Error ? err.message : String(err) });
    return deskFailure(err, "createStory");
  }
}
