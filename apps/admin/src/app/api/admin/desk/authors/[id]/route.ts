import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { getAuthor, updateAuthor, type AuthorRow } from "@timesprime/server/repositories/authors";
import { authorFields } from "../../_lib/authors";
import { auditedRecord, badRequest, deskFailure, readBody, type Params } from "../../_lib/desk";

// One author's record (Panel 2 design §7): a holder of author.manage edits it, or retires it
// (active false) or brings it back. Never deleted: a retired author stays credited on what they
// wrote, and cannot be credited again. Audited, with the record before and after.
const RULE = ADMIN_ROUTE_RULES["/api/admin/desk/authors/[id]"].PATCH;

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const gate = await requirePermission(request, RULE, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const checked = authorFields(body, false);
  if (!checked.ok) return badRequest(checked.error);

  let before: AuthorRow | null;
  try {
    before = id ? await getAuthor(id) : null;
  } catch (err) {
    return deskFailure(err, "getAuthor");
  }
  if (!before) return NextResponse.json({ error: "Author not found." }, { status: 404 });

  const result = await auditedRecord<AuthorRow | null>(
    gate.actor,
    { action: "author.update", entityType: "author", entityId: before.id, before: { ...before }, reason: null },
    () => updateAuthor(before.id, checked.fields),
    (author) => ({ ...(author ?? {}) })
  );
  if (!result.ok) return result.response;
  if (!result.value) return NextResponse.json({ error: "Author not found." }, { status: 404 });
  return NextResponse.json({ author: result.value });
}
