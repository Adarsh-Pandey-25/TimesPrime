import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { isRateLimited, getClientIp } from "@/lib/rateLimit";

const MODEL = "claude-haiku-4-5"; // fast + cheap, good fit for chat

const SYSTEM_PROMPT =
  "You are TimesPrime AI, a helpful news assistant. Answer questions about news topics concisely and factually. If given article context, use it to answer specifically.";

interface ChatMessageInput {
  role: string;
  content: string;
}

interface ArticleContext {
  title?: string;
  description?: string;
}

interface ChatRequestBody {
  message?: string;
  messages?: ChatMessageInput[];
  articleContext?: ArticleContext;
}

// Chatbot.tsx and ArticleDetailView.tsx both send { message }. The
// { messages: [...] } shape is kept for backward compatibility (that was
// ArticleDetailView's original payload, fixed in Phase 2).
function extractMessageText(body: ChatRequestBody): string | null {
  if (typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const lastUserMessage =
      [...body.messages].reverse().find((m) => m.role === "user") ??
      body.messages[body.messages.length - 1];
    if (typeof lastUserMessage?.content === "string" && lastUserMessage.content.trim()) {
      return lastUserMessage.content;
    }
  }
  return null;
}

function buildSystemPrompt(articleContext?: ArticleContext): string {
  if (!articleContext?.title) return SYSTEM_PROMPT;
  const lines = [SYSTEM_PROMPT, "", "Article context:", `Title: ${articleContext.title}`];
  if (articleContext.description) {
    lines.push(`Description: ${articleContext.description}`);
  }
  return lines.join("\n");
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment and try again." },
      { status: 429 }
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not set — AI assistant unavailable.");
    return NextResponse.json(
      { error: "AI assistant unavailable — ANTHROPIC_API_KEY is not configured." },
      { status: 503 }
    );
  }

  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON." }, { status: 400 });
  }

  const message = extractMessageText(body);
  if (!message) {
    return NextResponse.json(
      {
        error:
          'Message content is required — send either { message: string } or { messages: [{ role, content }] }.',
      },
      { status: 400 }
    );
  }

  const client = new Anthropic({ apiKey });

  try {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: buildSystemPrompt(body.articleContext),
      messages: [{ role: "user", content: message }],
    });

    // Pull the first event BEFORE returning a Response. client.messages.stream()
    // doesn't throw synchronously — a connection/auth failure only surfaces on
    // the first pull from the iterator. If we'd started the ReadableStream and
    // returned the Response first, that failure would arrive after the HTTP
    // response already committed, and Next.js can't gracefully convert an
    // in-flight stream into a JSON error response (confirmed: it throws
    // "failed to pipe response" and the client gets an empty 500). Peeking
    // here means a failed connection is still caught by the outer catch below
    // and returns a clean JSON error, same as any other failure before commit.
    const iterator = stream[Symbol.asyncIterator]();
    const first = await iterator.next();

    const encoder = new TextEncoder();
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let next = first;
          while (!next.done) {
            const event = next.value;
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
            next = await iterator.next();
          }
          controller.close();
        } catch (err) {
          console.error("Chat stream error (mid-stream):", err);
          Sentry.captureException(err, { tags: { source: "anthropic" }, extra: { model: MODEL, phase: "mid-stream" } });
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error: any) {
    console.error("Chat API error:", error);

    let reason = "the request to Claude failed.";
    let errorType = "unknown";
    if (error instanceof Anthropic.AuthenticationError) {
      reason = "authentication with Claude failed — check ANTHROPIC_API_KEY.";
      errorType = "authentication";
    } else if (error instanceof Anthropic.RateLimitError) {
      reason = "Claude's API rate limit was hit — try again shortly.";
      errorType = "rate_limit";
    } else if (error instanceof Anthropic.APIConnectionError) {
      reason = "could not connect to Claude's API.";
      errorType = "connection";
    } else if (error instanceof Anthropic.APIError) {
      reason = `Claude API error (${error.status}).`;
      errorType = `api_error_${error.status}`;
    }

    Sentry.captureException(error, {
      tags: { source: "anthropic", errorType },
      extra: { model: MODEL, phase: "pre-stream" },
    });

    return NextResponse.json({ error: `AI assistant unavailable — ${reason}` }, { status: 502 });
  }
}
