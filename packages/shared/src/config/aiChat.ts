/**
 * Whether readers get the AI chat (B-06, Phase B, approved by the owner's senior on 16 Nov 2026):
 * off unless NEXT_PUBLIC_AI_CHAT_ENABLED is "1". Off, the chat button is not rendered (its code is a
 * separate chunk that is then never loaded), the article page's askTimesPrime panel is hidden, and
 * /api/chat answers 404. It stays off until there is content of our own for it to answer from.
 *
 * NEXT_PUBLIC_ so Next inlines it at build, in the browser and on the server alike: each image is
 * built with its value, and the server and the page always agree.
 */
export function aiChatEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_CHAT_ENABLED === "1";
}
