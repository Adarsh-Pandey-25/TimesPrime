"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StoryArticle from "@timesprime/ui/StoryArticle";
import type { PublishedStory, StoryImageData } from "@timesprime/shared/types";
import type { StoryState } from "@timesprime/shared/config/desk";
import type { Credit } from "./CreditsPanel";
import { deskCall, STATE_LABELS, useAdminMe, when } from "./deskClient";

// The Desk's preview (Panel 2 design §6, owner decision 7): a story's last saved version, drawn by
// the reader site's own view (StoryArticle, with the same text styles), so an editor sees what
// readers will. It stays in the back office: the same session, permission and desk as opening the
// story (GET /api/admin/desk/stories/[id]), with no link a reader could follow.

interface Loaded {
  story: {
    id: string;
    public_id: number;
    language: "en" | "hi";
    section: string;
    format: string;
    slug: string | null;
    workflow_state: StoryState;
    current_revision_id: string | null;
    published_revision_id: string | null;
    correction_note: string | null;
    first_published_at: string | null;
    published_at: string | null;
  };
  revision: {
    id: string;
    headline: string;
    dek: string | null;
    seo_title: string | null;
    seo_description: string | null;
    body: unknown;
    created_at: string;
  } | null;
  credits?: Credit[];
  /** The library's images the revision uses, as the preview draws them (renditions, else the original). */
  images?: Record<string, StoryImageData>;
  /** The credited authors' photos, the same way. */
  photos?: Record<string, StoryImageData>;
}

/** The story as the reader's view takes it, with its last saved revision in place of the live one. */
function asReaderStory({ story, revision, credits = [], images = {}, photos = {} }: Loaded & { revision: NonNullable<Loaded["revision"]> }): PublishedStory {
  return {
    id: story.id,
    public_id: story.public_id,
    language: story.language,
    section: story.section,
    format: story.format,
    slug: story.slug,
    correction_note: story.correction_note,
    first_published_at: story.first_published_at,
    published_at: story.published_at,
    revision: { id: revision.id, headline: revision.headline, dek: revision.dek, seo_title: revision.seo_title, seo_description: revision.seo_description, body: revision.body },
    images,
    photos,
    // As the reader's page credits them: active authors only, by their name in the story's language.
    bylines: credits
      .filter((c) => c.author?.active)
      .map((c) => ({ role: c.role, name: (story.language === "hi" && c.author?.display_name_hi) || (c.author?.display_name_en ?? ""), photoId: c.author?.photo_id ?? null })),
  };
}

export default function StoryPreview({ id }: { id: string }) {
  const { me, error: meError } = useAdminMe();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");

  // Necessary setState-in-effect: the story comes from an async fetch, which cannot run during render.
  useEffect(() => {
    let live = true;
    void deskCall<Loaded>(`/api/admin/desk/stories/${id}`).then((res) => {
      if (!live) return;
      if (res.ok && res.data) setLoaded(res.data);
      else setError(res.error ?? "Could not load the story.");
    });
    return () => {
      live = false;
    };
  }, [id]);

  const back = (
    <Link href={`/admin/desk/${id}`} className="text-sm font-semibold text-blue-700 hover:underline dark:text-blue-300">
      ← Back to the story
    </Link>
  );

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;
  if (me && me.kind !== "staff") {
    return <p role="alert" className="text-sm text-red-700 dark:text-red-300">Sign in with your own staff account to use the Desk. The shared password cannot.</p>;
  }
  if (error) return <div className="space-y-2">{back}<p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p></div>;
  if (!loaded) return <p aria-live="polite" className="text-sm text-slate-500">Loading the preview…</p>;
  const { story, revision } = loaded;
  if (!revision) return <div className="space-y-2">{back}<p className="text-sm text-slate-500">This story has no saved text yet.</p></div>;

  const live = story.workflow_state === "published" && story.published_revision_id === revision.id;
  return (
    <div className="space-y-4">
      <div role="status" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <strong>{live ? "Preview of the live version" : "Preview, not published"}</strong>
        <span>
          {STATE_LABELS[story.workflow_state]} · the last saved version, {when(revision.created_at)}. Unsaved changes on the story screen are not shown.
        </span>
        {back}
      </div>
      <div className="rounded-lg bg-white dark:bg-[#1f2226]">
        <StoryArticle story={asReaderStory({ story, revision, credits: loaded.credits, images: loaded.images, photos: loaded.photos })} sectionLink={false} />
      </div>
    </div>
  );
}
