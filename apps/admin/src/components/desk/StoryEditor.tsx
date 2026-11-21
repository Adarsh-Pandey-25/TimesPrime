"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { Share2 } from "lucide-react";
import { embedProvider, isAllowedHref, EMPTY_DOC } from "@timesprime/editor/schema";
import { wordCount } from "@timesprime/editor/text";
import { CORRECTION_KIND_LABELS, CORRECTION_KINDS, type CorrectionKind } from "@timesprime/shared/config/corrections";
import { checklist, CORRECTION_NOTE_MAX, holdsDeskReview, move, PRE_PUBLISH_STATES, PUBLISH_TICK_MINUTES, TAKEDOWN_REASONS, type ChecklistProblem, type DeskAction, type StoryState } from "@timesprime/shared/config/desk";
import { storyImageIds } from "@timesprime/shared/config/media";
import { SITE_URL } from "@timesprime/shared/config/site";
import { deskStoryPath, storySlug } from "@timesprime/shared/lib/storyUrl";
import { whatsAppMessage } from "@timesprime/shared/lib/whatsApp";
import { canAct, canAsk, deskCall, STATE_LABELS, STATE_STYLES, useAdminMe, when } from "./deskClient";
import CreditsPanel, { type Credit } from "./CreditsPanel";
import { editorExtensions } from "./editorImage";
import ImagePicker from "./ImagePicker";
import RevisionsPanel, { type FullRevision } from "./RevisionsPanel";
import ActionMessage, { type Message } from "../ui/ActionMessage";
import { useDialog } from "../ui/Feedback";
import { backLink, badge, button, buttonDanger, buttonPrimary, card, field, hint, label, panel, panelTitle, tone } from "../ui/styles";

// The story screen (Panel 2 design §4 and §5): the editor, the story's details, the pre-publish
// checklist, the moves its state allows, its open two-person requests, its revisions and its
// history. The server decides every request; this screen only shows what the person might do.

interface Story {
  id: string;
  public_id: number;
  language: "en" | "hi";
  section: string;
  /** "live_blog" shows the Live updates panel (Panel 3, M3). */
  format: string;
  workflow_state: StoryState;
  slug: string | null;
  embargo_until: string | null;
  legal_review_required: boolean;
  current_revision_id: string | null;
  published_revision_id: string | null;
  scheduled_at: string | null;
  post_hoc_review_due: boolean;
  correction_note: string | null;
}
interface Revision {
  id: string;
  headline: string;
  dek: string | null;
  seo_title: string | null;
  seo_description: string | null;
  body: unknown;
}
interface HistoryEntry {
  action: string;
  to_state: StoryState;
  actor_label: string;
  reason: string | null;
  at: string;
}
interface Pending {
  id: string;
  action: string;
  requested_by: string;
  reason: string;
}
interface Loaded {
  story: Story;
  revision: Revision | null;
  history: HistoryEntry[];
  pending: Pending[];
  credits: Credit[];
}

const PROBLEM_TEXT: Record<ChecklistProblem, string> = {
  headline_missing: "A headline",
  headline_too_long: "A headline of at most 110 characters",
  dek_missing: "A dek (the line under the headline)",
  seo_title_missing: "An SEO title",
  seo_title_too_long: "An SEO title of at most 65 characters",
  slug_missing: "A slug (the story's address)",
  legal_review_pending: "The legal review cleared",
  translation_missing: "The other language's version",
  image_unavailable: "Every image in the media library, not retired, its licence not ended",
  image_rights_missing: "Every image's credit, source, licence and cleared rights",
  image_text_missing: "Every image's alt text and caption in the story's language",
};

