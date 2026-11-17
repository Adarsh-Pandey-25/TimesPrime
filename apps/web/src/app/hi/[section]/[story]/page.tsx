import type { Metadata } from "next";
import { renderStoryPage, storyMetadata, type StoryPageProps } from "../../../_story/storyPage";

// A Desk story in Hindi: /hi/{section}/{slug}-{number} (Panel 2 design §6, owner decision 1). Only
// story pages live under /hi/ for now; the rest of the site's Hindi addresses wait for Phase F.
// Rendered on every request from the database, never cached, as the English route is.
export const dynamic = "force-dynamic";

export function generateMetadata(props: StoryPageProps): Promise<Metadata> {
  return storyMetadata("hi", props);
}

export default function HindiStoryPage(props: StoryPageProps) {
  return renderStoryPage("hi", props);
}
