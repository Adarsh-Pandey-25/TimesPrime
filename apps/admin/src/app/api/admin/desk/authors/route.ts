import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { ADMIN_ROUTE_RULES } from "@timesprime/server/auth/adminRoutePolicy";
import { ANY_SCOPE } from "@timesprime/server/auth/decide";
import { requirePermission } from "@timesprime/server/auth/requirePermission";
import { createAuthor, listAuthors, type AuthorRow } from "@timesprime/server/repositories/authors";
import type { AuthorKind } from "@timesprime/shared/config/desk";
import { authorFields } from "../_lib/authors";
import { auditedRecord, badRequest, deskFailure, readBody } from "../_lib/desk";

// The Desk's authors (Panel 2 design §7): the list, which anyone on the Desk reads to credit a story
// (retired ones only on request), and a new author, for a holder of author.manage. Authors belong
// to no desk, so author.manage is decided in any scope (the matrix's F for a Desk Editor). Audited.
const RULES = ADMIN_ROUTE_RULES["/api/admin/desk/authors"];

export async function GET(request: NextRequest) {
  const gate = await requirePermission(request, RULES.GET);
  if (!gate.ok) return gate.response;
  const includeRetired = new URL(request.url).searchParams.get("all") === "1";
  try {
    return NextResponse.json({ authors: await listAuthors(includeRetired) });
  } catch (err) {
    return deskFailure(err, "listAuthors");
  }
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(request, RULES.POST, ANY_SCOPE);
  if (!gate.ok) return gate.response;
  const body = await readBody(request);
  if (body === null) return badRequest("The request body must be a JSON object.");
  const checked = authorFields(body, true);
  if (!checked.ok) return badRequest(checked.error);
  const fields = checked.fields as typeof checked.fields & { display_name_en: string; kind: AuthorKind };

  const result = await auditedRecord<AuthorRow>(
    gate.actor,
    { action: "author.create", entityType: "author", entityId: "new", before: null, reason: null },
    () => createAuthor(fields),
    (author) => ({ id: author.id, display_name_en: author.display_name_en, kind: author.kind })
  );
  if (!result.ok) return result.response;
  return NextResponse.json({ author: result.value }, { status: 201 });
}