/** The moves the screen offers, in the order an editor meets them; the server decides each. */
const MOVES_SHOWN: Array<{ action: DeskAction; route: string; label: string; needs?: "reason" | "schedule" | "takedown"; tone?: "primary" | "danger" }> = [
  { action: "submit", route: "submit", label: "Submit", tone: "primary" },
  { action: "send_back", route: "send-back", label: "Send back", needs: "reason" },
  { action: "approve", route: "approve", label: "Approve", tone: "primary" },
  { action: "schedule", route: "schedule", label: "Schedule", needs: "schedule" },
  { action: "unschedule", route: "unschedule", label: "Unschedule" },
  { action: "publish", route: "publish", label: "Publish", tone: "primary" },
  { action: "publish_direct", route: "publish-direct", label: "Publish now (breaking)", tone: "primary" },
  { action: "unpublish", route: "unpublish", label: "Take down", needs: "takedown", tone: "danger" },
  { action: "retract", route: "retract", label: "Retract", needs: "takedown", tone: "danger" },
  { action: "kill", route: "kill", label: "Kill", needs: "reason", tone: "danger" },
];
const MOVE_STYLE = { primary: buttonPrimary, danger: buttonDanger, normal: button } as const;

const SAVABLE: StoryState[] = ["pitch", "assigned", "draft", "in_review", "desk_review", "approved", "published"];

function Toolbar({ editor, disabled, onImage, onGallery }: { editor: Editor | null; disabled: boolean; onImage: () => void; onGallery: () => void }) {
  const dialog = useDialog();
  if (!editor) return null;
  const run = (fn: () => unknown) => () => {
    if (!disabled) void fn();
  };

  // Link, related story and embed ask for an address in a popup, which checks it before it closes.
  async function addLink(ed: Editor) {
    const current = (ed.getAttributes("link").href as string | undefined) ?? "";
    const values = await dialog.form({
      title: current ? "Change the link" : "Add a link",
      message: "Select the words first. Leave the address empty to remove the link.",
      fields: [{ name: "href", label: "Address", placeholder: "https://… or /section/…", defaultValue: current }],
      submitLabel: "Apply",
      validate: ({ href }) => (!href.trim() || isAllowedHref(href.trim()) ? null : "Only https links, site paths or mailto are allowed."),
    });
    if (!values) return;
    const href = values.href.trim();
    if (!href) ed.chain().focus().unsetLink().run();
    else ed.chain().focus().setLink({ href }).run();
  }

  async function addRelated(ed: Editor) {
    const values = await dialog.form({
      title: "Add a related story",
      fields: [
        { name: "href", label: "The story's address", placeholder: "https://… or /section/…" },
        { name: "title", label: "Its headline" },
      ],
      submitLabel: "Add",
      validate: ({ href }) => (isAllowedHref(href.trim()) ? null : "Only https links or site paths are allowed."),
    });
    if (!values) return;
    ed.chain().focus().insertContent({ type: "relatedLink", attrs: { href: values.href.trim(), title: values.title.trim() } }).run();
  }

  async function addEmbed(ed: Editor) {
    const values = await dialog.form({
      title: "Embed a post",
      message: "It shows on the site as a link to the post.",
      fields: [{ name: "url", label: "A YouTube, X or Instagram post", placeholder: "https://…" }],
      submitLabel: "Embed",
      validate: ({ url }) => (embedProvider(url.trim()) ? null : "Only YouTube, X and Instagram posts can be embedded."),
    });
    if (!values) return;
    ed.chain().focus().insertContent({ type: "embed", attrs: { url: values.url.trim() } }).run();
  }
  const tool = (label: string, onClick: () => void, active = false) => (
    <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className={`${button} ${active ? "bg-slate-200 dark:bg-[#33373d]" : ""}`}>
      {label}
    </button>
  );
  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-1.5">
      {tool("Bold", run(() => editor.chain().focus().toggleBold().run()), editor.isActive("bold"))}
      {tool("Italic", run(() => editor.chain().focus().toggleItalic().run()), editor.isActive("italic"))}
      {tool("Heading", run(() => editor.chain().focus().toggleHeading({ level: 2 }).run()), editor.isActive("heading", { level: 2 }))}
      {tool("Subheading", run(() => editor.chain().focus().toggleHeading({ level: 3 }).run()), editor.isActive("heading", { level: 3 }))}
      {tool("• List", run(() => editor.chain().focus().toggleBulletList().run()), editor.isActive("bulletList"))}
      {tool("1. List", run(() => editor.chain().focus().toggleOrderedList().run()), editor.isActive("orderedList"))}
      {tool("Quote", run(() => editor.chain().focus().toggleBlockquote().run()), editor.isActive("blockquote"))}
      {tool("Link", run(() => addLink(editor)), editor.isActive("link"))}
      {tool("Factbox", run(() => editor.chain().focus().insertContent({ type: "factbox", content: [{ type: "paragraph" }] }).run()))}
      {tool("Related story", run(() => addRelated(editor)))}
      {tool("Embed", run(() => addEmbed(editor)))}
      {tool("Image", run(onImage))}
      {tool("Gallery", run(onGallery))}
      {tool("Ad slot", run(() => editor.chain().focus().insertContent({ type: "adSlot" }).run()))}
    </div>
  );
}

