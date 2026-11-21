/**
 * The grievance form and the status page (Panel 7 design §4, M1), in the reader's language: what
 * they send, the ticket and due date on success, and each refusal worded by its code.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { LanguageProvider } from "@/context/LanguageContext";
import GrievanceForm from "./GrievanceForm";
import GrievanceStatusLookup from "./GrievanceStatusLookup";

type Answer = { status: number; body: unknown };
let answer: Answer | "network";
let sent: Array<{ url: string; body: unknown }>;

beforeEach(() => {
  sent = [];
  localStorage.clear();
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    if (answer === "network") throw new Error("offline");
    const a = answer;
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  }) as unknown as typeof fetch;
});

const inHindi = async (node: React.ReactNode) => {
  localStorage.setItem("timesprime_language", "hi");
  await act(async () => void render(<LanguageProvider>{node}</LanguageProvider>));
};

describe("the form", () => {
  const fill = (form: HTMLElement, names: { name: string; email: string; body: string }) => {
    fireEvent.change(within(form).getByRole("textbox", { name: names.name }), { target: { value: "Asha Rao" } });
    fireEvent.change(within(form).getByRole("textbox", { name: names.email }), { target: { value: "asha@example.com" } });
    fireEvent.change(within(form).getByRole("textbox", { name: names.body }), { target: { value: "The score was wrong." } });
  };
  const EN = { name: "Your name", email: "Your email, for our reply", body: "Your grievance" };

  test("sends the grievance in the reader's language, then shows the ticket, the due date and the status page", async () => {
    answer = { status: 201, body: { ticket: "G-2026-00042", received_at: "2026-11-21T06:00:00Z", decide_due_at: "2026-12-06T06:00:00Z" } };
    render(<GrievanceForm />);
    const form = screen.getByRole("form", { name: "Send a grievance" });
    fill(form, EN);
    fireEvent.change(within(form).getByRole("textbox", { name: "The address of the story it is about (optional)" }), { target: { value: " https://timesprime247.com/india/budget-7 " } });
    fireEvent.change(within(form).getByRole("combobox", { name: "What is it about?" }), { target: { value: "defamation_privacy" } });
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Send the grievance" })));
    expect(sent).toEqual([
      {
        url: "/api/grievances",
        body: { language: "en", name: "Asha Rao", email: "asha@example.com", about_url: "https://timesprime247.com/india/budget-7", category: "defamation_privacy", body: "The score was wrong.", website: "" },
      },
    ]);
    const done = screen.getByRole("status");
    expect(done).toHaveTextContent("Your grievance is received and acknowledged");
    expect(within(done).getByText("G-2026-00042")).toBeInTheDocument();
    expect(done).toHaveTextContent("We will decide on it by 6 Dec 2026");
    expect(within(done).getByRole("link", { name: /Check its status/ })).toHaveAttribute("href", "/grievance/status");
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });

  test("the hints describe their fields, and the hidden field is out of reach", () => {
    render(<GrievanceForm />);
    const body = screen.getByRole("textbox", { name: "Your grievance" });
    expect(body).toHaveAccessibleDescription("What is wrong, and why. At most 5,000 characters.");
    expect(body).toHaveAttribute("maxLength", "5000");
    expect(screen.queryByRole("textbox", { name: "Website" })).not.toBeInTheDocument();
    expect(document.querySelector('input[name="website"]')).toHaveAttribute("tabIndex", "-1");
  });

  test("in Hindi: the words, the categories and the language sent", async () => {
    answer = { status: 429, body: { code: "too_many", error: "Too many grievances from this address." } };
    await inHindi(<GrievanceForm />);
    const form = screen.getByRole("form", { name: "शिकायत भेजें" });
    expect(within(form).getByRole("option", { name: "तथ्य की गलती" })).toBeInTheDocument();
    fill(form, { name: "आपका नाम", email: "आपका ईमेल, हमारे जवाब के लिए", body: "आपकी शिकायत" });
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "शिकायत भेजें" })));
    expect(sent[0].body).toMatchObject({ language: "hi" });
    expect(screen.getByRole("alert")).toHaveTextContent("इस कनेक्शन से बहुत सारी शिकायतें आई हैं");
  });

  test.each([
    [{ status: 400, body: { code: "invalid", error: "An email address we can reply to is required." } }, "Please check each field.An email address we can reply to is required."],
    [{ status: 429, body: { code: "closed_today" } }, "The form takes no more grievances today."],
    [{ status: 503, body: { code: "failed" } }, "Your grievance could not be sent."],
    [{ status: 500, body: null }, "Your grievance could not be sent."],
    ["network" as const, "Your grievance could not be sent."],
  ])("a refusal or failure (%j) is told, and the form stays", async (reply, words) => {
    answer = reply;
    render(<GrievanceForm />);
    const form = screen.getByRole("form", { name: "Send a grievance" });
    fill(form, EN);
    await act(async () => fireEvent.click(within(form).getByRole("button", { name: "Send the grievance" })));
    expect(screen.getByRole("alert")).toHaveTextContent(words);
    expect(screen.getByRole("form", { name: "Send a grievance" })).toBeInTheDocument();
  });
});

describe("the status page", () => {
  const OPEN = { ticket: "G-2026-00042", state: "open", received_at: "2026-11-21T06:00:00Z", acknowledged_at: "2026-11-21T06:00:00Z", decide_due_at: "2026-12-06T06:00:00Z", outcome: null, reply: null, decided_at: null };
  const ask = async () => {
    const form = screen.getByRole("form");
    fireEvent.change(within(form).getAllByRole("textbox")[0], { target: { value: "g-2026-00042" } });
    fireEvent.change(within(form).getAllByRole("textbox")[1], { target: { value: "asha@example.com" } });
    await act(async () => fireEvent.click(within(form).getByRole("button")));
  };

  test("an open grievance: when it arrived and was acknowledged, and when the decision is due", async () => {
    answer = { status: 200, body: { grievance: OPEN } };
    render(<GrievanceStatusLookup />);
    await ask();
    expect(sent).toEqual([{ url: "/api/grievances/status", body: { ticket: "g-2026-00042", email: "asha@example.com" } }]);
    const result = screen.getByRole("status");
    expect(result).toHaveTextContent("Open: we are looking into it.");
    expect(result).toHaveTextContent("The decision is due by 6 Dec 2026");
  });

  test("a decided one in Hindi: the outcome in Hindi, and the reply", async () => {
    answer = { status: 200, body: { grievance: { ...OPEN, state: "decided", outcome: "upheld", reply: "हमने स्कोर सुधार दिया है।", decided_at: "2026-11-25T06:00:00Z" } } };
    await inHindi(<GrievanceStatusLookup />);
    await ask();
    const result = screen.getByRole("status");
    expect(result).toHaveTextContent("फ़ैसला: स्वीकार की गई");
    expect(within(result).getByText("हमने स्कोर सुधार दिया है।")).toBeInTheDocument();
  });

  test.each([
    [{ status: 404, body: { code: "not_found" } }, "No grievance has this ticket and email."],
    [{ status: 429, body: { code: "too_many" } }, "Too many tries from this connection."],
    [{ status: 400, body: { code: "invalid" } }, "Enter a ticket like G-2026-00042"],
    ["network" as const, "The status could not be read."],
  ])("%j is told", async (reply, words) => {
    answer = reply;
    render(<GrievanceStatusLookup />);
    await ask();
    expect(screen.getByRole("alert")).toHaveTextContent(words);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
