/**
 * The Desk's screens (Panel 2 design §4): what they show for each answer the API gives. The server
 * decides every request; these tests check the screens show its answers, offer only what the person
 * holds, and have loading, empty and error states.
 */

// A stable router, as Next's is: a new object each render would re-run every effect that lists it.
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, useParams: () => ({ id: "s-1" }) }));
const push = mockRouter.push;

import { act, render, screen, waitFor } from "@testing-library/react";
import DeskList from "./DeskList";
import NewStoryForm from "./NewStoryForm";
import StoryEditor from "./StoryEditor";

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
  const { fireEvent } = await import("@testing-library/react");
  fireEvent.change(headline, { target: { value: "Budget passes" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Create and open" })));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/desk/s-9"));
  const [, init] = (global.fetch as jest.Mock).mock.calls.find(([u]) => u === "/api/admin/desk/stories");
  expect(JSON.parse(init.body)).toMatchObject({ language: "en", headline: "Budget passes", state: "draft" });
});

describe("the story screen", () => {
  const STORY = {
    id: "s-1", language: "en", section: "india", workflow_state: "desk_review", slug: null, embargo_until: null,
    legal_review_required: false, current_revision_id: "r-1", published_revision_id: null, scheduled_at: null, post_hoc_review_due: false,
  };
  const REVISION = { id: "r-1", headline: "Budget passes", dek: "", seo_title: "", seo_description: "", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The house voted." }] }] } };

  function serveStory(permissions: Record<string, "act" | "read">, over: Record<string, unknown> = {}) {
    serve((url) => {
      if (url === "/api/admin/me") return { status: 200, body: staffMe(permissions) };
      if (url === "/api/admin/desk/stories/s-1") return { status: 200, body: { story: { ...STORY, ...over }, revision: REVISION, history: [{ action: "create", to_state: "draft", actor_label: "staff:u-9", reason: null, at: "2026-11-17T09:00:00Z" }], lock: null, pending: [] } };
      if (url === "/api/admin/desk/stories/s-1/lock") return { status: 200, body: { lock: {} } };
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
  });

  test("a person without article.edit sees the story read-only, with no Save", async () => {
    serveStory({ "article.view_admin": "read" });
    await act(async () => render(<StoryEditor id="s-1" />));
    expect(await screen.findByDisplayValue("Budget passes")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText("Nothing for you to do on this story now.")).toBeInTheDocument();
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
