/**
 * The Desk's screens (Panel 2 design §4): what they show for each answer the API gives. The server
 * decides every request; these tests check the screens show its answers, offer only what the person
 * holds, and have loading, empty and error states.
 */

// A stable router, as Next's is: a new object each render would re-run every effect that lists it.
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, useParams: () => ({ id: "s-1" }) }));
const push = mockRouter.push;

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FeedbackProvider } from "../ui/Feedback";
import DeskList from "./DeskList";
import AuthorsManager from "./AuthorsManager";
import MediaLibrary from "./MediaLibrary";
import NewStoryForm from "./NewStoryForm";
import StoryEditor from "./StoryEditor";
import StoryPreview from "./StoryPreview";

const staffMe = (permissions: Record<string, "act" | "read" | "ask">) => ({
  kind: "staff",
  displayName: "Asha",
  aal: "aal2",
  roles: [],
  permissions,
  mfa: { required: true, enrolled: true },
});

type Route = (url: string, init?: RequestInit) => { status: number; body: unknown } | undefined;
function serve(route: Route) {
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const answer = route(String(input), init) ?? { status: 404, body: { error: "not found" } };
    // jsdom has no Response; the admin's other screen tests answer with the same plain shape.
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  push.mockReset();
});

describe("the story list", () => {
  test("shows the stories of the caller's desks, each linking to its screen", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read", "article.create": "act" }) };
      if (url.startsWith("/api/admin/desk/stories?")) {
        return { status: 200, body: { stories: [{ id: "s-1", language: "hi", section: "sports", workflow_state: "desk_review", updated_at: "2026-11-17T10:00:00Z", post_hoc_review_due: false, current: { headline: "भारत ने मैच जीता" } }], total: 1 } };
      }
    });
    await act(async () => render(<DeskList />));
    const link = await screen.findByRole("link", { name: "भारत ने मैच जीता" });
    expect(link).toHaveAttribute("href", "/admin/desk/s-1");
    expect(link).toHaveAttribute("lang", "hi");
    expect(screen.getByText("Desk review", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /New story/ })).toHaveAttribute("href", "/admin/desk/new");
  });

  test("an empty desk says so, and someone who cannot create sees no New story", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read" }) };
      if (url.startsWith("/api/admin/desk/stories?")) return { status: 200, body: { stories: [], total: 0 } };
    });
    await act(async () => render(<DeskList />));
    expect(await screen.findByText(/No stories here yet/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /New story/ })).not.toBeInTheDocument();
  });

  test("the server's refusal is shown, not hidden", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({}) };
      if (url.startsWith("/api/admin/desk/stories?")) return { status: 403, body: { error: "You don't have permission for this action." } };
    });
    await act(async () => render(<DeskList />));
    expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission");
  });

  describe("the alert list of takedowns", () => {
    const ALERTS = [
      { id: 2, action: "retract", reason: "legal: Court order.", at: "2026-11-17T09:00:00Z", by: "Ravi", story: { id: "s-1", language: "hi", section: "sports", workflow_state: "retracted", headline: "मैच रिपोर्ट" } },
      { id: 1, action: "unpublish", reason: "error: Wrong score.", at: "2026-11-16T09:00:00Z", by: "Asha", story: { id: "s-2", language: "en", section: "world", workflow_state: "published", headline: "Talks" } },
    ];
    const listOf = (permissions: Record<string, "act" | "read" | "ask">, alerts: unknown[] = ALERTS) =>
      serve((url) => {
        if (url === "/api/admin/me") return { status: 200, body: staffMe(permissions) };
        if (url.startsWith("/api/admin/desk/stories?")) return { status: 200, body: { stories: [], total: 0 } };
        if (url === "/api/admin/desk/alerts") return { status: 200, body: { alerts, days: 30 } };
      });

    test("whoever may take stories down sees each takedown: what, which story, why, who, and whether it is live again", async () => {
      listOf({ "article.view_admin": "read", "article.unpublish": "act" });
      await act(async () => render(<DeskList />));
      expect(await screen.findByRole("heading", { name: "Alerts: stories taken down in the last 30 days" })).toBeInTheDocument();
      const story = screen.getByRole("link", { name: "मैच रिपोर्ट" });
      expect(story).toHaveAttribute("href", "/admin/desk/s-1");
      expect(story).toHaveAttribute("lang", "hi");
      expect(screen.getByText(/legal: Court order\. · by Ravi/)).toBeInTheDocument();
      expect(screen.getByText("Retracted", { selector: "span" })).toBeInTheDocument();
      expect(screen.getAllByText("Live again")).toHaveLength(1);
    });

    test("an empty list says so", async () => {
      listOf({ "article.view_admin": "read", "article.unpublish": "act" }, []);
      await act(async () => render(<DeskList />));
      expect(await screen.findByText("No story was taken down in your desks.")).toBeInTheDocument();
    });

    test("without article.unpublish there is no alert list, and it is never asked for", async () => {
      listOf({ "article.view_admin": "read", "article.create": "act" });
      await act(async () => render(<DeskList />));
      await screen.findByText(/No stories here yet/);
      expect(screen.queryByRole("heading", { name: /Alerts/ })).not.toBeInTheDocument();
      expect((global.fetch as jest.Mock).mock.calls.some(([url]) => url === "/api/admin/desk/alerts")).toBe(false);
    });
  });

  test("no session sends the browser to sign in", async () => {
    serve(() => ({ status: 401, body: { error: "Unauthorized" } }));
    await act(async () => render(<DeskList />));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/login"));
  });
});

test("New story offers a live blog (Panel 3, M3) and not sponsored content", async () => {
  serve(() => undefined);
  render(<NewStoryForm />);
  const formats = screen.getAllByRole("option").map((o) => o.textContent);
  expect(formats).toContain("live blog");
  expect(formats).not.toContain("sponsored");
});

