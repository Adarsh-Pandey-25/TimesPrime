import "server-only";

/**
 * Four-eyes (Panel 2 design §3; the access rules, "Four-eyes, takedown and MFA rules"): a story's
 * revision is approved by someone who neither created the story nor edited what is being approved.
 * Read from the story's history (workflow_transitions), on the server, never from the request.
 */

export interface HistoryRow {
  action: string;
  actorId: string | null;
}

/**
 * The people who may not approve the story's current revision: its creator, and everyone who saved
 * it since its last approval (for a first approval, since it was created). Saving after an approval
 * voids that approval (the database's desk_save_revision), so these are exactly the editors of what
 * is now being approved.
 */
export function editorsSinceApproval(createdBy: string, history: readonly HistoryRow[]): Set<string> {
  const editors = new Set<string>([createdBy]);
  let lastApproval = -1;
  history.forEach((row, i) => {
    if (row.action === "approve") lastApproval = i;
  });
  history.forEach((row, i) => {
    if (i > lastApproval && (row.action === "save" || row.action === "create") && row.actorId) editors.add(row.actorId);
  });
  return editors;
}

/** Whether `approverId` may approve the current revision. */
export function mayApprove(approverId: string, createdBy: string, history: readonly HistoryRow[]): boolean {
  return !editorsSinceApproval(createdBy, history).has(approverId);
}

/**
 * Whether `reviewerId` may give a breaking story's post-hoc review (design §3, "Publish direct"): a
 * different editor from the one who published it, and not one of its editors either.
 */
export function mayReviewPostHoc(reviewerId: string, createdBy: string, history: readonly HistoryRow[]): boolean {
  const publishers = history.filter((r) => r.action === "publish_direct").map((r) => r.actorId);
  return !publishers.includes(reviewerId) && mayApprove(reviewerId, createdBy, history);
}
