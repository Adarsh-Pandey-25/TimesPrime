"use client";

import dynamic from "next/dynamic";
import { aiChatEnabled } from "@timesprime/shared/config/aiChat";

// The chat's code is its own chunk, loaded only when the chat is on (B-06; BL-030).
const FloatingAiAssistant = dynamic(() => import("./FloatingAiAssistant"), { ssr: false });

/** The AI chat button, when the AI chat is on (aiChatEnabled); otherwise nothing. */
export default function ChatLauncher() {
  return aiChatEnabled() ? <FloatingAiAssistant /> : null;
}