// A live blog's updates (Panel 3, M3), loaded only when the story is one: other stories carry none
// of the panel's code. React's own lazy: the screen renders only in the browser, once the story has
// loaded, and React is already on the page.
const LiveUpdatesPanel = lazy(() => import("./LiveUpdatesPanel"));

export default function StoryEditor({ id }: { id: string }) {
  const { me, error: meError } = useAdminMe();
  const dialog = useDialog();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState("");
  const [headline, setHeadline] = useState("");
  const [dek, setDek] = useState("");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [substantive, setSubstantive] = useState(false);
  const [dirty, setDirty] = useState(false);
  // An answer shows beside what asked: the editor's (Save) under it, the workflow's in the side column.
  const [message, setMessage] = useState<(Message & { area: "editor" | "side" }) | null>(null);
  const say = (area: "editor" | "side", m: Message | null) => setMessage(m ? { ...m, area } : null);
  const [busy, setBusy] = useState(false);
  const [lockHolder, setLockHolder] = useState<string | null>(null);
  const [lockReady, setLockReady] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonCode, setReasonCode] = useState<string>(TAKEDOWN_REASONS[0]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [slug, setSlug] = useState("");
  const [embargo, setEmbargo] = useState("");
  const [correction, setCorrection] = useState("");
  // Panel 7, M2: what the correction is (decision 6), and the grievance that caused it, by its ticket.
  const [correctionKind, setCorrectionKind] = useState<CorrectionKind>("correction");
  const [correctionTicket, setCorrectionTicket] = useState("");

  // The text fields follow the story's current revision, as the editor's body does (it is rebuilt
  // when that revision changes). A details change or a move adds no revision, so it leaves unsaved
  // text alone instead of resetting the fields while the body keeps its changes.
  const shownRevision = useRef<string | null | undefined>(undefined);
  const load = useCallback(async () => {
    const res = await deskCall<Loaded>(`/api/admin/desk/stories/${id}`);
    if (!res.ok || !res.data) return setLoadError(res.error ?? "Could not load the story.");
    const data = { ...res.data, history: res.data.history ?? [], pending: res.data.pending ?? [], credits: res.data.credits ?? [] };
    setLoaded(data);
    setSlug(data.story.slug ?? "");
    setEmbargo(data.story.embargo_until ? data.story.embargo_until.slice(0, 16) : "");
    const revisionId = data.revision?.id ?? null;
    if (shownRevision.current === revisionId) return;
    shownRevision.current = revisionId;
    setHeadline(data.revision?.headline ?? "");
    setDek(data.revision?.dek ?? "");
    setSeoTitle(data.revision?.seo_title ?? "");
    setSeoDescription(data.revision?.seo_description ?? "");
    setDirty(false);
  }, [id]);

  // Necessary setState-in-effect: the story comes from an async fetch, which cannot run during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const story = loaded?.story ?? null;
  const mayEdit = Boolean(story && canAct(me, "article.edit") && SAVABLE.includes(story.workflow_state));
  const editable = mayEdit && lockReady && lockHolder === null;

  // The soft lock: taken when the screen opens, renewed every 30 seconds, released when it closes.
  const holdLock = useCallback(
    async (takeOver = false) => {
      const res = await deskCall<{ holder?: string }>(`/api/admin/desk/stories/${id}/lock`, {
        method: "POST",
        body: JSON.stringify(takeOver ? { take_over: true } : {}),
      });
      setLockHolder(res.status === 409 ? (res.data?.holder ?? "someone else") : null);
      setLockReady(true);
    },
    [id]
  );
  const storyLoaded = story !== null;
  useEffect(() => {
    if (!storyLoaded || !mayEdit) return;
    // Necessary setState-in-effect: the lock's state comes back from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void holdLock();
    const timer = window.setInterval(() => void holdLock(), 30_000);
    return () => {
      window.clearInterval(timer);
      void fetch(`/api/admin/desk/stories/${id}/lock`, { method: "DELETE", credentials: "include", keepalive: true });
    };
  }, [storyLoaded, mayEdit, holdLock, id]);

  const extensions = useMemo(() => editorExtensions(), []);
  const [picking, setPicking] = useState<"image" | "gallery" | null>(null);
  const revisionKey = loaded?.revision?.id ?? "none";
  const editor = useEditor(
    {
      extensions,
      content: (loaded?.revision?.body as object | undefined) ?? EMPTY_DOC,
      immediatelyRender: false,
      editable,
      onUpdate: () => setDirty(true),
      editorProps: {
        attributes: {
          class: "story-editor min-h-[320px] rounded-lg border border-slate-300 bg-white p-4 text-base leading-relaxed focus:outline-none dark:border-[#3a3f47] dark:bg-[#1f2226]",
          "aria-label": "Story text",
          lang: story?.language ?? "en",
        },
      },
    },
    [revisionKey]
  );
  useEffect(() => {
    // false: no update event. Tiptap sends one by default, and onUpdate would mark an untouched
    // story as having unsaved changes.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  async function save() {
    if (!story) return;
    setBusy(true);
    const res = await deskCall<{ story: Story }>(`/api/admin/desk/stories/${id}/revisions`, {
      method: "POST",
      body: JSON.stringify({
        expected_revision_id: story.current_revision_id,
        headline,
        dek,
        seo_title: seoTitle,
        seo_description: seoDescription,
        is_substantive: substantive,
        body: editor?.getJSON() ?? EMPTY_DOC,
      }),
    });
    setBusy(false);
    if (res.ok) {
      say("editor", { ok: true, text: "Saved as a new revision." });
      await load();
    } else {
      say("editor", { ok: false, text: res.status === 409 && !res.data ? res.error ?? "" : res.error ?? "Not saved." });
    }
  }

  /** An old revision back in the editor, unsaved: Save adds it as a new revision (design §3). */
  async function bringBack(revision: FullRevision, number: number): Promise<boolean> {
    if (
      dirty &&
      !(await dialog.confirm({
        title: `Replace your unsaved changes with revision ${number}?`,
        message: `What you have not saved is lost. Revision ${number} fills the editor, and Save keeps it as a new revision.`,
        confirmLabel: "Replace them",
        tone: "danger",
      }))
    ) {
      return false;
    }
    setHeadline(revision.headline);
    setDek(revision.dek ?? "");
    setSeoTitle(revision.seo_title ?? "");
    setSeoDescription(revision.seo_description ?? "");
    editor?.commands.setContent((revision.body as object | null) ?? EMPTY_DOC);
    setDirty(true);
    say("editor", null);
    return true;
  }

  async function saveDetails() {
    if (!story) return;
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${id}/details`, {
      method: "POST",
      body: JSON.stringify({ slug: slug || null, embargo_until: embargo ? new Date(embargo).toISOString() : null }),
    });
    setBusy(false);
    say("side", res.ok ? { ok: true, text: "Details saved." } : { ok: false, text: res.error ?? "Details not saved." });
    if (res.ok) await load();
  }

  async function setLegalReview(required: boolean) {
    const res = await deskCall(`/api/admin/desk/stories/${id}/details`, { method: "POST", body: JSON.stringify({ legal_review_required: required }) });
    say("side", res.ok ? { ok: true, text: required ? "Marked for legal review." : "Legal review cleared." } : { ok: false, text: res.error ?? "Not changed." });
    if (res.ok) await load();
  }

  async function doMove(route: string, needs?: "reason" | "schedule" | "takedown") {
    if (
      dirty &&
      !(await dialog.confirm({
        title: "Take this step with unsaved changes?",
        message: "Unsaved changes are not part of this step. Save first to include them.",
        confirmLabel: "Take the step",
      }))
    ) {
      return;
    }
    const body: Record<string, unknown> = {};
    if (needs === "reason" || needs === "takedown") body.reason = reason;
    if (needs === "takedown") body.reason_code = reasonCode;
    if (needs === "schedule") body.scheduled_at = scheduleAt ? new Date(scheduleAt).toISOString() : "";
    setBusy(true);
    const res = await deskCall<{ problems?: ChecklistProblem[] }>(`/api/admin/desk/stories/${id}/${route}`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (res.ok) {
      say("side", { ok: true, text: "Done." });
      setReason("");
      await load();
    } else {
      const problems = (res.data as { problems?: ChecklistProblem[] } | null)?.problems;
      say("side", { ok: false, text: problems ? `${res.error} Missing: ${problems.map((p) => PROBLEM_TEXT[p]).join("; ")}.` : res.error ?? "Not done." });
    }
  }

  async function askRestore() {
    const res = await deskCall(`/api/admin/desk/stories/${id}/restore`, { method: "POST", body: JSON.stringify({ reason }) });
    say("side", res.ok ? { ok: true, text: "Restore requested. A second person must approve it." } : { ok: false, text: res.error ?? "Not requested." });
    if (res.ok) await load();
  }

  async function decide(pending: Pending, outcome: "approved" | "declined") {
    const res = await deskCall(`/api/admin/desk/pending/${pending.id}/decide`, { method: "POST", body: JSON.stringify({ outcome }) });
    const done = pending.action === "correction" ? "Correction published." : "Restored.";
    say("side", res.ok ? { ok: true, text: outcome === "approved" ? done : "Request declined." } : { ok: false, text: res.error ?? "Not decided." });
    if (res.ok) await load();
  }

  /**
   * "Copy for WhatsApp" (Panel 3, M1): the live version's headline and dek, so a later revision that
   * is not published yet is never posted. Nothing is stored or sent; the desk pastes it in the channel.
   */
  async function copyForWhatsApp() {
    if (!story?.published_revision_id) return;
    let live = loaded?.revision?.id === story.published_revision_id ? loaded.revision : null;
    if (!live) {
      const res = await deskCall<{ revision: Revision }>(`/api/admin/desk/stories/${id}/revisions/${story.published_revision_id}`);
      if (!res.ok || !res.data) return say("side", { ok: false, text: res.error ?? "Could not read the live version." });
      live = res.data.revision;
    }
    const text = whatsAppMessage({ headline: live.headline, dek: live.dek, url: `${SITE_URL}${deskStoryPath(story)}` });
    try {
      await navigator.clipboard.writeText(text);
      say("side", { ok: true, text: "Copied for WhatsApp: paste it in the channel." });
    } catch {
      say("side", { ok: false, text: "Could not copy: the browser refused. Select the story's address instead." });
    }
  }

  /** A live story's public correction note: published at once (S or F), or asked for (A). */
  async function publishCorrection() {
    setBusy(true);
    const res = await deskCall(`/api/admin/desk/stories/${id}/correct`, {
      method: "POST",
      body: JSON.stringify({ note: correction, kind: correctionKind, grievance: correctionTicket.trim() || null }),
    });
    setBusy(false);
    if (!res.ok) return say("side", { ok: false, text: res.error ?? "Not done." });
    say("side", {
      ok: true,
      text: res.status === 201 ? "Correction requested. A Desk Editor or the Managing Editor decides it." : "Correction published. Readers see it under the story.",
    });
    setCorrection("");
    setCorrectionTicket("");
    await load();
  }

  if (meError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{meError}</p>;
  if (loadError) return <p role="alert" className="text-sm text-red-700 dark:text-red-300">{loadError}</p>;
  if (!loaded || !story) return <p aria-live="polite" className="text-sm text-slate-500">Loading the story…</p>;

  const problems = checklist({ headline, dek, seoTitle, slug: story.slug, legalReviewRequired: story.legal_review_required, counterpartMissing: false });
  const moves = MOVES_SHOWN.filter((m) => {
    const step = move(m.action, story.workflow_state);
    if (step === null || !canAct(me, step.permission)) return false;
    // The desk's review steps are for a Sub-editor or an editor, not a Writer (the server decides too).
    return !step.deskOnly || (me?.kind === "staff" && holdsDeskReview(me.roles));
  });

  const smallLink =
    "inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold transition-colors hover:border-slate-400 hover:bg-slate-50 dark:border-[#3a3f47] dark:hover:bg-[#2b2f36]";
  const sideMessage = message?.area === "side" ? message : null;
  const editorMessage = message?.area === "editor" ? message : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        {/* Where the story is: its desk and state, and the ways to see it as a reader. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/desk" className={backLink}>← Desk</Link>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATE_STYLES[story.workflow_state]}`}>{STATE_LABELS[story.workflow_state]}</span>
            <span className="text-sm text-slate-500">{story.language === "hi" ? "Hindi" : "English"} · {story.section}</span>
            <Link href={`/admin/desk/${id}/preview`} target="_blank" rel="noopener" className={smallLink}>
              Preview ↗
            </Link>
            {story.workflow_state === "published" && (
              <a href={`${SITE_URL}${deskStoryPath(story)}`} target="_blank" rel="noopener noreferrer" className={smallLink}>
                View on the site ↗
              </a>
            )}
            {story.workflow_state === "published" && story.published_revision_id && (
              <button type="button" className={smallLink} onClick={() => void copyForWhatsApp()}>
                <Share2 aria-hidden="true" className="h-3 w-3" /> Copy for WhatsApp
              </button>
            )}
          </div>
        </div>

        {lockHolder && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/40">
            Someone else is editing this story, so it is read-only for you.
            <button
              type="button"
              className={buttonDanger}
              onClick={async () => {
                const ok = await dialog.confirm({
                  title: "Take over this story?",
                  message: "The person editing it now loses their unsaved work.",
                  confirmLabel: "Take over",
                  tone: "danger",
                });
                if (ok) void holdLock(true);
              }}
            >
              Take over
            </button>
          </div>
        )}

        {/* A live blog's updates, above its intro: the work of a running story (Panel 3, M3). */}
        {story.format === "live_blog" && (
          <Suspense fallback={<p role="status" className="text-sm text-slate-500">Loading the live updates…</p>}>
            <LiveUpdatesPanel
              storyId={story.id}
              language={story.language}
              published={story.workflow_state === "published"}
              canPost={canAct(me, "live_update.post")}
              canRemove={canAct(me, "article.unpublish")}
              canEnd={canAct(me, "article.publish")}
              onEnded={() => void load()}
            />
          </Suspense>
        )}

        {/* The story and its Save, together: Save sticks to the screen's foot only while the story
            itself is in view, never over a live blog's updates above it. */}
        <div className="space-y-4">
        {/* The story itself. */}
        <div className={card}>
          <label className={label}>
            Headline
            <input className={`${field} mt-1 font-serif text-lg font-bold`} lang={story.language} value={headline} disabled={!editable} onChange={(e) => { setHeadline(e.target.value); setDirty(true); }} />
          </label>
          <label className={label}>
            Dek
            <textarea className={`${field} mt-1`} rows={2} lang={story.language} value={dek} disabled={!editable} onChange={(e) => { setDek(e.target.value); setDirty(true); }} />
          </label>
          <Toolbar editor={editor} disabled={!editable} onImage={() => setPicking("image")} onGallery={() => setPicking("gallery")} />
          {picking && editable && (
            <ImagePicker
              key={picking}
              mode={picking}
              language={story.language}
              onClose={() => setPicking(null)}
              onPick={(imageId, ratio) => {
                editor?.chain().focus().insertContent({ type: "image", attrs: { id: imageId, ratio } }).run();
                setPicking(null);
              }}
              onPickMany={(ids, ratio) => {
                editor?.chain().focus().insertContent({ type: "gallery", content: ids.map((id) => ({ type: "image", attrs: { id, ratio } })) }).run();
                setPicking(null);
              }}
            />
          )}
          <EditorContent editor={editor} />

          <details className="rounded-lg border border-slate-200 p-3 transition-colors hover:border-slate-300 dark:border-[#2b2f36] dark:hover:border-[#3a3f47]">
            <summary className="cursor-pointer text-sm font-semibold">Search engines</summary>
            <label className={`${label} mt-2 font-normal`}>SEO title<input className={`${field} mt-1`} lang={story.language} value={seoTitle} disabled={!editable} onChange={(e) => { setSeoTitle(e.target.value); setDirty(true); }} /></label>
            <label className={`${label} mt-2 font-normal`}>SEO description<textarea className={`${field} mt-1`} rows={2} lang={story.language} value={seoDescription} disabled={!editable} onChange={(e) => { setSeoDescription(e.target.value); setDirty(true); }} /></label>
          </details>
        </div>

        {/* Save stays in view at the bottom of the screen while the story is long. */}
        <div className="sticky bottom-0 z-10 space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur dark:border-[#2b2f36] dark:bg-[#202327]/95">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!editable || busy} onClick={() => void save()} className={buttonPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={substantive} onChange={(e) => setSubstantive(e.target.checked)} /> A substantive change</label>
            {dirty && <span className={`${badge} ${tone.amber}`}>Unsaved changes</span>}
            <span className={`${hint} ml-auto`}>{wordCount(editor?.getJSON() ?? loaded.revision?.body)} words</span>
          </div>
          <ActionMessage message={editorMessage} />
        </div>

        </div>

        <RevisionsPanel
          storyId={story.id}
          currentRevisionId={story.current_revision_id}
          publishedRevisionId={story.published_revision_id}
          language={story.language}
          canBringBack={editable}
          onBringBack={bringBack}
        />
      </div>

      {/* The workflow, in the order it is needed: a decision waiting, the next step, then what it needs. */}
      <aside className="space-y-4" aria-label="The story's workflow">
        <ActionMessage message={sideMessage} />

        {loaded.pending.length > 0 && (
          <section aria-labelledby="pending-heading" className={`${panel} border-amber-300 dark:border-amber-800`}>
            <h2 id="pending-heading" className={panelTitle}>Waiting for a second person</h2>
            {loaded.pending.map((p) => (
              <div key={p.id} className="space-y-2 text-sm">
                <p>{p.action === "correction" ? "Correction requested" : "Restore requested"}: {p.reason}</p>
                <div className="flex gap-2">
                  <button type="button" className={buttonPrimary} onClick={() => void decide(p, "approved")}>Approve</button>
                  <button type="button" className={button} onClick={() => void decide(p, "declined")}>Decline</button>
                </div>
              </div>
            ))}
          </section>
        )}

        <section aria-labelledby="moves-heading" className={`${panel} border-blue-200 dark:border-blue-900`}>
          <h2 id="moves-heading" className={panelTitle}>Next step</h2>
          {moves.length === 0 && story.workflow_state !== "unpublished" && <p className="text-sm text-slate-500">Nothing for you to do on this story now.</p>}
          {moves.some((m) => m.needs === "reason" || m.needs === "takedown") || story.workflow_state === "unpublished" ? (
            <label className={`${label} font-normal`}>Reason<textarea className={`${field} mt-1`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          ) : null}
          {moves.some((m) => m.needs === "takedown") && (
            <label className={`${label} font-normal`}>Reason code
              <select className={`${field} mt-1`} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                {TAKEDOWN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          )}
          {moves.some((m) => m.needs === "schedule") && (
            <div>
              <label className={`${label} font-normal`}>
                Publish at (IST)
                <input type="datetime-local" className={`${field} mt-1`} value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-describedby="schedule-hint" />
              </label>
              <p id="schedule-hint" className={`${hint} mt-1`}>
                The server publishes it within {PUBLISH_TICK_MINUTES} minutes after this time, if you may still publish it then.
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {moves.map((m) => (
              <button key={m.action} type="button" disabled={busy} className={MOVE_STYLE[m.tone ?? "normal"]} onClick={() => void doMove(m.route, m.needs)}>{m.label}</button>
            ))}
            {story.workflow_state === "unpublished" && !loaded.pending.some((p) => p.action === "restore") && (
              <button type="button" className={button} disabled={busy || !reason.trim()} onClick={() => void askRestore()}>Ask to restore</button>
            )}
          </div>
        </section>

        <section aria-labelledby="checklist-heading" className={panel}>
          <h2 id="checklist-heading" className={panelTitle}>Before approval</h2>
          {problems.length === 0 ? (
            <p className="text-sm text-green-700 dark:text-green-300">The checklist is complete.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                  {PROBLEM_TEXT[p]}
                </li>
              ))}
            </ul>
          )}
          {editor && storyImageIds(editor.getJSON()).length > 0 && (
            <p className={hint}>Its images are checked when the story is approved or published: credit, source, licence, cleared rights, and alt text and a caption in the story&apos;s language.</p>
          )}
        </section>

        {mayEdit && story.workflow_state !== "published" && (
          <section aria-labelledby="details-heading" className={panel}>
            <h2 id="details-heading" className={panelTitle}>Details</h2>
            <label className={`${label} font-normal`}>Slug
              <div className="mt-1 flex gap-1">
                <input className={field} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="india-wins-the-series" />
                <button type="button" className={button} onClick={() => setSlug(storySlug(headline))}>Suggest</button>
              </div>
            </label>
            <label className={`${label} font-normal`}>Embargo until (IST)<input type="datetime-local" className={`${field} mt-1`} value={embargo} onChange={(e) => setEmbargo(e.target.value)} /></label>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" className={button} disabled={busy} onClick={() => void saveDetails()}>Save details</button>
              {story.legal_review_required ? (
                <button type="button" className={button} onClick={() => void setLegalReview(false)}>Clear legal review</button>
              ) : (
                <button type="button" className={button} onClick={() => void setLegalReview(true)}>Needs legal review</button>
              )}
            </div>
          </section>
        )}

        <CreditsPanel
          storyId={story.id}
          language={story.language}
          credits={loaded.credits}
          editable={canAct(me, "article.edit") && PRE_PUBLISH_STATES.includes(story.workflow_state)}
          onSaved={async (result) => {
            say("side", result);
            if (result.ok) await load();
          }}
        />

        {story.workflow_state === "published" && (canAct(me, "correction.publish") || canAsk(me, "correction.publish")) && (
          <section aria-labelledby="correction-heading" className={panel}>
            <h2 id="correction-heading" className={panelTitle}>Correction</h2>
            {story.correction_note ? (
              <p className="text-sm">Readers see: <q lang={story.language}>{story.correction_note}</q></p>
            ) : (
              <p className="text-sm text-slate-500">No correction note on this story.</p>
            )}
            <label className={`${label} font-normal`}>
              Kind
              <select className={`${field} mt-1`} value={correctionKind} onChange={(e) => setCorrectionKind(e.target.value as CorrectionKind)}>
                {CORRECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CORRECTION_KIND_LABELS[k].en}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${label} font-normal`}>
              Correction note, shown to readers under the story and on /corrections
              <textarea className={`${field} mt-1`} rows={3} lang={story.language} maxLength={CORRECTION_NOTE_MAX} value={correction} onChange={(e) => setCorrection(e.target.value)} />
            </label>
            <label className={`${label} font-normal`}>
              Grievance ticket, if a grievance caused it (optional)
              <input className={`${field} mt-1`} value={correctionTicket} onChange={(e) => setCorrectionTicket(e.target.value)} placeholder="G-2026-00042" maxLength={20} />
            </label>
            <button type="button" className={buttonPrimary} disabled={busy || !correction.trim()} onClick={() => void publishCorrection()}>
              {canAct(me, "correction.publish") ? "Publish correction" : "Ask for a correction"}
            </button>
          </section>
        )}

        <section aria-labelledby="history-heading" className={panel}>
          <h2 id="history-heading" className={panelTitle}>History</h2>
          {loaded.history.length === 0 ? (
            <p className="text-sm text-slate-500">No history yet.</p>
          ) : (
            <ol className="space-y-2 border-l-2 border-slate-200 pl-3 text-xs dark:border-[#2b2f36]">
              {[...loaded.history].reverse().map((h, i) => (
                <li key={i} className="relative">
                  <span aria-hidden="true" className="absolute -left-[1.05rem] top-1 h-2 w-2 rounded-full bg-slate-400" />
                  <span className="font-semibold">{h.action.replace("_", " ")}</span> → {STATE_LABELS[h.to_state] ?? h.to_state} · {when(h.at)}
                  {h.reason ? <span className="block text-slate-500">{h.reason}</span> : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}
