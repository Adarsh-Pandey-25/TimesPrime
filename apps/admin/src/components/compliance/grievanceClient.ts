"use client";

import {
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_CHANNEL_LABELS,
  GRIEVANCE_OUTCOME_LABELS,
  grievanceClock,
  type ClockFields,
  type GrievanceCategory,
  type GrievanceChannel,
  type GrievanceOutcome,
} from "@timesprime/shared/config/grievances";
import { when } from "../desk/deskClient";
import { tone } from "../ui/styles";

// What the Compliance screens (Panel 7 design §4) share: a grievance as the API sends it, and its
// clock as words and a colour. The screens decide nothing: the server says whether the caller may
// act (may_handle), and decides each change.

export interface Grievance extends ClockFields {
  id: string;
  ticket: string;
  channel: GrievanceChannel;
  language: "en" | "hi";
  name: string;
  email: string;
  contact_shown: boolean;
  about_url: string | null;
  story_id: string | null;
  category: GrievanceCategory;
  body: string;
  received_at: string;
  entered_by: string | null;
  acknowledged_by: string | null;
  assigned_to: string | null;
  outcome: GrievanceOutcome | null;
  reply: string | null;
  decided_by: string | null;
  names: Record<string, string>;
}

export const categoryLabel = (c: GrievanceCategory) => GRIEVANCE_CATEGORY_LABELS[c]?.en ?? c;
export const channelLabel = (c: GrievanceChannel) => GRIEVANCE_CHANNEL_LABELS[c] ?? c;
export const outcomeLabel = (o: GrievanceOutcome) => GRIEVANCE_OUTCOME_LABELS[o]?.en ?? o;
export const nameOf = (g: Grievance, id: string | null) => (id ? (g.names[id] ?? "a staff member") : null);

/** A grievance's clock as the queue shows it: the words, and the badge's colour. */
export function clockBadge(g: Grievance, now: number): { text: string; className: string } {
  const clock = grievanceClock(g, now);
  switch (clock.kind) {
    case "late":
      return { text: `Late: the decision was due ${when(clock.at)}`, className: tone.red };
    case "ack_late":
      return { text: `Acknowledge now: it was due ${when(clock.at)}`, className: tone.red };
    case "ack_due":
      return { text: `Acknowledge by ${when(clock.at)}`, className: tone.amber };
    case "due_soon":
      return { text: `Decide by ${when(clock.at)}`, className: tone.amber };
    case "due":
      return { text: `Decide by ${when(clock.at)}`, className: tone.slate };
    case "decided":
      return clock.onTime ? { text: `Decided ${when(clock.at)}`, className: tone.green } : { text: `Decided late, ${when(clock.at)}`, className: tone.red };
  }
}
