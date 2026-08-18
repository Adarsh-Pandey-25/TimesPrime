/**
 * @jest-environment node
 *
 * Route handlers run in the Node runtime; NextRequest/Response interop is
 * more reliable there than under jsdom for this file specifically.
 */

// jest.mock factories are hoisted above the rest of the file (including
// top-level class/const declarations), so anything the factory needs must
// be defined *inside* it rather than referenced from outer scope.
jest.mock("@anthropic-ai/sdk", () => {
  class MockAnthropicError extends Error {}

  function createMockStream(chunks: string[]) {
    async function* generator() {
      for (const chunk of chunks) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text: chunk } };
      }
    }
    return { [Symbol.asyncIterator]: generator };
  }

  const mockStreamFn = jest.fn((_params: unknown) =>
    createMockStream(["Hello", " from mocked Claude"])
  );

  class MockAnthropic {
    messages = { stream: mockStreamFn };
    static AuthenticationError = class extends MockAnthropicError {};
    static RateLimitError = class extends MockAnthropicError {};
    static APIConnectionError = class extends MockAnthropicError {};
    static APIError = class extends MockAnthropicError {};
  }

  return {
    __esModule: true,
    default: MockAnthropic,
    __mockStreamFn: mockStreamFn,
  };
});

// Imported after jest.mock so the route picks up the mocked SDK.
import { NextRequest } from "next/server";
import { POST } from "./route";

const { __mockStreamFn: mockStreamFn } = jest.requireMock("@anthropic-ai/sdk") as {
  __mockStreamFn: jest.Mock;
};

let ipCounter = 0;
function makeRequest(body: unknown, rawBody = false): NextRequest {
  // Unique x-forwarded-for per request so each test gets its own rate-limit
  // bucket — the limiter's in-memory log is module-scoped and would
  // otherwise accumulate across every test in this file.
  ipCounter += 1;
  return new NextRequest("http://localhost:3000/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipCounter}`,
    },
    body: rawBody ? (body as string) : JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockStreamFn.mockClear();
  });

  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("returns 400 when the body has no message field", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/message content is required/i);
  });

  it("returns 400 when the message is empty/whitespace-only", async () => {
    const res = await POST(makeRequest({ message: "   " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed (non-JSON) body", async () => {
    const res = await POST(makeRequest("not valid json", true));
    expect(res.status).toBe(400);
  });

  it("returns 200 and streams a response for a valid { message } payload", async () => {
    const res = await POST(makeRequest({ message: "What's happening in tech?" }));
    expect(res.status).toBe(200);
    expect(mockStreamFn).toHaveBeenCalledTimes(1);

    const text = await res.text();
    expect(text).toBe("Hello from mocked Claude");
  });

  it("returns 200 for a valid { messages: [...] } payload (backward-compat shape)", async () => {
    const res = await POST(
      makeRequest({ messages: [{ role: "user", content: "Summarize this article" }] })
    );
    expect(res.status).toBe(200);
    expect(mockStreamFn).toHaveBeenCalledTimes(1);
  });

  it("injects article context into the system prompt when provided", async () => {
    const res = await POST(
      makeRequest({
        message: "What does this mean?",
        articleContext: { title: "Test Headline", description: "Test description" },
      })
    );
    expect(res.status).toBe(200);
    const callArgs = mockStreamFn.mock.calls[0][0] as { system: string };
    expect(callArgs.system).toContain("Test Headline");
    expect(callArgs.system).toContain("Test description");
  });

  it("returns 503 when ANTHROPIC_API_KEY is not configured", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(makeRequest({ message: "Hello" }));
    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toMatch(/AI assistant unavailable/i);
  });
});
