/**
 * The password field's eye (the owner, 20 Nov 2026): it shows what was typed and hides it again,
 * as a named button that says whether the password is shown, and the field keeps its label.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import PasswordInput from "./PasswordInput";

test("hidden at first; the eye shows the password, and hides it again", () => {
  render(
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" autoComplete="current-password" defaultValue="correct horse" className="field" />
    </>
  );
  const field = screen.getByLabelText("Password");
  expect(field).toHaveAttribute("type", "password");
  expect(field).toHaveAttribute("autocomplete", "current-password");
  const eye = screen.getByRole("button", { name: "Show password" });
  expect(eye).toHaveAttribute("aria-pressed", "false");
  expect(eye).toHaveAttribute("aria-controls", "pw");
  expect(eye).toHaveAttribute("type", "button");

  fireEvent.click(eye);
  expect(field).toHaveAttribute("type", "text");
  expect(field).toHaveValue("correct horse");
  const hide = screen.getByRole("button", { name: "Hide password" });
  expect(hide).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(hide);
  expect(field).toHaveAttribute("type", "password");
});

test("the eye never sends the form", () => {
  const submit = jest.fn((e: React.FormEvent) => e.preventDefault());
  render(
    <form onSubmit={submit}>
      <PasswordInput aria-label="Password" />
    </form>
  );
  fireEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(submit).not.toHaveBeenCalled();
});