test("a new story is created in its desk and opens in the editor", async () => {
  serve((url, init) => {
    if (url === "/api/admin/desk/stories" && init?.method === "POST") return { status: 201, body: { story: { id: "s-9" } } };
  });
  render(<NewStoryForm />);
  const headline = screen.getByRole("textbox", { name: "Headline" });
  await act(async () => {
    headline.focus();
    (headline as HTMLInputElement).value = "";
  });
  fireEvent.change(headline, { target: { value: "Budget passes" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create and open" })));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/desk/s-9"));
  const [, init] = (global.fetch as jest.Mock).mock.calls.find(([u]) => u === "/api/admin/desk/stories");
  expect(JSON.parse(init.body)).toMatchObject({ language: "en", headline: "Budget passes", state: "draft" });
});

describe("the story screen", () => {
  const STORY = {
    id: "s-1", public_id: 1024, language: "en", section: "india", workflow_state: "desk_review", slug: null, embargo_until: null,
    legal_review_required: false, current_revision_id: "r-1", published_revision_id: null, scheduled_at: null, post_hoc_review_due: false,
  };
  const revision = (id: string, headline: string, at: string, ...paragraphs: string[]) => ({
    id, headline, dek: "", seo_title: "", seo_description: "", editor_id: "u-9", is_substantive: false, created_at: at,
    body: { type: "doc", content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) },
  });
  type Revision = ReturnType<typeof revision>;
  const REVISION = revision("r-1", "Budget passes", "2026-11-17T09:00:00Z", "The house voted.");

  /** The story's routes; `extra` answers first, for the writes a test makes. Revisions newest first. */
  function serveStory(permissions: Record<string, "act" | "read" | "ask">, over: Record<string, unknown> = {}, extra?: Route, revisions: Revision[] = [REVISION]) {
    serve((url, init) => {
      const answer = extra?.(url, init);
      if (answer) return answer;
      if (url === "/api/admin/me") return { status: 200, body: staffMe(permissions) };
      if (url === "/api/admin/desk/stories/s-1") return { status: 200, body: { story: { ...STORY, current_revision_id: revisions[0].id, ...over }, revision: revisions[0], history: [{ action: "create", to_state: "draft", actor_label: "staff:u-9", reason: null, at: "2026-11-17T09:00:00Z" }], lock: null, pending: [] } };
      if (url === "/api/admin/desk/stories/s-1/lock") return { status: 200, body: { lock: {} } };
      if (url === "/api/admin/desk/stories/s-1/revisions") return { status: 200, body: { revisions: revisions.map((r) => ({ ...r, body: undefined })) } };
      const one = revisions.find((r) => url === `/api/admin/desk/stories/s-1/revisions/${r.id}`);
      if (one) return { status: 200, body: { revision: one } };
    });
  }

  test("shows what the checklist still needs, and only the moves the person holds", async () => {
    serveStory({ "article.view_admin": "read", "article.edit": "act", "article.approve": "act" });
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByDisplayValue("Budget passes")).toBeInTheDocument();
    expect(screen.getByText("A dek (the line under the headline)")).toBeInTheDocument();
    expect(screen.getByText("A slug (the story's address)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send back" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.getByText(/create/)).toBeInTheDocument();
    expect(await screen.findByText(/Only one revision so far/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View on the site/ })).not.toBeInTheDocument();
  });

  // The owner's decision (18 Nov 2026): out of review, Submit and Send back are the desk's steps.
  test("a story in review: a Writer is not offered Submit or Send back (Kill stays); a Sub-editor is", async () => {
    const perms = { "article.view_admin": "read", "article.edit": "act", "article.submit": "act" } as const;
    const as = (role: string) => (url: string) =>
      url === "/api/admin/me" ? { status: 200, body: { ...staffMe(perms), roles: [{ role, language: "en", section: null, expiresAt: "2027-05-01T00:00:00Z" }] } } : undefined;
    serveStory(perms, { workflow_state: "in_review" }, as("writer"));
    const { unmount } = await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByRole("button", { name: "Kill" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send back" })).not.toBeInTheDocument();
    unmount();

    serveStory(perms, { workflow_state: "in_review" }, as("sub_editor"));
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByRole("button", { name: "Submit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send back" })).toBeInTheDocument();
  });

  // Design §7: images from the media library, in the story's text.
  const IMAGE_ID = "c0ffee00-0000-4000-8000-000000000001";
  const LIBRARY_IMAGE = {
    id: IMAGE_ID, url: `/media/renditions/${IMAGE_ID}/4x3-480.webp`, language: "en", section: "india", credit: "Photo: Asha Rao",
    rights_cleared_at: null, alt_en: "Players on the field", alt_hi: null, caption_en: null, caption_hi: null, renditions_state: "ready",
  };

  test("Image opens the library, says what each image still needs, and adds the one chosen with its crop", async () => {
    // jsdom lays nothing out: ProseMirror's scroll after an insert asks a Range for rectangles.
    const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
    Object.assign(Range.prototype, { getClientRects: () => [], getBoundingClientRect: () => rect });
    serveStory({ "article.view_admin": "read", "article.edit": "act" }, {}, (url) =>
      url === "/api/admin/desk/media" ? { status: 200, body: { media: [LIBRARY_IMAGE], total: 1 } } : undefined
    );
    await act(async () => render(<StoryEditor id="s-1" />));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Image" })));
    expect(await screen.findByText("Before publishing: rights not cleared, no English caption")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Players on the field" })).toHaveAttribute("src", LIBRARY_IMAGE.url);
    fireEvent.change(screen.getByRole("combobox", { name: "Crop" }), { target: { value: "4x3" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add to the story" })));
    expect(screen.queryByRole("region", { name: "Add an image" })).not.toBeInTheDocument();
    expect(await screen.findByText(/Image, 4:3 crop/)).toBeInTheDocument();
    expect(screen.getByText(/Its images are checked when the story is approved or published/)).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const saves = (global.fetch as jest.Mock).mock.calls.filter(([u, init]) => u === "/api/admin/desk/stories/s-1/revisions" && init?.method === "POST");
    expect(JSON.parse(saves[0][1].body).body.content).toContainEqual({ type: "image", attrs: { id: IMAGE_ID, ratio: "4x3" } });
  });

  test("Gallery: two to twelve images chosen in order, added as one block with their crop", async () => {
    Object.assign(Range.prototype, { getClientRects: () => [], getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) });
    const SECOND = { ...LIBRARY_IMAGE, id: "c0ffee00-0000-4000-8000-000000000007", url: "/media/renditions/c0ffee00-0000-4000-8000-000000000007/4x3-480.webp", alt_en: "The crowd" };
    serveStory({ "article.view_admin": "read", "article.edit": "act" }, {}, (url) =>
      url === "/api/admin/desk/media" ? { status: 200, body: { media: [LIBRARY_IMAGE, SECOND], total: 2 } } : undefined
    );
    await act(async () => render(<StoryEditor id="s-1" />));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Gallery" })));
    await screen.findAllByRole("button", { name: "Add to the gallery" });
    // The button is above the library and again below its last image (the owner's walk-through).
    const [above, below] = screen.getAllByRole("button", { name: /Add the gallery/ });
    const picks = screen.getAllByRole("button", { name: "Add to the gallery" });
    expect(picks[1].compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(above).toBeDisabled();
    expect(below).toBeDisabled();
    expect(screen.getByText("Choose at least 2 images.")).toBeInTheDocument();
    await act(async () => fireEvent.click(picks[1]));
    expect(below).toBeDisabled();
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Add to the gallery" })[0]));
    expect(screen.getByRole("button", { name: "In the gallery (2)" })).toHaveAttribute("aria-pressed", "true");
    expect(above).toHaveAccessibleName("Add the gallery (2 of 2 to 12)");
    expect(above).toBeEnabled();
    await act(async () => fireEvent.click(below));
    expect(screen.queryByRole("region", { name: "Add a gallery" })).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    const saves = (global.fetch as jest.Mock).mock.calls.filter(([u, init]) => u === "/api/admin/desk/stories/s-1/revisions" && init?.method === "POST");
    expect(JSON.parse(saves[0][1].body).body.content).toContainEqual({
      type: "gallery",
      content: [
        { type: "image", attrs: { id: SECOND.id, ratio: "16x9" } },
        { type: "image", attrs: { id: IMAGE_ID, ratio: "16x9" } },
      ],
    });
  });

  test("the preview draws the revision's images as the server gives them", async () => {
    const withImage = { ...REVISION, body: { type: "doc", content: [{ type: "image", attrs: { id: IMAGE_ID, ratio: "16x9" } }] } };
    const images = { [IMAGE_ID]: { alt: "Players on the field", caption: "The final over.", credit: "Photo: Asha Rao", crops: {}, fallbackUrl: `/api/admin/desk/media/${IMAGE_ID}/original` } };
    serveStory({ "article.view_admin": "read" }, {}, (url) =>
      url === "/api/admin/desk/stories/s-1"
        ? { status: 200, body: { story: { ...STORY, current_revision_id: "r-1" }, revision: withImage, history: [], lock: null, pending: [], images } }
        : undefined
    );
    await act(async () => render(<StoryPreview id="s-1" />));
    expect(await screen.findByRole("img", { name: "Players on the field" })).toHaveAttribute("src", `/api/admin/desk/media/${IMAGE_ID}/original`);
    expect(screen.getByText("Photo: Asha Rao")).toBeInTheDocument();
  });

  test("scheduling says when the server publishes: within 5 minutes, if the editor may still publish", async () => {
    serveStory({ "article.view_admin": "read", "article.publish": "act" }, { workflow_state: "approved", approved_revision_id: "r-1" });
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByRole("button", { name: "Schedule" })).toBeInTheDocument();
    const when = screen.getByLabelText("Publish at (IST)");
    expect(when).toHaveAccessibleDescription("The server publishes it within 5 minutes after this time, if you may still publish it then.");
  });

  test("a live story links to its page on the site, at its own address", async () => {
    serveStory({ "article.view_admin": "read" }, { workflow_state: "published", published_revision_id: "r-1", slug: "budget-passes" });
    await act(async () => render(<StoryEditor id="s-1" />));
    const link = await screen.findByRole("link", { name: /View on the site/ });
    expect(link.getAttribute("href")).toMatch(/^https?:\/\/[^/]+\/india\/budget-passes-1024$/);
    expect(link).toHaveAttribute("target", "_blank");
  });

  // Panel 3, M1 (design §6, moved into M1 by the owner): a ready message for the WhatsApp Channel.
  describe("Copy for WhatsApp", () => {
    const writeText = jest.fn(async () => undefined);
    beforeEach(() => {
      writeText.mockClear();
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    });

    test("a live story copies its headline in bold, its dek, and its address tagged for WhatsApp", async () => {
      const live = { ...revision("r-1", "Budget passes", "2026-11-17T09:00:00Z", "The house voted."), dek: "300 to 120." };
      serveStory({ "article.view_admin": "read" }, { workflow_state: "published", published_revision_id: "r-1", slug: "budget-passes" }, undefined, [live]);
      await act(async () => render(<StoryEditor id="s-1" />));
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Copy for WhatsApp" })));
      expect(writeText).toHaveBeenCalledTimes(1);
      const [text] = writeText.mock.calls[0] as unknown as [string];
      expect(text.split("\n")[0]).toBe("*Budget passes*");
      expect(text.split("\n")[1]).toBe("300 to 120.");
      expect(text.split("\n")[2]).toMatch(/\/india\/budget-passes-1024\?utm_source=whatsapp&utm_medium=social&utm_campaign=channel$/);
      expect(await screen.findByRole("status")).toHaveTextContent("Copied for WhatsApp");
    });

    test("with a newer revision not yet published, it copies the live version, read from the server", async () => {
      const published = revision("r-1", "Budget passes", "2026-11-17T09:00:00Z", "The house voted.");
      const newer = revision("r-2", "Budget passes easily", "2026-11-17T10:00:00Z", "The house voted.");
      serveStory({ "article.view_admin": "read" }, { workflow_state: "published", published_revision_id: "r-1", slug: "budget-passes" }, undefined, [newer, published]);
      await act(async () => render(<StoryEditor id="s-1" />));
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Copy for WhatsApp" })));
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      expect((writeText.mock.calls[0] as unknown as [string])[0].split("\n")[0]).toBe("*Budget passes*");
    });

    test("not offered before the story is live", async () => {
      serveStory({ "article.view_admin": "read" });
      await act(async () => render(<StoryEditor id="s-1" />));
      await screen.findByDisplayValue("Budget passes");
      expect(screen.queryByRole("button", { name: "Copy for WhatsApp" })).not.toBeInTheDocument();
    });
  });

  // Panel 3, M3 (design §4): a live blog's updates, on its own screen.
  describe("the live updates panel", () => {
    const LIVE = { format: "live_blog", workflow_state: "published", published_revision_id: "r-1", slug: "results-live" };
    const body = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
    const UPDATES = [
      { id: "lu-2", headline: "Counting begins", body: body("Postal ballots first."), is_key_event: true, is_pinned: true, posted_at: "2026-11-20T09:00:00Z", edited_at: null, removed_at: null, removed_reason: null },
      { id: "lu-1", headline: null, body: body("A wrong figure."), is_key_event: false, is_pinned: false, posted_at: "2026-11-20T08:00:00Z", edited_at: null, removed_at: "2026-11-20T08:30:00Z", removed_reason: "Wrong figure." },
    ];
    const ALL = { "article.view_admin": "read", "article.edit": "act", "live_update.post": "act", "article.unpublish": "act", "article.publish": "act" } as const;
    let sent: Array<{ url: string; init?: RequestInit }>;
    const liveRoutes = (endedAt: string | null = null) => (url: string, init?: RequestInit) => {
      if (url.includes("/live") || url.endsWith("/end-live")) sent.push({ url, init });
      if (url === "/api/admin/desk/stories/s-1/live" && !init?.method) return { status: 200, body: { updates: UPDATES, live_ended_at: endedAt } };
      if (init?.method === "POST" || init?.method === "PATCH") return { status: 200, body: { update: UPDATES[0], story: {} } };
      return undefined;
    };
    const show = async () =>
      act(async () =>
        render(
          <FeedbackProvider>
            <StoryEditor id="s-1" />
          </FeedbackProvider>
        )
      );
    beforeEach(() => {
      sent = [];
    });

    test("a published live blog: Live, the updates newest first (pinned, key event, removed with its reason), and the form to post", async () => {
      serveStory(ALL, LIVE, liveRoutes());
      await show();
      expect(await screen.findByRole("heading", { name: "Live updates" })).toBeInTheDocument();
      expect(await screen.findByText("Counting begins")).toBeInTheDocument();
      const list = screen.getByRole("list", { name: "Updates, newest first" });
      const [first, second] = within(list).getAllByRole("listitem");
      expect(within(first).getByText("Pinned")).toBeInTheDocument();
      expect(within(first).getByText("Key event")).toBeInTheDocument();
      expect(within(second).getByText(/Removed .*: Wrong figure\./)).toBeInTheDocument();
      expect(within(second).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
      expect(screen.getByText("Live")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Headline (optional)" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Post the update" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "End the live blog" })).toBeInTheDocument();
    });

    test("an empty update is not sent: the screen says it needs text", async () => {
      serveStory(ALL, LIVE, liveRoutes());
      await show();
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Post the update" })));
      expect(await screen.findByRole("alert")).toHaveTextContent("An update needs some text.");
      expect(sent.filter((s) => s.init?.method)).toEqual([]);
    });

    test("changing an update sends its whole text and flags, from the update chosen", async () => {
      serveStory(ALL, LIVE, liveRoutes());
      await show();
      const list = await screen.findByRole("list", { name: "Updates, newest first" });
      await act(async () => fireEvent.click(within(within(list).getAllByRole("listitem")[0]).getByRole("button", { name: "Edit" })));
      const headline = screen.getByRole("textbox", { name: "Headline (optional)" });
      expect(headline).toHaveValue("Counting begins");
      fireEvent.change(headline, { target: { value: "Counting is under way" } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Key event" }));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save the change" })));
      const patch = sent.find((s) => s.init?.method === "PATCH");
      expect(patch?.url).toBe("/api/admin/desk/stories/s-1/live/lu-2");
      expect(JSON.parse(String(patch?.init?.body))).toEqual({ headline: "Counting is under way", body: body("Postal ballots first."), is_key_event: false, is_pinned: true });
      expect(await screen.findByText("The update is changed.")).toBeInTheDocument();
    });

    test("removing asks for a reason in the back office's popup, then sends it", async () => {
      serveStory(ALL, LIVE, liveRoutes());
      await show();
      const list = await screen.findByRole("list", { name: "Updates, newest first" });
      await act(async () => fireEvent.click(within(within(list).getAllByRole("listitem")[0]).getByRole("button", { name: "Remove" })));
      const dialog = await screen.findByRole("dialog", { name: "Remove this update?" });
      fireEvent.change(within(dialog).getByRole("textbox", { name: "Reason" }), { target: { value: "Not confirmed." } });
      await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Remove" })));
      const post = sent.find((s) => s.url.endsWith("/lu-2/remove"));
      expect(JSON.parse(String(post?.init?.body))).toEqual({ reason: "Not confirmed." });
    });

    test("ending asks first; Cancel keeps it live, and End sends it", async () => {
      serveStory(ALL, LIVE, liveRoutes());
      await show();
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "End the live blog" })));
      const first = await screen.findByRole("dialog", { name: "End the live blog?" });
      await act(async () => fireEvent.click(within(first).getByRole("button", { name: "Cancel" })));
      expect(sent.some((s) => s.url.endsWith("/end-live"))).toBe(false);
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "End the live blog" })));
      const again = await screen.findByRole("dialog", { name: "End the live blog?" });
      await act(async () => fireEvent.click(within(again).getByRole("button", { name: "End the live blog" })));
      expect(sent.some((s) => s.url === "/api/admin/desk/stories/s-1/end-live" && s.init?.method === "POST")).toBe(true);
    });

    test("an ended blog takes no updates: no form, no Edit, no End; an update can still be removed", async () => {
      serveStory(ALL, LIVE, liveRoutes("2026-11-20T10:00:00Z"));
      await show();
      expect(await screen.findByText(/^Ended /)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Post the update" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "End the live blog" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    });

    test("whoever lacks the permissions sees the updates and nothing to do with them", async () => {
      serveStory({ "article.view_admin": "read" }, LIVE, liveRoutes());
      await show();
      expect(await screen.findByText("Counting begins")).toBeInTheDocument();
      for (const name of ["Post the update", "Edit", "Remove", "End the live blog"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    });

    test("before publication the panel says updates come once it is published; another format has no panel", async () => {
      serveStory(ALL, { format: "live_blog" }, liveRoutes());
      const { unmount } = await show();
      expect(await screen.findByText(/Updates are posted once the live blog is published/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Post the update" })).not.toBeInTheDocument();
      unmount();
      sent = [];

      serveStory(ALL, { format: "news", workflow_state: "published", published_revision_id: "r-1" }, liveRoutes());
      await show();
      await screen.findByDisplayValue("Budget passes");
      expect(screen.queryByRole("heading", { name: "Live updates" })).not.toBeInTheDocument();
      expect(sent).toEqual([]);
    });

    test("the server's refusal of the list is shown, with a way to try again", async () => {
      serveStory(ALL, LIVE, (url, init) => (url === "/api/admin/desk/stories/s-1/live" && !init?.method ? { status: 500, body: { error: "The Desk could not do this. Nothing was changed." } } : undefined));
      await show();
      expect(await screen.findByText(/The Desk could not do this/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    });
  });

  test("a person without article.edit sees the story read-only, with no Save", async () => {
    serveStory({ "article.view_admin": "read" });
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByDisplayValue("Budget passes")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Nothing for you to do on this story now.")).toBeInTheDocument();
  });

  test("opening a story shows no unsaved changes, before or after the editor becomes editable", async () => {
    serveStory({ "article.view_admin": "read", "article.edit": "act" });
    await act(async () => render(<StoryEditor id="s-1" />));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Headline" })).toBeEnabled());
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Story text" })).toHaveAttribute("contenteditable", "true"));
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  test("saving the details keeps unsaved text: only a new revision resets the fields", async () => {
    serveStory({ "article.view_admin": "read", "article.edit": "act" }, {}, (url, init) =>
      url === "/api/admin/desk/stories/s-1/details" && init?.method === "POST" ? { status: 200, body: { story: STORY } } : undefined
    );
    await act(async () => render(<StoryEditor id="s-1" />));
    const headline = await screen.findByRole("textbox", { name: "Headline" });
    await waitFor(() => expect(headline).toBeEnabled());
    fireEvent.change(headline, { target: { value: "Budget passes, 300 to 120" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save details" })));
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(headline).toHaveValue("Budget passes, 300 to 120");
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  describe("revisions", () => {
    const OLD = revision("r-1", "Budget passes", "2026-11-17T09:00:00Z", "The house voted on Monday.", "The opposition walked out.");
    const NEW = revision("r-2", "Budget passes easily", "2026-11-17T10:00:00Z", "The house passed it on Monday.", "The opposition walked out.");
    const marked = (tag: "ins" | "del") => Array.from(document.querySelectorAll(tag), (n) => n.textContent).join(" | ");
    const saves = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => url === "/api/admin/desk/stories/s-1/revisions" && init?.method === "POST");

    test("comparing two shows what changed, field by field and word by word; a reader cannot bring one back", async () => {
      serveStory({ "article.view_admin": "read" }, {}, undefined, [NEW, OLD]);
      await act(async () => render(<StoryEditor id="s-1" />));
      const compare = await screen.findByRole("button", { name: "Compare" });
      expect(screen.getByRole("combobox", { name: /^From/ })).toHaveValue("r-1");
      expect(screen.getByRole("combobox", { name: /^To/ })).toHaveValue("r-2");
      expect(screen.queryByRole("button", { name: /Bring back/ })).not.toBeInTheDocument();
      await act(async () => fireEvent.click(compare));
      expect(await screen.findByRole("heading", { name: "Changes from revision 1 to revision 2" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Headline" })).toBeInTheDocument();
      expect(marked("ins")).toMatch(/easily/);
      expect(marked("ins")).toMatch(/passed/);
      expect(marked("del")).toMatch(/voted/);
      expect(screen.getByText("1 paragraph unchanged")).toBeInTheDocument();
    });

    test("bringing one back fills the editor, unsaved, and only Save adds it as a new revision", async () => {
      serveStory({ "article.view_admin": "read", "article.edit": "act" }, {}, (url, init) =>
        url === "/api/admin/desk/stories/s-1/revisions" && init?.method === "POST" ? { status: 200, body: { story: STORY } } : undefined, [NEW, OLD]);
      await act(async () => render(<StoryEditor id="s-1" />));
      await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Bring back revision 1" })));
      expect(await screen.findByText(/Revision 1 is in the editor/)).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Headline" })).toHaveValue("Budget passes");
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
      expect(saves()).toHaveLength(0);
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
      await waitFor(() => expect(saves()).toHaveLength(1));
      const sent = JSON.parse(saves()[0][1].body);
      expect(sent).toMatchObject({ expected_revision_id: "r-2", headline: "Budget passes" });
      expect(JSON.stringify(sent.body)).toContain("The house voted on Monday.");
    });

    test("with unsaved changes, bringing one back asks first in the back office's popup: Cancel keeps them, Replace them brings it back", async () => {
      serveStory({ "article.view_admin": "read", "article.edit": "act" }, {}, undefined, [NEW, OLD]);
      await act(async () =>
        render(
          <FeedbackProvider>
            <StoryEditor id="s-1" />
          </FeedbackProvider>,
        ),
      );
      const bringBack = await screen.findByRole("button", { name: "Bring back revision 1" });
      const headline = screen.getByRole("textbox", { name: "Headline" });
      fireEvent.change(headline, { target: { value: "Budget passes, 300 to 120" } });
      const browserConfirm = jest.spyOn(window, "confirm");

      await act(async () => fireEvent.click(bringBack));
      const dialog = await screen.findByRole("dialog", { name: "Replace your unsaved changes with revision 1?" });
      await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(headline).toHaveValue("Budget passes, 300 to 120");
      expect(screen.queryByText(/Revision 1 is in the editor/)).not.toBeInTheDocument();

      await act(async () => fireEvent.click(bringBack));
      const again = await screen.findByRole("dialog", { name: "Replace your unsaved changes with revision 1?" });
      await act(async () => fireEvent.click(within(again).getByRole("button", { name: "Replace them" })));
      expect(await screen.findByText(/Revision 1 is in the editor/)).toBeInTheDocument();
      expect(headline).toHaveValue("Budget passes");
      // The browser's own box is never used once the provider is there.
      expect(browserConfirm).not.toHaveBeenCalled();
      browserConfirm.mockRestore();
    });
  });

  describe("a correction on a live story", () => {
    const LIVE = { workflow_state: "published", published_revision_id: "r-1" };
    const NOTE = "An earlier version gave the wrong vote count.";
    const corrections = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => url === "/api/admin/desk/stories/s-1/correct" && init?.method === "POST");

    test("a Desk Editor (S) publishes the note at once, and sees what readers see", async () => {
      serveStory({ "article.view_admin": "read", "correction.publish": "act" }, { ...LIVE, correction_note: "An older note." }, (url, init) =>
        url === "/api/admin/desk/stories/s-1/correct" && init?.method === "POST" ? { status: 200, body: { story: STORY } } : undefined
      );
      await act(async () => render(<StoryEditor id="s-1" />));
      expect(await screen.findByText("An older note.")).toBeInTheDocument();
      fireEvent.change(screen.getByRole("textbox", { name: /Correction note/ }), { target: { value: NOTE } });
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish correction" })));
      expect(JSON.parse(corrections()[0][1].body)).toEqual({ note: NOTE, kind: "correction", grievance: null });
      expect(await screen.findByText("Correction published. Readers see it under the story.")).toBeInTheDocument();
    });

    // Panel 7, M2: what the correction is (decision 6), and the grievance that caused it.
    test("the correction's kind and a grievance ticket go with it", async () => {
      serveStory({ "article.view_admin": "read", "correction.publish": "act" }, LIVE, (url, init) =>
        url === "/api/admin/desk/stories/s-1/correct" && init?.method === "POST" ? { status: 200, body: { story: STORY } } : undefined
      );
      await act(async () => render(<StoryEditor id="s-1" />));
      const kind = await screen.findByRole("combobox", { name: "Kind" });
      expect(Array.from((kind as HTMLSelectElement).options).map((o) => o.textContent)).toEqual(["Correction", "Clarification", "Update", "Editor's note", "Retraction"]);
      fireEvent.change(kind, { target: { value: "clarification" } });
      fireEvent.change(screen.getByRole("textbox", { name: /Correction note/ }), { target: { value: NOTE } });
      fireEvent.change(screen.getByRole("textbox", { name: /Grievance ticket/ }), { target: { value: " G-2026-00042 " } });
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Publish correction" })));
      expect(JSON.parse(corrections()[0][1].body)).toEqual({ note: NOTE, kind: "clarification", grievance: "G-2026-00042" });
    });

    test("a Sub-editor (A) asks instead, and is told a second person decides", async () => {
      serveStory({ "article.view_admin": "read", "correction.publish": "ask" }, LIVE, (url, init) =>
        url === "/api/admin/desk/stories/s-1/correct" && init?.method === "POST" ? { status: 201, body: { request: { id: "p-2" } } } : undefined
      );
      await act(async () => render(<StoryEditor id="s-1" />));
      fireEvent.change(await screen.findByRole("textbox", { name: /Correction note/ }), { target: { value: NOTE } });
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Ask for a correction" })));
      expect(await screen.findByText(/Correction requested\. A Desk Editor or the Managing Editor decides it\./)).toBeInTheDocument();
    });

    test("nothing is offered without correction.publish, nor before the story is live", async () => {
      serveStory({ "article.view_admin": "read", "article.edit": "act" }, LIVE);
      await act(async () => render(<StoryEditor id="s-1" />));
      await screen.findByDisplayValue("Budget passes");
      expect(screen.queryByRole("heading", { name: "Correction" })).not.toBeInTheDocument();
    });

    test("an open correction request names itself, and approving it publishes the note", async () => {
      serve((url, init) => {
        if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read", "correction.publish": "act" }) };
        if (url === "/api/admin/desk/stories/s-1") {
          return { status: 200, body: { story: { ...STORY, ...LIVE }, revision: REVISION, history: [], lock: null, pending: [{ id: "p-2", action: "correction", requested_by: "u-3", reason: NOTE }] } };
        }
        if (url === "/api/admin/desk/pending/p-2/decide" && init?.method === "POST") return { status: 200, body: { story: STORY } };
        if (url === "/api/admin/desk/stories/s-1/revisions") return { status: 200, body: { revisions: [] } };
      });
      await act(async () => render(<StoryEditor id="s-1" />));
      expect(await screen.findByText(`Correction requested: ${NOTE}`)).toBeInTheDocument();
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Approve" })));
      expect(await screen.findByText("Correction published.")).toBeInTheDocument();
    });
  });

  describe("the preview", () => {
    test("the story screen opens it in a new tab", async () => {
      serveStory({ "article.view_admin": "read" });
      await act(async () => render(<StoryEditor id="s-1" />));
      const link = await screen.findByRole("link", { name: /Preview/ });
      expect(link).toHaveAttribute("href", "/admin/desk/s-1/preview");
      expect(link).toHaveAttribute("target", "_blank");
    });

    test("shows the last saved version in the reader's own view, marked as not published", async () => {
      const saved = revision("r-2", "Budget passes easily", "2026-11-17T10:00:00Z", "The house passed it on Monday.");
      serveStory({ "article.view_admin": "read" }, {}, undefined, [saved, REVISION]);
      await act(async () => render(<StoryPreview id="s-1" />));
      expect(await screen.findByRole("heading", { level: 1, name: "Budget passes easily" })).toBeInTheDocument();
      expect(screen.getByText("The house passed it on Monday.")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Preview, not published");
      expect(screen.getByRole("status")).toHaveTextContent("Desk review");
      expect(document.querySelector("article")).toHaveAttribute("lang", "en");
      expect(screen.queryByRole("link", { name: "India" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Back to the story/ })).toHaveAttribute("href", "/admin/desk/s-1");
    });

    test("a Hindi story is shown in Hindi, as on the site", async () => {
      const hindi = { ...revision("r-1", "संसद में बजट पास", "2026-11-17T09:00:00Z", "बहस देर रात तक चली।") };
      serveStory({ "article.view_admin": "read" }, { language: "hi" }, undefined, [hindi]);
      await act(async () => render(<StoryPreview id="s-1" />));
      expect(await screen.findByRole("heading", { level: 1, name: "संसद में बजट पास" })).toBeInTheDocument();
      expect(document.querySelector("article")).toHaveAttribute("lang", "hi");
      expect(screen.getByText("भारत")).toBeInTheDocument();
    });

    test("a live story whose saved version is the published one says so", async () => {
      serveStory({ "article.view_admin": "read" }, { workflow_state: "published", published_revision_id: "r-1" });
      await act(async () => render(<StoryPreview id="s-1" />));
      expect(await screen.findByRole("status")).toHaveTextContent("Preview of the live version");
    });

    test("the server's refusal is shown, and a story with no text says so", async () => {
      serve((url) => {
        if (url === "/api/admin/me") return { status: 200, body: staffMe({}) };
        if (url === "/api/admin/desk/stories/s-1") return { status: 403, body: { error: "You don't have permission for this action." } };
      });
      await act(async () => render(<StoryPreview id="s-1" />));
      expect(await screen.findByRole("alert")).toHaveTextContent("You don't have permission");

      serve((url) => {
        if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read" }) };
        if (url === "/api/admin/desk/stories/s-2") return { status: 200, body: { story: { ...STORY, id: "s-2" }, revision: null, history: [], pending: [] } };
      });
      await act(async () => render(<StoryPreview id="s-2" />));
      expect(await screen.findByText("This story has no saved text yet.")).toBeInTheDocument();
    });
  });

  test("a story the server cannot find shows its message", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({}) };
      return { status: 404, body: { error: "Story not found." } };
    });
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByRole("alert")).toHaveTextContent("Story not found.");
  });
});

describe("authors and credits (Panel 2 design §7)", () => {
  const ASHA = { id: "a1b2c3d4-0000-4000-8000-000000000001", display_name_en: "Asha Rao", display_name_hi: "आशा राव", kind: "staff", bio_en: null, bio_hi: null, beat: "sports", links: [], active: true };
  const RAVI = { ...ASHA, id: "a1b2c3d4-0000-4000-8000-000000000002", display_name_en: "Ravi Kumar", display_name_hi: null, kind: "freelancer", beat: null, active: false };
  const calls = (url: string, method = "POST") => (global.fetch as jest.Mock).mock.calls.filter(([u, init]) => u === url && init?.method === method);

  test("the Authors page lists every author; a holder of author.manage adds one and retires one", async () => {
    serve((url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read", "author.manage": "act" }) };
      if (url === "/api/admin/desk/authors?all=1") return { status: 200, body: { authors: [ASHA, RAVI] } };
      if (url === "/api/admin/desk/authors" && init?.method === "POST") return { status: 201, body: { author: ASHA } };
      if (url === `/api/admin/desk/authors/${ASHA.id}` && init?.method === "PATCH") return { status: 200, body: { author: { ...ASHA, active: false } } };
    });
    await act(async () => render(<AuthorsManager />));
    expect(await screen.findByText("आशा राव")).toHaveAttribute("lang", "hi");
    expect(screen.getByText("Retired")).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "New author" })));
    fireEvent.change(screen.getByRole("textbox", { name: "Name in English" }), { target: { value: "Meera Iyer" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Kind" }), { target: { value: "columnist" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add the author" })));
    expect(JSON.parse(calls("/api/admin/desk/authors")[0][1].body)).toMatchObject({ display_name_en: "Meera Iyer", kind: "columnist", links: [] });
    expect(await screen.findByText("Author added.")).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Retire" })[0]));
    expect(JSON.parse(calls(`/api/admin/desk/authors/${ASHA.id}`, "PATCH")[0][1].body)).toEqual({ active: false });
  });

  test("an author's photo is chosen from the library (rights cleared only) and saved with the record", async () => {
    const PHOTO = "c0ffee00-0000-4000-8000-000000000005";
    const cleared = { id: PHOTO, url: `/media/renditions/${PHOTO}/4x3-480.webp`, language: "en", section: "india", credit: "Staff", rights_cleared_at: "2026-11-18T09:00:00Z", alt_en: null, alt_hi: null, caption_en: null, caption_hi: null, renditions_state: "ready" };
    const uncleared = { ...cleared, id: "c0ffee00-0000-4000-8000-000000000006", rights_cleared_at: null };
    serve((url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read", "author.manage": "act" }) };
      if (url === "/api/admin/desk/authors?all=1") return { status: 200, body: { authors: [ASHA] } };
      if (url === "/api/admin/desk/media") return { status: 200, body: { media: [uncleared, cleared], total: 2 } };
      if (url === `/api/admin/desk/authors/${ASHA.id}` && init?.method === "PATCH") return { status: 200, body: { author: { ...ASHA, photo_id: PHOTO } } };
    });
    await act(async () => render(<AuthorsManager />));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Edit" })));
    expect(screen.getByText("No photo.")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Choose a photo" })));
    const uses = await screen.findAllByRole("button", { name: "Use as the photo" });
    expect(uses[0]).toBeDisabled();
    expect(screen.queryByRole("combobox", { name: "Crop" })).not.toBeInTheDocument();
    await act(async () => fireEvent.click(uses[1]));
    expect(screen.getByRole("button", { name: "Remove the photo" })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    expect(JSON.parse(calls(`/api/admin/desk/authors/${ASHA.id}`, "PATCH")[0][1].body)).toMatchObject({ photo_id: PHOTO });
  });

  test("without author.manage the list is read-only", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read" }) };
      if (url === "/api/admin/desk/authors?all=1") return { status: 200, body: { authors: [ASHA] } };
    });
    await act(async () => render(<AuthorsManager />));
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New author" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });

  const STORY_ROW = {
    id: "s-1", public_id: 1024, language: "hi", section: "india", workflow_state: "draft", slug: null, embargo_until: null, legal_review_required: false,
    current_revision_id: "r-1", published_revision_id: null, scheduled_at: null, post_hoc_review_due: false, correction_note: null,
  };
  const REV = { id: "r-1", headline: "बजट पास", dek: "", seo_title: "", seo_description: "", body: { type: "doc", content: [] }, created_at: "2026-11-18T09:00:00Z" };
  const storyWith = (permissions: Record<string, "act" | "read">, over: Record<string, unknown>, credits: unknown[]) =>
    serve((url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe(permissions) };
      if (url === "/api/admin/desk/stories/s-1") return { status: 200, body: { story: { ...STORY_ROW, ...over }, revision: REV, history: [], lock: null, pending: [], credits } };
      if (url === "/api/admin/desk/stories/s-1/lock") return { status: 200, body: { lock: {} } };
      if (url === "/api/admin/desk/stories/s-1/revisions") return { status: 200, body: { revisions: [] } };
      if (url === "/api/admin/desk/authors") return { status: 200, body: { authors: [ASHA] } };
      if (url === "/api/admin/desk/stories/s-1/credits" && init?.method === "POST") return { status: 200, body: { story: STORY_ROW } };
    });

  test("a story's credits: added from the authors, in the story's language, and saved as one list", async () => {
    storyWith({ "article.view_admin": "read", "article.edit": "act" }, {}, []);
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByText("No credits yet.")).toBeInTheDocument();
    const author = await screen.findByRole("combobox", { name: "Author" });
    await waitFor(() => expect(screen.getByRole("option", { name: "आशा राव" })).toBeInTheDocument());
    fireEvent.change(author, { target: { value: ASHA.id } });
    fireEvent.change(screen.getByRole("combobox", { name: "As" }), { target: { value: "translated_by" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));
    expect(screen.getByText("· Translated by")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save credits" })));
    expect(JSON.parse(calls("/api/admin/desk/stories/s-1/credits")[0][1].body)).toEqual({ credits: [{ author_id: ASHA.id, role: "translated_by" }] });
    expect(await screen.findByText("Credits saved.")).toBeInTheDocument();
  });

  test("a live story's credits are shown, not changed", async () => {
    const credit = { author_id: ASHA.id, role: "byline", position: 0, author: { display_name_en: "Asha Rao", display_name_hi: "आशा राव", active: true } };
    storyWith({ "article.view_admin": "read", "article.edit": "act" }, { workflow_state: "published", published_revision_id: "r-1" }, [credit]);
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByText("आशा राव")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save credits" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
  });

  test("the preview credits the story's active authors, as the reader's page does", async () => {
    const credits = [
      { author_id: ASHA.id, role: "byline", position: 0, author: { display_name_en: "Asha Rao", display_name_hi: "आशा राव", active: true } },
      { author_id: RAVI.id, role: "byline", position: 1, author: { display_name_en: "Ravi Kumar", display_name_hi: null, active: false } },
    ];
    storyWith({ "article.view_admin": "read" }, { language: "en" }, credits);
    await act(async () => render(<StoryPreview id="s-1" />));
    expect(await screen.findByText("By Asha Rao")).toBeInTheDocument();
    expect(screen.queryByText(/Ravi Kumar/)).not.toBeInTheDocument();
  });
});

describe("the media library (Panel 2 design §7)", () => {
  const IMAGE = {
    id: "c0ffee00-0000-4000-8000-000000000001", url: "/media/renditions/c0ffee00-0000-4000-8000-000000000001/4x3-480.webp",
    original_url: "/api/admin/desk/media/c0ffee00-0000-4000-8000-000000000001/original", renditions_state: "ready", language: "hi", section: "sports",
    credit: "Photo: Asha Rao", source: "staff", licence: "Own work", licence_expires_at: null, rights_cleared_by: null, rights_cleared_at: null,
    alt_en: "Players on the field", alt_hi: null, caption_en: null, caption_hi: null, renditions_at: null, active: true, created_at: "2026-11-18T09:00:00Z",
  };
  const calls = (url: string, method: string) => (global.fetch as jest.Mock).mock.calls.filter(([u, init]) => u === url && init?.method === method);
  const library = (permissions: Record<string, "act" | "read">) =>
    serve((url, init) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe(permissions) };
      if (url === "/api/admin/desk/media?retired=1") return { status: 200, body: { media: [IMAGE], total: 1 } };
      if (url === "/api/admin/desk/media" && init?.method === "POST") return { status: 201, body: { media: IMAGE } };
      if (url === `/api/admin/desk/media/${IMAGE.id}` && init?.method === "PATCH") return { status: 200, body: { media: IMAGE } };
    });

  test("each image with its desk, credit and whether its rights are cleared", async () => {
    library({ "article.view_admin": "read" });
    await act(async () => render(<MediaLibrary />));
    expect(await screen.findByRole("img", { name: "Players on the field" })).toHaveAttribute("src", IMAGE.url);
    expect(screen.getByText(/Photo: Asha Rao/)).toBeInTheDocument();
    expect(screen.getByText("Rights not cleared")).toBeInTheDocument();
    expect(screen.getByText(/Sizes for readers: made/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Original" })).toHaveAttribute("href", IMAGE.original_url);
    expect(screen.queryByRole("button", { name: "Upload an image" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear rights" })).not.toBeInTheDocument();
  });

  test("an image's sizes for readers: on the way until the worker runs, or failed with what to do", async () => {
    for (const [state, text] of [["waiting", /on the way \(within 5 minutes\)/], ["failed", /could not be made from this file\. Upload it again\./]] as const) {
      serve((url) => {
        if (url === "/api/admin/me") return { status: 200, body: staffMe({ "article.view_admin": "read" }) };
        if (url === "/api/admin/desk/media?retired=1") return { status: 200, body: { media: [{ ...IMAGE, renditions_state: state }], total: 1 } };
      });
      const { unmount } = await act(async () => render(<MediaLibrary />));
      expect(await screen.findByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  test("whoever may edit stories uploads an image as a form: the file, its desk and what is known", async () => {
    library({ "article.view_admin": "read", "article.edit": "act" });
    await act(async () => render(<MediaLibrary />));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Upload an image" })));
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "match.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/^Image/), { target: { files: [file] } });
    fireEvent.change(screen.getByRole("combobox", { name: "Language" }), { target: { value: "hi" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Section" }), { target: { value: "sports" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Credit" }), { target: { value: "Photo: Asha Rao" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Upload" })));
    const body = calls("/api/admin/desk/media", "POST")[0][1].body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect((body.get("file") as File).name).toBe("match.jpg");
    expect([body.get("language"), body.get("section"), body.get("credit")]).toEqual(["hi", "sports", "Photo: Asha Rao"]);
    expect(calls("/api/admin/desk/media", "POST")[0][1].headers).toBeUndefined();
    expect(await screen.findByText(/Image uploaded/)).toBeInTheDocument();
  });

  test("a holder of media.manage clears an image's rights and retires it", async () => {
    library({ "article.view_admin": "read", "media.manage": "act" });
    await act(async () => render(<MediaLibrary />));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Clear rights" })));
    expect(JSON.parse(calls(`/api/admin/desk/media/${IMAGE.id}`, "PATCH")[0][1].body)).toEqual({ rights_cleared: true });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retire" })));
    expect(JSON.parse(calls(`/api/admin/desk/media/${IMAGE.id}`, "PATCH")[1][1].body)).toEqual({ active: false });
  });
});
