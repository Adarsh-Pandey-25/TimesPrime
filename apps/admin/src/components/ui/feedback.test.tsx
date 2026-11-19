/**
 * The back office's popups (Feedback.tsx) and the action message (ActionMessage.tsx): the dialog in
 * place of the browser's confirm and prompt boxes, the toasts after an action worked, and what each
 * falls back to without the provider.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import ActionMessage, { type Message } from "./ActionMessage";
import { FeedbackProvider, useDialog, useToast, type ConfirmOptions, type FormOptions } from "./Feedback";

/** Buttons that open a dialog and show what it answered. */
function Asker({ confirm, form }: { confirm?: ConfirmOptions; form?: FormOptions }) {
  const dialog = useDialog();
  const [answer, setAnswer] = useState("none");
  return (
    <div>
      {confirm && <button onClick={async () => setAnswer(String(await dialog.confirm(confirm)))}>ask</button>}
      {form && <button onClick={async () => setAnswer(JSON.stringify(await dialog.form(form)))}>fill</button>}
      <output data-testid="answer">{answer}</output>
    </div>
  );
}

const inProvider = (ui: React.ReactNode) => render(<FeedbackProvider>{ui}</FeedbackProvider>);
const answer = () => screen.getByTestId("answer").textContent;

describe("the confirm dialog", () => {
  const OPTIONS: ConfirmOptions = { title: "Delete this article?", message: "This cannot be undone.", confirmLabel: "Delete", tone: "danger" };

  test("shows the title and message as a dialog, and its button answers yes", async () => {
    inProvider(<Asker confirm={OPTIONS} />);
    await act(async () => fireEvent.click(screen.getByText("ask")));
    const dialog = screen.getByRole("dialog", { name: "Delete this article?" });
    expect(dialog).toHaveTextContent("This cannot be undone.");
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete" })));
    expect(answer()).toBe("true");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Cancel, Escape and a click on the backdrop each answer no", async () => {
    inProvider(<Asker confirm={OPTIONS} />);
    await act(async () => fireEvent.click(screen.getByText("ask")));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(answer()).toBe("false");

    await act(async () => fireEvent.click(screen.getByText("ask")));
    // Escape: the browser fires "cancel" on the dialog.
    await act(async () => fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true })));
    expect(answer()).toBe("false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByText("ask")));
    await act(async () => fireEvent.click(screen.getByRole("dialog")));
    expect(answer()).toBe("false");
  });

  test("a danger dialog's confirming button is red and the keyboard starts on Cancel; an ordinary one starts on its button", async () => {
    const { unmount } = inProvider(<Asker confirm={OPTIONS} />);
    await act(async () => fireEvent.click(screen.getByText("ask")));
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("bg-red-600");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    unmount();

    inProvider(<Asker confirm={{ title: "Take this step?", confirmLabel: "Take the step" }} />);
    await act(async () => fireEvent.click(screen.getByText("ask")));
    expect(screen.getByRole("button", { name: "Take the step" }).className).toContain("bg-blue-600");
    expect(screen.getByRole("button", { name: "Take the step" })).toHaveFocus();
  });
});

