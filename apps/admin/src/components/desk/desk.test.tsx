/**
 * The Desk's screens (Panel 2 design §4): what they show for each answer the API gives. The server
 * decides every request; these tests check the screens show its answers, offer only what the person
 * holds, and have loading, empty and error states.
 */

// A stable router, as Next's is: a new object each render would re-run every effect that lists it.
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, useParams: () => ({ id: "s-1" }) }));
const push = mockRouter.push;

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DeskList from "./DeskList";
import NewStoryForm from "./NewStoryForm";
import StoryEditor from "./StoryEditor";
import StoryPreview from "./StoryPreview";

const staffMe = (permissions: Record<string, "act" | "read">) => ({
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

  test("the shared password is told to sign in with a staff account", async () => {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: { kind: "legacy", displayName: "Shared", retiresAt: "2027-01-01T00:00:00+05:30", permissions: {} } };
      if (url.startsWith("/api/admin/desk/stories?")) return { status: 403, body: { error: "x", code: "staff_only" } };
    });
    await act(async () => render(<DeskList />));
    expect(await screen.findByText(/own staff account/)).toBeInTheDocument();
  });

  test("no session sends the browser to sign in", async () => {
    serve(() => ({ status: 401, body: { error: "Unauthorized" } }));
    await act(async () => render(<DeskList />));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/login"));
  });
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
  function serveStory(permissions: Record<string, "act" | "read">, over: Record<string, unknown> = {}, extra?: Route, revisions: Revision[] = [REVISION]) {
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

    test("with unsaved changes, bringing one back asks first, and No keeps them", async () => {
      serveStory({ "article.view_admin": "read", "article.edit": "act" }, {}, undefined, [NEW, OLD]);
      await act(async () => render(<StoryEditor id="s-1" />));
      const bringBack = await screen.findByRole("button", { name: "Bring back revision 1" });
      const headline = screen.getByRole("textbox", { name: "Headline" });
      fireEvent.change(headline, { target: { value: "Budget passes, 300 to 120" } });
      const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
      await act(async () => fireEvent.click(bringBack));
      await waitFor(() => expect(confirm).toHaveBeenCalledWith("You have unsaved changes. Replace them with revision 1?"));
      expect(headline).toHaveValue("Budget passes, 300 to 120");
      expect(screen.queryByText(/Revision 1 is in the editor/)).not.toBeInTheDocument();
      confirm.mockRestore();
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
