/**
 * B-06: the AI chat button shows only when NEXT_PUBLIC_AI_CHAT_ENABLED is "1"; off, nothing is
 * rendered and the chat's code (its own chunk) is never loaded.
 */

jest.mock("next/dynamic", () => ({
  __esModule: true,
  default: () => {
    const Loaded = () => <button>chat</button>;
    return Loaded;
  },
}));

import { render, screen } from "@testing-library/react";
import ChatLauncher from "./ChatLauncher";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AI_CHAT_ENABLED;
});

test.each([undefined, "", "0", "true"])("off when the flag is %j: nothing at all", (flag) => {
  if (flag !== undefined) process.env.NEXT_PUBLIC_AI_CHAT_ENABLED = flag;
  const { container } = render(<ChatLauncher />);
  expect(container).toBeEmptyDOMElement();
});

test('on when the flag is "1": the chat button', () => {
  process.env.NEXT_PUBLIC_AI_CHAT_ENABLED = "1";
  render(<ChatLauncher />);
  expect(screen.getByRole("button", { name: "chat" })).toBeInTheDocument();
});