describe("the form dialog", () => {
  const OPTIONS: FormOptions = {
    title: "Add a related story",
    fields: [
      { name: "href", label: "The story's address", defaultValue: "/india/" },
      { name: "title", label: "Its headline" },
    ],
    submitLabel: "Add",
    validate: ({ href }) => (href.startsWith("https://") || href.startsWith("/") ? null : "Only https links or site paths are allowed."),
  };

  test("starts from the default values, refuses what validate refuses and stays open, then answers the values", async () => {
    inProvider(<Asker form={OPTIONS} />);
    await act(async () => fireEvent.click(screen.getByText("fill")));
    const address = screen.getByRole("textbox", { name: "The story's address" });
    expect(address).toHaveValue("/india/");
    expect(address).toHaveFocus();

    fireEvent.change(address, { target: { value: "ftp://x" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Only https links or site paths are allowed.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(answer()).toBe("none");

    // Typing again clears the problem.
    fireEvent.change(address, { target: { value: "/india/budget-1" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "Its headline" }), { target: { value: "Budget passes" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add" })));
    expect(JSON.parse(answer() ?? "")).toEqual({ href: "/india/budget-1", title: "Budget passes" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("Cancel answers null", async () => {
    inProvider(<Asker form={OPTIONS} />);
    await act(async () => fireEvent.click(screen.getByText("fill")));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(answer()).toBe("null");
  });

  test("a second dialog while one is open answers the first with no", async () => {
    function Twice() {
      const dialog = useDialog();
      const [first, setFirst] = useState("open");
      return (
        <div>
          <button
            onClick={() => {
              void dialog.confirm({ title: "First?" }).then((ok) => setFirst(String(ok)));
              void dialog.confirm({ title: "Second?" });
            }}
          >
            both
          </button>
          <output data-testid="first">{first}</output>
        </div>
      );
    }
    inProvider(<Twice />);
    await act(async () => fireEvent.click(screen.getByText("both")));
    expect(screen.getByTestId("first")).toHaveTextContent("false");
    expect(screen.getByRole("dialog", { name: "Second?" })).toBeInTheDocument();
  });
});

describe("toasts", () => {
  function Shouter({ text, tone }: { text: string; tone?: "success" | "error" }) {
    const toast = useToast();
    return <button onClick={() => toast?.show(text, tone)}>shout</button>;
  }

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("a toast is announced, goes away by itself, and stays while the pointer is on it", () => {
    inProvider(<Shouter text="Saved." />);
    act(() => fireEvent.click(screen.getByText("shout")));
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Saved.");
    expect(toast.parentElement).toHaveAttribute("aria-live", "polite");

    fireEvent.mouseEnter(toast);
    act(() => jest.advanceTimersByTime(20_000));
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => jest.advanceTimersByTime(6_000));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("Dismiss closes it at once; at most three are shown, the oldest going first", () => {
    inProvider(<Shouter text="Approved: the change is made." />);
    act(() => fireEvent.click(screen.getByText("shout")));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Dismiss" })));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    for (let i = 0; i < 4; i++) act(() => fireEvent.click(screen.getByText("shout")));
    expect(screen.getAllByRole("status")).toHaveLength(3);
  });

  test("an error toast is an alert", () => {
    inProvider(<Shouter text="Not saved." tone="error" />);
    act(() => fireEvent.click(screen.getByText("shout")));
    expect(screen.getByRole("alert")).toHaveTextContent("Not saved.");
  });
});

describe("ActionMessage", () => {
  function Screen({ message, extra }: { message: Message | null; extra?: boolean }) {
    return <ActionMessage message={message}>{extra ? <a href="#their-page">Open their page</a> : null}</ActionMessage>;
  }

  test("with the provider, success becomes a toast and nothing is shown inline", () => {
    inProvider(<Screen message={{ ok: true, text: "Details saved." }} />);
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Details saved.");
    // The toast lives in the provider's corner, not in the screen.
    expect(toast.closest("[aria-live]")).not.toBeNull();
  });

  test("a refusal stays inline, beside the form, as an alert", () => {
    inProvider(<Screen message={{ ok: false, text: "You don't have permission for this action." }} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("You don't have permission for this action.");
    expect(alert.closest("[aria-live]")).toBeNull();
  });

  test("success with a link to follow stays inline, so the link can be used", () => {
    inProvider(<Screen message={{ ok: true, text: "Already on the staff." }} extra />);
    expect(screen.getByRole("status")).toHaveTextContent("Already on the staff. Open their page");
    expect(screen.getByRole("link", { name: "Open their page" })).toBeInTheDocument();
  });

  test("without the provider, success is shown inline; with no message, nothing", () => {
    const { rerender } = render(<Screen message={{ ok: true, text: "Saved." }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
    rerender(<Screen message={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});

describe("without the provider, the browser's own boxes, as before", () => {
  test("confirm asks window.confirm with the title and message", async () => {
    const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
    render(<Asker confirm={{ title: "Take over?", message: "Their unsaved work is lost." }} />);
    await act(async () => fireEvent.click(screen.getByText("ask")));
    expect(confirm).toHaveBeenCalledWith("Take over?\n\nTheir unsaved work is lost.");
    expect(answer()).toBe("true");
    confirm.mockRestore();
  });

  test("a form asks window.prompt per field, and a refused value is explained with window.alert", async () => {
    const prompt = jest.spyOn(window, "prompt").mockReturnValueOnce("ftp://x");
    const alert = jest.spyOn(window, "alert").mockImplementation(() => undefined);
    render(<Asker form={{ title: "Add a link", fields: [{ name: "href", label: "Address" }], validate: () => "Only https links." }} />);
    await act(async () => fireEvent.click(screen.getByText("fill")));
    expect(prompt).toHaveBeenCalledWith("Address", "");
    expect(alert).toHaveBeenCalledWith("Only https links.");
    expect(answer()).toBe("null");
    prompt.mockRestore();
    alert.mockRestore();
  });
});
