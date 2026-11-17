import type { Metadata } from "next";
import { renderStoryPage, storyMetadata, type StoryPageProps } from "../../_story/storyPage";

// A Desk story in English: /{section}/{slug}-{number} (Panel 2 design §6). Rendered on every
// request from the database, never cached (design §6, "No caching in Panel 2"), so publishing and
// taking a story down show at once, and the response is no-store for CloudFront.
export const dynamic = "force-dynamic";

export function generateMetadata(props: StoryPageProps): Promise<Metadata> {
  return storyMetadata("en", props);
}

export default function EnglishStoryPage(props: StoryPageProps) {
  return renderStoryPage("en", props);
}
